local UmsConfig = {}

local configPath = "ums_config.json"

local defaults = {
    keyboardFavoriteKey = "IK_Tab",
    controllerFavoriteKey = "IK_Pad_Y_TRIANGLE",
}

local config = {}
local inputListener = nil
local favoriteCallback = nil

function UmsConfig.load()
    config = {}
    for k, v in pairs(defaults) do config[k] = v end

    local file = io.open(configPath, "r")
    if file then
        local content = file:read("*all")
        file:close()
        local ok, data = pcall(json.decode, content)
        if ok and data then
            for k, v in pairs(data) do
                if defaults[k] ~= nil then
                    config[k] = v
                end
            end
        end
    end
end

function UmsConfig.save()
    local ok, encoded = pcall(json.encode, config)
    if ok then
        local file = io.open(configPath, "w")
        if file then
            file:write(encoded)
            file:close()
        end
    end
end

function UmsConfig.get(key)
    return config[key] or defaults[key]
end

-- ============================================
-- RAW INPUT LISTENER
-- ============================================

function UmsConfig.onFavoritePressed(callback)
    favoriteCallback = callback
end

local function handleKeyInput(event)
    local key = event:GetKey().value
    local action = event:GetAction().value
    if action ~= "IACT_Release" then return end

    local kbKey = config.keyboardFavoriteKey or defaults.keyboardFavoriteKey
    local ctrlKey = config.controllerFavoriteKey or defaults.controllerFavoriteKey

    if key == kbKey or key == ctrlKey then
        if favoriteCallback then
            favoriteCallback()
        end
    end
end

function UmsConfig.registerInputListener()
    if inputListener then return end

    inputListener = NewProxy({
        OnKeyInput = {
            args = { "handle:KeyInputEvent" },
            callback = handleKeyInput,
        }
    })
    Game.GetCallbackSystem():RegisterCallback("Input/Key", inputListener:Target(), inputListener:Function("OnKeyInput"), true)
end

-- ============================================
-- NATIVE SETTINGS REGISTRATION
-- ============================================

function UmsConfig.registerNativeSettings()
    local nativeSettings = GetMod("nativeSettings")
    if not nativeSettings then return end

    nativeSettings.addTab("/ums", "Unified Mod Settings")
    nativeSettings.addSubcategory("/ums/keybinds", "Keybinds")

    nativeSettings.addKeyBinding("/ums/keybinds", "Keyboard Favorite Key", "Press any key to set as the favorite toggle key.", config.keyboardFavoriteKey, defaults.keyboardFavoriteKey, false, function(key)
        config.keyboardFavoriteKey = key
        UmsConfig.save()
    end)

    nativeSettings.addKeyBinding("/ums/keybinds", "Controller Favorite Button", "Press any button to set as the favorite toggle button.", config.controllerFavoriteKey, defaults.controllerFavoriteKey, false, function(key)
        config.controllerFavoriteKey = key
        UmsConfig.save()
    end)
end

UmsConfig.load()

return UmsConfig
