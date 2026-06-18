import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// One choice inside an [OewangSegmentedTabs].
@immutable
class SegmentItem<T> {
  const SegmentItem({required this.value, required this.label, this.icon});

  final T value;
  final String label;
  final IconData? icon;
}

/// Reusable segmented control matching the web `Tabs` `segmented` variant
/// (`packages/ui/src/components/atoms/tabs.tsx`): a flat track where the active
/// segment is filled with the primary color and inactive segments blend into
/// the track. Square corners to match the app's flat aesthetic.
///
/// Generic over the value type so it can drive transaction types, category
/// types, filters, or any other small set of mutually-exclusive options.
class OewangSegmentedTabs<T> extends StatelessWidget {
  const OewangSegmentedTabs({
    required this.segments,
    required this.selected,
    required this.onChanged,
    this.padding = const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    this.height = 40,
    super.key,
  });

  final List<SegmentItem<T>> segments;
  final T selected;
  final ValueChanged<T> onChanged;
  final EdgeInsetsGeometry padding;
  final double height;

  // Web track / inactive-text tokens (`#f7f7f7` / `#131313`, `#707070` /
  // `#666666`) — kept literal so the control matches the website 1:1.
  static const Color _trackDark = Color(0xFF131313);
  static const Color _trackLight = Color(0xFFF7F7F7);
  static const Color _inactiveDark = Color(0xFF666666);
  static const Color _inactiveLight = Color(0xFF707070);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final palette = context.palette;
    final trackColor = isDark ? _trackDark : _trackLight;
    final inactiveText = isDark ? _inactiveDark : _inactiveLight;

    return Padding(
      padding: padding,
      child: DecoratedBox(
        decoration: BoxDecoration(color: trackColor),
        child: Row(
          children: [
            for (final segment in segments)
              Expanded(
                child: _Segment(
                  label: segment.label,
                  icon: segment.icon,
                  selected: segment.value == selected,
                  height: height,
                  selectedColor: palette.primary,
                  selectedTextColor: palette.primaryForeground,
                  inactiveTextColor: inactiveText,
                  onTap: () => onChanged(segment.value),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.icon,
    required this.selected,
    required this.height,
    required this.selectedColor,
    required this.selectedTextColor,
    required this.inactiveTextColor,
    required this.onTap,
  });

  final String label;
  final IconData? icon;
  final bool selected;
  final double height;
  final Color selectedColor;
  final Color selectedTextColor;
  final Color inactiveTextColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final textColor = selected ? selectedTextColor : inactiveTextColor;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.zero,
        child: Container(
          height: height,
          alignment: Alignment.center,
          color: selected ? selectedColor : Colors.transparent,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 16, color: textColor),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: OewangFonts.sans(
                  color: textColor,
                  fontSize: 14,
                  fontWeight: selected ? FontWeight.w500 : FontWeight.w400,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
