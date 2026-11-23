import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/workspaces_repository.dart';
import 'package:oewang/domain/models/workspace.dart';
import 'package:oewang/domain/models/workspace_membership.dart';

class WorkspacesRepositoryFake implements WorkspacesRepository {
  WorkspacesRepositoryFake({List<WorkspaceMembership>? memberships})
    : _memberships = [...?memberships];

  final List<WorkspaceMembership> _memberships;
  int _nextId = 1;

  @override
  Future<Result<List<WorkspaceMembership>, AppError>> list() async =>
      Success(List.unmodifiable(_memberships));

  @override
  Future<Result<Workspace, AppError>> create({
    required String name,
    required String currencyCode,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    final created = Workspace(
      id: 'ws-fake-${_nextId++}',
      name: name,
      currencyCode: currencyCode,
    );
    _memberships.add(
      WorkspaceMembership(id: created.id, name: name, role: 'owner'),
    );
    return Success(created);
  }
}
