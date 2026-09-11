import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/press_scale.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Tappable grouped-list row: leading icon, title, optional subtitle/trailing.
/// Paints a [palette.background] card so it sits on the gray grouping backdrop.
class ListRow extends StatelessWidget {
  const ListRow({
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.trailing,
    this.trailingLabel,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;

  /// Accessible text for [trailing] (e.g. "Coming soon") — [trailing] is
  /// dropped from the semantics tree in favor of one merged row label, so
  /// its meaning has to be spelled out here instead.
  final String? trailingLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final label = [
      title,
      if (subtitle != null) subtitle,
      if (trailingLabel != null) trailingLabel,
    ].join('. ');
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: PressScale(
        onTap: onTap,
        child: Container(
          color: palette.background,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          child: Row(
            children: [
              Icon(icon, color: palette.mutedForeground, size: 22),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: OewangFonts.sans(
                        color: palette.foreground,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: OewangFonts.sans(
                          color: palette.mutedForeground,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
        ),
      ),
    );
  }
}
