import 'package:decimal/decimal.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/wallet_totals.dart';

class WalletsRepositoryFake implements WalletsRepository {
  WalletsRepositoryFake({List<Wallet>? seed, this.totalsSeed})
    : _store =
          (seed ??
                  <Wallet>[
                    Wallet(
                      id: 'w-cash',
                      name: 'Cash',
                      groupId: 'g-cash',
                      balance: Decimal.fromInt(625000),
                    ),
                    Wallet(
                      id: 'w-shopee',
                      name: 'Shopee Pay',
                      groupId: 'g-accounts',
                      balance: Decimal.fromInt(35999),
                    ),
                    Wallet(id: 'w-dana', name: 'Dana', groupId: 'g-accounts'),
                    Wallet(
                      id: 'w-gopay',
                      name: 'Gopay',
                      groupId: 'g-accounts',
                      balance: Decimal.fromInt(-131500),
                    ),
                    Wallet(
                      id: 'w-bca',
                      name: 'BCA',
                      groupId: 'g-debit',
                      balance: Decimal.fromInt(-1947500),
                    ),
                    Wallet(id: 'w-bni', name: 'BNI', groupId: 'g-debit'),
                  ])
              .toList();

  final List<Wallet> _store;
  int _nextId = 1000;

  @override
  Future<Result<List<Wallet>, AppError>> list() async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    return Success(List<Wallet>.unmodifiable(_store));
  }

  /// The API's answer for the seed wallets (all IDR); a test that needs
  /// other figures passes its own.
  final WalletTotals? totalsSeed;

  @override
  Future<Result<WalletTotals, AppError>> totals() async {
    Money idr(int v) => Money(amount: Decimal.fromInt(v));
    return Success(
      totalsSeed ??
          WalletTotals(
            total: idr(-1418001),
            assets: idr(660999),
            liabilities: idr(2079000),
            groups: [
              GroupTotal(id: 'g-cash', subtotal: idr(625000)),
              GroupTotal(id: 'g-accounts', subtotal: idr(-95501)),
              GroupTotal(id: 'g-debit', subtotal: idr(-1947500)),
            ],
          ),
    );
  }

  @override
  Future<Result<Wallet, AppError>> create(NewWalletDraft draft) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    final created = Wallet(
      id: 'w-fake-${_nextId++}',
      name: draft.name,
      groupId: draft.groupId,
      currency: draft.currencyCode ?? 'IDR',
    );
    _store.add(created);
    return Success(created);
  }

  @override
  Future<Result<Wallet, AppError>> update(
    String id,
    NewWalletDraft draft,
  ) async => _replace(
    id,
    (w) => Wallet(
      id: id,
      name: draft.name,
      groupId: draft.groupId,
      balance: w.balance,
      currency: draft.currencyCode ?? w.currency,
      isIncludedInTotals: w.isIncludedInTotals,
    ),
  );

  @override
  Future<Result<Wallet, AppError>> adjust(String id, Decimal balance) async =>
      _replace(
        id,
        (w) => Wallet(
          id: id,
          name: w.name,
          groupId: w.groupId,
          balance: balance,
          currency: w.currency,
          isIncludedInTotals: w.isIncludedInTotals,
        ),
      );

  @override
  Future<Result<void, AppError>> delete(String id) async {
    _store.removeWhere((w) => w.id == id);
    return const Success(null);
  }

  @override
  Future<Result<void, AppError>> setIncludedInTotals(
    String id, {
    required bool included,
  }) async {
    final res = _replace(
      id,
      (w) => Wallet(
        id: w.id,
        name: w.name,
        groupId: w.groupId,
        balance: w.balance,
        currency: w.currency,
        isIncludedInTotals: included,
      ),
    );
    return res.fold((_) => const Success(null), Failure.new);
  }

  Result<Wallet, AppError> _replace(String id, Wallet Function(Wallet) next) {
    final i = _store.indexWhere((w) => w.id == id);
    if (i == -1) {
      return const Failure(
        ServerError(statusCode: 404, message: 'Wallet not found'),
      );
    }
    return Success(_store[i] = next(_store[i]));
  }
}
