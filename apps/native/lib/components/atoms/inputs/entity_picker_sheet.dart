import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/drawer_header.dart';
import 'package:oewang/components/atoms/drawer_metrics.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Vertical-list picker content for choosing one item from a list. Reports the
/// picked item through [onSelected]; never touches the Navigator.
class EntityListContent<T> extends StatelessWidget {
  const EntityListContent({
    required this.title,
    required this.items,
    required this.labelOf,
    required this.onSelected,
    this.onClose,
    this.subtitleOf,
    super.key,
  });

  final String title;
  final List<T> items;
  final String Function(T) labelOf;
  final ValueChanged<T> onSelected;
  final VoidCallback? onClose;
  final String? Function(T)? subtitleOf;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Column(
      mainAxisSize: MainAxisSize.max,
      children: [
        FormDrawerHeader(title: title, onClose: onClose),
        Expanded(
          child: ListView.builder(
            padding: EdgeInsets.zero,
            itemCount: items.length,
            itemBuilder: (context, index) {
              final item = items[index];
              return ListTile(
                title: Text(
                  labelOf(item),
                  style: OewangFonts.sans(color: palette.foreground),
                ),
                subtitle: subtitleOf == null
                    ? null
                    : Text(
                        subtitleOf!(item) ?? '',
                        style: OewangFonts.sans(
                          color: palette.mutedForeground,
                          fontSize: 12,
                        ),
                      ),
                onTap: () => onSelected(item),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Modal fallback — opens [EntityListContent] as a fixed-height bottom sheet.
class EntityPickerSheet {
  const EntityPickerSheet._();

  static Future<T?> show<T>(
    BuildContext context, {
    required String title,
    required List<T> items,
    required String Function(T) labelOf,
    required String Function(T) idOf,
    String? Function(T)? subtitleOf,
  }) {
    return showModalBottomSheet<T>(
      context: context,
      backgroundColor: DrawerMetrics.surface(context),
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        top: false,
        child: SizedBox(
          height: DrawerMetrics.height,
          child: EntityListContent<T>(
            title: title,
            items: items,
            labelOf: labelOf,
            subtitleOf: subtitleOf,
            onSelected: (item) => Navigator.of(sheetContext).pop(item),
            onClose: () => Navigator.of(sheetContext).pop(),
          ),
        ),
      ),
    );
  }
}
