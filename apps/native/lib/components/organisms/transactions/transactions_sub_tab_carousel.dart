import 'package:flutter/material.dart';

/// Wraps a sub-tab's content (Daily/Calendar/Monthly/Summary) in a directional
/// two-panel slide: the incoming child enters from [isForward]'s side while
/// the outgoing child exits the *opposite* side — unlike a naive
/// `AnimatedSwitcher` reusing one `Tween` for both children (which makes them
/// slide toward the same edge and cross near the center).
class SubTabCarousel extends StatelessWidget {
  const SubTabCarousel({
    required this.index,
    required this.isForward,
    required this.child,
    super.key,
  });

  final int index;
  final bool isForward;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 250),
      transitionBuilder: (child, animation) {
        final isIncoming = child.key == ValueKey(index);
        final enterOffset = Offset(isForward ? 1 : -1, 0);
        final exitOffset = Offset(isForward ? -1 : 1, 0);
        final tween = Tween<Offset>(
          begin: isIncoming ? enterOffset : exitOffset,
          end: Offset.zero,
        );
        return SlideTransition(
          position: tween.animate(
            CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
          ),
          child: child,
        );
      },
      child: KeyedSubtree(key: ValueKey(index), child: child),
    );
  }
}
