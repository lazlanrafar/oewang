/// Where an `Input`'s label sits relative to its field.
enum InputLabelPosition {
  /// Two-column row: muted label on the left, value on the right (default).
  /// The `variant` border is drawn around the value area only.
  left,

  /// Label stacked above the field. The `variant` border wraps the whole field
  /// — the classic form-input look.
  top,
}
