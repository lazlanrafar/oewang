import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/rates_repository.dart';

class RatesRepositoryFake implements RatesRepository {
  RatesRepositoryFake({Map<String, double>? seed})
    : _seed = seed ?? _defaultSeed;

  /// Default seed assumes base=IDR so `1 IDR = N units of code`. Numbers
  /// match the IMG_2260 screenshot (1 SGD ≈ 13,319.65 IDR, 1 USD ≈ 16,834.50).
  static const _defaultSeed = <String, double>{
    'IDR': 1,
    'SGD': 1 / 13319.6486421,
    'USD': 1 / 16834.504124,
  };

  final Map<String, double> _seed;

  @override
  Future<Result<Map<String, double>, AppError>> rates({
    String base = 'USD',
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    return Success(Map<String, double>.unmodifiable(_seed));
  }
}
