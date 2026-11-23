import 'dart:convert';
import 'dart:io';

import 'package:decimal/decimal.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/feedback_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories_remote/budgets_repository_remote.dart';
import 'package:oewang/data/repositories_remote/categories_repository_remote.dart';
import 'package:oewang/data/repositories_remote/feedback_repository_remote.dart';
import 'package:oewang/data/repositories_remote/overview_repository_remote.dart';
import 'package:oewang/data/repositories_remote/users_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallet_groups_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallets_repository_remote.dart';
import 'package:oewang/data/repositories_remote/workspaces_repository_remote.dart';
import 'package:oewang/data/services/api/api_client.dart';

/// Answers every request with [respond] (an envelope's `data`, or a status
/// to fail with) and records what was sent, below the OWE1 layer.
class _Stub extends Interceptor {
  _Stub([this.respond]);
  final Object? Function(RequestOptions)? respond;
  final sent = <RequestOptions>[];

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    sent.add(options);
    final data = respond?.call(options);
    if (data is int) {
      handler.reject(
        DioException(
          requestOptions: options,
          response: Response<dynamic>(
            requestOptions: options,
            statusCode: data,
            data: {
              'data': null,
              'error': {'code': 'NOT_FOUND', 'message': 'Not found'},
              'meta': <String, Object?>{},
            },
          ),
          type: DioExceptionType.badResponse,
        ),
      );
      return;
    }
    handler.resolve(
      Response<dynamic>(
        requestOptions: options,
        statusCode: 200,
        data: {'data': data, 'error': null, 'meta': <String, Object?>{}},
      ),
    );
  }
}

T _ok<T>(Result<T, AppError> r) => (r as Success<T, AppError>).value;

ApiClient _client(_Stub stub) => ApiClient(Dio()..interceptors.add(stub));

Map<String, dynamic> _walletView({String balance = '125000.5000'}) => {
  'id': 'w-1',
  'group_id': 'g-1',
  'group_name': 'Cash',
  'name': 'Wallet',
  'currency_code': 'IDR',
  'balance': balance,
  'is_included_in_totals': false,
  'is_default': true,
  'sort_order': 0,
  'has_transactions': true,
  'created_at': '2026-11-01T00:00:00+00:00',
  'updated_at': '2026-11-01T00:00:00+00:00',
};

void main() {
  group('MOB-4 wallets on /v1/wallets', () {
    test('maps a WalletView, balance exact', () async {
      final stub = _Stub((_) => [_walletView()]);
      final res = await WalletsRepositoryRemote(_client(stub)).list();
      final w = _ok(res).single;
      expect(w.balance, Decimal.parse('125000.5'));
      expect(w.isIncludedInTotals, isFalse);
      expect(w.groupId, 'g-1');
    });

    test('create sends snake_case and no balance (TXN-3)', () async {
      final stub = _Stub((_) => _walletView());
      await WalletsRepositoryRemote(
        _client(stub),
      ).create(const NewWalletDraft(name: 'Wallet', groupId: 'g-1'));
      expect(stub.sent.single.method, 'POST');
      expect(stub.sent.single.data, {'name': 'Wallet', 'group_id': 'g-1'});
    });

    test('update sends an explicit null group to detach', () async {
      final stub = _Stub((_) => _walletView());
      await WalletsRepositoryRemote(
        _client(stub),
      ).update('w-1', const NewWalletDraft(name: 'Wallet'));
      expect(stub.sent.single.method, 'PATCH');
      expect(stub.sent.single.path, '/wallets/w-1');
      final body = stub.sent.single.data as Map;
      expect(body.containsKey('group_id'), isTrue);
      expect(body['group_id'], isNull);
    });

    test('adjust posts the target as a decimal string', () async {
      final stub = _Stub((_) => _walletView(balance: '0.0100'));
      final res = await WalletsRepositoryRemote(
        _client(stub),
      ).adjust('w-1', Decimal.parse('0.01'));
      expect(stub.sent.single.path, '/wallets/w-1/adjust');
      expect(stub.sent.single.data, {'balance': '0.01'});
      expect(_ok(res).balance, Decimal.parse('0.01'));
    });

    test('the totals flag is a PATCH', () async {
      final stub = _Stub((_) => _walletView());
      await WalletsRepositoryRemote(
        _client(stub),
      ).setIncludedInTotals('w-1', included: true);
      expect(stub.sent.single.method, 'PATCH');
      expect(stub.sent.single.data, {'is_included_in_totals': true});
    });
  });

  group('MOB-4 reorder is one sort_order PATCH per row', () {
    test('wallet groups', () async {
      final stub = _Stub((_) => {'id': 'x', 'name': 'x'});
      await WalletGroupsRepositoryRemote(_client(stub)).reorder(['b', 'a']);
      expect(stub.sent.map((o) => '${o.method} ${o.path} ${o.data}'), [
        'PATCH /wallet-groups/b {sort_order: 0}',
        'PATCH /wallet-groups/a {sort_order: 1}',
      ]);
    });

    test('categories', () async {
      final stub = _Stub((_) => null);
      await CategoriesRepositoryRemote(_client(stub)).reorder(['c2', 'c1']);
      expect(stub.sent.map((o) => '${o.method} ${o.path} ${o.data}'), [
        'PATCH /categories/c2 {sort_order: 0}',
        'PATCH /categories/c1 {sort_order: 1}',
      ]);
    });
  });

  group('MOB-4 budgets on /v1/budgets', () {
    final body = {
      'month': '2026-11',
      'currency_code': 'IDR',
      'budgeted': '3500000.0000',
      'spent': '3800000.0000',
      'remaining': '-300000.0000',
      'percent': 108,
      'budgets': [
        {
          'id': 'b-1',
          'category_id': 'cat-food',
          'category_name': 'Food',
          'amount': '1500000.0000',
          'spent': '2000000.0000',
          'remaining': '-500000.0000',
          'percent': 133,
          'state': 'over',
        },
      ],
    };

    test('takes every figure from the API, past 100%', () async {
      final stub = _Stub((_) => body);
      final res = await BudgetsRepositoryRemote(
        _client(stub),
      ).status(month: 11, year: 2026);
      expect(stub.sent.single.path, '/budgets');
      expect(stub.sent.single.queryParameters, {'month': '2026-11'});
      final month = _ok(res);
      expect(month.totals.remaining.amount, Decimal.fromInt(-300000));
      expect(month.totals.percent, 108);
      final line = month.budgets.single;
      expect(line.remaining.amount, Decimal.fromInt(-500000));
      expect(line.percentage, 133);
      expect(line.amount.currency, 'IDR');
    });

    test('create and update send snake_case decimal strings', () async {
      final stub = _Stub((_) => null);
      final repo = BudgetsRepositoryRemote(_client(stub));
      await repo.create(categoryId: 'cat-food', amount: Decimal.parse('1.5'));
      await repo.update(id: 'b-1', amount: Decimal.fromInt(2));
      expect(stub.sent[0].data, {'category_id': 'cat-food', 'amount': '1.5'});
      expect(
        (stub.sent[1].method, stub.sent[1].path),
        ('PATCH', '/budgets/b-1'),
      );
    });
  });

  test('MOB-4 the overview maps totals and shares', () async {
    final stub = _Stub(
      (_) => {
        'currency_code': 'IDR',
        'income': {'value': '5000000.0000'},
        'expense': {'value': '200000.0000'},
        'income_categories': <Object>[],
        'expense_categories': [
          {
            'id': null,
            'name': null,
            'other': true,
            'total': '50000.0000',
            'share_percent': '25.00',
          },
        ],
      },
    );
    final res = await OverviewRepositoryRemote(
      _client(stub),
    ).overview(from: DateTime(2026, 11), to: DateTime(2026, 11, 30));
    expect(stub.sent.single.queryParameters, {
      'from': '2026-11-01',
      'to': '2026-11-30',
    });
    final o = _ok(res);
    expect(o.expense.amount, Decimal.fromInt(200000));
    final other = o.expenseCategories.single;
    expect(other.label, 'Other');
    expect(other.sharePercent, Decimal.fromInt(25));
  });

  test('MOB-4 feedback posts JSON with the API type names', () async {
    final stub = _Stub((_) => {'id': 'f-1'});
    await FeedbackRepositoryRemote(
      _client(stub),
    ).submit(type: FeedbackType.featureRequest, message: 'Dark icons');
    expect(stub.sent.single.data, {'type': 'feature', 'message': 'Dark icons'});
  });

  group('MOB-4 settings on /v1/auth/me and /v1/workspaces/current', () {
    test('avatar: bytes from base64, and a 404 is no photo', () async {
      final bytes = [1, 2, 3];
      final repo = UsersRepositoryRemote(
        _client(
          _Stub((_) => {'type': 'image/jpeg', 'data': base64Encode(bytes)}),
        ),
      );
      expect(_ok(await repo.avatar()), bytes);
      final none = UsersRepositoryRemote(_client(_Stub((_) => 404)));
      expect(_ok(await none.avatar()), isNull);
    });

    test('upload sends base64 and returns the version id', () async {
      final file = File('${Directory.systemTemp.path}/oewang-avatar.jpg')
        ..writeAsBytesSync([9, 9]);
      final stub = _Stub((_) => {'profile_picture': 'v-2'});
      final res = await UsersRepositoryRemote(_client(stub)).uploadAvatar(file);
      expect(stub.sent.single.method, 'PUT');
      expect(stub.sent.single.data, {
        'data': base64Encode([9, 9]),
      });
      expect(_ok(res), 'v-2');
    });

    test('colours are PUT together, null for the default', () async {
      final stub = _Stub((_) => null);
      await UsersRepositoryRemote(
        _client(stub),
      ).updateColors(incomeColor: '#f87171', expenseColor: null);
      expect(stub.sent.single.path, '/auth/me/colors');
      expect(stub.sent.single.data, {
        'income_color': '#f87171',
        'expense_color': null,
      });
    });

    test('current workspace carries the currency lock', () async {
      final stub = _Stub(
        (_) => {
          'id': 'ws',
          'name': 'Home',
          'slug': 'home',
          'currency_code': 'IDR',
          'role': 'owner',
          'currency_locked': true,
        },
      );
      final ws = _ok(await WorkspacesRepositoryRemote(_client(stub)).current());
      expect(ws.currencyLocked, isTrue);
      expect(ws.currencyCode, 'IDR');
    });

    test('preview, convert and members', () async {
      final stub = _Stub(
        (o) => switch (o.path) {
          '/workspaces/current/currency/preview' => {
            'from': 'IDR',
            'to': 'USD',
            'suggested_rate': '0.000062',
            'rate_date': '2026-11-20',
            'transactions': 12,
            'budgets': 2,
          },
          '/workspaces/current/members' => [
            {
              'user_id': 'u-1',
              'email': 'a@b.com',
              'name': null,
              'role': 'admin',
              'joined_at': '2026-11-01T00:00:00+00:00',
            },
          ],
          _ => null,
        },
      );
      final repo = WorkspacesRepositoryRemote(_client(stub));
      final p = _ok(await repo.previewConversion('USD'));
      expect(p.suggestedRate, Decimal.parse('0.000062'));
      expect(p.transactions, 12);
      await repo.convertCurrency(
        currencyCode: 'USD',
        rate: Decimal.parse('0.000062'),
      );
      expect(stub.sent[1].data, {'currency_code': 'USD', 'rate': '0.000062'});
      final members = _ok(await repo.members());
      expect(members.single.role, 'admin');
    });
  });
}
