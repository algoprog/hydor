// The editors' shell: the pieces a picture, video or sound editor is built from, with nothing of any one editor in
// them (see each file's top for what it holds).
//   Layout.tsx    EditorShell (the frame: top bar, options bar, tool rail, stage, dock, status bar; a phone's layout),
//                 OptionsBar, OptionsSep, OptionsLabel, StatusBar, StatusItem
//   menus.ts      MenuBar and ShortcutsDialog (the app's own), runMenuKeys (a menu's keys made to work), matchKeys,
//                 shortcutGroups, keyLabel
//   ToolRail.tsx  ToolRail (tools in groups with flyouts), useRailPicks
//   Dock.tsx      Dock (tabbed, folding, resizable panels), PanelSheet (the panels on a phone)
//   fields.tsx    ScrubNumber, SliderRow, Section, Seg, MiniSelect, Check, FieldRow, fieldCls, useSettled
//   color.tsx     ColorPicker, ColorButton, ColorSwatches, parseHex, toHex, rgbToHsv, hsvToRgb
//   persist.ts    usePersisted (what the layout was, kept in this browser)
export * from './color';
export * from './Dock';
export * from './fields';
export * from './Layout';
export * from './menus';
export * from './persist';
export * from './ToolRail';
