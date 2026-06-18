import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/workspaces_repository.dart';
import 'package:oewang/domain/models/workspace.dart';

class WorkspacesRepositoryFake implements WorkspacesRepository {
  int _nextId = 1;

  @override
  Future<Result<Workspace, AppError>> create({
    required String name,
    String? country,
    String? mainCurrencyCode,
    String? mainCurrencySymbol,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    return Success(Workspace(id: 'ws-fake-${_nextId++}', name: name));
  }
}
