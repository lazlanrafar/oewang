import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/wallet_groups_repository.dart';
import 'package:oewang/domain/models/wallet_group.dart';

class WalletGroupsRepositoryFake implements WalletGroupsRepository {
  WalletGroupsRepositoryFake({List<WalletGroup>? seed})
    : _store = seed ??
            const [
              WalletGroup(id: 'g-cash', name: 'Cash'),
              WalletGroup(id: 'g-accounts', name: 'Accounts'),
              WalletGroup(id: 'g-debit', name: 'Debit Card'),
            ];

  final List<WalletGroup> _store;

  @override
  Future<Result<List<WalletGroup>, AppError>> list() async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    return Success(List<WalletGroup>.unmodifiable(_store));
  }
}
