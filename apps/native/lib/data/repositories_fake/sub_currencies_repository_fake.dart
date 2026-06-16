import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/sub_currencies_repository.dart';
import 'package:oewang/domain/models/sub_currency.dart';

class SubCurrenciesRepositoryFake implements SubCurrenciesRepository {
  SubCurrenciesRepositoryFake({List<SubCurrency>? seed})
    : _store = (seed ?? _seed).toList();

  static const _seed = <SubCurrency>[
    SubCurrency(id: 'sc-sgd', currencyCode: 'SGD'),
    SubCurrency(id: 'sc-usd', currencyCode: 'USD'),
  ];

  final List<SubCurrency> _store;
  int _nextId = 1000;

  @override
  Future<Result<List<SubCurrency>, AppError>> list() async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    return Success(List<SubCurrency>.unmodifiable(_store));
  }

  @override
  Future<Result<SubCurrency, AppError>> create(String currencyCode) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    if (_store.any((s) => s.currencyCode == currencyCode)) {
      return const Failure(
        ServerError(statusCode: 409, message: 'Currency code already exists'),
      );
    }
    final created = SubCurrency(
      id: 'sc-fake-${_nextId++}',
      currencyCode: currencyCode,
    );
    _store.add(created);
    return Success(created);
  }

  @override
  Future<Result<void, AppError>> delete(String id) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    _store.removeWhere((s) => s.id == id);
    return const Success<void, AppError>(null);
  }
}
