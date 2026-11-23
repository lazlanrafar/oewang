import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/molecules/hatch_bar.dart';
import 'package:oewang/components/organisms/chat/chat_artifact_card.dart';
import 'package:oewang/components/organisms/chat/chat_screen.dart';
import 'package:oewang/components/organisms/vault/vault_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/app_theme.dart';
import 'package:oewang/data/repositories/chat_repository.dart';
import 'package:oewang/data/repositories/vault_repository.dart';
import 'package:oewang/data/repositories_fake/chat_repository_fake.dart';
import 'package:oewang/data/repositories_fake/vault_repository_fake.dart';
import 'package:oewang/domain/models/session.dart';
import 'package:oewang/domain/models/vault_file.dart';

class _FixedSession extends SessionController {
  _FixedSession(this.role);
  final String role;

  @override
  AsyncValue<Session?> build() =>
      AsyncData(Session(userId: 'u', workspaceId: 'ws', role: role));
}

Widget _app(Widget home, {String role = 'owner', ChatRepositoryFake? chat}) =>
    ProviderScope(
      overrides: [
        sessionControllerProvider.overrideWith(() => _FixedSession(role)),
        chatRepositoryProvider.overrideWith(
          (ref) => (chat ?? ChatRepositoryFake()) as ChatRepository,
        ),
        vaultRepositoryProvider.overrideWith(
          (ref) =>
              VaultRepositoryFake([
                    VaultFile(
                      id: 'f1',
                      name: 'warung.jpg',
                      type: 'image/jpeg',
                      size: 482113,
                      usedBy: 2,
                      createdAt: DateTime(2026, 11, 5),
                    ),
                  ])
                  as VaultRepository,
        ),
      ],
      child: MaterialApp(theme: AppTheme.dark(), home: home),
    );

void main() {
  testWidgets('MOB-8 chat streams an answer with a hatch artifact', (
    tester,
  ) async {
    final chat = ChatRepositoryFake();
    await tester.pumpWidget(_app(const ChatScreen(), chat: chat));
    await tester.enterText(find.byType(TextField), 'Analyse my spending');
    await tester.tap(find.byTooltip('Send'));
    await tester.pump();

    void emit(String event, Object payload) =>
        chat.nextTurn.add((event: event, data: jsonEncode(payload)));

    emit('tool_call', {'id': 't1', 'name': 'get_spending_analysis'});
    await tester.pump();
    expect(find.text('Analysing your spending'), findsOneWidget);
    expect(find.byTooltip('Stop'), findsOneWidget);

    emit('tool_result', {'id': 't1', 'ok': true, 'summary': '2'});
    emit('artifact', {
      'id': 't1',
      'type': 'spending',
      'payload': {
        'from': '2026-11-01',
        'to': '2026-11-30',
        'currency_code': 'IDR',
        'total': {'value': '150000.0000'},
        'count': 3,
        'categories': [
          {'name': 'Food', 'total': '100000.0000', 'share_formatted': '67%'},
          {'name': null, 'other': true, 'total': '50000.0000'},
        ],
      },
    });
    emit('token', {'text': 'Food is [two thirds](#cat:c1).'});
    emit('done', {'message_id': 'm1'});
    await tester.pumpAndSettle();

    expect(find.text('Food is two thirds.'), findsOneWidget);
    expect(find.byType(ChatArtifactCard), findsOneWidget);
    expect(find.byType(HatchBar), findsNWidgets(2));
    expect(find.text('Other'), findsOneWidget);
    expect(find.byTooltip('Send'), findsOneWidget);
  });

  testWidgets('MOB-5 MOB-8 a viewer opens a vault file but cannot write', (
    tester,
  ) async {
    await tester.pumpWidget(_app(const VaultScreen(), role: 'member'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Upload'), findsNothing);

    await tester.tap(find.text('warung.jpg'));
    await tester.pumpAndSettle();
    expect(find.text('Open or share'), findsOneWidget);
    expect(find.text('Delete'), findsNothing);
    expect(find.byTooltip('Rename'), findsNothing);
  });

  testWidgets('MOB-8 deleting a file says how many transactions lose it', (
    tester,
  ) async {
    await tester.pumpWidget(_app(const VaultScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('warung.jpg'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();

    expect(find.textContaining('attached to 2 transactions'), findsOneWidget);
    await tester.tap(find.text('Delete').last);
    await tester.pumpAndSettle();
    expect(
      find.text('No files yet. Receipts and statements you upload land here.'),
      findsOneWidget,
    );
  });
}
