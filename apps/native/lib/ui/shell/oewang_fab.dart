import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';

/// 56-pt coral circular FAB used on Trans / Stats / Accounts. Opens the
/// transaction form once Milestone 4 lands.
class OewangFab extends StatelessWidget {
  const OewangFab({required this.onPressed, super.key});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton(
      heroTag: 'oewangFab',
      backgroundColor: OewangColors.coral,
      foregroundColor: OewangColors.foreground,
      elevation: 4,
      onPressed: onPressed,
      child: const Icon(Icons.add, size: 28),
    );
  }
}
