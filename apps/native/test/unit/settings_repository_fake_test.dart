import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/data/repositories_fake/settings_repository_fake.dart';

void main() {
  group('SettingsRepositoryFake', () {
    test('fetchTransactionSettings returns the seeded scheme', () async {
      final repo = SettingsRepositoryFake(
        initial: TransactionColorScheme.redBlue,
      );
      final res = await repo.fetchTransactionSettings();
      final settings = res.fold((ok) => ok, (_) => null);
      expect(settings, isNotNull);
      expect(
        settings!.incomeExpensesColor,
        TransactionColorScheme.redBlue,
      );
    });

    test('updateColorScheme persists across reads', () async {
      final repo = SettingsRepositoryFake();
      await repo.updateColorScheme(TransactionColorScheme.redBlue);
      final res = await repo.fetchTransactionSettings();
      final settings = res.fold((ok) => ok, (_) => null);
      expect(
        settings!.incomeExpensesColor,
        TransactionColorScheme.redBlue,
      );
    });
  });
}
