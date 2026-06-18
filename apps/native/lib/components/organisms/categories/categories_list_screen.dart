import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/category.dart' as cat;

final categoriesByTypeProvider = FutureProvider.autoDispose
    .family<List<cat.Category>, cat.CategoryType>((ref, type) async {
      ref.watch(_categoriesRevisionProvider);
      final res = await ref.watch(categoriesRepositoryProvider).list(type: type);
      return res.fold((c) => c, (_) => <cat.Category>[]);
    });

class _CategoriesRevision extends Notifier<int> {
  @override
  int build() => 0;
  void bump() => state = state + 1;
}

final _categoriesRevisionProvider =
    NotifierProvider<_CategoriesRevision, int>(_CategoriesRevision.new);

/// IMG_1846 (Income) / IMG_1847 (Expense). Delete / edit / drag-to-reorder.
class CategoryListScreen extends ConsumerStatefulWidget {
  const CategoryListScreen({required this.type, super.key});
  final cat.CategoryType type;

  @override
  ConsumerState<CategoryListScreen> createState() => _CategoryListScreenState();
}

class _CategoryListScreenState extends ConsumerState<CategoryListScreen> {
  // Local copy so drag-reorder updates instantly; synced from the provider.
  List<cat.Category> _items = [];
  // Which row has its Delete action revealed (only one at a time).
  String? _openId;

  void _bump() => ref.read(_categoriesRevisionProvider.notifier).bump();

  Future<void> _add() async {
    final saved = await context.push<bool>(
      AppRoutes.categoryAdd,
      extra: widget.type,
    );
    if ((saved ?? false) && mounted) _bump();
  }

  Future<void> _delete(cat.Category c) async {
    setState(() => _openId = null);
    final res = await ref.read(categoriesRepositoryProvider).delete(c.id);
    if (!mounted) return;
    res.fold((_) => _bump(), (e) => _snack(e.message));
  }

  Future<void> _reorder(int oldIndex, int newIndex) async {
    setState(() {
      final target = newIndex > oldIndex ? newIndex - 1 : newIndex;
      final moved = _items.removeAt(oldIndex);
      _items.insert(target, moved);
    });
    final res = await ref
        .read(categoriesRepositoryProvider)
        .reorder(_items.map((c) => c.id).toList());
    if (!mounted) return;
    res.fold((_) {}, (e) {
      _snack(e.message);
      _bump(); // reload to undo the optimistic move
    });
  }

  void _snack(String msg) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(msg)));

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(categoriesByTypeProvider(widget.type));
    // Keep the local list in sync whenever the provider re-fetches.
    ref.listen(categoriesByTypeProvider(widget.type), (_, next) {
      final data = next.valueOrNull;
      if (data != null) setState(() => _items = List.of(data));
    });
    final palette = context.palette;
    final title = widget.type == cat.CategoryType.income ? 'Income' : 'Exp.';
    return Scaffold(
      appBar: PageAppBar(
        title: title,
        backLabel: 'Settings',
        actions: [
          IconButton(
            onPressed: _add,
            icon: Icon(Icons.add, color: palette.foreground),
          ),
        ],
      ),
      body: SafeArea(
        child: async.when(
          data: (items) {
            final list = _items.isEmpty ? items : _items;
            return ReorderableListView.builder(
                itemCount: list.length,
                onReorder: _reorder,
                itemBuilder: (context, i) => _CategoryRow(
                  key: ValueKey(list[i].id),
                  index: i,
                  category: list[i],
                  isOpen: _openId == list[i].id,
                  onToggleOpen: () => setState(
                    () => _openId = _openId == list[i].id ? null : list[i].id,
                  ),
                  onDelete: () => _delete(list[i]),
                  onEdit: () async {
                    final saved = await context.push<bool>(
                      AppRoutes.categoryEditFor(list[i].id),
                      extra: list[i],
                    );
                    if (saved ?? false) _bump();
                  },
                ),
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Text(
              e.toString(),
              style: OewangFonts.sans(color: OewangColors.coral),
            ),
          ),
        ),
      ),
    );
  }
}

// Width of the revealed Delete action (also how far the row slides left).
const double _kDeleteWidth = 96;
const double _kRowHeight = 56;

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({
    required this.index,
    required this.category,
    required this.isOpen,
    required this.onToggleOpen,
    required this.onEdit,
    required this.onDelete,
    super.key,
  });
  final int index;
  final cat.Category category;
  final bool isOpen;
  final VoidCallback onToggleOpen;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SizedBox(
      height: _kRowHeight,
      child: Stack(
        children: [
          // Delete action behind, pinned to the right edge.
          Positioned(
            top: 0,
            bottom: 0,
            right: 0,
            width: _kDeleteWidth,
            child: GestureDetector(
              onTap: onDelete,
              child: ColoredBox(
                color: OewangColors.coral,
                child: Center(
                  child: Text(
                    'Delete',
                    style: OewangFonts.sans(color: Colors.white, fontSize: 15),
                  ),
                ),
              ),
            ),
          ),
          // Foreground row — slides left to reveal the Delete action.
          AnimatedPositioned(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            top: 0,
            bottom: 0,
            left: isOpen ? -_kDeleteWidth : 0,
            right: isOpen ? _kDeleteWidth : 0,
            // Tapping the row body (anywhere but the action buttons) while the
            // Delete action is revealed cancels it.
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: isOpen ? onToggleOpen : null,
              child: DecoratedBox(
              decoration: BoxDecoration(
                color: palette.background,
                border: Border(bottom: BorderSide(color: palette.border)),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Row(
                  children: [
                    IconButton(
                      tooltip: 'Delete',
                      onPressed: onToggleOpen,
                      icon: const Icon(
                        Icons.remove_circle,
                        color: OewangColors.coral,
                        size: 18,
                      ),
                    ),
                    if (category.emoji != null) ...[
                      Text(category.emoji!,
                          style: const TextStyle(fontSize: 18)),
                      const SizedBox(width: 8),
                    ],
                    Expanded(
                      child: Text(
                        category.name,
                        style: OewangFonts.sans(color: palette.foreground),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Edit',
                      onPressed: onEdit,
                      icon: Icon(Icons.edit_outlined,
                          color: palette.mutedForeground),
                    ),
                    ReorderableDragStartListener(
                      index: index,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        child: Icon(Icons.drag_handle,
                            color: palette.mutedForeground),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            ),
          ),
        ],
      ),
    );
  }
}
