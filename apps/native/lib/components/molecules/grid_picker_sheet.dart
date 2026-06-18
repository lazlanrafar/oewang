import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/drawer_header.dart';
import 'package:oewang/components/atoms/drawer_metrics.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// WMoney-style grid picker content (Category / Account). A gray header carries
/// the title and close button; each cell shows an optional [leadingOf] glyph
/// (e.g. a category emoji) then the label. Reports the picked item through
/// [onSelected] — it never touches the Navigator.
class GridPickerContent<T> extends StatelessWidget {
  const GridPickerContent({
    required this.title,
    required this.items,
    required this.labelOf,
    required this.onSelected,
    this.onClose,
    this.leadingOf,
    this.selectedId,
    this.idOf,
    this.columns = 3,
    super.key,
  });

  final String title;
  final List<T> items;
  final String Function(T) labelOf;
  final ValueChanged<T> onSelected;
  final VoidCallback? onClose;
  final String? Function(T)? leadingOf;
  final String? selectedId;
  final String Function(T)? idOf;
  final int columns;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.max,
      children: [
        FormDrawerHeader(title: title, onClose: onClose),
        Expanded(
          child: GridView.builder(
            padding: EdgeInsets.zero,
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: columns,
              mainAxisExtent: 56,
            ),
            itemCount: items.length,
            itemBuilder: (context, index) {
              final item = items[index];
              final selected = idOf != null &&
                  selectedId != null &&
                  idOf!(item) == selectedId;
              return _GridCell(
                label: labelOf(item),
                leading: leadingOf?.call(item),
                selected: selected,
                onTap: () => onSelected(item),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _GridCell extends StatelessWidget {
  const _GridCell({
    required this.label,
    required this.leading,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String? leading;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final hasLeading = leading != null && leading!.isNotEmpty;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: selected ? palette.muted : null,
        border: Border(
          right: BorderSide(color: palette.border),
          bottom: BorderSide(color: palette.border),
        ),
      ),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          child: Row(
            mainAxisAlignment: hasLeading
                ? MainAxisAlignment.start
                : MainAxisAlignment.center,
            children: [
              if (hasLeading) ...[
                Text(leading!, style: const TextStyle(fontSize: 18)),
                const SizedBox(width: 8),
              ],
              Flexible(
                child: Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: hasLeading ? TextAlign.start : TextAlign.center,
                  style: OewangFonts.sans(
                    color: palette.foreground,
                    fontSize: 14,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Modal fallback — opens [GridPickerContent] as a fixed-height bottom sheet.
class GridPickerSheet {
  const GridPickerSheet._();

  static Future<T?> show<T>(
    BuildContext context, {
    required String title,
    required List<T> items,
    required String Function(T) labelOf,
    String? Function(T)? leadingOf,
    String? selectedId,
    String Function(T)? idOf,
    int columns = 3,
  }) {
    return showModalBottomSheet<T>(
      context: context,
      backgroundColor: DrawerMetrics.surface(context),
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        top: false,
        child: SizedBox(
          height: DrawerMetrics.height,
          child: GridPickerContent<T>(
            title: title,
            items: items,
            labelOf: labelOf,
            leadingOf: leadingOf,
            selectedId: selectedId,
            idOf: idOf,
            columns: columns,
            onSelected: (item) => Navigator.of(sheetContext).pop(item),
            onClose: () => Navigator.of(sheetContext).pop(),
          ),
        ),
      ),
    );
  }
}
