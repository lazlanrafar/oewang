import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/wallet_groups_repository.dart';
import 'package:oewang/domain/models/wallet_group.dart';

class WalletGroupsRepositoryFake implements WalletGroupsRepository {
  WalletGroupsRepositoryFake({List<WalletGroup>? seed})
    : _store = List<WalletGroup>.of(
        seed ??
            const [
              WalletGroup(id: 'g-cash', name: 'Cash'),
              WalletGroup(id: 'g-accounts', name: 'Accounts'),
              WalletGroup(id: 'g-debit', name: 'Debit Card'),
            ],
      );

  final List<WalletGroup> _store;
  var _seq = 0;

  @override
  Future<Result<List<WalletGroup>, AppError>> list() async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    return Success(List<WalletGroup>.unmodifiable(_store));
  }

  @override
  Future<Result<WalletGroup, AppError>> create({required String name}) async {
    final group = WalletGroup(id: 'g-fake-${_seq++}', name: name);
    _store.add(group);
    return Success(group);
  }

  @override
  Future<Result<WalletGroup, AppError>> update({
    required String id,
    required String name,
  }) async {
    final i = _store.indexWhere((g) => g.id == id);
    if (i == -1) {
      return const Failure(
        ServerError(statusCode: 404, message: 'Group not found'),
      );
    }
    final updated = WalletGroup(id: id, name: name);
    _store[i] = updated;
    return Success(updated);
  }

  @override
  Future<Result<void, AppError>> delete(String id) async {
    _store.removeWhere((g) => g.id == id);
    return const Success(null);
  }

  @override
  Future<Result<void, AppError>> reorder(List<String> orderedIds) async {
    _store.sort(
      (a, b) => orderedIds.indexOf(a.id).compareTo(orderedIds.indexOf(b.id)),
    );
    return const Success(null);
  }
}
