import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/transactions/transactions_form_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/app_theme.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories/vault_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories/workspaces_repository.dart';
import 'package:oewang/data/repositories_fake/categories_repository_fake.dart';
import 'package:oewang/data/repositories_fake/transactions_repository_fake.dart';
import 'package:oewang/data/repositories_fake/vault_repository_fake.dart';
import 'package:oewang/data/repositories_fake/wallets_repository_fake.dart';
import 'package:oewang/data/repositories_fake/workspaces_repository_fake.dart';
import 'package:oewang/domain/models/session.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/workspace.dart';

class _FixedSession extends SessionController {
  @override
  AsyncValue<Session?> build() =>
      const AsyncData(Session(userId: 'u', workspaceId: 'ws', role: 'owner'));
}

void main() {
  testWidgets(
    'OEW-121 the amount is labelled in the base currency, then the wallet one',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            sessionControllerProvider.overrideWith(_FixedSession.new),
            workspacesRepositoryProvider.overrideWith(
              (ref) =>
                  WorkspacesRepositoryFake(
                        current: const Workspace(
                          id: 'ws',
                          name: 'Personal',
                          currencyCode: 'EUR',
                        ),
                      )
                      as WorkspacesRepository,
            ),
            walletsRepositoryProvider.overrideWith(
              (ref) =>
                  WalletsRepositoryFake(
                        seed: [
                          Wallet(id: 'w-usd', name: 'Card', currency: 'USD'),
                        ],
                      )
                      as WalletsRepository,
            ),
            categoriesRepositoryProvider.overrideWith(
              (ref) => CategoriesRepositoryFake() as CategoriesRepository,
            ),
            transactionsRepositoryProvider.overrideWith(
              (ref) => TransactionsRepositoryFake() as TransactionsRepository,
            ),
            vaultRepositoryProvider.overrideWith(
              (ref) => VaultRepositoryFake() as VaultRepository,
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const TransactionFormScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('EUR'), findsOneWidget);
      expect(find.textContaining('IDR'), findsNothing);

      ProviderScope.containerOf(tester.element(find.byType(Scaffold).first))
          .read(transactionFormVmProvider((editing: null, receipt: null)))
          .setWallet('w-usd');
      await tester.pumpAndSettle();
      expect(find.textContaining('USD'), findsOneWidget);
      expect(find.textContaining('EUR'), findsNothing);
    },
  );
}
