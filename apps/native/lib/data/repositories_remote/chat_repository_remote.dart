import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/chat_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/chat.dart';

class ChatRepositoryRemote implements ChatRepository {
  ChatRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<Result<List<ChatSessionSummary>, AppError>> listSessions() =>
      _call(() async {
        final res = await _api.get(
          '/ai/sessions',
          queryParameters: {'limit': 50},
        );
        final rows = envelopeData(res) as List? ?? const [];
        return rows.cast<Map<String, dynamic>>().map(_session).toList();
      });

  @override
  Future<Result<List<ChatMessage>, AppError>> messages(String sessionId) =>
      _call(() async {
        final data = envelopeData(await _api.get('/ai/sessions/$sessionId'));
        final rows = data is Map ? data['messages'] as List? : null;
        return [
          for (final m in (rows ?? const []).cast<Map<String, dynamic>>())
            ChatMessage(
              id: m['id'] as String,
              role: ChatRole.values.asNameMap()[m['role']] ?? ChatRole.system,
              content: m['content'] as String? ?? '',
              toolCalls: toolCallsFromAttachments(m['attachments']),
            ),
        ];
      });

  @override
  Future<Result<ChatSessionSummary, AppError>> createSession() => _call(
    () async => _session(
      envelopeData(await _api.post('/ai/sessions', data: {'title': null}))!
          as Map<String, dynamic>,
    ),
  );

  @override
  Future<Result<void, AppError>> rename(String sessionId, String title) =>
      _call(
        () => _api.patch('/ai/sessions/$sessionId', data: {'title': title}),
      );

  @override
  Future<Result<void, AppError>> delete(String sessionId) =>
      _call(() => _api.delete('/ai/sessions/$sessionId'));

  @override
  Future<Result<Stream<ChatEvent>, AppError>> send(
    String sessionId,
    String message,
  ) => _call(() async {
    final frames = await _api.stream(
      '/ai/chat/stream',
      data: {
        'session_id': sessionId,
        'message': message,
        'attachment_ids': <String>[],
      },
    );
    return frames.map((f) => (event: f.event, data: f.data));
  });

  static ChatSessionSummary _session(Map<String, dynamic> json) =>
      ChatSessionSummary(
        id: json['id'] as String,
        title: json['title'] as String? ?? '',
        lastMessage: json['last_message'] as String?,
        updatedAt:
            DateTime.tryParse(json['updated_at'] as String? ?? '') ??
            DateTime.now(),
      );

  Future<Result<T, AppError>> _call<T>(Future<T> Function() run) async {
    try {
      return Success(await run());
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }
}
