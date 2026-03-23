// ============================================
// CODEWARE SEARCH INPUT 
// ============================================

import Codeware.UI.*

@addField(SettingsMainGameController)
private let m_umsSearchInput: ref<HubTextInput>;

@addField(SettingsMainGameController)
private let m_umsSearchContainer: wref<inkCompoundWidget>;

@addField(SettingsMainGameController)
private let m_umsSearchText: String;

@addField(SettingsMainGameController)
private let m_umsSearchFocusPending: Bool;

@addMethod(SettingsMainGameController)
public func UmsCreateSearchInput(parent: wref<inkCompoundWidget>) {
  if IsDefined(this.m_umsSearchInput) {
    this.m_umsSearchInput.Reparent(parent);
    return;
  };

  let input: ref<HubTextInput> = HubTextInput.Create();
  input.SetName(n"umsSearchInput");
  input.SetDefaultText("Type to search...");
  input.SetMaxLength(64);
  input.RegisterToCallback(n"OnInput", this, n"UmsOnSearchInput");
  input.Reparent(parent);

  let rootW: wref<inkWidget> = input.GetRootWidget();
  if IsDefined(rootW) {
    rootW.SetInteractive(true);
    rootW.RegisterToCallback(n"OnRelease", this, n"UmsOnSearchBoxRelease");
  };

  this.m_umsSearchInput = input;
  this.m_umsSearchText = "";
}

@addMethod(SettingsMainGameController)
protected cb func UmsOnSearchInput(widget: wref<inkWidget>) {
  if IsDefined(this.m_umsSearchInput) {
    this.m_umsSearchText = this.m_umsSearchInput.GetText();
  };
}

@addMethod(SettingsMainGameController)
public func UmsGetSearchText() -> String {
  return this.m_umsSearchText;
}

@addMethod(SettingsMainGameController)
public func UmsSetSearchText(text: String) {
  if IsDefined(this.m_umsSearchInput) {
    this.m_umsSearchInput.SetText(text);
    this.m_umsSearchText = text;
  };
}

@addMethod(SettingsMainGameController)
public func UmsShowSearchInput(visible: Bool) {
  if IsDefined(this.m_umsSearchInput) {
    this.m_umsSearchInput.GetRootWidget().SetVisible(visible);
  };
}

@addMethod(SettingsMainGameController)
public func UmsFocusSearch() {
  if IsDefined(this.m_umsSearchInput) {
    this.RequestSetFocus(this.m_umsSearchInput.GetRootWidget());
  };
}

@addMethod(SettingsMainGameController)
public func UmsUnfocusSearch() {
  if IsDefined(this.m_umsSearchInput) {
    this.RequestSetFocus(null);
  };
}

@addMethod(SettingsMainGameController)
public func UmsIsSearchFocused() -> Bool {
  if IsDefined(this.m_umsSearchInput) {
    return this.m_umsSearchInput.IsFocused();
  };
  return false;
}

@addMethod(SettingsMainGameController)
protected cb func UmsOnSearchBoxRelease(e: ref<inkPointerEvent>) -> Bool {
  if e.IsAction(n"click") {
    this.m_umsSearchFocusPending = true;
  };
}

@addMethod(SettingsMainGameController)
public func UmsCheckPendingFocus() -> Bool {
  if this.m_umsSearchFocusPending {
    this.m_umsSearchFocusPending = false;
    this.UmsFocusSearch();
    return true;
  };
  return false;
}


