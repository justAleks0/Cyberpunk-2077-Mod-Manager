local CallbackRouter = {}

-- ============================================
-- CONTROLLER REGISTRY
-- ============================================

CallbackRouter.controllerList = {}

local function isSameInstance(a, b)
    if a == nil or b == nil then return false end
    return Game["OperatorEqual;IScriptableIScriptable;Bool"](a, b)
end

function CallbackRouter.registerController(controller, option)
    if not controller then return end
    table.insert(CallbackRouter.controllerList, { controller = controller, option = option })
end

function CallbackRouter.findOptionByController(ums, controller)
    if not controller then return nil end
    for _, entry in ipairs(CallbackRouter.controllerList) do
        if isSameInstance(entry.controller, controller) then
            return entry.option
        end
    end
    return nil
end

function CallbackRouter.clearControllers()
    CallbackRouter.controllerList = {}
end

-- ============================================
-- NS VALUE WRITEBACK
-- ============================================

local function setNsValue(option, newValue)
    local nsOpt = option._nsOption
    if not nsOpt then
        print("[UMS] ERROR: NS option ref missing for setValue")
        return
    end

    local t = option.type
    if t == "switch" then
        nsOpt.state = newValue
        option.currentValue = newValue
    elseif t == "sliderInt" or t == "sliderFloat" then
        nsOpt.currentValue = newValue
        option.currentValue = newValue
    elseif t == "selector" then
        nsOpt.selectedElementIndex = newValue
        option.currentValue = newValue
    elseif t == "keyBinding" then
        nsOpt.value = newValue
        option.currentValue = newValue
    elseif t == "button" then
        -- no value to set
    end

    if nsOpt.callback then
        local ok, err
        if t == "button" then
            ok, err = pcall(nsOpt.callback)
        else
            ok, err = pcall(nsOpt.callback, newValue)
        end
        if not ok then
            print("[UMS] ERROR: NS callback failed for '" .. tostring(option.label) .. "': " .. tostring(err))
        end
    end
end

-- ============================================
-- MS VALUE ROUTING
-- ============================================

local function setMsValue(option, newValue)
    local cv = option._configVar
    if not cv then
        print("[UMS] ERROR: MS ConfigVar ref missing for setValue")
        return
    end

    local t = option.type
    local ok, err

    if t == "switch" then
        ok, err = pcall(function() cv:SetValue(newValue) end)
    elseif t == "sliderInt" or t == "sliderFloat" then
        ok, err = pcall(function() cv:SetValue(newValue) end)
    elseif t == "selector" then
        ok, err = pcall(function() cv:SetIndex(newValue - 1) end)
    elseif t == "keyBinding" then
        ok, err = pcall(function() cv:SetValueName(StringToName(newValue)) end)
    elseif t == "name" then
        ok, err = pcall(function() cv:SetValue(StringToName(newValue)) end)
    end

    if ok == nil then
        print("[UMS] ERROR: MS unsupported type '" .. tostring(t) .. "'")
        return
    end

    if not ok then
        print("[UMS] ERROR: MS SetValue failed for type '" .. tostring(t) .. "': " .. tostring(err))
        return
    end

    option.currentValue = newValue

    local aok, aerr = pcall(function() ModSettings.AcceptChanges() end)
    if not aok then
        print("[UMS] ERROR: ModSettings.AcceptChanges() failed: " .. tostring(aerr))
    end
end

-- ============================================
-- PUBLIC API
-- ============================================

function CallbackRouter.setValue(option, newValue)
    if not option then return end

    if option._source == "nativeSettings" then
        setNsValue(option, newValue)
    elseif option._source == "modSettings" then
        setMsValue(option, newValue)
    else
        print("[UMS] ERROR: Unknown option source '" .. tostring(option._source) .. "'")
    end

    if option.type ~= "button" then
        option.isModified = (option.currentValue ~= option.defaultValue)
    end
end

function CallbackRouter.resetOption(option)
    if not option then return end
    if option.defaultValue == nil then return end
    CallbackRouter.setValue(option, option.defaultValue)
end

function CallbackRouter.resetMod(mod)
    if not mod then return end

    if mod.source == "nativeSettings" then
        if mod._nsRestoreDefaultsCallback then
            mod._nsRestoreDefaultsCallback()
            if mod._nsOverrideNativeRestore then
                return
            end
        end

        for _, catId in ipairs(mod.categoryOrder) do
            local cat = mod.categories[catId]
            if cat and cat.options then
                for _, option in ipairs(cat.options) do
                    if option.defaultValue ~= nil and option.type ~= "button" then
                        CallbackRouter.setValue(option, option.defaultValue)
                    end
                end
            end
        end

    elseif mod.source == "modSettings" then
        if mod._msModName then
            local ok, err = pcall(function()
                ModSettings.RestoreDefaults(mod._msModName)
                ModSettings.AcceptChanges()
            end)
            if not ok then
                print("[UMS] ERROR: ModSettings.RestoreDefaults() failed: " .. tostring(err))
            end
        else
            print("[UMS] ERROR: MS mod missing _msModName for resetMod")
        end
    end
end

return CallbackRouter
