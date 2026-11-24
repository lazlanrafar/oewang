import 'package:decimal/decimal.dart';
import 'package:flutter/widgets.dart';
import 'package:oewang/core/command/command.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/debts_repository.dart';
import 'package:oewang/data/repositories/rates_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/domain/models/debt.dart';
import 'package:oewang/domain/models/wallet.dart';

/// The payment screen (DEBT-4, DEBT-5): an amount in the debt's currency,
/// an optional wallet, a date, and a rate when the wallet's currency differs
/// from the debt's. The rate prefills from the daily rates and stays
/// editable, so the wallet amount can match what really moved (D39).
class PayDebtViewModel extends ChangeNotifier {
  PayDebtViewModel({
    required this.debt,
    required DebtsRepository debts,
    required WalletsRepository wallets,
    required RatesRepository rates,
    DateTime? today,
  }) : _debts = debts,
       _rates = rates,
       amount = debt.remainingAmount.amount,
       date = today ?? DateTime.now() {
    save = Command<void, void>(_runSave)..addListener(notifyListeners);
    wallets.list().then((res) {
      res.fold((ws) => _wallets = ws, (_) {});
      if (!_disposed) notifyListeners();
    });
  }

  final Debt debt;
  final DebtsRepository _debts;
  final RatesRepository _rates;
  bool _disposed = false;

  late final Command<void, void> save;

  List<Wallet> _wallets = const [];
  List<Wallet> get wallets => _wallets;

  Decimal amount;
  DateTime date;
  Wallet? wallet;

  /// Debt currency to wallet currency, as typed; prefilled from the rates.
  final rateField = TextEditingController();

  /// The client-side check; the API decides (PAYMENT_EXCEEDS_REMAINING).
  String? _invalid;
  String? get error => _invalid ?? save.error?.message;

  bool get needsRate => wallet != null && wallet!.currency != debt.currency;

  Decimal? get rate =>
      needsRate ? Decimal.tryParse(rateField.text.trim()) : null;

  /// What leaves or reaches the wallet, in its currency, for the preview.
  Decimal? get walletAmount {
    if (wallet == null) return null;
    if (!needsRate) return amount;
    final r = rate;
    return r == null ? null : amount * r;
  }

  void setAmount(Decimal value) {
    amount = value;
    _invalid = null;
    notifyListeners();
  }

  void setDate(DateTime value) {
    date = value;
    notifyListeners();
  }

  /// The rate field changed: the preview follows.
  void rateChanged(String _) => notifyListeners();

  Future<void> setWallet(Wallet? value) async {
    wallet = value;
    rateField.clear();
    notifyListeners();
    if (!needsRate) return;
    final res = await _rates.rates(base: debt.currency);
    final r = res.fold((m) => m[value!.currency], (_) => null);
    // Prefill only: a rate the person typed meanwhile wins.
    if (r != null && rateField.text.isEmpty && wallet == value) {
      rateField.text = Decimal.parse(r.toStringAsFixed(8)).toString();
      notifyListeners();
    }
  }

  /// Pays; answers true when it was sent or queued.
  Future<bool> submit() async {
    if (amount <= Decimal.zero) {
      _invalid = 'Enter a valid amount';
    } else if (amount > debt.remainingAmount.amount) {
      _invalid = 'More than the ${debt.remainingAmount.format()} remaining';
    } else if (needsRate && (rate == null || rate! <= Decimal.zero)) {
      _invalid = 'Enter the rate from ${debt.currency} to ${wallet!.currency}';
    } else {
      _invalid = null;
    }
    if (_invalid != null) {
      notifyListeners();
      return false;
    }
    await save.run(null);
    return save.error == null;
  }

  Future<Result<void, AppError>> _runSave(void _) => _debts.pay(
    debt.id,
    NewDebtPayment(
      amount: amount,
      date: date,
      walletId: wallet?.id,
      exchangeRate: rate,
    ),
  );

  @override
  void dispose() {
    _disposed = true;
    rateField.dispose();
    save
      ..removeListener(notifyListeners)
      ..dispose();
    super.dispose();
  }
}
