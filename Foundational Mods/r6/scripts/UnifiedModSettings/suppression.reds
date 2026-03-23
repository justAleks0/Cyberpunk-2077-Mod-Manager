// Hides the "Mod Settings" entry added by the Mod Settings RED4ext plugin.


@wrapMethod(gameuiMenuItemListGameController)
protected func ShowActionsList() -> Void {
  wrappedMethod();

  let i: Int32 = 0;
  let count: Int32 = this.m_menuListController.Size();
  let widget: wref<inkWidget>;
  let ctrl: wref<ListItemController>;
  let data: ref<PauseMenuListItemData>;
  while i < count {
    widget = this.m_menuListController.GetItemAt(i);
    if IsDefined(widget) {
      ctrl = widget.GetController() as ListItemController;
      if IsDefined(ctrl) {
        data = ctrl.GetData() as PauseMenuListItemData;
        if IsDefined(data) {
          if Equals(data.eventName, n"OnSwitchToModSettings") {
            widget.SetVisible(false);
          };
        };
      };
    };
    i += 1;
  };
}
