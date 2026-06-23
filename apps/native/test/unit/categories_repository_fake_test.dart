import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories_fake/categories_repository_fake.dart';
import 'package:oewang/domain/models/category.dart';

void main() {
  group('CategoriesRepositoryFake', () {
    test('update renames the category in the underlying store', () async {
      final repo = CategoriesRepositoryFake();
      final res = await repo.update(id: 'cat-food', name: 'Foods');
      expect(res, isA<Success<Category, Object>>());
      final list = await repo.list(type: CategoryType.expense);
      final names =
          list.fold((cs) => cs.map((c) => c.name).toList(), (_) => <String>[]);
      expect(names, contains('Foods'));
      expect(names, isNot(contains('Food')));
    });

    test('update of an unknown id returns a server error', () async {
      final repo = CategoriesRepositoryFake();
      final res = await repo.update(id: 'nope', name: 'X');
      expect(res.isErr, isTrue);
    });
  });
}
