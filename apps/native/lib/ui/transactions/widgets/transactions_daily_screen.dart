import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/ui/transactions/view_models/transactions_daily_view_model.dart';
import 'package:oewang/ui/transactions/widgets/daily_group_header.dart';
import 'package:oewang/ui/transactions/widgets/month_picker_bar.dart';
import 'package:oewang/ui/transactions/widgets/transaction_row.dart';
import 'package:oewang/ui/transactions/widgets/transactions_summary_row.dart';

/// IMG_1826 — Daily list under the Trans. tab. Hosts only the body; the
/// header + sub-tabs come from the parent `TransactionsScreen`.
class TransactionsDailyScreen extends ConsumerWidget {
  const TransactionsDailyScreen({
    required this.repositoryProvider,
    super.key,
  });

  final ProviderListenable<TransactionsRepository> repositoryProvider;

  static final _vmProvider =
      ChangeNotifierProvider.autoDispose
          .family<TransactionsDailyViewModel, TransactionsRepository>(
            (ref, repo) => TransactionsDailyViewModel(repo),
          );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(repositoryProvider);
    final vm = ref.watch(_vmProvider(repo));

    return Column(
      children: [
        MonthPickerBar(
          month: vm.month,
          onPrev: () =>
              vm.setMonth(DateTime(vm.month.year, vm.month.month - 1)),
          onNext: () =>
              vm.setMonth(DateTime(vm.month.year, vm.month.month + 1)),
        ),
        TransactionsSummaryRow(income: vm.income, expense: vm.expense),
        Expanded(child: _Body(vm: vm)),
      ],
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.vm});

  final TransactionsDailyViewModel vm;

  @override
  Widget build(BuildContext context) {
    if (vm.loading && vm.groups.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (vm.error != null && vm.groups.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            vm.error!.message,
            textAlign: TextAlign.center,
            style: OewangFonts.sans(color: OewangColors.coral),
          ),
        ),
      );
    }
    if (vm.groups.isEmpty) {
      return Center(
        child: Text(
          'No transactions this month',
          style: OewangFonts.sans(color: OewangColors.mutedForeground),
        ),
      );
    }
    return ListView.builder(
      itemCount: vm.groups.length,
      itemBuilder: (context, index) {
        final group = vm.groups[index];
        return Column(
          children: [
            DailyGroupHeader(group: group),
            for (final t in group.items) TransactionRow(transaction: t),
          ],
        );
      },
    );
  }
}
