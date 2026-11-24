/// One streaming turn, advanced frame by frame. A port of `advance` in the
/// web's `apps/app/src/lib/chat-stream.ts`; the protocol is
/// docs/ai/service.md#streaming-protocol.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/chat.dart';

enum TurnStatus { idle, sending, streaming, done, stopped, failed }

@immutable
class ChatTurn {
  const ChatTurn({
    this.status = TurnStatus.idle,
    this.text = '',
    this.textSinceTool = '',
    this.toolCalls = const [],
    this.errorCode,
  });

  final TurnStatus status;

  /// The assistant's text so far. Kept on stop: a partial reply is a reply.
  final String text;

  /// Text since the latest tool call; all the screen shows while working.
  final String textSinceTool;
  final List<ToolCall> toolCalls;
  final String? errorCode;

  bool get isActive =>
      status == TurnStatus.sending || status == TurnStatus.streaming;

  /// While tools are in play, narration before the last call is hidden
  /// (CHAT-14); once the turn ends the whole text shows, as stored.
  String get visibleText =>
      isActive && toolCalls.isNotEmpty ? textSinceTool : text;

  /// What a working turn shows when no words are on screen yet.
  String? get phase {
    if (!isActive) return null;
    if (toolCalls.any((c) => c.status == ToolStatus.running)) return null;
    if (visibleText.isNotEmpty) return null;
    return toolCalls.isEmpty ? 'Thinking' : 'Reading the results';
  }

  ChatTurn _copy({
    TurnStatus? status,
    String? text,
    String? textSinceTool,
    List<ToolCall>? toolCalls,
    String? errorCode,
  }) => ChatTurn(
    status: status ?? this.status,
    text: text ?? this.text,
    textSinceTool: textSinceTool ?? this.textSinceTool,
    toolCalls: toolCalls ?? this.toolCalls,
    errorCode: errorCode ?? this.errorCode,
  );

  static const sending = ChatTurn(status: TurnStatus.sending);

  ChatTurn stop() => isActive ? _copy(status: TurnStatus.stopped) : this;

  ChatTurn fail(String code) =>
      isActive ? _copy(status: TurnStatus.failed, errorCode: code) : this;

  /// The next state. Once a turn has stopped, finished or failed nothing
  /// reopens it: a frame already buffered when Stop was pressed must not
  /// make the button look ignored.
  ChatTurn advance(String event, String data) {
    if (!isActive) return this;
    final payload = _payload(data);
    String str(Object? v) => v is String ? v : '';

    switch (event) {
      case 'token':
        final chunk = str(payload['text']);
        return _copy(
          status: TurnStatus.streaming,
          text: text + chunk,
          textSinceTool: textSinceTool + chunk,
        );
      case 'tool_call':
        final id = str(payload['id']);
        final name = str(payload['name']);
        if (id.isEmpty || name.isEmpty) return this;
        return _copy(
          status: TurnStatus.streaming,
          // Two rounds of the model, kept as two paragraphs, as stored.
          text: text.trim().isNotEmpty ? '${text.trimRight()}\n\n' : text,
          textSinceTool: '',
          toolCalls: [
            ...toolCalls,
            ToolCall(id: id, name: name),
          ],
        );
      case 'tool_result':
        final id = str(payload['id']);
        // A result for a call that never arrived is dropped, not invented.
        if (!toolCalls.any((c) => c.id == id)) return this;
        return _copy(
          toolCalls: [
            for (final c in toolCalls)
              c.id == id
                  ? c.copyWith(
                      status: payload['ok'] == true
                          ? ToolStatus.ok
                          : ToolStatus.failed,
                      summary: str(payload['summary']),
                    )
                  : c,
          ],
        );
      case 'artifact':
        final id = str(payload['id']);
        final artifact = ChatArtifact.read(payload['type'], payload['payload']);
        if (artifact == null || !toolCalls.any((c) => c.id == id)) return this;
        return _copy(
          toolCalls: [
            for (final c in toolCalls)
              c.id == id ? c.copyWith(artifact: artifact) : c,
          ],
        );
      case 'done':
        return _copy(status: TurnStatus.done);
      case 'error':
        final code = str(payload['code']);
        return fail(code.isEmpty ? 'STREAM_FAILED' : code);
      default:
        // An event this version does not know is ignored, not guessed at.
        return this;
    }
  }
}

/// A malformed payload is dropped, not thrown: the screen is holding a
/// half-written answer and one bad frame should not take it down.
Map<String, dynamic> _payload(String data) {
  try {
    final parsed = jsonDecode(data);
    return parsed is Map<String, dynamic> ? parsed : const {};
  } on FormatException {
    return const {};
  }
}
