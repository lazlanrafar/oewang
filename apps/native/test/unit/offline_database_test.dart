import 'dart:io';

import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/data/services/db/app_database.dart';

void main() {
  test(
    'should retain queued writes when upgrading the existing v1 cache',
    () async {
      final dir = await Directory.systemTemp.createTemp('oewang-cache-test');
      final file = File('${dir.path}/cache.sqlite');
      final old = AppDatabase.withExecutor(NativeDatabase(file));
      try {
        await old
            .into(old.cachedWallets)
            .insert(
              CachedWalletsCompanion.insert(
                id: 'w',
                workspaceId: 'ws',
                name: 'Offline wallet',
                pendingOp: const Value(kPendingOpCreate),
              ),
            );
        // Reproduce the v1 on-disk schema, then open it with the new migration.
        for (final table in [
          'cached_transactions',
          'cached_wallets',
          'cached_debts',
        ]) {
          await old.customStatement('ALTER TABLE $table DROP COLUMN revision');
        }
        await old.customStatement(
          'ALTER TABLE cached_transactions DROP COLUMN attachment_ids',
        );
        await old.customStatement('DROP TABLE cached_budget_snapshots');
        await old.customStatement('PRAGMA user_version = 1');
      } finally {
        await old.close();
      }
      final upgraded = AppDatabase.withExecutor(NativeDatabase(file));
      try {
        final row = await upgraded.select(upgraded.cachedWallets).getSingle();
        expect(row.name, 'Offline wallet');
        expect(row.pendingOp, kPendingOpCreate);
        expect(row.revision, 0);
        expect(
          await upgraded.select(upgraded.cachedBudgetSnapshots).get(),
          isEmpty,
        );
      } finally {
        await upgraded.close();
        await dir.delete(recursive: true);
      }
    },
  );
}
