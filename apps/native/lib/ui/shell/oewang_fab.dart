import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';

/// 56-pt coral circular FAB. Brand-fixed, so it stays the same in light + dark.
class OewangFab extends StatelessWidget {
  const OewangFab({required this.onPressed, super.key});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton(
      heroTag: 'oewangFab',
      backgroundColor: OewangColors.coral,
      foregroundColor: Colors.white,
      elevation: 4,
      onPressed: onPressed,
      child: const Icon(Icons.add, size: 28),
    );
  }
}
