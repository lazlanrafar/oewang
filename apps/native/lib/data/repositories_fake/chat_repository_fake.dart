import 'dart:async';

import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/chat_repository.dart';
import 'package:oewang/domain/models/chat.dart';

/// In-memory sessions. Each [send] answers with [nextTurn], a controller the
/// test drives event by event; [sent] records what was asked.
class ChatRepositoryFake implements ChatRepository {
  final sessions = <ChatSessionSummary>[];
  final stored = <String, List<ChatMessage>>{};
  final sent = <String>[];
  StreamController<ChatEvent> nextTurn = StreamController<ChatEvent>();
  int _ids = 0;

  @override
  Future<Result<List<ChatSessionSummary>, AppError>> listSessions() async =>
      Success(List.of(sessions));

  @override
  Future<Result<List<ChatMessage>, AppError>> messages(String id) async =>
      Success(stored[id] ?? const []);

  @override
  Future<Result<ChatSessionSummary, AppError>> createSession() async {
    final session = ChatSessionSummary(
      id: 's${++_ids}',
      title: 'New chat',
      updatedAt: DateTime(2026, 11, 23),
    );
    sessions.insert(0, session);
    return Success(session);
  }

  @override
  Future<Result<void, AppError>> rename(String id, String title) async {
    final i = sessions.indexWhere((s) => s.id == id);
    sessions[i] = ChatSessionSummary(
      id: id,
      title: title,
      updatedAt: sessions[i].updatedAt,
    );
    return const Success(null);
  }

  @override
  Future<Result<void, AppError>> delete(String id) async {
    sessions.removeWhere((s) => s.id == id);
    return const Success(null);
  }

  @override
  Future<Result<Stream<ChatEvent>, AppError>> send(
    String sessionId,
    String message,
  ) async {
    sent.add(message);
    return Success(nextTurn.stream);
  }
}
