local UnifiedModSettings = {
    version = "1.0.0",
    isActive = false,
    fromMods = false,
    settingsMainController = nil,
    currentModId = nil,
    currentView = "search",
    searchQuery = "",
    hoveredOption = nil,
    unifiedData = nil,

    Cron = require("lib/Cron"),
}

local dataAggregator = nil
local uiRenderer = nil
local suppression = nil
local callbackRouter = nil
local favorites = nil
local profiles = nil
local search = nil
local hiddenMods = nil

registerForEvent("onInit", function()
    local ok, err = pcall(function()
        local ns = GetMod("nativeSettings")
        if not ns then
            print("[UnifiedModSettings] WARNING: Native Settings UI not found. CET mod settings will not be available.")
        end

        dataAggregator = require("modules/dataAggregator")
        uiRenderer = require("modules/umsRenderer")
        suppression = require("modules/suppression")
        callbackRouter = require("modules/callbackRouter")
        favorites = require("modules/favorites")
        profiles = require("modules/profiles")
        search = require("modules/search")
        hiddenMods = require("modules/hiddenMods")

        suppression.init(UnifiedModSettings, uiRenderer)
        favorites.init(UnifiedModSettings)
        profiles.init()
        hiddenMods.load()

        pcall(function()
            local umsConfig = require("modules/umsConfig")
            umsConfig.registerNativeSettings()
        end)

        print("[UnifiedModSettings] v" .. UnifiedModSettings.version .. " initialized")
    end)

    if not ok then
        print("[UnifiedModSettings] CRITICAL ERROR during init: " .. tostring(err))
        print("[UnifiedModSettings] Falling back to original menu systems")
    end
end)

registerForEvent("onUpdate", function(deltaTime)
    if UnifiedModSettings.Cron then
        UnifiedModSettings.Cron.Update(deltaTime)
    end
end)

return UnifiedModSettings
