import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/chat_repository.dart';
import 'package:oewang/domain/models/chat.dart';
import 'package:oewang/domain/models/chat_turn.dart';

/// One conversation: its stored messages and the turn in flight (MOB-8).
///
/// A new conversation has no session until its first message, so opening
/// the chat and leaving makes nothing.
class ChatViewModel extends ChangeNotifier {
  ChatViewModel(this._repo, {String? sessionId}) : _sessionId = sessionId {
    if (sessionId != null) unawaited(_load(sessionId));
  }

  final ChatRepository _repo;
  String? _sessionId;
  StreamSubscription<ChatEvent>? _sub;
  bool _disposed = false;

  String? get sessionId => _sessionId;
  List<ChatMessage> messages = const [];
  ChatTurn turn = const ChatTurn();
  bool loading = false;
  AppError? error;

  bool get canSend => !turn.isActive && !loading;

  Future<void> _load(String id) async {
    loading = true;
    _notify();
    final res = await _repo.messages(id);
    loading = false;
    switch (res) {
      case Success(:final value):
        messages = value.where((m) => m.role != ChatRole.system).toList();
      case Failure(error: final e):
        error = e;
    }
    _notify();
  }

  Future<void> send(String text) async {
    final message = text.trim();
    if (message.isEmpty || !canSend) return;
    error = null;

    var id = _sessionId;
    if (id == null) {
      final created = await _repo.createSession();
      switch (created) {
        case Success(:final value):
          id = _sessionId = value.id;
        case Failure(error: final e):
          error = e;
          _notify();
          return;
      }
    }

    messages = [
      ...messages,
      ChatMessage(
        id: 'local-${messages.length}',
        role: ChatRole.user,
        content: message,
      ),
    ];
    turn = ChatTurn.sending;
    _notify();

    switch (await _repo.send(id, message)) {
      case Failure(error: final e):
        turn = turn.fail(e.code ?? 'STREAM_FAILED');
        error = e;
        _notify();
      case Success(value: final events):
        _sub = events.listen(
          (e) {
            turn = turn.advance(e.event, e.data);
            if (!turn.isActive) _settle();
            _notify();
          },
          // A dropped connection or an event that fails to open.
          onError: (Object _) {
            turn = turn.fail('STREAM_FAILED');
            _settle();
            _notify();
          },
          // `done` or `error` always arrives last; a stream that just ends
          // lost its tail.
          onDone: () {
            if (turn.isActive) turn = turn.fail('STREAM_FAILED');
            _settle();
            _notify();
          },
        );
    }
  }

  /// Stops generation; the API keeps the partial reply (CHAT-9).
  void stop() {
    if (!turn.isActive) return;
    turn = turn.stop();
    _settle();
    _notify();
  }

  /// The ended turn becomes a message, so it stays when the next one starts.
  void _settle() {
    final sub = _sub;
    _sub = null;
    unawaited(sub?.cancel());
    if (turn.text.isEmpty && turn.toolCalls.isEmpty) return;
    messages = [
      ...messages,
      ChatMessage(
        id: 'local-${messages.length}',
        role: ChatRole.assistant,
        content: turn.text,
        toolCalls: turn.toolCalls,
      ),
    ];
    turn = ChatTurn(status: turn.status, errorCode: turn.errorCode);
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_sub?.cancel());
    super.dispose();
  }
}
