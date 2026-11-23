/// Behaviour of an `Input` — selects the formatter, keyboard, validator and
/// decoration via [InputStyleResolver]. One component, many contexts.
enum InputContext {
  /// Plain typed text (name, email, password). No formatter.
  text,

  /// Account name — required, whitespace tidied.
  accounts,

  /// Money amount with the workspace currency switcher — the keypad shows a
  /// tab per workspace currency (hidden when the workspace has only its main
  /// currency). Used where the entry's currency is chosen inline (transactions).
  currency,

  /// Plain money amount — same keypad without the currency tabs. Used where the
  /// currency is fixed or picked elsewhere (budgets, wallet balance).
  amount,

  /// Date — opens the calendar drawer, shows the formatted day.
  date,

  /// A value chosen from a drawer — an entity picker (`EntitySelect`) or a plain
  /// tappable row (`displayValue` + `onTap`).
  select,
}
