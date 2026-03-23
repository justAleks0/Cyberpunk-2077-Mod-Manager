module ACU
import Codeware.UI.*

public native func LoadCharacterPreset(name: String) -> Bool;

public native func SaveCharacterPreset(name: String) -> Bool;

public native func SaveCharacterPresetCompat(name: String, content: String) -> Bool;

public native func ListCharacterPresets() -> array<String>;

/*
Appearance Change Unlocker v3.1
  _____ _   _  ____ _  __  ____  _   _ _____ ___ _   _ 
 |  ___| | | |/ ___| |/ / |  _ \| | | |_   _|_ _| \ | |
 | |_  | | | | |   | ' /  | |_) | | | | | |  | ||  \| |
 |  _| | |_| | |___| . \  |  __/| |_| | | |  | || |\  |
 |_|    \___/ \____|_|\_\ |_|    \___/  |_| |___|_| \_|
                                                       
edition by PotatoOfDoom
*/
@replaceMethod(MenuScenario_CharacterCustomizationMirror)
protected cb func OnEnterScenario(prevScenario: CName, userData: ref<IScriptable>) -> Bool {
  this.m_morphMenuUserData = userData as MorphMenuUserData;
  if IsDefined(this.m_morphMenuUserData) {
    this.m_morphMenuUserData.m_optionsListInitialized = false;
    this.m_morphMenuUserData.m_updatingFinalizedState = true;
    this.m_morphMenuUserData.m_editMode = gameuiCharacterCustomizationEditTag.NewGame;
  }
  this.m_currMenuName = n"character_customization_scenes";
  this.GetMenusState().OpenMenu(n"character_customization_scenes");
}

@replaceMethod(characterCreationBodyMorphMenu)
public final func CreateVoiceOverSwitcher() -> Void {
  if this.m_updatingFinalizedState {
    return;
  }
  let switcherWidget: wref<inkWidget> = this.SpawnFromLocal(inkWidgetRef.Get(this.m_optionsList), n"VoiceOverSwitcher");
  let switcherController: wref<characterCreationVoiceOverSwitcher> = switcherWidget.GetController() as characterCreationVoiceOverSwitcher;
  switcherController.RegisterToCallback(n"OnVoiceOverSwitched", this, n"OnVoiceOverSwitched");
  switcherWidget.RegisterToCallback(n"OnHoverOver", this, n"OnHoverOverOption");
  switcherController.SetIsBrainGenderMale(this.m_characterCustomizationState.IsBrainGenderMale());
}

public class ChangeAppearanceEvent extends Event {
}

public class CharacterPresetManager {
  private let morphMenu: ref<characterCreationBodyMorphMenu>;
  private let myVerticalPanel: ref<inkVerticalPanel>;
  private let selectCharacterPresetLabel: ref<inkText>;
  private let randomizeAppearanceBtn: ref<SimpleButton>;
  //ScrollArea shit
  private let presetScrollAreaWrapper: ref<inkHorizontalPanel>;
  private let presetScrollArea: ref<inkScrollArea>;
  private let presetScrollAreaVerticalPanel: ref<inkVerticalPanel>;
  private let presetScrollAreaButtons: array<ref<SimpleButton>>;
  //ScrollArea Slider shit
  private let isDragged: Bool;
  private let dragStartPos: Vector2;
  private let dragStartMargin: inkMargin;
  private let presetScrollSliderArea: ref<inkCanvas>;
  private let presetScrollSliderHandle: ref<inkRectangle>;
  private let presetSliderHandleWidth: Float;
  private let savePresetBtn: ref<SimpleButton>;
  private let saveNameLabel: ref<inkText>;
  private let saveNameTextInput: ref<TextInput>;

  public func OnInitialize(parent: ref<characterCreationBodyMorphMenu>) -> Bool {
    //GUI CODE
    this.presetSliderHandleWidth = 16.0;

    //[INSERT VOMIT EMOJI HERE]

    this.morphMenu = parent;

    this.myVerticalPanel = this.morphMenu.GetChildWidgetByPath(n"presets") as inkVerticalPanel;
    this.myVerticalPanel.RemoveAllChildren();

    // Disabled in beta
    /*
    this.randomizeAppearanceBtn = SimpleButton.Create();
    this.randomizeAppearanceBtn.SetText("Randomize Appearance");
    this.randomizeAppearanceBtn.SetWidth(600);
		this.randomizeAppearanceBtn.SetFlipped(true);
		this.randomizeAppearanceBtn.ToggleAnimations(true);
		this.randomizeAppearanceBtn.ToggleSounds(true);
    this.randomizeAppearanceBtn.Reparent(this.myVerticalPanel);
    */

    this.selectCharacterPresetLabel = new inkText();
    this.selectCharacterPresetLabel.SetText("Select Preset:");
    this
      .selectCharacterPresetLabel
      .SetFontFamily("base\\gameplay\\gui\\fonts\\orbitron\\orbitron.inkfontfamily");
    this.selectCharacterPresetLabel.SetFontStyle(n"Regular");
    this.selectCharacterPresetLabel.SetFontSize(25);
    this.selectCharacterPresetLabel.SetLetterCase(textLetterCase.UpperCase);
    this.selectCharacterPresetLabel.SetTintColor(ThemeColors.Bittersweet());
    this.selectCharacterPresetLabel.SetMargin(new inkMargin(0.0, 0.0, 0.0, 4.0));
    this.selectCharacterPresetLabel.Reparent(this.myVerticalPanel);

    this.presetScrollAreaWrapper = new inkHorizontalPanel();
    this.presetScrollAreaWrapper.SetAnchor(inkEAnchor.TopRight);
    this.presetScrollAreaWrapper.SetAnchorPoint(new Vector2(0.0, 0.0));
    this.presetScrollAreaWrapper.SetInteractive(true);
    this.presetScrollAreaWrapper.Reparent(this.myVerticalPanel);

    //ScrollContent
    this.presetScrollArea = new inkScrollArea();
    this.presetScrollArea.SetSize(620.0, 1000.0);
    this.presetScrollArea.SetName(n"scroller");
    this.presetScrollArea.SetAnchor(inkEAnchor.Fill);
    this
      .presetScrollArea
      .SetMargin(new inkMargin(0.0, 0.0, this.presetSliderHandleWidth + 4.0, 0.0));
    this.presetScrollArea.fitToContentDirection = inkFitToContentDirection.Horizontal;
    this.presetScrollArea.SetUseInternalMask(true);
    this.presetScrollArea.constrainContentPosition = true;
    this.presetScrollArea.Reparent(this.presetScrollAreaWrapper, -1);

    this.presetScrollSliderArea = new inkCanvas();
    this.presetScrollSliderArea.SetName(n"sliderArea");
    this.presetScrollSliderArea.SetAnchor(inkEAnchor.RightFillVerticaly);
    this.presetScrollSliderArea.SetSize(this.presetSliderHandleWidth, 1000.0);
    this.presetScrollSliderArea.Reparent(this.presetScrollAreaWrapper);

    let sliderBg: ref<inkRectangle> = new inkRectangle();
    sliderBg.SetName(n"sliderBg");
    sliderBg.SetAnchor(inkEAnchor.TopFillHorizontaly);
    sliderBg.SetSize(this.presetSliderHandleWidth, 1000.0);
    sliderBg.SetTintColor(new HDRColor(0.054902, 0.054902, 0.090196, 1.0));
    sliderBg.Reparent(this.presetScrollSliderArea);

    this.presetScrollSliderHandle = new inkRectangle();
    this.presetScrollSliderHandle.SetName(n"sliderHandle");
    this.presetScrollSliderHandle.SetAnchor(inkEAnchor.TopFillHorizontaly);
    this.presetScrollSliderHandle.SetSize(this.presetSliderHandleWidth, 40.0);
    this.presetScrollSliderHandle.SetInteractive(true);
    this.presetScrollSliderHandle.SetTintColor(new HDRColor(0.368627, 0.964706, 1.0, 1.0));
    this.presetScrollSliderHandle.Reparent(this.presetScrollSliderArea);

    this.presetScrollAreaVerticalPanel = new inkVerticalPanel();
    this.presetScrollAreaVerticalPanel.SetAnchor(inkEAnchor.TopFillHorizontaly);
    this.presetScrollAreaVerticalPanel.SetAnchorPoint(new Vector2(0.5, 0.5));
    this.presetScrollAreaVerticalPanel.SetChildMargin(new inkMargin(0.0, 4.0, 0.0, 4.0));
    this.presetScrollAreaVerticalPanel.Reparent(this.presetScrollArea, -1);
    this.PopulatePresetList();
    this.presetScrollAreaVerticalPanel.SetFitToContent(true);
    this.presetScrollAreaWrapper.SetFitToContent(true);

    this.saveNameLabel = new inkText();
    this.saveNameLabel.SetText("Preset Name:");
    this
      .saveNameLabel
      .SetFontFamily("base\\gameplay\\gui\\fonts\\orbitron\\orbitron.inkfontfamily");
    this.saveNameLabel.SetFontStyle(n"Regular");
    this.saveNameLabel.SetFontSize(25);
    this.saveNameLabel.SetLetterCase(textLetterCase.UpperCase);
    this.saveNameLabel.SetTintColor(ThemeColors.Bittersweet());
    this.saveNameLabel.SetMargin(new inkMargin(0.0, 0.0, 0.0, 4.0));
    this.saveNameLabel.Reparent(this.myVerticalPanel);

    this.saveNameTextInput = HubTextInput.Create();
    this.saveNameTextInput.Reparent(this.myVerticalPanel);

    this.savePresetBtn = SimpleButton.Create();
    this.savePresetBtn.SetName(n"SavePreset");
    this.savePresetBtn.SetText("Save character preset");
    this.savePresetBtn.SetWidth(600);
    this.savePresetBtn.SetFlipped(true);
    this.savePresetBtn.ToggleAnimations(true);
    this.savePresetBtn.ToggleSounds(true);
    this.savePresetBtn.Reparent(this.myVerticalPanel);

    this.RegisterCallbacks();

    return true;
  }

  public func OnPressSliderHandle(evt: ref<inkPointerEvent>) {
    if evt.IsAction(n"mouse_left") {
      this.isDragged = true;
      this.dragStartPos = evt.GetScreenSpacePosition();
      this.dragStartMargin = this.presetScrollSliderHandle.GetMargin();

      this
        .morphMenu
        .RegisterToGlobalInputCallback(n"OnPostOnRelative", this, n"OnGlobalMove");
      this
        .morphMenu
        .RegisterToGlobalInputCallback(n"OnPostOnRelease", this, n"OnGlobalRelease");
    }
  }

  public func UpdateScrollBarSize() -> Void {
    let area: Vector2 = this.presetScrollArea.GetViewportSize();
    let content: Vector2 = this.presetScrollAreaVerticalPanel.GetSize();

    if content.Y >= area.Y {
      this.presetScrollSliderHandle.SetVisible(true);
      let viewRatio: Float = area.Y / content.Y;
      this
        .presetScrollSliderHandle
        .SetSize(this.presetSliderHandleWidth, viewRatio * (area.Y - 100.0));
    } else {
      this.presetScrollSliderHandle.SetVisible(false);
      this.presetScrollSliderHandle.SetSize(this.presetSliderHandleWidth, 40.0);
    }
    this.presetScrollArea.ScrollVertical(0.0);
    let margin: inkMargin = this.presetScrollSliderHandle.GetMargin();
    margin.top = 0.0;
    this.presetScrollSliderHandle.SetMargin(margin);
  }

  protected cb func OnScroll(evt: ref<inkPointerEvent>) -> Void {
    if evt.IsAction(n"right_stick_y") || evt.IsAction(n"mouse_wheel") {
      let viewport = this.presetScrollArea.GetViewportSize();
      let content = this.presetScrollAreaVerticalPanel.GetSize();
      let realScrollDelta = content.Y + 100.0 - viewport.Y;
      // 100.0 offset to fix the scrollbar bug

      if realScrollDelta <= 0.0 {
        return;
      }

      //Update Scrollposition
      let margin: inkMargin = this.presetScrollSliderHandle.GetMargin();
      let size = this.presetScrollSliderHandle.GetSize();
      let area = this.presetScrollSliderArea.GetSize();
      let scrollDelta = area.Y - size.Y;

      let scrollPosPercent = margin.top / scrollDelta;

      let absPos = scrollPosPercent * realScrollDelta;
      absPos = absPos - evt.GetAxisData() * 75.0;

      scrollPosPercent = absPos / realScrollDelta;

      margin.top = scrollPosPercent * scrollDelta;
      margin.top = ClampF(margin.top, 0, scrollDelta);

      this.presetScrollSliderHandle.SetMargin(margin);
      this.presetScrollArea.ScrollVertical(scrollPosPercent);
    }
  }

  public func OnGlobalMove(evt: ref<inkPointerEvent>) -> Void {
    if this.isDragged {
      //Update Scrollposition
      let cursor: Vector2 = evt.GetScreenSpacePosition();
      let margin: inkMargin = this.dragStartMargin;
      let size: Vector2 = this.presetScrollSliderHandle.GetSize();
      let area: Vector2 = this.presetScrollSliderArea.GetSize();
      let scrollDelta = area.Y - size.Y;

      let dragOffset: Float = (cursor.Y - this.dragStartPos.Y) * 2.0;

      margin.top += dragOffset;
      margin.top = ClampF(margin.top, 0, scrollDelta);

      let scrollPosPercent = margin.top / scrollDelta;
      scrollPosPercent = ClampF(scrollPosPercent, 0.0, 1.0);

      this.presetScrollSliderHandle.SetMargin(margin);
      this.presetScrollArea.ScrollVertical(scrollPosPercent);
    }
  }

  public func OnGlobalRelease(evt: ref<inkPointerEvent>) -> Bool {
    if evt.IsAction(n"mouse_left") {
      this.isDragged = false;
      this
        .morphMenu
        .UnregisterFromGlobalInputCallback(n"OnPostOnRelative", this, n"OnGlobalMove");
      this
        .morphMenu
        .UnregisterFromGlobalInputCallback(n"OnPostOnRelease", this, n"OnGlobalRelease");
    }
  }

  private func AddPresetListEntry(presetName: String) -> Void {
    let presetBtn: ref<SimpleButton> = SimpleButton.Create();
    presetBtn.SetName(n"PresetButton");
    presetBtn.SetText(presetName);
    presetBtn.SetWidth(584);
    presetBtn.SetFlipped(true);
    presetBtn.SetDisabled(false);
    presetBtn.ToggleAnimations(true);
    presetBtn.ToggleSounds(true);
    presetBtn.Reparent(this.presetScrollAreaVerticalPanel);

    presetBtn.RegisterToCallback(n"OnRelease", this, n"OnClickPresetListText");

    ArrayPush(this.presetScrollAreaButtons, presetBtn);
  }

  private func ClearPresetList() -> Void {
    this.presetScrollAreaVerticalPanel.RemoveAllChildren();

    for presetScrollButton in this.presetScrollAreaButtons {
      presetScrollButton.UnregisterFromCallback(n"OnRelease", this, n"OnClickPresetListText");
    }
    ArrayClear(this.presetScrollAreaButtons);
  }

  private func PopulatePresetList() -> Void {
    let presets: array<String> = ListCharacterPresets();

    this.ClearPresetList();

    for preset in presets {
      this.AddPresetListEntry(preset);
    }

    this.presetScrollArea.RemoveAllChildren();

    //Workaround
    //SetFitToContent doesn't really work how it is supposed to work
    let presetScrollAreaVerticalPanelMargin = this.presetScrollAreaVerticalPanel.GetMargin();
    let vPanelHeight: Float = (this.presetScrollAreaButtons[0].GetRootWidget().GetHeight()
      + presetScrollAreaVerticalPanelMargin.top
      + presetScrollAreaVerticalPanelMargin.bottom) * Cast<Float>(ArraySize(this.presetScrollAreaButtons));
    this
      .presetScrollAreaVerticalPanel
      .SetSize(this.presetScrollAreaButtons[0].GetRootWidget().GetWidth(), vPanelHeight);

    //Need to do this so scrollarea can update contents (no idea why)
    this.presetScrollAreaVerticalPanel.Reparent(this.presetScrollArea);
    this.UpdateScrollBarSize();
  }

  protected cb func OnGlobalInputUnfocus(evt: ref<inkPointerEvent>) -> Void {
    if evt.IsAction(n"mouse_left") {
      if !IsDefined(evt.GetTarget()) || !evt.GetTarget().CanSupportFocus() {
        this.morphMenu.RequestSetFocus(null);
      }
    }
  }

  private func RegisterCallbacks() -> Void {
    this
      .randomizeAppearanceBtn
      .RegisterToCallback(n"OnRelease", this.morphMenu, n"OnRandomizePress");
    this.savePresetBtn.RegisterToCallback(n"OnRelease", this, n"OnClickSavePreset");
    this
      .presetScrollSliderHandle
      .RegisterToCallback(n"OnPress", this, n"OnPressSliderHandle");
    this
      .morphMenu
      .RegisterToGlobalInputCallback(n"OnPostOnRelease", this, n"OnGlobalInputUnfocus");
    this.presetScrollAreaWrapper.RegisterToCallback(n"OnAxis", this, n"OnScroll");
    this
      .presetScrollAreaWrapper
      .RegisterToCallback(n"OnRelative", this, n"OnScroll");
  }

  private func UnregisterCallbacks() -> Void {
    this
      .randomizeAppearanceBtn
      .UnregisterFromCallback(n"OnRelease", this.morphMenu, n"OnRandomizePress");
    this
      .savePresetBtn
      .UnregisterFromCallback(n"OnRelease", this, n"OnClickSavePreset");
    this
      .presetScrollSliderHandle
      .UnregisterFromCallback(n"OnPress", this, n"OnPressSliderHandle");
    this
      .morphMenu
      .UnregisterFromGlobalInputCallback(n"OnPostOnRelative", this, n"OnGlobalMove");
    this
      .morphMenu
      .UnregisterFromGlobalInputCallback(n"OnPostOnRelease", this, n"OnGlobalRelease");
    this
      .morphMenu
      .UnregisterFromGlobalInputCallback(n"OnPostOnRelease", this, n"OnGlobalInputUnfocus");
    this
      .presetScrollAreaWrapper
      .UnregisterFromCallback(n"OnAxis", this, n"OnScroll");
    this
      .presetScrollAreaWrapper
      .UnregisterFromCallback(n"OnRelative", this, n"OnScroll");
    this.morphMenu.RequestSetFocus(null);
  }

  public func OnUninitialize() -> Bool {
    this.UnregisterCallbacks();
    this.ClearPresetList();
    return true;
  }

  private func UpdatePresetList() -> Void {
    this.PopulatePresetList();
  }

  protected cb func OnClickPresetListText(e: ref<inkPointerEvent>) -> Bool {
    if e.IsAction(n"click") {
      let widget: ref<inkWidget> = e.GetTarget();
      let name: String = (widget.GetController() as SimpleButton).GetText();

      if NotEquals(widget.GetName(), n"PresetButton") || Equals(name, "") {
        return false;
      }

      ModLog(n"ACU", "Loading preset: " + name);

      let result = LoadCharacterPreset(name);
      return result;
    }
    return false;
  }

  protected cb func OnClickSavePreset(e: ref<inkPointerEvent>) -> Bool {
    if e.IsAction(n"click") {
      let customizationSystem = GameInstance
        .GetCharacterCustomizationSystem(this.morphMenu.GetPlayerControlledObject().GetGame());

      let optionsArray = customizationSystem.GetUnitedOptions(true, true, true);

      let saveOptions: array<String>;

      for option in optionsArray {
        if option.isEditable && option.isActive {
          ArrayPush(
            saveOptions,
            LocKeyToString(option.info.name) + ":" + ToString(option.currIndex)
          );
        }
      }

      let presetName = this.saveNameTextInput.GetText();
      if Equals(presetName, "") {
        return false;
      }

      let content: String = "";
      for option in saveOptions {
        content += option + "\n";
      }

      SaveCharacterPresetCompat(presetName, content);

      this.UpdatePresetList();
    }
    return true;
  }
}

@addField(characterCreationBodyMorphMenu)
let characterPresetManager: ref<CharacterPresetManager>;

@wrapMethod(characterCreationBodyMorphMenu)
protected cb func OnInitialize() -> Bool {
  let result: Bool = wrappedMethod();

  this.characterPresetManager = new CharacterPresetManager();
  this.characterPresetManager.OnInitialize(this);

  /*
    inkWidgetRef.SetInteractive(this.m_randomize, false);
    inkWidgetRef.SetVisible(this.m_randomize, false);
    inkWidgetRef.SetVisible(this.m_randomizeBg, false);
    */

  return result;
}

@wrapMethod(characterCreationBodyMorphMenu)
protected cb func OnUninitialize() -> Bool {
  if IsDefined(this.characterPresetManager) {
    this.characterPresetManager.OnUninitialize();
  }
  return wrappedMethod();
}

