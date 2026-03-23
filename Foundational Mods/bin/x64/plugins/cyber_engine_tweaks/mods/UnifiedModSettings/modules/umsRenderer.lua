local UIRenderer = {}

local callbackRouter = require("modules/callbackRouter")
local hiddenMods = require("modules/hiddenMods")

-- ============================================
-- STATE
-- ============================================

local cachedOptionsList = nil
local optionWidgetCount = 0
local cachedUms = nil
local cachedController = nil

local search = require("modules/search")

local FONT_FAMILY = "base\\gameplay\\gui\\fonts\\raj\\raj.inkfontfamily"

local COLOR_YELLOW = nil
local COLOR_RED = nil
local COLOR_DIM = nil
local COLOR_MODIFIED_DOT = nil
local COLOR_CYAN = nil

local function ensureColors()
    if COLOR_YELLOW then return end
    COLOR_YELLOW = HDRColor.new({ Red = 1.1761, Green = 0.8, Blue = 0.2, Alpha = 1.0 })
    COLOR_RED = HDRColor.new({ Red = 1.1761, Green = 0.3809, Blue = 0.3476, Alpha = 1.0 })
    COLOR_DIM = HDRColor.new({ Red = 0.7, Green = 0.7, Blue = 0.7, Alpha = 1.0 })
    COLOR_MODIFIED_DOT = HDRColor.new({ Red = 1.1761, Green = 0.8, Blue = 0.2, Alpha = 1.0 })
    COLOR_CYAN = HDRColor.new({ Red = 0.368, Green = 0.964, Blue = 1.0, Alpha = 1.0 })
end

-- ============================================
-- HELPERS
-- ============================================

local function getNextOptionName()
    local name = "ums_opt_" .. optionWidgetCount
    optionWidgetCount = optionWidgetCount + 1
    return name
end

local function setTabLabel(controller, index, label)
    if not controller then return end
    pcall(function()
        controller.selectorCtrl:Clear()
        local tabs = { "Modified", label, "Favorites" }
        for _, name in ipairs(tabs) do
            local d = ListItemData.new()
            d.label = name
            controller.selectorCtrl:PushData(d)
        end
        controller.selectorCtrl:Refresh()
    end)
end

local function clearOptionsList(controller)
    if cachedOptionsList then
        cachedOptionsList:RemoveAllChildren()
    end
    controller.settingsElements = {}
    callbackRouter.clearControllers()
    optionWidgetCount = 0
end

local function ensureOptionsList(controller)
    if not cachedOptionsList then
        local optionsList = controller.settingsOptionsList
        if optionsList then cachedOptionsList = optionsList.widget end
    end
    return cachedOptionsList ~= nil
end

local function hideRightSide(ctrl)
    local container = ctrl:GetRootWidget():GetWidgetByPath(BuildWidgetPath({ "layout", "container" }))
    if container then container:SetVisible(false) end
end

local function hideToggle(ctrl)
    local root = ctrl:GetRootWidget():GetWidgetByPath(BuildWidgetPath({ "layout", "container" }))

    local onBody = root:GetWidgetByPath(BuildWidgetPath({ "onState", "body" }))
    if onBody then
        local b = onBody:GetWidgetByPath(BuildWidgetPath({ "button" }))
        if b then b:SetVisible(false) end
        local t = onBody:GetWidgetByPath(BuildWidgetPath({ "txtValue" }))
        if t then t:SetVisible(false) end
        local bd = onBody:GetWidgetByPath(BuildWidgetPath({ "buttonBorder" }))
        if bd then bd:SetVisible(false) end
    end

    local offBody = root:GetWidgetByPath(BuildWidgetPath({ "offState", "body" }))
    if offBody then
        local b2 = offBody:GetWidgetByPath(BuildWidgetPath({ "button" }))
        if b2 then b2:SetVisible(false) end
        local t2 = offBody:GetWidgetByPath(BuildWidgetPath({ "txtValue" }))
        if t2 then t2:SetVisible(false) end
        local bd2 = offBody:GetWidgetByPath(BuildWidgetPath({ "buttonBorder" }))
        if bd2 then bd2:SetVisible(false) end
    end

    ctrl.offStateBody:UnregisterFromCallback("OnRelease", ctrl, "OnLeft")
    ctrl.onStateBody:UnregisterFromCallback("OnRelease", ctrl, "OnRight")
end

-- ============================================
-- CLEANUP
-- ============================================

function UIRenderer.cleanup(ums)
    cachedOptionsList = nil
    cachedUms = nil
    cachedController = nil
    optionWidgetCount = 0
end

-- ============================================
-- MOD OPTIONS RENDERING
-- ============================================

function UIRenderer.renderModOptions(ums, controller, modId)
    if not controller then return end
    if not ensureOptionsList(controller) then return end

    cachedUms = ums
    cachedController = controller
    clearOptionsList(controller)

    if not modId then return end

    ums.currentModId = modId
    ums.currentView = "modOptions"

    local mod = ums.unifiedData and ums.unifiedData.mods[modId]
    if not mod then
        print("[UMS] ERROR: Mod '" .. tostring(modId) .. "' not found in unified data")
        return
    end

    pcall(setTabLabel, controller, 1, mod.displayName or modId)

    -- Back button
    local backName = getNextOptionName()
    local backWidget = controller:SpawnFromLocal(cachedOptionsList, "settingsSelectorBool")
    if backWidget then
        backWidget:SetName(StringToName(backName))
        local backCtrl = backWidget:GetController()
        backCtrl.LabelText:SetText("< BACK")
        hideRightSide(backCtrl)
        backCtrl:RegisterToCallback("OnHoverOver", controller, "OnSettingHoverOver")
        backCtrl:RegisterToCallback("OnHoverOut", controller, "OnSettingHoverOut")
        controller.settingsElements = UIRenderer.nativeInsert(controller.settingsElements, backCtrl)
        callbackRouter.registerController(backCtrl, {
            type = "backButton",
            label = "Back",
            description = "",
        })
    end

    if controller.descriptionText then
        controller.descriptionText:SetVisible(true)
    end

    for _, catId in ipairs(mod.categoryOrder) do
        local cat = mod.categories[catId]
        if cat then
            if catId ~= "_root" and cat.label and cat.label ~= "" then
                UIRenderer.spawnCategoryHeader(controller, cat.label)
            end

            if cat.options then
                for _, option in ipairs(cat.options) do
                    UIRenderer.spawnOption(ums, controller, option)
                end
            end
        end
    end

    UIRenderer.updateHints(ums, controller)
end

-- ============================================
-- SEARCH VIEW (A-Z grouped mod browser)
-- ============================================

function UIRenderer.renderSearchView(ums, controller)
    if not controller then return end
    if not ensureOptionsList(controller) then return end

    cachedUms = ums
    cachedController = controller
    clearOptionsList(controller)

    ums.currentView = "search"
    ums.currentModId = nil

    pcall(setTabLabel, controller, 1, "Unified Mod Settings")

    if controller.descriptionText then
        controller.descriptionText:SetText("")
        controller.descriptionText:SetVisible(false)
    end

    if not ums.unifiedData or not ums.unifiedData.sortedModIds then return end

    if ums.searchQuery ~= "" then
        UIRenderer.renderSearchResults(ums, controller)
    else
        UIRenderer.renderModBrowserAZ(ums, controller)
    end

    UIRenderer.updateHints(ums, controller)
end

-- ============================================
-- SEARCH RESULTS (filtered by query)
-- ============================================

function UIRenderer.renderSearchResults(ums, controller)
    local results = search.filter(ums.unifiedData, ums.searchQuery)
    if not results or #results == 0 then
        UIRenderer.spawnCategoryHeader(controller, "No results for: " .. ums.searchQuery)
        return
    end

    for _, result in ipairs(results) do
        UIRenderer.spawnCategoryHeader(controller, result.mod.displayName or "Unknown")
        for _, option in ipairs(result.options) do
            UIRenderer.spawnOption(ums, controller, option)
        end
    end
end

-- ============================================
-- SEARCH RESULTS UPDATE (incremental, keeps input widget)
-- ============================================

function UIRenderer.updateSearchResults(ums, controller)
    if not controller then return end
    if not ensureOptionsList(controller) then return end
    if not ums.unifiedData or not ums.unifiedData.sortedModIds then return end

    clearOptionsList(controller)

    if ums.searchQuery ~= "" then
        UIRenderer.renderSearchResults(ums, controller)
    else
        UIRenderer.renderModBrowserAZ(ums, controller)
    end
end

-- ============================================
-- A-Z MOD BROWSER (no query)
-- ============================================

function UIRenderer.renderModBrowserAZ(ums, controller)
    local groups = {}
    local groupOrder = {}
    local groupSeen = {}

    for _, modId in ipairs(ums.unifiedData.sortedModIds) do
        local mod = ums.unifiedData.mods[modId]
        if mod and not hiddenMods.isHidden(modId) then
            local name = mod.displayName or modId
            local firstChar = name:sub(1, 1):upper()
            if not firstChar:match("%a") then firstChar = "#" end

            if not groupSeen[firstChar] then
                groupSeen[firstChar] = true
                table.insert(groupOrder, firstChar)
                groups[firstChar] = {}
            end
            table.insert(groups[firstChar], { modId = modId, mod = mod })
        end
    end

    for _, letter in ipairs(groupOrder) do
        UIRenderer.spawnCategoryHeader(controller, letter)

        for _, entry in ipairs(groups[letter]) do
            local widgetName = getNextOptionName()
            local widget = controller:SpawnFromLocal(cachedOptionsList, "settingsSelectorBool")
            if widget then
                widget:SetName(StringToName(widgetName))
                local ctrl = widget:GetController()
                local displayName = entry.mod.displayName or entry.modId
                local modCount = entry.mod.modifiedCount or 0
                local hasModified = modCount > 0
                local isFav = entry.mod.isFavorite

                ensureColors()
                ctrl.LabelText:SetText(displayName)
                ctrl.LabelText:SetFontSize(42)
                hideRightSide(ctrl)

                local rootCanvas = ctrl:GetRootWidget()
                if rootCanvas then
                    local tagOffset = 1700.0

                    if isFav then
                        local favTag = inkText.new()
                        favTag:SetName(StringToName("umsFavTag"))
                        favTag:SetFontFamily(FONT_FAMILY)
                        favTag:SetFontStyle("Medium")
                        favTag:SetFontSize(38)
                        favTag:SetText("[F]")
                        favTag:SetTintColor(COLOR_RED)
                        favTag:SetAnchor(inkEAnchor.TopLeft)
                        favTag:SetMargin(inkMargin.new({ left = tagOffset, top = 10.0, right = 0.0, bottom = 0.0 }))
                        favTag:Reparent(rootCanvas, -1)
                        tagOffset = tagOffset + 70.0
                    end

                    if hasModified then
                        local modTag = inkText.new()
                        modTag:SetName(StringToName("umsModTag"))
                        modTag:SetFontFamily(FONT_FAMILY)
                        modTag:SetFontStyle("Medium")
                        modTag:SetFontSize(38)
                        modTag:SetText("[M]")
                        modTag:SetTintColor(COLOR_RED)
                        modTag:SetAnchor(inkEAnchor.TopLeft)
                        modTag:SetMargin(inkMargin.new({ left = tagOffset, top = 10.0, right = 0.0, bottom = 0.0 }))
                        modTag:Reparent(rootCanvas, -1)
                    end
                end

                ctrl:RegisterToCallback("OnHoverOver", controller, "OnSettingHoverOver")
                ctrl:RegisterToCallback("OnHoverOut", controller, "OnSettingHoverOut")
                controller.settingsElements = UIRenderer.nativeInsert(controller.settingsElements, ctrl)

                local descParts = { (entry.mod.optionCount or 0) .. " settings" }
                if hasModified then table.insert(descParts, modCount .. " modified") end

                callbackRouter.registerController(ctrl, {
                    type = "modEntry",
                    modId = entry.modId,
                    label = displayName,
                    description = table.concat(descParts, " | "),
                })
            end
        end
    end
end

-- ============================================
-- VIRTUAL TAB VIEWS (favorites, modified)
-- ============================================

function UIRenderer.renderVirtualTab(ums, controller, viewType)
    if not controller then return end
    if not ensureOptionsList(controller) then return end

    cachedUms = ums
    cachedController = controller
    clearOptionsList(controller)

    ums.currentView = viewType
    ums.currentModId = nil

    if not ums.unifiedData then return end

    for _, modId in ipairs(ums.unifiedData.sortedModIds) do
        local mod = ums.unifiedData.mods[modId]
        if mod then
            if viewType == "favorites" then
                if mod.isFavorite then
                    UIRenderer.spawnCategoryHeader(controller, mod.displayName or modId)
                    for _, catId in ipairs(mod.categoryOrder) do
                        local cat = mod.categories[catId]
                        if cat and cat.options then
                            for _, option in ipairs(cat.options) do
                                UIRenderer.spawnOption(ums, controller, option)
                            end
                        end
                    end
                end
            elseif viewType == "modified" then
                local hasModified = false
                for _, catId in ipairs(mod.categoryOrder) do
                    local cat = mod.categories[catId]
                    if cat and cat.options then
                        for _, option in ipairs(cat.options) do
                            if option.isModified then
                                hasModified = true
                                break
                            end
                        end
                    end
                    if hasModified then break end
                end

                if hasModified then
                    UIRenderer.spawnCategoryHeader(controller, mod.displayName or modId)
                    for _, catId in ipairs(mod.categoryOrder) do
                        local cat = mod.categories[catId]
                        if cat and cat.options then
                            for _, option in ipairs(cat.options) do
                                if option.isModified then
                                    UIRenderer.spawnOption(ums, controller, option)
                                end
                            end
                        end
                    end
                end
            end
        end
    end

    UIRenderer.updateHints(ums, controller)
end

-- ============================================
-- CATEGORY HEADER
-- ============================================

function UIRenderer.spawnCategoryHeader(controller, label)
    if not cachedOptionsList then return end

    local categoryWidget = controller:SpawnFromLocal(cachedOptionsList, "settingsCategory")
    if not categoryWidget then
        print("[UMS] ERROR: Failed to spawn settingsCategory")
        return
    end

    categoryWidget:SetName(StringToName("umsCat_" .. getNextOptionName()))
    local ctrl = categoryWidget:GetController()
    if IsDefined(ctrl) then
        ctrl:Setup(StringToName(label))
    end
end

-- ============================================
-- OPTION DISPATCHER
-- ============================================

function UIRenderer.spawnOption(ums, controller, option)
    if not option or not cachedOptionsList or not controller then return end

    local t = option.type

    if t == "switch" then
        UIRenderer.spawnSwitch(ums, controller, option)
    elseif t == "sliderInt" then
        UIRenderer.spawnSliderInt(ums, controller, option)
    elseif t == "sliderFloat" then
        UIRenderer.spawnSliderFloat(ums, controller, option)
    elseif t == "selector" then
        UIRenderer.spawnSelector(ums, controller, option)
    elseif t == "keyBinding" then
        UIRenderer.spawnKeyBinding(ums, controller, option)
    elseif t == "button" then
        UIRenderer.spawnButton(ums, controller, option)
    elseif t == "custom" then
        if option.customCallback then
            local ok, err = pcall(option.customCallback, cachedOptionsList, option)
            if not ok then
                print("[UMS] ERROR: Custom callback failed: " .. tostring(err))
            end
        end
    end
end

-- ============================================
-- SWITCH (BOOL TOGGLE)
-- ============================================

function UIRenderer.spawnSwitch(ums, controller, option)
    local widgetName = getNextOptionName()
    local widget = controller:SpawnFromLocal(cachedOptionsList, "settingsSelectorBool")
    if not widget then
        print("[UMS] ERROR: Failed to spawn settingsSelectorBool")
        return
    end

    widget:SetName(StringToName(widgetName))
    local ctrl = widget:GetController()

    ctrl.LabelText:SetText(option.label or "")
    ctrl.onState:SetVisible(option.currentValue == true)
    ctrl.offState:SetVisible(option.currentValue ~= true)
    ctrl:RegisterToCallback("OnHoverOver", controller, "OnSettingHoverOver")
    ctrl:RegisterToCallback("OnHoverOut", controller, "OnSettingHoverOut")

    controller.settingsElements = UIRenderer.nativeInsert(controller.settingsElements, ctrl)
    callbackRouter.registerController(ctrl, option)
    UIRenderer.addOptionOverlays(ctrl, option)
end

-- ============================================
-- SLIDER INT
-- ============================================

function UIRenderer.spawnSliderInt(ums, controller, option)
    local widgetName = getNextOptionName()
    local widget = controller:SpawnFromLocal(cachedOptionsList, "settingsSelectorInt")
    if not widget then
        print("[UMS] ERROR: Failed to spawn settingsSelectorInt")
        return
    end

    widget:SetName(StringToName(widgetName))
    local ctrl = widget:GetController()

    ctrl.LabelText:SetText(option.label or "")
    ctrl:RegisterToCallback("OnHoverOver", controller, "OnSettingHoverOver")
    ctrl:RegisterToCallback("OnHoverOut", controller, "OnSettingHoverOut")

    ctrl.sliderController = ctrl.sliderWidget:GetControllerByType("inkSliderController")
    ctrl.sliderController:Setup(option.min or 0, option.max or 100, option.currentValue or 0, option.step or 1)
    ctrl.sliderController:RegisterToCallback("OnSliderValueChanged", ctrl, "OnSliderValueChanged")
    ctrl.sliderController:RegisterToCallback("OnSliderHandleReleased", ctrl, "OnHandleReleased")
    ctrl.newValue = option.currentValue or 0
    ctrl.ValueText:SetText(tostring(option.currentValue or 0))

    controller.settingsElements = UIRenderer.nativeInsert(controller.settingsElements, ctrl)
    callbackRouter.registerController(ctrl, option)
    UIRenderer.addOptionOverlays(ctrl, option)
end

-- ============================================
-- SLIDER FLOAT
-- ============================================

function UIRenderer.spawnSliderFloat(ums, controller, option)
    local widgetName = getNextOptionName()
    local widget = controller:SpawnFromLocal(cachedOptionsList, "settingsSelectorFloat")
    if not widget then
        print("[UMS] ERROR: Failed to spawn settingsSelectorFloat")
        return
    end

    widget:SetName(StringToName(widgetName))
    local ctrl = widget:GetController()

    ctrl.LabelText:SetText(option.label or "")
    ctrl:RegisterToCallback("OnHoverOver", controller, "OnSettingHoverOver")
    ctrl:RegisterToCallback("OnHoverOut", controller, "OnSettingHoverOut")

    ctrl.sliderController = ctrl.sliderWidget:GetControllerByType("inkSliderController")
    ctrl.sliderController:Setup(option.min or 0.0, option.max or 1.0, option.currentValue or 0.0, option.step or 0.01)
    ctrl.sliderController:RegisterToCallback("OnSliderValueChanged", ctrl, "OnSliderValueChanged")
    ctrl.sliderController:RegisterToCallback("OnSliderHandleReleased", ctrl, "OnHandleReleased")
    ctrl.newValue = option.currentValue or 0.0
    ctrl.ValueText:SetText(string.format(option.format or "%.2f", option.currentValue or 0.0))

    controller.settingsElements = UIRenderer.nativeInsert(controller.settingsElements, ctrl)
    callbackRouter.registerController(ctrl, option)
    UIRenderer.addOptionOverlays(ctrl, option)
end

-- ============================================
-- SELECTOR (STRING LIST)
-- ============================================

function UIRenderer.spawnSelector(ums, controller, option)
    local widgetName = getNextOptionName()
    local widget = controller:SpawnFromLocal(cachedOptionsList, "settingsSelectorStringList")
    if not widget then
        print("[UMS] ERROR: Failed to spawn settingsSelectorStringList")
        return
    end

    widget:SetName(StringToName(widgetName))
    local ctrl = widget:GetController()

    ctrl.LabelText:SetText(option.label or "")
    ctrl:RegisterToCallback("OnHoverOver", controller, "OnSettingHoverOver")
    ctrl:RegisterToCallback("OnHoverOut", controller, "OnSettingHoverOut")

    local elements = option.elements or {}
    local selectedIdx = option.currentValue or 1

    ctrl:PopulateDots(#elements)
    ctrl:SelectDot(selectedIdx - 1)

    if elements[selectedIdx] then
        ctrl.ValueText:SetText(tostring(elements[selectedIdx]))
    end

    controller.settingsElements = UIRenderer.nativeInsert(controller.settingsElements, ctrl)
    callbackRouter.registerController(ctrl, option)
    UIRenderer.addOptionOverlays(ctrl, option)
end

-- ============================================
-- KEY BINDING
-- ============================================

function UIRenderer.spawnKeyBinding(ums, controller, option)
    local widgetName = getNextOptionName()
    local widget = controller:SpawnFromLocal(cachedOptionsList, "settingsSelectorKeyBinding")
    if not widget then
        print("[UMS] ERROR: Failed to spawn settingsSelectorKeyBinding")
        return
    end

    widget:SetName(StringToName(widgetName))
    local ctrl = widget:GetController()

    ctrl.LabelText:SetText(option.label or "")
    ctrl:RegisterToCallback("OnHoverOver", controller, "OnSettingHoverOver")
    ctrl:RegisterToCallback("OnHoverOut", controller, "OnSettingHoverOut")

    local value = option.currentValue or ""
    local isHold = option.isHold or false
    ctrl.text:SetText(SettingsSelectorControllerKeyBinding.PrepareInputTag(value, "None", isHold and "hold_input" or "None"))

    controller.settingsElements = UIRenderer.nativeInsert(controller.settingsElements, ctrl)
    callbackRouter.registerController(ctrl, option)
    UIRenderer.addOptionOverlays(ctrl, option)
end

-- ============================================
-- BUTTON (BOOL WIDGET REPURPOSED)
-- ============================================

function UIRenderer.spawnButton(ums, controller, option)
    ensureColors()
    local widgetName = getNextOptionName()
    local widget = controller:SpawnFromLocal(cachedOptionsList, "settingsSelectorBool")
    if not widget then
        print("[UMS] ERROR: Failed to spawn settingsSelectorBool for button")
        return
    end

    widget:SetName(StringToName(widgetName))
    local ctrl = widget:GetController()

    ctrl.LabelText:SetText(option.label or "")
    ctrl:RegisterToCallback("OnHoverOver", controller, "OnSettingHoverOver")
    ctrl:RegisterToCallback("OnHoverOut", controller, "OnSettingHoverOut")

    local anchor = inkCanvas.new()
    anchor:SetAnchorPoint(Vector2.new({ X = 0.5, Y = 0.5 }))
    anchor:SetInteractive(true)
    anchor:SetMargin(inkMargin.new({ left = 760.0, top = 38.0, right = 0.0, bottom = 0.0 }))
    anchor:Reparent(ctrl:GetRootWidget():GetWidgetByPath(BuildWidgetPath({ "layout", "container" })), -1)

    local btnText = inkText.new()
    btnText:SetFontFamily(FONT_FAMILY)
    btnText:SetFontStyle("Medium")
    btnText:SetFontSize(option.textSize or 40)
    btnText:SetLetterCase(textLetterCase.OriginalCase)
    btnText:SetTintColor(COLOR_RED)
    btnText:SetAnchor(inkEAnchor.Fill)
    btnText:SetHorizontalAlignment(textHorizontalAlignment.Center)
    btnText:SetVerticalAlignment(textVerticalAlignment.Center)
    btnText:SetText(option.buttonText or "PRESS")
    btnText:Reparent(anchor, -1)

    hideToggle(ctrl)

    controller.settingsElements = UIRenderer.nativeInsert(controller.settingsElements, ctrl)
    callbackRouter.registerController(ctrl, option)
end

-- ============================================
-- OPTION OVERLAYS
-- ============================================

function UIRenderer.addOptionOverlays(ctrl, option)
end

-- ============================================
-- BUTTON HINTS
-- ============================================

function UIRenderer.updateHints(ums, controller)
    if not controller or not controller.buttonHintsController then return end

    local hints = controller.buttonHintsController
    hints:UmsClear()

    local view = ums.currentView

    if view == "modOptions" then
        hints:UmsAddHint("back", "Back")
        hints:UmsAddHint("restore_default_settings", "Restore Defaults")
    elseif view == "search" then
        hints:UmsAddHint("back", "Close")
    elseif view == "favorites" then
        hints:UmsAddHint("back", "Close")
    elseif view == "modified" then
        hints:UmsAddHint("back", "Close")
    end

    hints:UmsShow()
end

-- ============================================
-- UTILITY
-- ============================================

function UIRenderer.nativeInsert(nTable, value)
    local t = nTable or {}
    table.insert(t, value)
    return t
end

-- ============================================
-- REFRESH HELPERS
-- ============================================

function UIRenderer.refreshCurrentView(ums, controller)
    if not controller then return end
    if ums.currentView == "modOptions" and ums.currentModId then
        UIRenderer.renderModOptions(ums, controller, ums.currentModId)
    elseif ums.currentView == "favorites" then
        UIRenderer.renderVirtualTab(ums, controller, "favorites")
    elseif ums.currentView == "modified" then
        UIRenderer.renderVirtualTab(ums, controller, "modified")
    elseif ums.currentView == "search" then
        UIRenderer.renderSearchView(ums, controller)
    end
end

function UIRenderer.updateOptionVisuals(widget, option)
    if not widget or not option then return end
    ensureColors()

    local modDot = widget:GetWidgetByPathName(StringToName("umsModDot"))
    if modDot then
        modDot:SetVisible(option.isModified == true)
    end
end

return UIRenderer
