import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/chat.dart';

/// Chat sessions and turns (`/v1/ai/sessions*`, `/v1/ai/chat/stream`).
/// Every route takes any role: a viewer may ask, and the API refuses a write
/// tool on their behalf (`TOOL_FORBIDDEN`).
abstract class ChatRepository {
  /// Newest activity first.
  Future<Result<List<ChatSessionSummary>, AppError>> listSessions();

  Future<Result<List<ChatMessage>, AppError>> messages(String sessionId);

  Future<Result<ChatSessionSummary, AppError>> createSession();

  Future<Result<void, AppError>> rename(String sessionId, String title);

  /// Soft delete, messages with it.
  Future<Result<void, AppError>> delete(String sessionId);

  /// One turn. The API persists both messages; a refusal before the stream
  /// opens is a [Failure]. Cancelling the subscription drops the
  /// connection, which stops the generation and keeps the partial reply
  /// (CHAT-9).
  Future<Result<Stream<ChatEvent>, AppError>> send(
    String sessionId,
    String message,
  );
}
