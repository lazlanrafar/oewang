import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Reusable picker (modal bottom sheet) — used for Category and Account rows
/// in the transaction form.
class EntityPickerSheet<T> extends StatelessWidget {
  const EntityPickerSheet({
    required this.title,
    required this.items,
    required this.labelOf,
    required this.idOf,
    this.subtitleOf,
    super.key,
  });

  final String title;
  final List<T> items;
  final String Function(T) labelOf;
  final String Function(T) idOf;
  final String? Function(T)? subtitleOf;

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
      backgroundColor: context.palette.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) => EntityPickerSheet<T>(
        title: title,
        items: items,
        labelOf: labelOf,
        idOf: idOf,
        subtitleOf: subtitleOf,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                title,
                style: OewangFonts.sans(
                  color: palette.foreground,
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            Divider(height: 1, color: palette.border),
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
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
                    onTap: () => Navigator.of(context).pop(item),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
