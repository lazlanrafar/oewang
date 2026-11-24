import 'package:decimal/decimal.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/workspace.dart';
import 'package:oewang/domain/models/workspace_membership.dart';

abstract class WorkspacesRepository {
  /// `GET /v1/workspaces`: every workspace the user belongs to, with the
  /// role in each. Works from a session with no workspace (D109).
  Future<Result<List<WorkspaceMembership>, AppError>> list();

  /// `POST /v1/workspaces` (WS-6). The caller then switches into it.
  Future<Result<Workspace, AppError>> create({
    required String name,
    required String currencyCode,
  });

  /// `GET /v1/workspaces/current`, with `currency_locked` (WAL-6).
  Future<Result<Workspace, AppError>> current();

  /// `PATCH /v1/workspaces/current` with a new currency, while unlocked.
  Future<Result<void, AppError>> setCurrency(String currencyCode);

  /// `GET /v1/workspaces/current/currency/preview?to=` (owner, WAL-7).
  Future<Result<CurrencyPreview, AppError>> previewConversion(String to);

  /// `POST /v1/workspaces/current/currency/convert` (owner, WAL-7, D105).
  Future<Result<void, AppError>> convertCurrency({
    required String currencyCode,
    required Decimal rate,
  });

  /// `GET /v1/workspaces/current/members`.
  Future<Result<List<WorkspaceMember>, AppError>> members();
}
