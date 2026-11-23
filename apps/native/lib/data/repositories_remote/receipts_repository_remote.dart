import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/receipts_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/receipt_draft.dart';

class ReceiptsRepositoryRemote implements ReceiptsRepository {
  ReceiptsRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<Result<ReceiptDraft, AppError>> parse(String vaultFileId) async {
    try {
      final res = await _api.post(
        '/ai/receipt/parse',
        data: {'vault_file_id': vaultFileId},
      );
      final data = envelopeData(res);
      if (data is! Map<String, dynamic>) {
        return const Failure(
          ServerError(statusCode: 500, message: 'Unexpected response'),
        );
      }
      return Success(
        ReceiptDraft.fromJson({...data, 'vault_file_id': vaultFileId}),
      );
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<void, AppError>> queue(String vaultFileId) async {
    try {
      await _api.post(
        '/receipts/pending',
        data: {'vault_file_id': vaultFileId},
      );
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }
}
