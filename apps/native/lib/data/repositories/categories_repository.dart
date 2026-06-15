import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/category.dart';

abstract class CategoriesRepository {
  Future<Result<List<Category>, AppError>> list({CategoryType? type});
  Future<Result<Category, AppError>> update({
    required String id,
    required String name,
  });
}
