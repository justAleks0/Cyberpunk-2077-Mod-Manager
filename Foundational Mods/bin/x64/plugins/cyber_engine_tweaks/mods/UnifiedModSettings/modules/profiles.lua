local Profiles = {}

local profileDir = "profiles"

-- ============================================
-- INIT
-- ============================================

function Profiles.init()
    pcall(os.execute, 'mkdir "' .. profileDir .. '" 2>nul')
end

-- ============================================
-- EXPORT
-- ============================================

function Profiles.export(unifiedData, profileName)
    if not profileName or profileName == "" then
        profileName = "profile_" .. os.date("%Y%m%d_%H%M%S")
    end

    local settings = {}
    local settingCount = 0

    for _, modId in ipairs(unifiedData.sortedModIds) do
        local mod = unifiedData.mods[modId]
        for _, catId in ipairs(mod.categoryOrder) do
            local cat = mod.categories[catId]
            if cat then
                for _, option in ipairs(cat.options) do
                    if option.hasValue and option.currentValue ~= nil then
                        local entry = {
                            id = option.id,
                            type = option.type,
                            value = option.currentValue,
                            label = option.label,
                            modName = mod.displayName,
                        }
                        if option.type == "selector" and option.elements then
                            entry.validationText = option.elements[option.currentValue]
                        end
                        table.insert(settings, entry)
                        settingCount = settingCount + 1
                    end
                end
            end
        end
    end

    local profile = {
        formatVersion = 1,
        profileName = profileName,
        exportDate = os.date("%Y-%m-%dT%H:%M:%S"),
        modCount = unifiedData.totalModCount,
        settingCount = settingCount,
        settings = settings,
    }

    local ok, encoded = pcall(json.encode, profile)
    if not ok then
        print("[UMS] ERROR encoding profile: " .. tostring(encoded))
        return false
    end

    local filePath = profileDir .. "/" .. profileName .. ".json"
    local file = io.open(filePath, "w")
    if not file then
        print("[UMS] ERROR writing profile to " .. filePath)
        return false
    end

    file:write(encoded)
    file:close()
    print("[UMS] Profile exported: " .. filePath .. " (" .. settingCount .. " settings)")
    return true
end

-- ============================================
-- IMPORT
-- ============================================

function Profiles.import(unifiedData, filePath)
    local file = io.open(filePath, "r")
    if not file then
        print("[UMS] ERROR: profile not found: " .. filePath)
        return nil
    end

    local content = file:read("*all")
    file:close()

    local ok, profile = pcall(json.decode, content)
    if not ok or not profile or not profile.settings then
        print("[UMS] ERROR: invalid profile format")
        return nil
    end

    local optionLookup = {}
    for _, mod in pairs(unifiedData.mods) do
        for _, catId in ipairs(mod.categoryOrder) do
            local cat = mod.categories[catId]
            if cat then
                for _, option in ipairs(cat.options) do
                    optionLookup[option.id] = option
                end
            end
        end
    end

    local callbackRouter = require("modules/callbackRouter")
    local applied = 0
    local skipped = {}
    local warnings = {}

    for _, entry in ipairs(profile.settings) do
        local option = optionLookup[entry.id]

        if not option then
            table.insert(skipped, entry.modName .. " > " .. entry.label .. " (mod not installed)")
        elseif option.type ~= entry.type then
            table.insert(skipped, entry.modName .. " > " .. entry.label .. " (type mismatch)")
        else
            if option.type == "selector" and entry.validationText and option.elements then
                local currentText = option.elements[entry.value]
                if currentText ~= entry.validationText then
                    table.insert(warnings, entry.modName .. " > " .. entry.label ..
                        " (enum changed: expected '" .. entry.validationText ..
                        "', got '" .. tostring(currentText) .. "')")
                end
            end

            callbackRouter.setValue(option, entry.value)
            applied = applied + 1
        end
    end

    local result = {
        profileName = profile.profileName,
        applied = applied,
        skipped = skipped,
        warnings = warnings,
    }

    print("[UMS] Profile imported: " .. applied .. " applied, " ..
          #skipped .. " skipped, " .. #warnings .. " warnings")

    return result
end

-- ============================================
-- LIST
-- ============================================

function Profiles.list()
    local profiles = {}
    local ok, files = pcall(function()
        local result = {}
        local p = io.popen('dir "' .. profileDir .. '" /b 2>nul')
        if p then
            for file in p:lines() do
                if string.match(file, "%.json$") then
                    table.insert(result, file)
                end
            end
            p:close()
        end
        return result
    end)

    if ok then profiles = files end
    return profiles
end

return Profiles
