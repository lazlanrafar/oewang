import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/domain/models/wallet.dart';

class WalletsRepositoryFake implements WalletsRepository {
  WalletsRepositoryFake({List<Wallet>? seed})
    : _store = (seed ??
              const <Wallet>[
                Wallet(id: 'w-cash', name: 'Cash', groupId: 'g-cash', balance: 625000),
                Wallet(id: 'w-shopee', name: 'Shopee Pay', groupId: 'g-accounts', balance: 35999),
                Wallet(id: 'w-dana', name: 'Dana', groupId: 'g-accounts'),
                Wallet(id: 'w-gopay', name: 'Gopay', groupId: 'g-accounts', balance: -131500),
                Wallet(id: 'w-bca', name: 'BCA', groupId: 'g-debit', balance: -1947500),
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

  @override
  Future<Result<Wallet, AppError>> create(NewWalletDraft draft) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    final created = Wallet(
      id: 'w-fake-${_nextId++}',
      name: draft.name,
      groupId: draft.groupId,
      balance: draft.balance,
    );
    _store.add(created);
    return Success(created);
  }

  @override
  Future<Result<Wallet, AppError>> update(
    String id,
    NewWalletDraft draft,
  ) async {
    final i = _store.indexWhere((w) => w.id == id);
    if (i == -1) {
      return const Failure(
        ServerError(statusCode: 404, message: 'Wallet not found'),
      );
    }
    final updated = Wallet(
      id: id,
      name: draft.name,
      groupId: draft.groupId,
      balance: draft.balance,
    );
    _store[i] = updated;
    return Success(updated);
  }

  @override
  Future<Result<void, AppError>> delete(String id) async {
    _store.removeWhere((w) => w.id == id);
    return const Success(null);
  }

  @override
  Future<Result<void, AppError>> reorder(
    List<String> orderedIds, {
    String? groupId,
  }) async {
    _store.sort(
      (a, b) => orderedIds.indexOf(a.id).compareTo(orderedIds.indexOf(b.id)),
    );
    return const Success(null);
  }

  @override
  Future<Result<void, AppError>> setIncludedInTotals(
    String id, {
    required bool included,
  }) async {
    final i = _store.indexWhere((w) => w.id == id);
    if (i == -1) {
      return const Failure(
        ServerError(statusCode: 404, message: 'Wallet not found'),
      );
    }
    final w = _store[i];
    _store[i] = Wallet(
      id: w.id,
      name: w.name,
      groupId: w.groupId,
      balance: w.balance,
      currency: w.currency,
      isIncludedInTotals: included,
    );
    return const Success(null);
  }
}
