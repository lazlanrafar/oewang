import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/chat.dart';

/// Tool calls as one line of plain English, never JSON (CHAT-14): a call in
/// flight takes the line; one finished call is a check and its label;
/// several collapse to "Used N tools" and open on tap. A refused delete
/// (`CONFIRMATION_REQUIRED`, D20) shows here as a failed call; the question
/// itself is the assistant's text, answered in the next message.
class ChatToolLine extends StatefulWidget {
  const ChatToolLine({required this.calls, super.key});

  final List<ToolCall> calls;

  @override
  State<ChatToolLine> createState() => _ChatToolLineState();
}

class _ChatToolLineState extends State<ChatToolLine> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final calls = widget.calls;
    if (calls.isEmpty) return const SizedBox.shrink();
    final palette = context.palette;
    final style = OewangFonts.sans(
      color: palette.mutedForeground,
      fontSize: 13,
    );

    final running = calls.where((c) => c.status == ToolStatus.running);
    final finished = calls
        .where((c) => c.status != ToolStatus.running)
        .toList();
    final collapsible = running.isEmpty && finished.length > 1;

    Widget line(ToolCall call) => Row(
      children: [
        _statusIcon(context, call.status),
        const SizedBox(width: OewangSpacing.sm),
        Expanded(
          child: Text(
            call.status == ToolStatus.failed
                ? '${toolLabel(call.name)}: failed'
                : toolLabel(call.name),
            style: style,
          ),
        ),
      ],
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: OewangSpacing.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (running.isNotEmpty)
            line(running.first)
          else if (!collapsible)
            line(finished.single)
          else ...[
            InkWell(
              onTap: () => setState(() => _open = !_open),
              child: Row(
                children: [
                  _statusIcon(context, ToolStatus.ok),
                  const SizedBox(width: OewangSpacing.sm),
                  Text('Used ${finished.length} tools', style: style),
                  Icon(
                    _open ? Icons.expand_less : Icons.expand_more,
                    size: 16,
                    color: palette.mutedForeground,
                  ),
                ],
              ),
            ),
            if (_open)
              for (final call in finished)
                Padding(
                  padding: const EdgeInsets.only(left: OewangSpacing.lg),
                  child: line(call),
                ),
          ],
        ],
      ),
    );
  }

  Widget _statusIcon(BuildContext context, ToolStatus status) {
    final palette = context.palette;
    return switch (status) {
      ToolStatus.running => SizedBox.square(
        dimension: 12,
        child: CircularProgressIndicator(
          strokeWidth: 1.5,
          color: palette.mutedForeground,
        ),
      ),
      ToolStatus.ok => Icon(
        Icons.check,
        size: 14,
        color: palette.mutedForeground,
      ),
      ToolStatus.failed => Icon(
        Icons.error_outline,
        size: 14,
        color: Theme.of(context).colorScheme.error,
      ),
    };
  }
}
