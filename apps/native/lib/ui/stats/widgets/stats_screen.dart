import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/ui/core/money_text.dart';
import 'package:oewang/ui/stats/view_models/stats_view_model.dart';
import 'package:oewang/ui/transactions/view_models/month_transactions_controller.dart';
import 'package:oewang/ui/transactions/widgets/month_picker_bar.dart';

/// IMG_1834 — Stats tab.
class StatsScreen extends ConsumerStatefulWidget {
  const StatsScreen({super.key});

  @override
  ConsumerState<StatsScreen> createState() => _StatsScreenState();
}

class _StatsScreenState extends ConsumerState<StatsScreen> {
  static const _topLabels = ['Stats', 'Budget', 'Note'];
  int _topIndex = 0;
  bool _incomeMode = false;

  static const _chartPalette = <Color>[
    OewangColors.coral,
    Color(0xFFFFA630),
    Color(0xFFFFD23F),
    Color(0xFF60A5FA),
    Color(0xFFA78BFA),
    Color(0xFF7DD3A1),
  ];

  @override
  Widget build(BuildContext context) {
    final monthCtl = ref.read(monthControllerProvider.notifier);
    final month = ref.watch(monthControllerProvider);
    final async = ref.watch(monthTransactionsProvider(month));
    final palette = context.palette;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 8),
            _TopPills(
              labels: _topLabels,
              currentIndex: _topIndex,
              onSelect: (i) => setState(() => _topIndex = i),
            ),
            const SizedBox(height: 4),
            MonthPickerBar(
              month: month,
              onPrev: monthCtl.prev,
              onNext: monthCtl.next,
            ),
            _ModeToggle(
              incomeMode: _incomeMode,
              onChanged: (v) => setState(() => _incomeMode = v),
              totalMoney: async.maybeWhen(
                data: (txs) {
                  final slices = aggregateStats(
                    transactions: txs,
                    incomeMode: _incomeMode,
                  );
                  return sumOfSlices(slices);
                },
                orElse: Money.zero,
              ),
            ),
            Divider(height: 1, color: palette.border),
            Expanded(
              child: _topIndex == 0
                  ? async.when(
                      data: (txs) => _StatsBody(
                        slices: aggregateStats(
                          transactions: txs,
                          incomeMode: _incomeMode,
                        ),
                        chartPalette: _chartPalette,
                      ),
                      loading: () =>
                          const Center(child: CircularProgressIndicator()),
                      error: (e, _) => _ErrorView(message: e.toString()),
                    )
                  : _ComingSoon(label: _topLabels[_topIndex]),
            ),
          ],
        ),
      ),
    );
  }
}

class _TopPills extends StatelessWidget {
  const _TopPills({
    required this.labels,
    required this.currentIndex,
    required this.onSelect,
  });

  final List<String> labels;
  final int currentIndex;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(2),
              color: palette.card,
              child: Row(
                children: [
                  for (var i = 0; i < labels.length; i++)
                    Expanded(
                      child: GestureDetector(
                        onTap: () => onSelect(i),
                        child: Container(
                          height: 32,
                          alignment: Alignment.center,
                          color: i == currentIndex
                              ? palette.primary
                              : Colors.transparent,
                          child: Text(
                            labels[i],
                            style: OewangFonts.sans(
                              color: i == currentIndex
                                  ? palette.primaryForeground
                                  : palette.mutedForeground,
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              border: Border.all(color: palette.border),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'M',
                  style: OewangFonts.sans(
                    color: palette.foreground,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(width: 2),
                Icon(
                  Icons.arrow_drop_down,
                  size: 18,
                  color: palette.foreground,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ModeToggle extends StatelessWidget {
  const _ModeToggle({
    required this.incomeMode,
    required this.onChanged,
    required this.totalMoney,
  });

  final bool incomeMode;
  final ValueChanged<bool> onChanged;
  final Money totalMoney;

  @override
  Widget build(BuildContext context) {
    final tx = Theme.of(context).extension<TransactionColors>()!;
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: GestureDetector(
              onTap: () => onChanged(true),
              child: Column(
                children: [
                  Text(
                    incomeMode ? 'Income ${totalMoney.format()}' : 'Income',
                    style: OewangFonts.sans(
                      color: incomeMode ? tx.income : palette.mutedForeground,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Container(
                    height: 2,
                    color: incomeMode ? tx.income : Colors.transparent,
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: GestureDetector(
              onTap: () => onChanged(false),
              child: Column(
                children: [
                  Text(
                    incomeMode ? 'Exp.' : 'Exp. ${totalMoney.format()}',
                    style: OewangFonts.sans(
                      color: incomeMode ? palette.mutedForeground : tx.expense,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Container(
                    height: 2,
                    color: incomeMode ? Colors.transparent : tx.expense,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatsBody extends StatelessWidget {
  const _StatsBody({required this.slices, required this.chartPalette});

  final List<StatsSlice> slices;
  final List<Color> chartPalette;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    if (slices.isEmpty) {
      return Center(
        child: Text(
          'No data for this month',
          style: OewangFonts.sans(color: palette.mutedForeground),
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 12),
      children: [
        SizedBox(
          height: 260,
          child: _Pie(slices: slices, chartPalette: chartPalette),
        ),
        const SizedBox(height: 12),
        Divider(height: 1, color: palette.border),
        for (var i = 0; i < slices.length; i++)
          _CategoryRow(
            slice: slices[i],
            color: chartPalette[i % chartPalette.length],
          ),
      ],
    );
  }
}

class _Pie extends StatelessWidget {
  const _Pie({required this.slices, required this.chartPalette});
  final List<StatsSlice> slices;
  final List<Color> chartPalette;

  @override
  Widget build(BuildContext context) {
    return PieChart(
      PieChartData(
        sectionsSpace: 0,
        centerSpaceRadius: 0,
        startDegreeOffset: -90,
        sections: [
          for (var i = 0; i < slices.length; i++)
            PieChartSectionData(
              value: slices[i].amount.amount.toDouble(),
              color: chartPalette[i % chartPalette.length],
              radius: 100,
              title: '',
            ),
        ],
      ),
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({required this.slice, required this.color});

  final StatsSlice slice;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            color: color,
            child: Text(
              '${slice.percent.round()}%',
              style: OewangFonts.sans(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              slice.label,
              style: OewangFonts.sans(color: palette.foreground),
            ),
          ),
          MoneyText(amount: slice.amount, color: palette.foreground),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: OewangFonts.sans(color: OewangColors.coral),
      ),
    ),
  );
}

class _ComingSoon extends StatelessWidget {
  const _ComingSoon({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) => Center(
    child: Text(
      '$label — coming soon',
      style: OewangFonts.sans(color: context.palette.mutedForeground),
    ),
  );
}
