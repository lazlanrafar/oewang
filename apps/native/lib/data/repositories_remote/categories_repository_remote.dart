import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/category_dto.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/category.dart';

class CategoriesRepositoryRemote implements CategoriesRepository {
  CategoriesRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<List<Category>, AppError>> list({CategoryType? type}) async {
    try {
      final res = await _api.get(
        '/categories',
        queryParameters: {
          if (type != null) 'type': type == CategoryType.income ? 'income' : 'expense',
        },
      );
      final data = (res.data as Map<String, dynamic>)['data'];
      if (data is! List) return const Success<List<Category>, AppError>([]);
      final cats = data
          .whereType<Map<String, dynamic>>()
          .map(CategoryDto.fromJson)
          .map((dto) => dto.toDomain())
          .toList();
      return Success(cats);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }
}
