/// Border treatment of an `Input`, mirroring the web input variants.
enum InputVariant {
  /// Bottom border only (default — in-app settings forms).
  underline,

  /// Full square box border (login / auth forms).
  outlined,

  /// Grey filled box, no visible border.
  filled,

  /// No border or fill — the plain WMoney row look.
  none,
}
