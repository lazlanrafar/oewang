import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_header.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_host.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_metrics.dart';
import 'package:oewang/components/atoms/inputs/contexts/input_context_row.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Type-safe config for an entity-picker `Input(context: select)`. Generic so
/// `labelOf`/`idOf`/`onSelected` keep their element type while `Input` itself
/// stays non-generic. With [gridColumns] the picker is a grid, else a list.
class EntitySelect<T> {
  const EntitySelect({
    required this.value,
    required this.items,
    required this.labelOf,
    required this.idOf,
    required this.onSelected,
    this.subtitleOf,
    this.leadingOf,
    this.gridColumns,
    this.sheetTitle,
    this.searchable = false,
    this.extraHeaderActions = const [],
  });

  final T? value;
  final List<T> items;
  final String Function(T) labelOf;
  final String Function(T) idOf;
  final ValueChanged<T> onSelected;
  final String? Function(T)? subtitleOf;
  final String? Function(T)? leadingOf;
  final int? gridColumns;
  final String? sheetTitle;

  /// Shows a search field in the drawer's header (list picker only) to filter
  /// [items] by [labelOf]. For long lists — e.g. contacts.
  final bool searchable;

  /// Extra buttons in the drawer's header (list picker only), before the
  /// search icon — e.g. "import from phone contacts".
  final List<Widget> extraHeaderActions;

  /// The selected item's display text (with optional leading glyph), or null.
  String? get displayLabel {
    final v = value;
    if (v == null) return null;
    final leading = leadingOf?.call(v);
    final name = labelOf(v);
    return (leading != null && leading.isNotEmpty) ? '$leading $name' : name;
  }

  void open(
    BuildContext context, {
    required String id,
    required String fallbackTitle,
  }) {
    final title = sheetTitle ?? fallbackTitle;
    final v = value;
    final selectedId = v == null ? null : idOf(v);
    if (gridColumns != null) {
      openGridDrawer<T>(
        context,
        id: id,
        title: title,
        items: items,
        labelOf: labelOf,
        leadingOf: leadingOf,
        idOf: idOf,
        selectedId: selectedId,
        columns: gridColumns!,
        onSelected: onSelected,
      );
    } else {
      openListDrawer<T>(
        context,
        id: id,
        title: title,
        items: items,
        labelOf: labelOf,
        idOf: idOf,
        subtitleOf: subtitleOf,
        searchable: searchable,
        extraHeaderActions: extraHeaderActions,
        onSelected: onSelected,
      );
    }
  }
}


/// `InputContext.select` — an entity picker drawer (via `widget.entity`) or a
/// plain tappable row (via `widget.displayValue` + `widget.onTap`).
Widget buildSelectContext(BuildContext context, Input widget) {
  final entity = widget.entity;
  final label = widget.label ?? '';
  return inputSelectRow(
    context,
    widget,
    label: label,
    value: entity != null ? entity.displayLabel : widget.displayValue,
    placeholder: widget.placeholder,
    onTap: entity != null
        ? () => entity.open(
            context,
            id: widget.drawerId ?? label,
            fallbackTitle: label,
          )
        : (widget.onTap ?? () {}),
  );
}

// ── Picker drawers (grid + list) ────────────────────────────────────────────

/// Opens a grid picker in the shared FormDrawerHost.
void openGridDrawer<T>(
  BuildContext context, {
  required String id,
  required String title,
  required List<T> items,
  required String Function(T) labelOf,
  required String Function(T) idOf,
  required ValueChanged<T> onSelected,
  String? Function(T)? leadingOf,
  String? selectedId,
  int columns = 3,
}) {
  final controller = FormDrawerScope.maybeOf(context);
  controller?.open(
    id,
    (_) => GridPickerContent<T>(
      title: title,
      items: items,
      labelOf: labelOf,
      leadingOf: leadingOf,
      idOf: idOf,
      selectedId: selectedId,
      columns: columns,
      onSelected: (item) {
        // Close first — onSelected may open the next field's drawer, and
        // that must win over this stale close().
        controller.close();
        onSelected(item);
      },
      onClose: controller.close,
    ),
  );
}

/// Opens a vertical-list picker in the shared FormDrawerHost.
void openListDrawer<T>(
  BuildContext context, {
  required String id,
  required String title,
  required List<T> items,
  required String Function(T) labelOf,
  required String Function(T) idOf,
  required ValueChanged<T> onSelected,
  String? Function(T)? subtitleOf,
  bool searchable = false,
  List<Widget> extraHeaderActions = const [],
}) {
  final controller = FormDrawerScope.maybeOf(context);
  controller?.open(
    id,
    (_) => EntityListContent<T>(
      title: title,
      items: items,
      labelOf: labelOf,
      subtitleOf: subtitleOf,
      searchable: searchable,
      extraHeaderActions: extraHeaderActions,
      onSelected: (item) {
        // Close first — onSelected may open the next field's drawer, and
        // that must win over this stale close().
        controller.close();
        onSelected(item);
      },
      onClose: controller.close,
    ),
  );
}


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
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ),
              if (selected) ...[
                const SizedBox(width: 6),
                Icon(Icons.check, size: 16, color: palette.foreground),
              ],
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


/// Vertical-list picker content for choosing one item from a list. Reports the
/// picked item through [onSelected]; never touches the Navigator. With
/// [searchable] a search field is added to the header (black section) to
/// filter by [labelOf].
class EntityListContent<T> extends StatefulWidget {
  const EntityListContent({
    required this.title,
    required this.items,
    required this.labelOf,
    required this.onSelected,
    this.onClose,
    this.subtitleOf,
    this.searchable = false,
    this.extraHeaderActions = const [],
    super.key,
  });

  final String title;
  final List<T> items;
  final String Function(T) labelOf;
  final ValueChanged<T> onSelected;
  final VoidCallback? onClose;
  final String? Function(T)? subtitleOf;
  final bool searchable;
  final List<Widget> extraHeaderActions;

  @override
  State<EntityListContent<T>> createState() => _EntityListContentState<T>();
}

class _EntityListContentState<T> extends State<EntityListContent<T>> {
  final _searchCtl = TextEditingController();
  bool _searching = false;
  String _query = '';

  @override
  void dispose() {
    _searchCtl.dispose();
    super.dispose();
  }

  void _toggleSearch() {
    setState(() {
      _searching = !_searching;
      if (!_searching) {
        _query = '';
        _searchCtl.clear();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final filtered = _query.isEmpty
        ? widget.items
        : widget.items
            .where((i) =>
                widget.labelOf(i).toLowerCase().contains(_query.toLowerCase()))
            .toList();
    return Column(
      mainAxisSize: MainAxisSize.max,
      children: [
        FormDrawerHeader(
          title: widget.title,
          // While searching the header's own close button cancels the
          // search instead — one trailing icon at a time, not two.
          onClose: _searching ? _toggleSearch : widget.onClose,
          titleWidget: _searching
              ? TextField(
                  controller: _searchCtl,
                  autofocus: true,
                  onChanged: (v) => setState(() => _query = v),
                  style: OewangFonts.sans(color: DrawerMetrics.onHeader),
                  cursorColor: DrawerMetrics.onHeader,
                  decoration: InputDecoration(
                    isDense: true,
                    isCollapsed: true,
                    filled: false,
                    border: InputBorder.none,
                    hintText: 'Search ${widget.title.toLowerCase()}',
                    hintStyle: OewangFonts.sans(
                      color: DrawerMetrics.onHeader.withValues(alpha: 0.6),
                    ),
                  ),
                )
              : null,
          actions: _searching
              ? const []
              : [
                  ...widget.extraHeaderActions,
                  if (widget.searchable)
                    IconButton(
                      tooltip: 'Search',
                      visualDensity: VisualDensity.compact,
                      onPressed: _toggleSearch,
                      icon: const Icon(
                        Icons.search,
                        color: DrawerMetrics.onHeader,
                      ),
                    ),
                ],
        ),
        Expanded(
          child: filtered.isEmpty
              ? Center(
                  child: Text(
                    'No matches',
                    style: OewangFonts.sans(color: palette.mutedForeground),
                  ),
                )
              : ListView.separated(
                  padding: EdgeInsets.zero,
                  itemCount: filtered.length,
                  separatorBuilder: (_, _) =>
                      Divider(height: 1, color: palette.border),
                  itemBuilder: (context, index) {
                    final item = filtered[index];
                    // The shared drawer panel's own DecoratedBox (surface
                    // color + top border) sits between here and the
                    // Scaffold's Material, which hides ListTile's ink — give
                    // it its own.
                    return Material(
                      type: MaterialType.transparency,
                      child: ListTile(
                        title: Text(
                          widget.labelOf(item),
                          style: OewangFonts.sans(color: palette.foreground),
                        ),
                        subtitle: widget.subtitleOf == null
                            ? null
                            : Text(
                                widget.subtitleOf!(item) ?? '',
                                style: OewangFonts.sans(
                                  color: palette.mutedForeground,
                                  fontSize: 12,
                                ),
                              ),
                        onTap: () => widget.onSelected(item),
                      ),
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
