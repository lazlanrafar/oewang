import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/chat/chat_view_model.dart';
import 'package:oewang/data/repositories_fake/chat_repository_fake.dart';
import 'package:oewang/domain/models/chat.dart';
import 'package:oewang/domain/models/chat_turn.dart';

ChatEvent _e(String event, Object payload) =>
    (event: event, data: jsonEncode(payload));

void main() {
  group('MOB-8 chat view model streaming', () {
    late ChatRepositoryFake repo;
    late ChatViewModel vm;
    late StreamController<ChatEvent> turn;

    setUp(() {
      repo = ChatRepositoryFake();
      turn = repo.nextTurn;
      vm = ChatViewModel(repo);
    });

    tearDown(() => vm.dispose());

    Future<void> emit(ChatEvent e) async {
      turn.add(e);
      await pumpEventQueue();
    }

    test(
      'makes the session on the first message, then streams tokens',
      () async {
        await vm.send('How much on food?');
        expect(vm.sessionId, 's1');
        expect(repo.sent, ['How much on food?']);
        expect(vm.turn.status, TurnStatus.sending);
        expect(vm.turn.phase, 'Thinking');

        await emit(_e('token', {'text': 'You spent '}));
        await emit(_e('token', {'text': 'Rp 50.000.'}));
        expect(vm.turn.visibleText, 'You spent Rp 50.000.');
        expect(vm.canSend, isFalse);

        await emit(_e('done', {'message_id': 'm1'}));
        expect(vm.turn.isActive, isFalse);
        expect(vm.messages.map((m) => (m.role, m.content)), [
          (ChatRole.user, 'How much on food?'),
          (ChatRole.assistant, 'You spent Rp 50.000.'),
        ]);
        expect(vm.canSend, isTrue);
      },
    );

    test('hides narration before a tool, and carries its artifact', () async {
      await vm.send('Analyse my spending');
      await emit(_e('token', {'text': 'Let me check.'}));
      await emit(
        _e('tool_call', {'id': 't1', 'name': 'get_spending_analysis'}),
      );
      expect(vm.turn.visibleText, isEmpty);
      expect(vm.turn.toolCalls.single.status, ToolStatus.running);

      await emit(_e('tool_result', {'id': 't1', 'ok': true, 'summary': '6'}));
      await emit(
        _e('artifact', {
          'id': 't1',
          'type': 'spending',
          'payload': {'currency_code': 'IDR'},
        }),
      );
      // A result for a call that never happened is dropped.
      await emit(_e('tool_result', {'id': 'nope', 'ok': true}));
      await emit(_e('token', {'text': 'Food leads.'}));
      expect(vm.turn.visibleText, 'Food leads.');
      await emit(_e('done', {}));

      final answer = vm.messages.last;
      expect(answer.content, 'Let me check.\n\nFood leads.');
      expect(answer.toolCalls.single.status, ToolStatus.ok);
      expect(answer.toolCalls.single.artifact?.kind, 'spending');
    });

    test(
      'a refused delete is a failed call and the question is text',
      () async {
        await vm.send('Delete the coffee');
        await emit(_e('tool_call', {'id': 't1', 'name': 'delete_transaction'}));
        await emit(
          _e('tool_result', {
            'id': 't1',
            'ok': false,
            'summary': 'CONFIRMATION_REQUIRED',
          }),
        );
        await emit(_e('token', {'text': 'Delete Coffee, 25,000? Say yes.'}));
        await emit(_e('done', {}));
        expect(vm.messages.last.toolCalls.single.status, ToolStatus.failed);
        expect(vm.messages.last.content, 'Delete Coffee, 25,000? Say yes.');
      },
    );

    test('an error event fails the turn and keeps the partial text', () async {
      await vm.send('hi');
      await emit(_e('token', {'text': 'Partial'}));
      await emit(_e('error', {'code': 'TOOL_FAILED'}));
      expect(vm.turn.status, TurnStatus.failed);
      expect(vm.turn.errorCode, 'TOOL_FAILED');
      expect(vm.messages.last.content, 'Partial');
    });

    test('a stream that ends without done is a failure, not success', () async {
      await vm.send('hi');
      await emit(_e('token', {'text': 'cut'}));
      await turn.close();
      await pumpEventQueue();
      expect(vm.turn.status, TurnStatus.failed);
      expect(vm.turn.errorCode, 'STREAM_FAILED');
    });

    test('stop keeps the partial reply and ignores later frames', () async {
      await vm.send('hi');
      await emit(_e('token', {'text': 'Half'}));
      vm.stop();
      expect(vm.turn.status, TurnStatus.stopped);
      expect(turn.hasListener, isFalse, reason: 'the connection is dropped');
      expect(vm.messages.last.content, 'Half');
    });
  });
}
