import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/category.dart' as cat;
import 'package:oewang/ui/core/page_app_bar.dart';

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

/// IMG_1846 (Income) / IMG_1847 (Expense). Read-only delete/reorder for now
/// — the pencil pushes the edit screen.
class CategoryListScreen extends ConsumerWidget {
  const CategoryListScreen({required this.type, super.key});
  final cat.CategoryType type;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(categoriesByTypeProvider(type));
    final palette = context.palette;
    final title = type == cat.CategoryType.income ? 'Income' : 'Exp.';
    return Scaffold(
      appBar: PageAppBar(
        title: title,
        backLabel: 'Settings',
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Icon(Icons.add, color: palette.foreground),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            _SubcategoryToggle(),
            Divider(height: 1, color: palette.border),
            Expanded(
              child: async.when(
                data: (items) => ListView.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, _) =>
                      Divider(height: 1, color: palette.border),
                  itemBuilder: (context, i) {
                    final c = items[i];
                    return _CategoryRow(
                      category: c,
                      onEdit: () async {
                        final saved = await context.push<bool>(
                          AppRoutes.categoryEditFor(c.id),
                          extra: c,
                        );
                        if (saved ?? false) {
                          ref
                              .read(_categoriesRevisionProvider.notifier)
                              .bump();
                        }
                      },
                    );
                  },
                ),
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(
                  child: Text(
                    e.toString(),
                    style: OewangFonts.sans(color: OewangColors.coral),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SubcategoryToggle extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Text(
              'Subcategory',
              style: OewangFonts.sans(color: palette.foreground),
            ),
          ),
          Switch(value: false, onChanged: (_) {}),
        ],
      ),
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({required this.category, required this.onEdit});
  final cat.Category category;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Row(
        children: [
          const Icon(
            Icons.remove_circle,
            color: OewangColors.coral,
            size: 22,
          ),
          const SizedBox(width: 12),
          if (category.emoji != null) ...[
            Text(category.emoji!, style: const TextStyle(fontSize: 18)),
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
            icon: Icon(
              Icons.edit_outlined,
              color: palette.mutedForeground,
            ),
          ),
          Icon(Icons.drag_handle, color: palette.mutedForeground),
          const SizedBox(width: 8),
        ],
      ),
    );
  }
}
