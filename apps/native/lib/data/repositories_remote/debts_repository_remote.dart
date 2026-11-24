import 'package:decimal/decimal.dart';
import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/debt_dto.dart';
import 'package:oewang/data/repositories/debts_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/debt.dart';

/// Runs one API call, mapping a transport failure to an [AppError].
Future<Result<T, AppError>> apiCall<T>(Future<T> Function() call) async {
  try {
    return Success(await call());
  } on DioException catch (e) {
    return Failure(mapDioError(e));
  } on Exception {
    return const Failure(UnknownError());
  }
}

/// Every page of a `/v1/debts` or `/v1/contacts` list.
Future<List<Map<String, dynamic>>> fetchAllPages(
  ApiClient api,
  String path, {
  Map<String, dynamic> query = const {},
}) async {
  const perPage = 100;
  final out = <Map<String, dynamic>>[];
  // shortcut: stops at 2,000 rows; a workspace with more debts would need
  // the list paged on screen.
  for (var page = 1; page <= 20; page++) {
    final data = envelopeData(
      await api.get(
        path,
        queryParameters: {...query, 'page': page, 'per_page': perPage},
      ),
    );
    final batch = [
      for (final r in (data as List?) ?? const []) r as Map<String, dynamic>,
    ];
    out.addAll(batch);
    if (batch.length < perPage) break;
  }
  return out;
}

class DebtsRepositoryRemote implements DebtsRepository {
  DebtsRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<List<Debt>, AppError>> list({String? search}) =>
      apiCall(() async {
        final rows = await fetchAllPages(
          _api,
          '/debts',
          query: {
            'today': dayWire(DateTime.now()),
            if (search != null && search.isNotEmpty) 'search': search,
          },
        );
        return rows.map(debtFromJson).toList();
      });

  @override
  Future<Result<DebtSummary, AppError>> summary() => apiCall(() async {
    final data = envelopeData(
      await _api.get(
        '/debts/summary',
        queryParameters: {'today': dayWire(DateTime.now())},
      ),
    );
    return debtSummaryFromJson(data! as Map<String, dynamic>);
  });

  @override
  Future<Result<List<DebtPayment>, AppError>> payments(String debtId) =>
      apiCall(() async {
        final debt =
            envelopeData(await _api.get('/debts/$debtId'))!
                as Map<String, dynamic>;
        final currency = debt['currency_code'] as String? ?? 'IDR';
        return [
          for (final p in (debt['payments'] as List?) ?? const [])
            debtPaymentFromJson({
              'debt_id': debtId,
              ...p as Map<String, dynamic>,
            }, currency: currency),
        ];
      });

  @override
  Future<Result<Debt, AppError>> create(NewDebtDraft draft) =>
      apiCall(() async {
        final res = await _api.post('/debts', data: debtBody(draft));
        return debtFromJson(envelopeData(res)! as Map<String, dynamic>);
      });

  @override
  Future<Result<Debt, AppError>> update({
    required String id,
    String? contactId,
    Decimal? amount,
    String? description,
    DateTime? dueDate,
  }) => apiCall(() async {
    final res = await _api.patch(
      '/debts/$id',
      data: debtPatch(
        contactId: contactId,
        amount: amount,
        description: description,
        dueDate: dueDate,
      ),
    );
    return debtFromJson(envelopeData(res)! as Map<String, dynamic>);
  });

  @override
  Future<Result<void, AppError>> delete(String id) =>
      apiCall(() => _api.delete('/debts/$id'));

  @override
  Future<Result<void, AppError>> pay(String debtId, NewDebtPayment payment) =>
      apiCall(
        () => _api.post('/debts/$debtId/payments', data: paymentBody(payment)),
      );

  @override
  Future<Result<void, AppError>> cancelPayment(
    String debtId,
    String paymentId,
  ) => apiCall(() => _api.delete('/debts/$debtId/payments/$paymentId'));
}

/// The `PATCH /v1/debts/{id}` body: only what was given.
Map<String, dynamic> debtPatch({
  String? contactId,
  Decimal? amount,
  String? description,
  DateTime? dueDate,
}) => {
  'contact_id': ?contactId,
  if (amount != null) 'amount': '$amount',
  'description': ?description,
  if (dueDate != null) 'due_date': dayWire(dueDate),
};
