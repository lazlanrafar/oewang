import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/categories/categories_list_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_account_group_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/core/theme/app_theme.dart';
import 'package:oewang/data/repositories_fake/categories_repository_fake.dart';
import 'package:oewang/data/repositories_fake/wallet_groups_repository_fake.dart';
import 'package:oewang/domain/models/category.dart';

class Categories extends CategoriesRepositoryFake {
  Categories()
    : super(
        seed: const [
          Category(id: 'a', name: 'A', type: CategoryType.expense),
          Category(id: 'b', name: 'B', type: CategoryType.expense),
          Category(id: 'c', name: 'C', type: CategoryType.expense),
        ],
      );
  List<String>? saved;
  @override
  Future<Result<void, AppError>> reorder(List<String> ids) async {
    saved = ids;
    return const Success(null);
  }
}

class Groups extends WalletGroupsRepositoryFake {
  List<String>? saved;
  @override
  Future<Result<void, AppError>> reorder(List<String> ids) async {
    saved = ids;
    return const Success(null);
  }
}

void main() {
  testWidgets(
    'should preserve the final destination index when moving categories down and up',
    (tester) async {
      final repo = Categories();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [categoriesRepositoryProvider.overrideWithValue(repo)],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const CategoryListScreen(type: CategoryType.expense),
          ),
        ),
      );
      await tester.pumpAndSettle();
      tester
          .widget<ReorderableListView>(find.byType(ReorderableListView))
          .onReorderItem!(0, 2);
      await tester.pumpAndSettle();
      expect(repo.saved, ['b', 'c', 'a']);
      tester
          .widget<ReorderableListView>(find.byType(ReorderableListView))
          .onReorderItem!(2, 0);
      await tester.pumpAndSettle();
      expect(repo.saved, ['a', 'b', 'c']);
    },
  );
  testWidgets(
    'should preserve the final destination index when moving wallet groups down and up',
    (tester) async {
      final repo = Groups();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [walletGroupsRepositoryProvider.overrideWithValue(repo)],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const AccountGroupScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      tester
          .widget<ReorderableListView>(find.byType(ReorderableListView))
          .onReorderItem!(0, 2);
      await tester.pumpAndSettle();
      expect(repo.saved, ['g-accounts', 'g-debit', 'g-cash']);
      tester
          .widget<ReorderableListView>(find.byType(ReorderableListView))
          .onReorderItem!(2, 0);
      await tester.pumpAndSettle();
      expect(repo.saved, ['g-cash', 'g-accounts', 'g-debit']);
    },
  );
}
