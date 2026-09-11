import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// A horizontal rule split by a centered "or" label, used between the social
/// sign-in buttons and the email/password fields on the auth screens.
class OrDivider extends StatelessWidget {
  const OrDivider({required this.palette, super.key});
  final OewangPalette palette;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Divider(color: palette.border)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            'or',
            style: OewangFonts.sans(
              color: palette.mutedForeground,
              fontSize: 13,
            ),
          ),
        ),
        Expanded(child: Divider(color: palette.border)),
      ],
    );
  }
}
