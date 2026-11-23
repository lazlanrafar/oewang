import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';

enum HatchTone { neutral, warning, over }

/// A horizontal bar filled with the product's diagonal hatch (D93): one-pixel
/// lines at 45 degrees on an eight-pixel tile, as the web's `chart-hatch`
/// and the old app's `incomePattern` draw it. [fraction] is geometry only
/// (D89); the figure beside it is always the API's decimal.
class HatchBar extends StatelessWidget {
  const HatchBar({
    required this.fraction,
    this.tone = HatchTone.neutral,
    super.key,
  });

  final double fraction;
  final HatchTone tone;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final stroke = switch (tone) {
      HatchTone.neutral => palette.mutedForeground,
      HatchTone.warning => Colors.amber,
      HatchTone.over => Theme.of(context).colorScheme.error,
    };
    return SizedBox(
      height: 10,
      child: CustomPaint(
        painter: _HatchPainter(
          fraction: fraction.isFinite ? fraction.clamp(0, 1) : 0,
          track: palette.muted,
          fill: palette.background,
          stroke: stroke,
        ),
      ),
    );
  }
}

class _HatchPainter extends CustomPainter {
  _HatchPainter({
    required this.fraction,
    required this.track,
    required this.fill,
    required this.stroke,
  });

  final double fraction;
  final Color track;
  final Color fill;
  final Color stroke;

  static const _tile = 8.0;

  @override
  void paint(Canvas canvas, Size size) {
    const radius = Radius.circular(OewangRadius.sm);
    canvas.drawRRect(
      RRect.fromRectAndRadius(Offset.zero & size, radius),
      Paint()..color = track,
    );
    if (fraction <= 0) return;

    final bar = RRect.fromRectAndRadius(
      Rect.fromLTWH(0, 0, math.max(size.width * fraction, 2), size.height),
      radius,
    );
    canvas
      ..save()
      ..clipRRect(bar)
      ..drawRRect(bar, Paint()..color = fill);
    final line = Paint()
      ..color = stroke.withValues(alpha: 0.6)
      ..strokeWidth = 1;
    for (var x = -size.height; x < bar.width; x += _tile) {
      canvas.drawLine(Offset(x, size.height), Offset(x + size.height, 0), line);
    }
    canvas
      ..restore()
      ..drawRRect(
        bar,
        Paint()
          ..color = stroke
          ..style = PaintingStyle.stroke,
      );
  }

  @override
  bool shouldRepaint(_HatchPainter old) =>
      old.fraction != fraction || old.stroke != stroke || old.track != track;
}
