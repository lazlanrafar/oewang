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
}
