import 'package:flutter/material.dart';

/// Tactile press feedback (scale to 0.96 on tap-down) for a tappable [child].
/// `app_theme.dart` kills Material's ripple/highlight app-wide with no
/// replacement cue — use this wherever that leaves a tap feeling dead.
///
/// Built on `InkWell`, not a bare `GestureDetector`, so it stays keyboard-
/// focusable and Enter/Space-activatable (a real `GestureDetector` gives
/// neither). Honors `MediaQuery.disableAnimations` (the OS "reduce motion"
/// setting) by skipping the scale transition entirely.
class PressScale extends StatefulWidget {
  const PressScale({required this.onTap, required this.child, super.key});

  final VoidCallback onTap;
  final Widget child;

  @override
  State<PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<PressScale> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    return Material(
      type: MaterialType.transparency,
      child: InkWell(
        onTap: widget.onTap,
        onHighlightChanged: (v) => setState(() => _pressed = v),
        child: AnimatedScale(
          scale: _pressed ? 0.96 : 1.0,
          duration: reduceMotion
              ? Duration.zero
              : const Duration(milliseconds: 100),
          curve: Curves.easeOut,
          child: widget.child,
        ),
      ),
    );
  }
}
