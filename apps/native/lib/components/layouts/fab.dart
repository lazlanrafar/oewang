import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';

/// Monochrome 56-pt circular FAB. Inverts foreground/background so it pops
/// against the theme like the primary CTA pattern in the web app.
class OewangFab extends StatelessWidget {
  const OewangFab({required this.onPressed, super.key});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return FloatingActionButton(
      heroTag: 'oewangFab',
      backgroundColor: palette.primary,
      foregroundColor: palette.primaryForeground,
      elevation: 2,
      onPressed: onPressed,
      child: const Icon(Icons.add, size: 28),
    );
  }
}
