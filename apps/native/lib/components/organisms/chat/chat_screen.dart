import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/organisms/chat/chat_artifact_card.dart';
import 'package:oewang/components/organisms/chat/chat_bubble.dart';
import 'package:oewang/components/organisms/chat/chat_tool_line.dart';
import 'package:oewang/components/organisms/chat/chat_view_model.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/chat.dart';
import 'package:oewang/domain/models/chat_turn.dart';

final chatVmProvider = ChangeNotifierProvider.autoDispose
    .family<ChatViewModel, String?>(
      (ref, id) =>
          ChatViewModel(ref.watch(chatRepositoryProvider), sessionId: id),
    );

/// One conversation (`/chat/:id`, or `/chat/new` before the first message).
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({this.sessionId, super.key});

  final String? sessionId;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _input = TextEditingController();

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  void _send(ChatViewModel vm) {
    final text = _input.text;
    if (text.trim().isEmpty) return;
    _input.clear();
    vm.send(text);
  }

  @override
  Widget build(BuildContext context) {
    final vm = ref.watch(chatVmProvider(widget.sessionId));
    final palette = context.palette;
    final turn = vm.turn;
    final muted = OewangFonts.sans(
      color: palette.mutedForeground,
      fontSize: 13,
    );

    // Newest at the bottom: the list is reversed so it stays pinned there
    // while tokens arrive.
    final items = <Widget>[
      if (turn.isActive) _LiveTurn(turn: turn),
      if (turn.status == TurnStatus.failed)
        Text(_failure(turn.errorCode), style: muted),
      if (turn.status == TurnStatus.stopped) Text('Stopped.', style: muted),
      for (final m in vm.messages.reversed) _Message(message: m),
    ];

    return Scaffold(
      appBar: const PageAppBar(title: 'Chat'),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: vm.loading
                  ? const Center(child: CircularProgressIndicator.adaptive())
                  : vm.messages.isEmpty && !turn.isActive
                  ? Center(
                      child: Text(
                        vm.error?.message ??
                            'Ask about your money: spending, budgets, a '
                                'transaction to add.',
                        style: muted,
                        textAlign: TextAlign.center,
                      ),
                    )
                  : ListView.separated(
                      reverse: true,
                      padding: const EdgeInsets.all(OewangSpacing.lg),
                      itemCount: items.length,
                      separatorBuilder: (_, _) =>
                          const SizedBox(height: OewangSpacing.lg),
                      itemBuilder: (_, i) => items[i],
                    ),
            ),
            Divider(height: 1, color: palette.border),
            Padding(
              padding: const EdgeInsets.all(OewangSpacing.sm),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      minLines: 1,
                      maxLines: 5,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(vm),
                      decoration: const InputDecoration(
                        hintText: 'Ask anything',
                      ),
                    ),
                  ),
                  if (turn.isActive)
                    IconButton(
                      tooltip: 'Stop',
                      onPressed: vm.stop,
                      icon: const Icon(Icons.stop_circle_outlined),
                    )
                  else
                    IconButton(
                      tooltip: 'Send',
                      onPressed: vm.canSend ? () => _send(vm) : null,
                      icon: const Icon(Icons.arrow_upward),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _failure(String? code) => switch (code) {
    'AI_UNAVAILABLE' => 'The assistant is unavailable right now. Try again.',
    'RATE_LIMITED' => 'Too many messages. Wait a moment and try again.',
    _ => 'The answer did not finish. Try again.',
  };
}

class _Message extends StatelessWidget {
  const _Message({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    if (message.role == ChatRole.user) {
      return ChatBubble(text: message.content, fromUser: true);
    }
    return _Answer(text: message.content, calls: message.toolCalls);
  }
}

class _LiveTurn extends StatelessWidget {
  const _LiveTurn({required this.turn});

  final ChatTurn turn;

  @override
  Widget build(BuildContext context) {
    final phase = turn.phase;
    return _Answer(text: turn.visibleText, calls: turn.toolCalls, phase: phase);
  }
}

/// The assistant's side: tools first, then the words, then any analysis.
class _Answer extends StatelessWidget {
  const _Answer({required this.text, required this.calls, this.phase});

  final String text;
  final List<ToolCall> calls;
  final String? phase;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ChatToolLine(calls: calls),
        if (phase != null)
          Text(
            '$phase…',
            style: OewangFonts.sans(
              color: palette.mutedForeground,
              fontSize: 13,
            ),
          ),
        if (text.isNotEmpty)
          ChatBubble(text: displayText(text), fromUser: false),
        for (final call in calls)
          if (call.artifact != null) ChatArtifactCard(artifact: call.artifact!),
      ],
    );
  }
}
