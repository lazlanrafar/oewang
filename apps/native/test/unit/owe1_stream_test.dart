import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/data/repositories_remote/chat_repository_remote.dart';
import 'package:oewang/data/services/api/owe1/owe1_protocol.dart';
import 'package:oewang/data/services/api/owe1/owe1_stream.dart';

import '../support/fake_owe1_api.dart';

void main() {
  group('MOB-8 SSE frame reader', () {
    test('keeps a frame split across chunks until its blank line', () {
      final (first, rest) = readFrames('event: token\ndata: {"te');
      expect(first, isEmpty);
      final (frames, tail) = readFrames(
        '$rest'
        'xt":"hi"}\r\n\r\nevent: do',
      );
      expect(frames.single.event, 'token');
      expect(frames.single.data, '{"text":"hi"}');
      expect(tail, 'event: do');
    });

    test('skips keep-alive comments and joins multi-line data', () {
      final (frames, _) = readFrames(': ping\n\ndata: a\ndata: b\n\n');
      expect(frames.single.event, 'message');
      expect(frames.single.data, 'a\nb');
    });
  });

  group('MOB-8 sealed chat stream', () {
    late FakeOwe1Api server;

    // The answer to the next stream request, built from that request so the
    // events are sealed under its id.
    Future<List<String>> Function(FakeRequest req)? turn;

    setUp(() {
      server = FakeOwe1Api((api, req) async {
        if (req.path == '/v1/ai/chat/stream') {
          return api.stream(await turn!(req));
        }
        return api.envelope(req, null, status: 404, code: 'NOT_FOUND');
      });
    });

    Future<List<String>> events(
      FakeRequest req,
      List<(String, Object)> list, {
      int startSeq = 0,
    }) async => [
      for (final (i, (name, payload)) in list.indexed)
        await server.event(req, startSeq + i, name, payload),
    ];

    test('opens each event in order, through to done', () async {
      turn = (req) async {
        final all = (await events(req, [
          ('token', {'text': 'You spent '}),
          ('tool_call', {'id': 't1', 'name': 'get_spending_summary'}),
          ('done', {'message_id': 'm1'}),
        ])).join();
        // Network chunk boundaries fall mid-frame.
        return [all.substring(0, 17), all.substring(17, 90), all.substring(90)];
      };
      final frames = await (await server.client().stream(
        '/ai/chat/stream',
        data: {'session_id': 's1', 'message': 'hi'},
      )).toList();

      expect(frames.map((f) => f.event), ['token', 'tool_call', 'done']);
      expect(jsonDecode(frames.first.data), {'text': 'You spent '});
      // The turn travelled sealed like any body.
      expect(server.requests.single.body, {
        'session_id': 's1',
        'message': 'hi',
      });
    });

    test('an error event arrives as the last frame', () async {
      turn = (req) => events(req, [
        ('token', {'text': 'Partial'}),
        ('error', {'code': 'TOOL_FAILED', 'message': 'x'}),
      ]);
      final frames = await (await server.client().stream(
        '/ai/chat/stream',
      )).toList();
      expect(frames.last.event, 'error');
      expect(jsonDecode(frames.last.data), containsPair('code', 'TOOL_FAILED'));
    });

    test('a dropped event makes the next one fail to open', () async {
      turn = (req) async => [
        await server.event(req, 0, 'token', {'text': 'a'}),
        // seq 1 never arrives.
        await server.event(req, 2, 'token', {'text': 'c'}),
      ];
      final stream = await server.client().stream('/ai/chat/stream');
      await expectLater(
        stream,
        emitsInOrder([isA<SseFrame>(), emitsError(isA<Owe1Exception>())]),
      );
    });

    test('refuses an unsealed event', () async {
      turn = (_) async => ['event: token\ndata: {"text":"injected"}\n\n'];
      final stream = await server.client().stream('/ai/chat/stream');
      await expectLater(stream, emitsError(isA<Owe1Exception>()));
    });

    test('a refusal before the stream opens is the sealed envelope', () async {
      server = FakeOwe1Api(
        (api, req) => api.envelope(req, null, status: 403, code: 'FORBIDDEN'),
      );
      final repo = ChatRepositoryRemote(server.client());
      final res = await repo.send('s1', 'hi');
      expect(res.fold((_) => null, (e) => e.code), 'FORBIDDEN');

      await expectLater(
        server.client().stream('/ai/chat/stream'),
        throwsA(isA<DioException>()),
      );
    });
  });
}
