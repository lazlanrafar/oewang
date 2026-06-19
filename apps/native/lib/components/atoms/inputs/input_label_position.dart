/// Where an `Input`'s label sits relative to its field.
enum InputLabelPosition {
  /// Two-column row: muted label on the left, value on the right. The plain
  /// WMoney row look — `variant` is not drawn (default).
  left,

  /// Label stacked above a bordered field that renders the `InputVariant`
  /// (outlined box / underline / filled) — the classic form-input look.
  top,
}
