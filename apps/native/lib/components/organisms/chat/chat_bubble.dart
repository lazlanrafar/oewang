import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// A rounded bubble for one side of the conversation.
class ChatBubble extends StatelessWidget {
  const ChatBubble({required this.text, required this.fromUser, super.key});

  final String text;
  final bool fromUser;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final body = SelectableText(
      text,
      style: OewangFonts.sans(
        color: palette.foreground,
        fontSize: 15,
        height: 1.4,
      ),
    );
    if (!fromUser) return body;
    return Align(
      alignment: Alignment.centerRight,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.8,
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: OewangSpacing.md,
          vertical: OewangSpacing.sm,
        ),
        decoration: BoxDecoration(
          color: palette.muted,
          borderRadius: BorderRadius.circular(OewangRadius.xl),
        ),
        child: body,
      ),
    );
  }
}
