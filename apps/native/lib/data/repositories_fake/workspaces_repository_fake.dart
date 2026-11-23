import 'package:decimal/decimal.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/workspaces_repository.dart';
import 'package:oewang/domain/models/workspace.dart';
import 'package:oewang/domain/models/workspace_membership.dart';

class WorkspacesRepositoryFake implements WorkspacesRepository {
  WorkspacesRepositoryFake({
    List<WorkspaceMembership>? memberships,
    Workspace? current,
    List<WorkspaceMember>? members,
  }) : _memberships = [...?memberships],
       _current =
           current ??
           const Workspace(id: 'ws', name: 'Personal', currencyCode: 'IDR'),
       _members =
           members ??
           const [
             WorkspaceMember(
               userId: 'u-1',
               email: 'tester@oewang.com',
               name: 'Test User',
               role: 'owner',
             ),
           ];

  final List<WorkspaceMembership> _memberships;
  final List<WorkspaceMember> _members;
  Workspace _current;
  int _nextId = 1;

  Workspace get currentWorkspace => _current;

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

  @override
  Future<Result<Workspace, AppError>> current() async => Success(_current);

  @override
  Future<Result<void, AppError>> setCurrency(String currencyCode) async {
    if (_current.currencyLocked) {
      return const Failure(
        ServerError(
          statusCode: 409,
          code: 'WORKSPACE_CURRENCY_LOCKED',
          message: 'The currency is locked',
        ),
      );
    }
    _current = Workspace(
      id: _current.id,
      name: _current.name,
      currencyCode: currencyCode,
    );
    return const Success<void, AppError>(null);
  }

  @override
  Future<Result<CurrencyPreview, AppError>> previewConversion(
    String to,
  ) async => Success(
    CurrencyPreview(
      from: _current.currencyCode,
      to: to,
      suggestedRate: Decimal.parse('0.000062'),
      transactions: 3,
      budgets: 1,
    ),
  );

  @override
  Future<Result<void, AppError>> convertCurrency({
    required String currencyCode,
    required Decimal rate,
  }) async {
    _current = Workspace(
      id: _current.id,
      name: _current.name,
      currencyCode: currencyCode,
      currencyLocked: true,
    );
    return const Success<void, AppError>(null);
  }

  @override
  Future<Result<List<WorkspaceMember>, AppError>> members() async =>
      Success(List.unmodifiable(_members));
}
