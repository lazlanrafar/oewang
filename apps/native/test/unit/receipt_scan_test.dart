import 'dart:io';

import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/receipts/receipts_scan_view_model.dart';
import 'package:oewang/components/organisms/transactions/transactions_form_view_model.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories_fake/categories_repository_fake.dart';
import 'package:oewang/data/repositories_fake/receipts_repository_fake.dart';
import 'package:oewang/data/repositories_fake/transactions_repository_fake.dart';
import 'package:oewang/data/repositories_fake/vault_repository_fake.dart';
import 'package:oewang/data/repositories_fake/wallets_repository_fake.dart';
import 'package:oewang/domain/models/receipt_draft.dart';
import 'package:oewang/domain/models/transaction.dart';

Result<ReceiptDraft, AppError> _refused(String code) =>
    Failure(ServerError(statusCode: 503, message: code, code: code));

void main() {
  group('MOB-8 receipt draft', () {
    test('reads the API answer field by field', () {
      final draft = ReceiptDraft.fromJson(const {
        'vault_file_id': 'f1',
        'draft': {
          'merchant': ' Warung Tekko ',
          'date': '2026-11-02',
          'currency': 'IDR',
          'total': '87500.0000',
        },
        'quality': {
          'low_confidence_fields': ['date'],
          'corrected_fields': [
            {'field': 'total', 'model_value': '8750'},
          ],
        },
      });
      expect(draft.merchant, 'Warung Tekko');
      expect(draft.date, DateTime(2026, 11, 2));
      expect(draft.total, Decimal.parse('87500'));
      expect(draft.corrected, ['total']);
      expect(draft.lowConfidence, ['date']);
      expect(draft.isEmpty, isFalse);
    });

    test('drops a prose date, an impossible date and a float total', () {
      for (final date in ['2 November', '2026-02-31']) {
        final draft = ReceiptDraft.fromJson({
          'vault_file_id': 'f1',
          'draft': {'date': date, 'total': 87500.5},
        });
        expect(draft.date, isNull);
        expect(draft.total, isNull);
        expect(draft.isEmpty, isTrue);
      }
    });
  });

  group('MOB-8 receipt scan', () {
    late VaultRepositoryFake vault;
    final image = File('receipt.jpg');

    setUp(() => vault = VaultRepositoryFake());

    ReceiptScanViewModel scanner(ReceiptsRepositoryFake receipts) =>
        ReceiptScanViewModel(vault: vault, receipts: receipts);

    test('uploads first, then reads by vault id', () async {
      final receipts = ReceiptsRepositoryFake(
        (id) =>
            Success(ReceiptDraft(vaultFileId: id, total: Decimal.parse('10'))),
      );
      final outcome = await scanner(receipts).scan(image);
      expect(outcome, isA<ReceiptScanDraft>());
      final draft = (outcome as ReceiptScanDraft).draft;
      expect(draft.vaultFileId, vault.files.single.id);
      expect(outcome.readable, isTrue);
    });

    test('a busy reader offers the queue for the uploaded file', () async {
      for (final code in ['AI_UNAVAILABLE', 'EXTRACTION_NO_ANSWER']) {
        final receipts = ReceiptsRepositoryFake((_) => _refused(code));
        final vm = scanner(receipts);
        final outcome = await vm.scan(image);
        expect(outcome, isA<ReceiptScanBusy>());
        await vm.queue((outcome as ReceiptScanBusy).vaultFileId);
        expect(receipts.queued.last, vault.files.first.id);
      }
    });

    test('an unreadable image opens the form with only the file', () async {
      final outcome = await scanner(
        ReceiptsRepositoryFake((_) => _refused('RECEIPT_UNREADABLE')),
      ).scan(image);
      expect(outcome, isA<ReceiptScanDraft>());
      expect((outcome as ReceiptScanDraft).readable, isFalse);
      expect(outcome.draft.vaultFileId, vault.files.single.id);
    });
  });

  test('MOB-8 a receipt draft prefills the transaction form', () async {
    final vm = TransactionFormViewModel(
      transactions: TransactionsRepositoryFake(),
      wallets: WalletsRepositoryFake(),
      categories: CategoriesRepositoryFake(),
      vault: VaultRepositoryFake(),
      receipt: ReceiptDraft(
        vaultFileId: 'f1',
        merchant: 'Warung Tekko',
        date: DateTime(2026, 11, 2),
        total: Decimal.parse('87500'),
      ),
    );
    addTearDown(vm.dispose);

    expect(vm.state.type, TransactionType.expense);
    expect(vm.state.amount, Decimal.parse('87500'));
    expect(vm.state.date, DateTime(2026, 11, 2));
    expect(vm.state.note, 'Warung Tekko');
    expect(vm.state.attachmentIds, ['f1']);
    expect(vm.isEditing, isFalse, reason: 'saving creates; nothing exists yet');
  });
}
