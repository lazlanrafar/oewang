import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/atoms/amount_input_field.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/form_field_row.dart';
import 'package:oewang/components/atoms/select_entity_field.dart';
import 'package:oewang/components/molecules/form_drawer.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/organisms/budgets/budgets_form_view_model.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/budget_status.dart';
import 'package:oewang/domain/models/category.dart';

final budgetFormVmProvider = ChangeNotifierProvider.autoDispose
    .family<BudgetFormViewModel, BudgetStatus?>(
      (ref, editing) => BudgetFormViewModel(
        budgets: ref.watch(budgetsRepositoryProvider),
        categories: ref.watch(categoriesRepositoryProvider),
        editing: editing,
      ),
    );

/// Returns the first element matching [test], or `null`.
T? _firstOrNull<T>(Iterable<T> items, bool Function(T) test) {
  for (final item in items) {
    if (test(item)) return item;
  }
  return null;
}

/// Create / edit a monthly budget for an expense category. On edit the category
/// is fixed (matches the web) — only the monthly limit changes.
class BudgetFormScreen extends ConsumerWidget {
  const BudgetFormScreen({super.key, this.budget});

  final BudgetStatus? budget;

  static const _labelWidth = 110.0;
  static const _rowHeight = 56.0;

  Future<void> _onSave(BuildContext context, WidgetRef ref) async {
    final vm = ref.read(budgetFormVmProvider(budget));
    final res = await vm.submit();
    if (res == null || !context.mounted) return;
    res.fold(
      (_) {
        ref.read(budgetsRevisionProvider.notifier).bump();
        Navigator.of(context).pop(true);
      },
      (_) {/* error rendered via VM */},
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final vm = ref.watch(budgetFormVmProvider(budget));
    final palette = context.palette;

    return Scaffold(
      appBar: PageAppBar(
        title: vm.isEditing ? 'Edit' : 'Add',
        backLabel: 'Budget',
      ),
      body: SafeArea(
        child: FormDrawerHost(
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: EdgeInsets.zero,
                  children: [
                    if (vm.isEditing)
                      FormFieldRow(
                        label: 'Category',
                        labelWidth: _labelWidth,
                        height: _rowHeight,
                        showBorder: true,
                        child: Text(
                          vm.editingCategoryName,
                          style: OewangFonts.sans(color: palette.foreground),
                        ),
                      )
                    else
                      SelectEntityField<Category>(
                        label: 'Category',
                        labelWidth: _labelWidth,
                        height: _rowHeight,
                        showBorder: true,
                        gridColumns: 3,
                        placeholder: 'Choose a category',
                        leadingOf: (c) => c.emoji,
                        value: _firstOrNull(
                          vm.categoryOptions,
                          (c) => c.id == vm.state.categoryId,
                        ),
                        items: vm.categoryOptions,
                        labelOf: (c) => c.name,
                        idOf: (c) => c.id,
                        onSelected: (c) => vm.setCategory(c.id),
                      ),
                    AmountInputField(
                      label: 'Monthly Limit',
                      labelWidth: _labelWidth,
                      height: _rowHeight,
                      showBorder: true,
                      showCurrencyTabs: false,
                      value: vm.state.amount,
                      onChanged: vm.setAmount,
                    ),
                    if (vm.save.error != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                        child: Text(
                          vm.save.error!.message,
                          textAlign: TextAlign.center,
                          style: OewangFonts.sans(color: OewangColors.coral),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Button(
                  label: 'Save',
                  loading: vm.save.running,
                  onPressed: vm.canSave ? () => _onSave(context, ref) : null,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
