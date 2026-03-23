local DataAggregator = {}

local favorites = require("modules/favorites")

-- ============================================
-- HELPERS
-- ============================================

local function sanitizeId(str)
    if not str then return "unknown" end
    return tostring(str):lower():gsub("[^%w]", "")
end

local function safeString(val)
    if val == nil then return "" end
    local str = tostring(val)
    if str:find("^LocKey#") then
        local ok, resolved = pcall(GetLocalizedText, str)
        if ok and type(resolved) == "string" and resolved ~= "" and resolved ~= str then
            return resolved
        end
    end
    return str
end

local function localizeDisplayName(cname)
    if not cname then return "" end
    local ok1, localized = pcall(GetLocalizedTextByKey, cname)
    if ok1 and type(localized) == "string" and localized ~= "" then
        return localized
    end
    local ok2, val = pcall(function() return cname.value end)
    if ok2 and val and val ~= "" and val ~= "None" then
        return val
    end
    return ""
end

local function updatePolicyToString(configVar)
    local ok, policy = pcall(function() return configVar:GetUpdatePolicy() end)
    if not ok or not policy then return nil end
    local pStr = tostring(policy)
    if pStr:find("Restart") then return "restart" end
    if pStr:find("Confirmation") then return "confirmation" end
    if pStr:find("Checkpoint") or pStr:find("LoadLast") then return "checkpoint" end
    return nil
end

-- ============================================
-- NATIVE SETTINGS AGGREGATION
-- ============================================

local function makeNsOptionId(tabPath, subPath, label)
    local prefix = "ns:/" .. safeString(tabPath)
    if subPath and subPath ~= "" then
        prefix = prefix .. "/" .. safeString(subPath)
    end
    return prefix .. "/" .. safeString(label)
end

local function mapNsType(nsType)
    if nsType == "switch" then return "switch" end
    if nsType == "rangeInt" then return "sliderInt" end
    if nsType == "rangeFloat" then return "sliderFloat" end
    if nsType == "selectorString" then return "selector" end
    if nsType == "keyBinding" then return "keyBinding" end
    if nsType == "button" then return "button" end
    if nsType == "custom" then return "custom" end
    return nsType or "unknown"
end

local function extractNsCurrentValue(nsOpt)
    local t = nsOpt.type
    if t == "switch" then return nsOpt.state end
    if t == "rangeInt" or t == "rangeFloat" then return nsOpt.currentValue end
    if t == "selectorString" then return nsOpt.selectedElementIndex end
    if t == "keyBinding" then return nsOpt.value end
    return nil
end

local function extractNsDefaultValue(nsOpt)
    return nsOpt.defaultValue
end

local function hasNsValue(nsOpt)
    local t = nsOpt.type
    if t == "button" or t == "custom" then return false end
    return true
end

local function convertNsOption(nsOpt, tabPath, subPath)
    local uType = mapNsType(nsOpt.type)
    local curVal = extractNsCurrentValue(nsOpt)
    local defVal = extractNsDefaultValue(nsOpt)
    local hasVal = hasNsValue(nsOpt)
    local isModified = false
    if hasVal and curVal ~= nil and defVal ~= nil then
        isModified = (curVal ~= defVal)
    end

    local option = {
        id = makeNsOptionId(tabPath, subPath, nsOpt.label),
        type = uType,
        label = safeString(nsOpt.label),
        description = safeString(nsOpt.desc),
        currentValue = curVal,
        defaultValue = defVal,
        isModified = isModified,
        hasValue = hasVal,
        _source = "nativeSettings",
        _nsOption = nsOpt,
        _configVar = nil,
        _updatePolicy = nil,
    }

    if uType == "sliderInt" or uType == "sliderFloat" then
        option.min = nsOpt.min
        option.max = nsOpt.max
        option.step = nsOpt.step
    end

    if uType == "sliderFloat" then
        option.format = nsOpt.format
    end

    if uType == "selector" then
        option.elements = nsOpt.elements
    end

    if uType == "keyBinding" then
        option.isHold = nsOpt.isHold or false
    end

    if uType == "button" then
        option.buttonText = nsOpt.buttonText
        option.textSize = nsOpt.textSize
    end

    if uType == "custom" then
        option.customCallback = nsOpt.callback
    end

    return option
end

local function processNsOptions(optionsList, tabPath, subPath, dest)
    if not optionsList then return end
    for i = 1, #optionsList do
        local nsOpt = optionsList[i]
        if nsOpt and nsOpt.type then
            local option = convertNsOption(nsOpt, tabPath, subPath)
            table.insert(dest, option)
        end
    end
end

local function aggregateNativeSetting(nsData, unifiedData, usedIds)
    if not nsData then return end

    for tabPath, tab in pairs(nsData) do
        if type(tab) == "table" and tab.label then
            local modId = sanitizeId(tab.label)
            if usedIds[modId] then
                modId = modId .. "_ns"
            end
            usedIds[modId] = true

            local mod = {
                id = modId,
                displayName = safeString(tab.label),
                source = "nativeSettings",
                sortName = safeString(tab.label):lower(),
                modifiedCount = 0,
                categories = {},
                categoryOrder = {},
                _nsClosedCallback = tab.closedCallback,
                _nsRestoreDefaultsCallback = tab.restoreDefaultsCallback,
                _nsOverrideNativeRestore = tab.overrideNativeRestoreDefaults or false,
                _msModName = nil,
            }

            if tab.options and #tab.options > 0 then
                local catId = "_root"
                local catOptions = {}
                processNsOptions(tab.options, tabPath, nil, catOptions)
                mod.categories[catId] = {
                    id = catId,
                    label = "",
                    options = catOptions,
                }
                table.insert(mod.categoryOrder, catId)
            end

            if tab.keys then
                local maxKeyIdx = 0
                for k in pairs(tab.keys) do
                    if type(k) == "number" and k > maxKeyIdx then maxKeyIdx = k end
                end
                for i = 1, maxKeyIdx do
                    local subKey = tab.keys[i]
                    if subKey and tab.subcategories and tab.subcategories[subKey] then
                        local sub = tab.subcategories[subKey]
                        local catId = sanitizeId(subKey)
                        if catId == "" then catId = "_sub" end
                        local catOptions = {}
                        processNsOptions(sub.options, tabPath, subKey, catOptions)
                        mod.categories[catId] = {
                            id = catId,
                            label = safeString(sub.label),
                            options = catOptions,
                        }
                        table.insert(mod.categoryOrder, catId)
                    end
                end
            end

            local optionCount = 0
            local modifiedCount = 0
            for _, catId in ipairs(mod.categoryOrder) do
                local cat = mod.categories[catId]
                if cat and cat.options then
                    optionCount = optionCount + #cat.options
                    for _, opt in ipairs(cat.options) do
                        if opt.isModified then
                            modifiedCount = modifiedCount + 1
                        end
                    end
                end
            end
            mod.optionCount = optionCount
            mod.modifiedCount = modifiedCount

            unifiedData.mods[modId] = mod
        end
    end
end

-- ============================================
-- MOD SETTINGS AGGREGATION
-- ============================================

local function makeMsOptionId(modName, catName, varName)
    return "ms:/" .. safeString(modName) .. "/" .. safeString(catName) .. "/" .. safeString(varName)
end

local function convertMsConfigVar(configVar, modNameStr, catNameStr)
    local ok, varName = pcall(function() return configVar:GetName().value end)
    if not ok or not varName or varName == "" then varName = "unknown" end

    local ok2, displayName = pcall(function() return localizeDisplayName(configVar:GetDisplayName()) end)
    if not ok2 then displayName = varName end

    local ok3, description = pcall(function() return localizeDisplayName(configVar:GetDescription()) end)
    if not ok3 then description = "" end

    local uType = "unknown"
    local curVal, defVal
    local hasVal = true
    local optionExtra = {}

    local okB, isBool = pcall(function() return configVar:IsA("ModConfigVarBool") end)
    isBool = okB and isBool
    local okI, isInt = pcall(function() return configVar:IsA("ModConfigVarInt32") end)
    isInt = okI and isInt
    local okF, isFloat = pcall(function() return configVar:IsA("ModConfigVarFloat") end)
    isFloat = okF and isFloat
    local okE, isEnum = pcall(function() return configVar:IsA("ModConfigVarEnum") end)
    isEnum = okE and isEnum
    local okK, isKeyBinding = pcall(function() return configVar:IsA("ModConfigVarKeyBinding") end)
    isKeyBinding = okK and isKeyBinding
    local okN, isName = pcall(function() return configVar:IsA("ModConfigVarName") end)
    isName = okN and isName

    if isBool then
        uType = "switch"
        local okV, v = pcall(function() return configVar:GetValue() end)
        local okD, d = pcall(function() return configVar:GetDefaultValue() end)
        curVal = okV and v or false
        defVal = okD and d or false

    elseif isInt then
        uType = "sliderInt"
        local okV, v = pcall(function() return configVar:GetValue() end)
        local okD, d = pcall(function() return configVar:GetDefaultValue() end)
        curVal = okV and v or 0
        defVal = okD and d or 0
        local okMin, vMin = pcall(function() return configVar:GetMinValue() end)
        local okMax, vMax = pcall(function() return configVar:GetMaxValue() end)
        local okStep, vStep = pcall(function() return configVar:GetStepValue() end)
        optionExtra.min = okMin and vMin or 0
        optionExtra.max = okMax and vMax or 100
        optionExtra.step = okStep and vStep or 1

    elseif isFloat then
        uType = "sliderFloat"
        local okV, v = pcall(function() return configVar:GetValue() end)
        local okD, d = pcall(function() return configVar:GetDefaultValue() end)
        curVal = okV and v or 0.0
        defVal = okD and d or 0.0
        local okMin, vMin = pcall(function() return configVar:GetMinValue() end)
        local okMax, vMax = pcall(function() return configVar:GetMaxValue() end)
        local okStep, vStep = pcall(function() return configVar:GetStepValue() end)
        optionExtra.min = okMin and vMin or 0.0
        optionExtra.max = okMax and vMax or 1.0
        optionExtra.step = okStep and vStep or 0.01
        optionExtra.format = "%.2f"

    elseif isEnum then
        uType = "selector"
        local okI, idx = pcall(function() return configVar:GetIndex() end)
        local okDI, dIdx = pcall(function() return configVar:GetDefaultIndex() end)
        curVal = okI and (idx + 1) or 1
        defVal = okDI and (dIdx + 1) or 1
        local elements = {}
        local okVals, vals = pcall(function() return configVar:GetValues() end)
        if okVals and vals then
            local valCount = 0
            local okSize, sz = pcall(function() return vals:Size() end)
            if okSize and sz then
                valCount = sz
            else
                valCount = #vals
            end
            for i = 0, valCount - 1 do
                local okDv, dvCName = pcall(function() return configVar:GetDisplayValue(i) end)
                if okDv and dvCName then
                    local localized = localizeDisplayName(dvCName)
                    table.insert(elements, localized)
                else
                    table.insert(elements, tostring(i))
                end
            end
        end
        optionExtra.elements = elements

    elseif isKeyBinding then
        uType = "keyBinding"
        local okV, v = pcall(function() return configVar:GetValueName().value end)
        local okD, d = pcall(function() return configVar:GetDefaultValueName().value end)
        curVal = okV and v or ""
        defVal = okD and d or ""
        optionExtra.isHold = false

    elseif isName then
        uType = "name"
        local okV, v = pcall(function() return configVar:GetValue().value end)
        local okD, d = pcall(function() return configVar:GetDefaultValue().value end)
        curVal = okV and v or ""
        defVal = okD and d or ""
        hasVal = true
    end

    local isModified = false
    if hasVal and curVal ~= nil and defVal ~= nil then
        isModified = (curVal ~= defVal)
    end

    local option = {
        id = makeMsOptionId(modNameStr, catNameStr, varName),
        type = uType,
        label = displayName,
        description = description,
        currentValue = curVal,
        defaultValue = defVal,
        isModified = isModified,
        hasValue = hasVal,
        _source = "modSettings",
        _nsOption = nil,
        _configVar = configVar,
        _updatePolicy = updatePolicyToString(configVar),
    }

    for k, v in pairs(optionExtra) do
        option[k] = v
    end

    return option
end

local function aggregateModSettings(unifiedData, usedIds)
    local ok, modList = pcall(function() return ModSettings.GetMods() end)
    if not ok or not modList then return end

    for i = 1, #modList do
        local modCName = modList[i]
        local okNts, modNameStr = pcall(function() return modCName.value end)
        if not okNts or not modNameStr or modNameStr == "" then modNameStr = tostring(modCName) end
        local displayName = localizeDisplayName(modCName)

        local modId = sanitizeId(displayName)
        if modId == "" then modId = sanitizeId(modNameStr) end
        if usedIds[modId] then
            modId = modId .. "_ms"
        end
        usedIds[modId] = true

        local mod = {
            id = modId,
            displayName = displayName,
            source = "modSettings",
            sortName = displayName:lower(),
            modifiedCount = 0,
            categories = {},
            categoryOrder = {},
            _nsClosedCallback = nil,
            _nsRestoreDefaultsCallback = nil,
            _nsOverrideNativeRestore = false,
            _msModName = modCName,
        }

        local okRootVars, rootVars = pcall(function() return ModSettings.GetVars(modCName, CName.new("None")) end)
        if okRootVars and rootVars and #rootVars > 0 then
            local catId = "_root"
            local catOptions = {}
            for j = 1, #rootVars do
                local cv = rootVars[j]
                if cv then
                    local okVis, vis = pcall(function() return cv:IsVisible() end)
                    if not okVis or vis then
                        local optOk, opt = pcall(convertMsConfigVar, cv, modNameStr, "None")
                        if optOk and opt then
                            table.insert(catOptions, opt)
                        end
                    end
                end
            end
            if #catOptions > 0 then
                mod.categories[catId] = {
                    id = catId,
                    label = "",
                    options = catOptions,
                }
                table.insert(mod.categoryOrder, catId)
            end
        end

        local okCats, categories = pcall(function() return ModSettings.GetCategories(modCName) end)
        if okCats and categories then
            for j = 1, #categories do
                local catCName = categories[j]
                local okCNts, catNameStr = pcall(function() return catCName.value end)
                if not okCNts or not catNameStr or catNameStr == "" then catNameStr = tostring(catCName) end
                local catDisplayName = localizeDisplayName(catCName)
                local catId = sanitizeId(catNameStr)
                if catId == "" then catId = "_cat" .. tostring(j) end

                local okVars, vars = pcall(function() return ModSettings.GetVars(modCName, catCName) end)
                if okVars and vars and #vars > 0 then
                    local catOptions = {}
                    for k = 1, #vars do
                        local cv = vars[k]
                        if cv then
                            local okVis, vis = pcall(function() return cv:IsVisible() end)
                            if not okVis or vis then
                                local optOk, opt = pcall(convertMsConfigVar, cv, modNameStr, catNameStr)
                                if optOk and opt then
                                    table.insert(catOptions, opt)
                                end
                            end
                        end
                    end
                    if #catOptions > 0 then
                        mod.categories[catId] = {
                            id = catId,
                            label = catDisplayName,
                            options = catOptions,
                        }
                        table.insert(mod.categoryOrder, catId)
                    end
                end
            end
        end

        -- Count options and modified
        local optionCount = 0
        local modifiedCount = 0
        for _, catId in ipairs(mod.categoryOrder) do
            local cat = mod.categories[catId]
            if cat and cat.options then
                optionCount = optionCount + #cat.options
                for _, opt in ipairs(cat.options) do
                    if opt.isModified then
                        modifiedCount = modifiedCount + 1
                    end
                end
            end
        end
        mod.optionCount = optionCount
        mod.modifiedCount = modifiedCount

        unifiedData.mods[modId] = mod
    end
end

-- ============================================
-- PUBLIC API
-- ============================================

function DataAggregator.aggregate(ums)
    local unifiedData = {
        mods = {},
        sortedModIds = {},
        totalModCount = 0,
        totalModifiedCount = 0,
    }

    local usedIds = {}

    -- NS mods
    local ns = GetMod("nativeSettings")
    if ns and ns.data then
        local ok, err = pcall(aggregateNativeSetting, ns.data, unifiedData, usedIds)
        if not ok then
            print("[UMS] ERROR: NS aggregation failed: " .. tostring(err))
        end
    end

    -- MS mods
    if ModSettings then
        local ok, err = pcall(aggregateModSettings, unifiedData, usedIds)
        if not ok then
            print("[UMS] ERROR: MS aggregation failed: " .. tostring(err))
        end
    end

    -- Sort mod IDs alphabetically
    local sortedIds = {}
    for modId, mod in pairs(unifiedData.mods) do
        table.insert(sortedIds, { id = modId, sortName = mod.sortName })
    end
    table.sort(sortedIds, function(a, b) return a.sortName < b.sortName end)

    for _, entry in ipairs(sortedIds) do
        table.insert(unifiedData.sortedModIds, entry.id)
    end

    -- Totals
    local totalMods = 0
    local totalModified = 0
    for _, modId in ipairs(unifiedData.sortedModIds) do
        totalMods = totalMods + 1
        totalModified = totalModified + (unifiedData.mods[modId].modifiedCount or 0)
    end
    unifiedData.totalModCount = totalMods
    unifiedData.totalModifiedCount = totalModified

    -- Apply favorites
    local favOk, favErr = pcall(function() favorites.applyFavorites(unifiedData.mods) end)
    if not favOk then
        print("[UMS] WARNING: favorites.applyFavorites() failed: " .. tostring(favErr))
    end

    print(string.format("[UMS] Aggregated %d mods (%d modified settings)", totalMods, totalModified))

    return unifiedData
end

return DataAggregator
