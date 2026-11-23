/// The chat stream, opened one sealed event at a time (MOB-8).
///
/// Frames follow docs/ai/service.md#streaming-protocol; each frame's data is
/// `{"n","c"}` sealed with `k_s2c` under `OWE1|sse|session|request|seq`
/// (docs/api/encryption.md#chat-stream-events). The frame reader is a port of
/// the web's `readFrames` in `apps/app/src/lib/chat-stream.ts`.
library;

import 'dart:convert';

import 'package:oewang/data/services/api/owe1/owe1_protocol.dart';

class SseFrame {
  const SseFrame(this.event, this.data);
  final String event;
  final String data;
}

/// Whole frames in [buffer], and what is left of a frame still arriving.
///
/// Nothing is parsed until its blank line has arrived: a network chunk can
/// end anywhere, including inside a field name.
(List<SseFrame>, String) readFrames(String buffer) {
  final text = buffer.replaceAll('\r\n', '\n');
  final frames = <SseFrame>[];
  var start = 0;
  for (;;) {
    final end = text.indexOf('\n\n', start);
    if (end == -1) break;
    final frame = _parseFrame(text.substring(start, end));
    if (frame != null) frames.add(frame);
    start = end + 2;
  }
  return (frames, text.substring(start));
}

SseFrame? _parseFrame(String block) {
  var event = '';
  final data = <String>[];
  for (final line in block.split('\n')) {
    // A leading colon is a comment; servers send one as a keep-alive.
    if (line.isEmpty || line.startsWith(':')) continue;
    final colon = line.indexOf(':');
    final field = colon == -1 ? line : line.substring(0, colon);
    final raw = colon == -1 ? '' : line.substring(colon + 1);
    final value = raw.startsWith(' ') ? raw.substring(1) : raw;
    if (field == 'event') event = value;
    if (field == 'data') data.add(value);
  }
  if (event.isEmpty && data.isEmpty) return null;
  return SseFrame(event.isEmpty ? 'message' : event, data.join('\n'));
}

/// The plaintext frames of one stream, in order.
///
/// `seq` counts sealed events from 0, so a dropped, reordered or replayed
/// event fails to open instead of arriving quietly. An unsealed event is
/// refused: accepting one would let whoever strips the seal write the
/// assistant's words.
Stream<SseFrame> openEvents(
  Stream<List<int>> bytes, {
  required List<int> key,
  required String sessionId,
  required String requestId,
}) async* {
  var buffer = '';
  var seq = 0;
  // Dio hands a Stream<Uint8List>, which utf8.decoder refuses at runtime
  // unless it is first viewed as the Stream<List<int>> it is declared as.
  await for (final text in bytes.cast<List<int>>().transform(utf8.decoder)) {
    final (frames, rest) = readFrames(buffer + text);
    buffer = rest;
    for (final frame in frames) {
      final Object? sealed;
      try {
        sealed = jsonDecode(frame.data);
      } on FormatException {
        throw const Owe1Exception('malformed event');
      }
      if (sealed is! Map<String, dynamic> ||
          sealed['n'] is! String ||
          sealed['c'] is! String) {
        throw const Owe1Exception('refusing an unsealed event');
      }
      final plain = await open(
        key,
        aadStreamEvent(sessionId, requestId, seq),
        SealedBody.fromJson(sealed),
      );
      seq += 1;
      yield SseFrame(frame.event, utf8.decode(plain));
    }
  }
}
