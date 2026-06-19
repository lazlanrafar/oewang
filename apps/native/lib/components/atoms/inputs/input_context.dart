/// Behaviour of an `Input` — selects the formatter, keyboard, validator and
/// decoration via [InputStyleResolver]. One component, many contexts.
enum InputContext {
  /// Plain typed text (name, email, password). No formatter.
  text,

  /// Account name — required, whitespace tidied.
  accounts,

  /// Money amount — number keyboard, live thousands grouping, must be > 0.
  currency,

  /// Date — opens the calendar drawer, shows the formatted day.
  date,

  /// A value chosen from a drawer — an entity picker (`EntitySelect`) or a plain
  /// tappable row (`displayValue` + `onTap`).
  select,
}
