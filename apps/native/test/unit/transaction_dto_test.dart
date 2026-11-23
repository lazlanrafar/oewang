import 'package:decimal/decimal.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/transaction_dto.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories_remote/transactions_repository_remote.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/new_transaction_draft.dart';
import 'package:oewang/domain/models/transaction.dart';

/// A `TransactionView` as the API sends it.
Map<String, dynamic> view({
  String amount = '50000.0000',
  String baseAmount = '50000.0000',
  String type = 'expense',
  String currency = 'IDR',
}) => {
  'id': 't-1',
  'wallet_id': 'w-cash',
  'wallet_name': 'Cash',
  'wallet_currency_code': currency,
  'to_wallet_id': null,
  'to_wallet_name': null,
  'category_id': 'cat-food',
  'category_name': 'Food',
  'amount': amount,
  'to_amount': null,
  'original_amount': null,
  'original_currency_code': null,
  'exchange_rate': null,
  'base_amount': baseAmount,
  'base_rate': '1',
  'base_rate_source': 'identity',
  'base_rate_date': '2026-01-05',
  'base_rate_is_stale': false,
  'date': '2026-01-05T04:30:00+00:00',
  'type': type,
  'name': 'Nasi Jinggo',
  'description': null,
  'is_exported': false,
  'source': 'web',
  'created_at': '2026-01-05T04:30:00+00:00',
};

/// Answers every request with [respond] and records what was sent, below
/// the OWE1 layer (which has its own vectors test).
class _Stub extends Interceptor {
  _Stub(this.respond);
  final Object? Function(RequestOptions) respond;
  final sent = <RequestOptions>[];

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    sent.add(options);
    handler.resolve(
      Response<dynamic>(
        requestOptions: options,
        statusCode: 200,
        data: {
          'data': respond(options),
          'error': null,
          'meta': <String, Object?>{},
        },
      ),
    );
  }
}

void main() {
  group('MOB-4 TransactionDto', () {
    test('maps a TransactionView with joined wallet and category', () {
      final tx = TransactionDto.fromJson(view()).toDomain();
      expect(tx.type, TransactionType.expense);
      expect(tx.amount.currency, 'IDR');
      expect(tx.wallet?.name, 'Cash');
      expect(tx.category?.name, 'Food');
      // The instant's local calendar day.
      final local = DateTime.parse('2026-01-05T04:30:00Z').toLocal();
      expect(tx.date, DateTime(local.year, local.month, local.day));
    });

    test('keeps decimal strings exact, digits a double would lose', () {
      final tx = TransactionDto.fromJson(
        view(
          amount: '12345678901234.5678',
          baseAmount: '0.1000',
          currency: 'USD',
        ),
      ).toDomain();
      expect(tx.amount.amount, Decimal.parse('12345678901234.5678'));
      expect(tx.amount.amount.toString(), '12345678901234.5678');
      expect(
        tx.baseAmount + tx.baseAmount + tx.baseAmount,
        Decimal.parse('0.3'),
      );
    });

    test('refuses a JSON number for an amount rather than guessing', () {
      final bad = view()..['amount'] = 5000;
      expect(() => TransactionDto.fromJson(bad), throwsA(isA<TypeError>()));
    });

    test('falls back to expense on an unknown wire type', () {
      expect(
        TransactionDto.fromJson(view(type: 'mystery')).toDomain().type,
        TransactionType.expense,
      );
    });

    test(
      'the write body carries the amount as a string and the day at noon',
      () {
        final body = TransactionDto.body(
          NewTransactionDraft(
            type: TransactionType.expense,
            amount: Decimal.parse('35000.50'),
            date: DateTime(2026, 1, 5),
            walletId: 'w-cash',
            categoryId: 'cat-food',
            note: 'Lunch',
          ),
        );
        expect(body['amount'], '35000.5');
        expect(body['wallet_id'], 'w-cash');
        expect(body['category_id'], 'cat-food');
        expect(body['name'], 'Lunch');
        expect(body.containsKey('attachment_ids'), isFalse);
        final day = DateTime.parse(body['date'] as String).toLocal();
        expect([day.year, day.month, day.day, day.hour], [2026, 1, 5, 12]);
      },
    );
  });

  group('MOB-4 TransactionsRepositoryRemote', () {
    test('lists with the API filter names and maps every row', () async {
      final stub = _Stub((_) => [view(), view(amount: '1.2300')]);
      final repo = TransactionsRepositoryRemote(
        ApiClient(Dio()..interceptors.add(stub)),
      );

      final res = await repo.list(
        TransactionsListQuery(
          from: DateTime(2026, 1),
          to: DateTime(2026, 1, 31),
          page: 2,
        ),
      );

      final rows = (res as Success<List<Transaction>, AppError>).value;
      expect(rows.map((t) => t.amount.amount.toString()), ['50000', '1.23']);
      expect(stub.sent.single.queryParameters, {
        'start_date': '2026-01-01',
        'end_date': '2026-01-31',
        'limit': 100,
        'page': 2,
        'type': null,
      });
    });

    test(
      'reads the summary totals as decimals in the workspace currency',
      () async {
        final stub = _Stub(
          (_) => {
            'currency_code': 'USD',
            'by_type': [
              {'type': 'income', 'total': '1000.10', 'count': 2},
              {'type': 'expense', 'total': '0.30', 'count': 3},
            ],
            'by_category': <Object>[],
          },
        );
        final repo = TransactionsRepositoryRemote(
          ApiClient(Dio()..interceptors.add(stub)),
        );

        final res = await repo.summary(
          from: DateTime(2026, 1),
          to: DateTime(2026, 1, 31),
        );

        final summary = (res as Success<TransactionsSummary, AppError>).value;
        expect(summary.currency, 'USD');
        expect(summary.income.amount, Decimal.parse('1000.1'));
        expect(summary.expense.amount, Decimal.parse('0.3'));
        expect(stub.sent.single.path, '/transactions/summary');
      },
    );
  });
}
