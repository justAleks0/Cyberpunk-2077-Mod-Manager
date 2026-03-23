local Suppression = {}

local ums = nil
local nativeSettings = nil
local uiRenderer = nil
local dataAggregator = require("modules/dataAggregator")
local callbackRouter = require("modules/callbackRouter")
local umsConfig = require("modules/umsConfig")

-- ============================================
-- HELPERS
-- ============================================

local function isUmsActive()
    return nativeSettings and nativeSettings.fromMods and ums.isActive
end

local function safeCall(fn, ...)
    local ok, err = pcall(fn, ...)
    if not ok then
        print("[UnifiedModSettings] ERROR: " .. tostring(err))
    end
    return ok, err
end

-- ============================================
-- SEARCH POLLING (Codeware HubTextInput)
-- ============================================

local searchPollTimer = nil
local searchDebounceTimer = nil

local function startSearchPoll()
    if searchPollTimer then return end
    searchPollTimer = ums.Cron.Every(0.15, function()
        if not ums.isActive or ums.currentView ~= "search" then
            ums.Cron.Halt(searchPollTimer)
            searchPollTimer = nil
            return
        end
        local controller = ums.settingsMainController
        if not controller then return end
        safeCall(function() controller:UmsCheckPendingFocus() end)
        local newText = controller:UmsGetSearchText()
        if newText ~= ums.searchQuery then
            ums.searchQuery = newText
            if searchDebounceTimer then
                ums.Cron.Halt(searchDebounceTimer)
                searchDebounceTimer = nil
            end
            searchDebounceTimer = ums.Cron.After(0.2, function()
                searchDebounceTimer = nil
                local ctrl = ums.settingsMainController
                if ctrl and ums.isActive and ums.currentView == "search" then
                    uiRenderer.updateSearchResults(ums, ctrl)
                end
            end)
        end
    end)
end

local function stopSearchPoll()
    if searchPollTimer then
        ums.Cron.Halt(searchPollTimer)
        searchPollTimer = nil
    end
    if searchDebounceTimer then
        ums.Cron.Halt(searchDebounceTimer)
        searchDebounceTimer = nil
    end
end

-- ============================================
-- INITIALIZATION
-- ============================================

function Suppression.init(umsRef, uiRendererRef)
    ums = umsRef
    uiRenderer = uiRendererRef
    nativeSettings = GetMod("nativeSettings")

    if not nativeSettings then
        print("[UnifiedModSettings] Cannot initialize suppression: nativeSettings not found")
        return
    end

    if nativeSettings.version then
        print("[UnifiedModSettings] Native Settings version: " .. tostring(nativeSettings.version))
    end

    local bridge = GetMod("RedAndCetModsSettings")
    if bridge then
        print("[UnifiedModSettings] WARNING: 'Redscript And CET Mods Settings' detected. This mod is not needed with Unified Mod Settings and may cause conflicts.")
    end

    ums.Cron.NextTick(function()
        Suppression.registerOverrides()
        Suppression.registerObserves()
        Suppression.hookRefresh()
        print("[UnifiedModSettings] Suppression hooks registered (deferred)")
    end)

    pcall(function()
        umsConfig.registerInputListener()
        umsConfig.onFavoritePressed(function()
            if not ums.isActive then return end
            local controller = ums.settingsMainController
            if not controller then return end

            local fav = require("modules/favorites")
            local targetModId = nil

            if ums.hoveredOption and ums.hoveredOption.type == "modEntry" then
                targetModId = ums.hoveredOption.modId
            elseif ums.currentView == "modOptions" and ums.currentModId then
                targetModId = ums.currentModId
            end

            if targetModId and ums.unifiedData and ums.unifiedData.mods[targetModId] then
                fav.toggleMod(targetModId)
                ums.unifiedData.mods[targetModId].isFavorite = fav.isModFavorite(targetModId)
                controller:PlaySound("Button", "OnPress")
                uiRenderer.refreshCurrentView(ums, controller)
            end
        end)
    end)
end

-- ============================================
-- SETTINGSMAIN OVERRIDES
-- ============================================

function Suppression.registerOverrides()

    Override("SettingsMainGameController", "ShowBrightnessScreen", function(_, wrappedMethod)
        if nativeSettings.fromMods then return end
        wrappedMethod()
    end)

    Override("SettingsMainGameController", "ShowControllerScreen", function(_, wrappedMethod)
        if nativeSettings.fromMods then return end
        wrappedMethod()
    end)

    Override("SettingsMainGameController", "PopulateHints", function(this, wrappedMethod)
        if not nativeSettings.fromMods or not ums.isActive then
            wrappedMethod()
            return
        end
        uiRenderer.updateHints(ums, this)
    end)

    Override("SettingsMainGameController", "PopulateSettingsData", function(this, wrappedMethod)
        if not nativeSettings.fromMods or not ums.isActive then
            wrappedMethod()
            return
        end
    end)

    Override("SettingsMainGameController", "PopulateCategories", function(this, idx, wrappedMethod)
        if not nativeSettings.fromMods or not ums.isActive then
            wrappedMethod(idx)
            return
        end

        safeCall(function()
            this.selectorCtrl:Clear()
            local tabs = {
                "Modified",
                "Unified Mod Settings",
                "Favorites",
            }
            for _, name in ipairs(tabs) do
                local d = ListItemData.new()
                d.label = name
                this.selectorCtrl:PushData(d)
            end
            this.selectorCtrl:Refresh()
            this.selectorCtrl:SetToggledIndex(1)
        end)
    end)

    Override("SettingsMainGameController", "PopulateCategorySettingsOptions", function(this, idx, wrappedMethod)
        if not nativeSettings.fromMods or not ums.isActive then
            wrappedMethod(idx)
            return
        end

        ums.settingsOptionsList = this.settingsOptionsList
        ums.settingsMainController = this

        safeCall(function()
            if idx == 0 then
                stopSearchPoll()
                this:UmsShowSearchInput(false)
                uiRenderer.renderVirtualTab(ums, this, "modified")
            elseif idx == 1 then
                this:UmsShowSearchInput(true)
                uiRenderer.renderSearchView(ums, this)
                startSearchPoll()
            elseif idx == 2 then
                stopSearchPoll()
                this:UmsShowSearchInput(false)
                uiRenderer.renderVirtualTab(ums, this, "favorites")
            end
        end)
    end)

    Override("SettingsCategoryController", "Setup", function(this, label, wrappedMethod)
        if nativeSettings.fromMods and ums.isActive then
            local labelString = GetLocalizedTextByKey(label)
            if not labelString or labelString:len() == 0 then
                labelString = label.value
            end
            this.label:SetText(labelString)
        else
            wrappedMethod(label)
        end
    end)

    Override("SettingsMainGameController", "OnButtonRelease", function(this, event, wrappedMethod)
        if not isUmsActive() then
            wrappedMethod(event)
            return
        end

        if not event:IsAction("click") then
            if event:IsAction("select") or event:IsAction("one_click_confirm") then
                if ums.currentView == "search" or ums.currentView == "favorites" or ums.currentView == "modified" then
                    local isFocused = false
                    safeCall(function() isFocused = this:UmsIsSearchFocused() end)
                    if isFocused then
                        safeCall(function() this:UmsUnfocusSearch() end)
                        return
                    end
                end
            end
        end

        if event:IsAction("click") then
            if ums.currentView == "search" or ums.currentView == "favorites" or ums.currentView == "modified" then
                local isFocused = false
                safeCall(function() isFocused = this:UmsIsSearchFocused() end)
                if isFocused then
                    safeCall(function() this:UmsUnfocusSearch() end)
                end
            end
        end

        -- Back/Escape handling
        if event:IsAction("back") or event:IsAction("cancel") then
            local isFocused = false
            safeCall(function() isFocused = this:UmsIsSearchFocused() end)
            if isFocused then
                safeCall(function() this:UmsUnfocusSearch() end)
                ums.backHandledThisFrame = true
                return
            end

            if ums.currentView == "modOptions" then
                safeCall(function()
                    this:UmsShowSearchInput(true)
                    uiRenderer.renderSearchView(ums, this)
                    startSearchPoll()
                end)
                ums.backHandledThisFrame = true
                return
            end

            wrappedMethod(event)
            return
        end

        -- Tab navigation
        if event:IsAction("prior_menu") or event:IsAction("next_menu") then
            wrappedMethod(event)
            return
        end

    end)

    Override("SettingsMainGameController", "OnBack", function(this, userData, wrappedMethod)
        if not isUmsActive() then
            wrappedMethod(userData)
            return
        end

        if ums.backHandledThisFrame then
            ums.backHandledThisFrame = false
            return
        end

        wrappedMethod(userData)
    end)

    Override("SettingsMainGameController", "RequestRestoreDefaults", function(this, wrappedMethod)
        if not nativeSettings.fromMods then
            wrappedMethod()
            return
        end

        if not ums.isActive then
            wrappedMethod()
            return
        end

        safeCall(function()
            if ums.currentModId then
                local mod = ums.unifiedData and ums.unifiedData.mods[ums.currentModId]
                if mod then
                    callbackRouter.resetMod(mod)
                end
            end
        end)
    end)

    -- ============================================
    -- SELECTOR CONTROLLER OVERRIDES
    -- ============================================

    Override("SettingsSelectorControllerInt", "Refresh", function(this, wrappedMethod)
        if not isUmsActive() then
            wrappedMethod()
            return
        end

        safeCall(function()
            local option = callbackRouter.findOptionByController(ums, this)
            if not option then
                wrappedMethod()
                return
            end
            local sliderController = this.sliderWidget:GetControllerByType("inkSliderController")
            callbackRouter.setValue(option, this.newValue)
            this.ValueText:SetText(tostring(this.newValue))
            sliderController:ChangeValue(math.floor(this.newValue))
        end)
    end)

    Override("SettingsSelectorControllerInt", "ChangeValue", function(this, forward, wrappedMethod)
        if not isUmsActive() then
            wrappedMethod(forward)
            return
        end

        safeCall(function()
            local option = callbackRouter.findOptionByController(ums, this)
            if not option then
                wrappedMethod(forward)
                return
            end
            if forward then
                this.newValue = this.newValue + (option.step or 1)
            else
                this.newValue = this.newValue - (option.step or 1)
            end
            this.newValue = math.max(math.min(option.max or this.newValue, this.newValue), option.min or this.newValue)
            this:Refresh()
        end)
    end)

    Override("SettingsSelectorControllerInt", "AcceptValue", function(this, forward, wrappedMethod)
        if not isUmsActive() then
            wrappedMethod(forward)
            return
        end

        safeCall(function()
            local option = callbackRouter.findOptionByController(ums, this)
            if not option then
                wrappedMethod(forward)
                return
            end
            if forward then
                this.newValue = this.newValue + (option.step or 1)
            else
                this.newValue = this.newValue - (option.step or 1)
            end
            this.newValue = math.max(math.min(option.max or this.newValue, this.newValue), option.min or this.newValue)
            this:Refresh()
        end)
    end)

    Override("SettingsSelectorControllerFloat", "Refresh", function(this, wrappedMethod)
        if not isUmsActive() then
            wrappedMethod()
            return
        end

        safeCall(function()
            local option = callbackRouter.findOptionByController(ums, this)
            if not option then
                wrappedMethod()
                return
            end
            local sliderController = this.sliderWidget:GetControllerByType("inkSliderController")
            callbackRouter.setValue(option, this.newValue)
            this.ValueText:SetText(string.format(option.format or "%.2f", this.newValue))
            sliderController:ChangeValue(this.newValue)
        end)
    end)

    Override("SettingsSelectorControllerFloat", "ChangeValue", function(this, forward, wrappedMethod)
        if not isUmsActive() then
            wrappedMethod(forward)
            return
        end

        safeCall(function()
            local option = callbackRouter.findOptionByController(ums, this)
            if not option then
                wrappedMethod(forward)
                return
            end
            if forward then
                this.newValue = this.newValue + (option.step or 0.1)
            else
                this.newValue = this.newValue - (option.step or 0.1)
            end
            this.newValue = math.max(math.min(option.max or this.newValue, this.newValue), option.min or this.newValue)
            this:Refresh()
        end)
    end)

    Override("SettingsSelectorControllerFloat", "AcceptValue", function(this, forward, wrappedMethod)
        if not isUmsActive() then
            wrappedMethod(forward)
            return
        end

        safeCall(function()
            local option = callbackRouter.findOptionByController(ums, this)
            if not option then
                wrappedMethod(forward)
                return
            end
            if forward then
                this.newValue = this.newValue + (option.step or 0.1)
            else
                this.newValue = this.newValue - (option.step or 0.1)
            end
            this.newValue = math.max(math.min(option.max or this.newValue, this.newValue), option.min or this.newValue)
            this:Refresh()
        end)
    end)

    Override("SettingsSelectorControllerKeyBinding", "PrepareInputTag", function(key, group, action, wrappedMethod)
        return wrappedMethod(key, group, action)
    end)

    Override("SettingsSelectorControllerKeyBinding", "Refresh", function(this, wrappedMethod)
        if not isUmsActive() then
            wrappedMethod()
            return
        end

        safeCall(function()
            local option = callbackRouter.findOptionByController(ums, this)
            if not option then
                wrappedMethod()
                return
            end

            this.text:SetText(SettingsSelectorControllerKeyBinding.PrepareInputTag(option.currentValue or "", "None", option.isHold and "hold_input" or "None"))
            this:TriggerActionFeedback()
        end)
    end)
end

-- ============================================
-- OBSERVE HOOKS (ADDITIVE)
-- ============================================

function Suppression.registerObserves()

    Observe("SettingsMainGameController", "OnInitialize", function(this)
        if not nativeSettings.fromMods then return end
        ums.settingsMainController = this

        local ok = safeCall(function()
            ums.unifiedData = dataAggregator.aggregate(ums)
        end)
        if ok and ums.unifiedData then
            ums.isActive = true
            print("[UMS] Activated: " .. tostring(ums.unifiedData.totalModCount) .. " mods aggregated")
        end
    end)

    ObserveAfter("SettingsMainGameController", "OnInitialize", function(this)
        if not nativeSettings.fromMods then return end
        ums.settingsOptionsList = this.settingsOptionsList
        ums.settingsMainController = this

        if ums.isActive then
            local rootWidget = this:GetRootCompoundWidget()
            if rootWidget then
                local extra = rootWidget:GetWidgetByPath(BuildWidgetPath({ "wrapper", "extra" }))
                if extra then extra:SetVisible(false) end

                local outerWrapper = rootWidget:GetWidgetByPath(BuildWidgetPath({ "wrapper" }))
                if outerWrapper then
                    local searchBox = inkCanvas.new()
                    searchBox:SetName(StringToName("umsSearchBox"))
                    searchBox:SetSize(Vector2.new({ X = 300, Y = 50 }))
                    searchBox:SetAnchor(inkEAnchor.TopLeft)
                    searchBox:SetAnchorPoint(Vector2.new({ X = 0, Y = 0 }))
                    searchBox:SetMargin(inkMargin.new({ left = 60.0, top = 75.0, right = 0.0, bottom = 0.0 }))
                    searchBox:SetInteractive(true)
                    searchBox:SetVisible(true)
                    searchBox:Reparent(outerWrapper, -1)

                    this:UmsCreateSearchInput(searchBox)
                    ums.searchBox = searchBox
                end
            end
            if this.descriptionText then
                this.descriptionText:SetText("")
                this.descriptionText:SetVisible(false)
            end
        end
    end)

    Observe("SettingsMainGameController", "RequestClose", function(this)
        if not ums.isActive then return end

        safeCall(function()
            if ums.currentModId and ums.unifiedData then
                local mod = ums.unifiedData.mods[ums.currentModId]
                if mod and mod._nsClosedCallback then
                    pcall(mod._nsClosedCallback)
                end
            end
            callbackRouter.clearControllers()
        end)

        stopSearchPoll()
        uiRenderer.cleanup(ums)
        ums.isActive = false
        ums.settingsMainController = nil
        ums.settingsOptionsList = nil
        ums.currentModId = nil
        ums.currentView = "search"
        ums.searchQuery = ""
        ums.hoveredOption = nil
        ums.searchBox = nil
        ums.unifiedData = nil
    end)

    ObserveAfter("SettingsMainGameController", "OnSettingHoverOver", function(this, evt)
        if not isUmsActive() then return end

        safeCall(function()
            local currentItem = evt:GetCurrentTarget():GetController()
            local option = callbackRouter.findOptionByController(ums, currentItem)

            ums.hoveredOption = option
            if option and option.description and option.description ~= "" then
                this.descriptionText:SetText(option.description)
                this.descriptionText:SetVisible(true)
            else
                this.descriptionText:SetText("")
                this.descriptionText:SetVisible(false)
            end

            if option and option.type == "modEntry" then
                local rootW = currentItem:GetRootWidget()
                if rootW then
                    local cyanColor = HDRColor.new({ Red = 0.368, Green = 0.964, Blue = 1.0, Alpha = 1.0 })
                    local favTag = rootW:GetWidgetByPathName(StringToName("umsFavTag"))
                    if favTag then favTag:SetTintColor(cyanColor) end
                    local modTag = rootW:GetWidgetByPathName(StringToName("umsModTag"))
                    if modTag then modTag:SetTintColor(cyanColor) end
                end
            end
        end)
    end)

    ObserveAfter("SettingsMainGameController", "OnSettingHoverOut", function(this, evt)
        if not isUmsActive() then return end

        safeCall(function()
            local currentItem = evt:GetCurrentTarget():GetController()

            if ums.hoveredOption and ums.hoveredOption.type == "modEntry" then
                local rootW = currentItem:GetRootWidget()
                if rootW then
                    local redColor = HDRColor.new({ Red = 1.1761, Green = 0.3809, Blue = 0.3476, Alpha = 1.0 })
                    local favTag = rootW:GetWidgetByPathName(StringToName("umsFavTag"))
                    if favTag then favTag:SetTintColor(redColor) end
                    local modTag = rootW:GetWidgetByPathName(StringToName("umsModTag"))
                    if modTag then modTag:SetTintColor(redColor) end
                end
            end

            ums.hoveredOption = nil
            this.descriptionText:SetText("")
            this.descriptionText:SetVisible(false)
        end)
    end)

    Observe("SettingsSelectorControllerBool", "AcceptValue", function(this)
        if not isUmsActive() then return end

        safeCall(function()
            local option = callbackRouter.findOptionByController(ums, this)
            if not option then return end

            if option.type == "switch" then
                local newVal = not option.currentValue
                callbackRouter.setValue(option, newVal)
                this.onState:SetVisible(newVal)
                this.offState:SetVisible(not newVal)
            end
        end)
    end)

    Observe("SettingsSelectorControllerBool", "OnShortcutPress", function(this, event)
        if not isUmsActive() then return end

        safeCall(function()
            local option = callbackRouter.findOptionByController(ums, this)
            if not option then return end
            if not event:IsAction("click") then return end

            if option.type == "modEntry" then
                this:PlaySound("Button", "OnPress")
                stopSearchPoll()
                if ums.settingsMainController then
                    ums.settingsMainController:UmsShowSearchInput(false)
                end
                uiRenderer.renderModOptions(ums, ums.settingsMainController, option.modId)
                return
            end

            if option.type == "backButton" then
                this:PlaySound("Button", "OnPress")
                if ums.settingsMainController then
                    ums.settingsMainController:UmsShowSearchInput(true)
                end
                uiRenderer.renderSearchView(ums, ums.settingsMainController)
                startSearchPoll()
                return
            end

            if option.type == "button" then
                callbackRouter.setValue(option, nil)
            end
        end)
    end)

    Observe("SettingsSelectorControllerListString", "ChangeValue", function(this, forward)
        if not isUmsActive() then return end

        safeCall(function()
            local option = callbackRouter.findOptionByController(ums, this)
            if not option then return end

            local idx = option.currentValue or 1
            if forward then
                idx = idx + 1
            else
                idx = idx - 1
            end

            if idx > #option.elements then
                idx = 1
            elseif idx < 1 then
                idx = #option.elements
            end

            this.ValueText:SetText(tostring(option.elements[idx]))
            this:SelectDot(idx - 1)

            callbackRouter.setValue(option, idx)
        end)
    end)

    Override("SettingsSelectorControllerKeyBinding", "SetValue", function(this, key, wrappedMethod)
        if not isUmsActive() then
            wrappedMethod(key)
            return
        end

        safeCall(function()
            local option = callbackRouter.findOptionByController(ums, this)
            if not option then
                wrappedMethod(key)
                return
            end

            local keyStr = key.value
            this.text:SetText(SettingsSelectorControllerKeyBinding.PrepareInputTag(keyStr, "None", option.isHold and "hold_input" or "None"))
            callbackRouter.setValue(option, keyStr)
        end)
    end)
end

-- ============================================
-- NS REFRESH HOOK
-- ============================================

function Suppression.hookRefresh()
    if not nativeSettings.refresh then return end

    local originalRefresh = nativeSettings.refresh
    nativeSettings.refresh = function()
        if not ums.isActive then
            originalRefresh()
            return
        end

        safeCall(function()
            ums.unifiedData = dataAggregator.aggregate(ums)
            if ums.settingsMainController then
                uiRenderer.refreshCurrentView(ums, ums.settingsMainController)
                if ums.currentView == "search" then
                    startSearchPoll()
                end
            end
        end)
    end
end

return Suppression
