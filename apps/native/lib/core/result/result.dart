/// A lightweight sealed `Result<Ok, Err>` used by repositories.
///
/// We deliberately avoid throwing across the data ↔ view-model boundary so
/// every ViewModel handles the error path explicitly.
sealed class Result<Ok, Err> {
  const Result();

  bool get isOk => this is Success<Ok, Err>;
  bool get isErr => this is Failure<Ok, Err>;

  /// Pattern-match helper. Both callbacks must return the same type.
  T fold<T>(T Function(Ok value) onOk, T Function(Err error) onErr) {
    final self = this;
    if (self is Success<Ok, Err>) return onOk(self.value);
    return onErr((self as Failure<Ok, Err>).error);
  }
}

class Success<Ok, Err> extends Result<Ok, Err> {
  const Success(this.value);
  final Ok value;
}

class Failure<Ok, Err> extends Result<Ok, Err> {
  const Failure(this.error);
  final Err error;
}

/// Constructors so call sites read naturally (`Ok(x)` / `Err(e)`).
Result<Ok, Err> ok<Ok, Err>(Ok value) => Success<Ok, Err>(value);
Result<Ok, Err> err<Ok, Err>(Err error) => Failure<Ok, Err>(error);
