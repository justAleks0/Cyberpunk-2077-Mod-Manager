// ============================================
// BUTTON HINTS 
// ============================================

@addMethod(ButtonHints)
public func UmsAddHint(action: CName, label: String) {
  this.AddButtonHint(action, label);
}

@addMethod(ButtonHints)
public func UmsAddKeyHint(key: EInputKey, label: String) {
  this.AddButtonHint(key, label);
}

@addMethod(ButtonHints)
public func UmsAddKeyHintByName(keyName: String, label: String) {
  let key: EInputKey = IntEnum<EInputKey>(EnumValueFromString("EInputKey", keyName));
  let newWidget: wref<inkWidget> = this.SpawnFromLocal(inkWidgetRef.Get(this.m_horizontalHolder), n"ButtonHintListItem");
  if IsDefined(newWidget) {
    let buttonHint: wref<ButtonHintListItem> = newWidget.GetController() as ButtonHintListItem;
    if IsDefined(buttonHint) {
      buttonHint.SetData(key, label);
    };
  };
}

@addMethod(ButtonHints)
public func UmsClear() {
  this.ClearButtonHints();
}

@addMethod(ButtonHints)
public func UmsShow() {
  this.Show();
}
