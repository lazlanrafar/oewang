import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/atoms/money_text.dart';
import 'package:oewang/components/organisms/stats/stats_view_model.dart';
import 'package:oewang/components/organisms/transactions/transactions_month_controller.dart';
import 'package:oewang/components/organisms/transactions/transactions_month_picker_bar.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/format/amount_format.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/budget_status.dart';
import 'package:oewang/domain/models/money.dart';

/// Per-category budget status for [month], keyed so each month caches its own.
/// Bumped with the budgets revision so edits in Budget Setting reflect here.
final _budgetStatusProvider = FutureProvider.autoDispose
    .family<List<BudgetStatus>, DateTime>((ref, month) async {
      ref.watch(budgetsRevisionProvider);
      final res = await ref
          .watch(budgetsRepositoryProvider)
          .status(month: month.month, year: month.year);
      return res.fold((s) => s, (_) => const <BudgetStatus>[]);
    });

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
              child: async.when(
                data: (txs) => switch (_topIndex) {
                  0 => _StatsBody(
                    slices: aggregateStats(
                      transactions: txs,
                      incomeMode: _incomeMode,
                    ),
                    chartPalette: _chartPalette,
                  ),
                  1 => _BudgetBody(
                    statusAsync: ref.watch(_budgetStatusProvider(month)),
                    slices: aggregateStats(
                      transactions: txs,
                      incomeMode: _incomeMode,
                    ),
                  ),
                  _ => _NoteBody(
                    rows: aggregateNotes(
                      transactions: txs,
                      incomeMode: _incomeMode,
                    ),
                  ),
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => _ErrorView(message: e.toString()),
              ),
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

class _StatsBody extends StatefulWidget {
  const _StatsBody({required this.slices, required this.chartPalette});

  final List<StatsSlice> slices;
  final List<Color> chartPalette;

  @override
  State<_StatsBody> createState() => _StatsBodyState();
}

class _StatsBodyState extends State<_StatsBody> {
  int? _selected;

  void _toggle(int? i) => setState(() => _selected = _selected == i ? null : i);

  @override
  void didUpdateWidget(covariant _StatsBody old) {
    super.didUpdateWidget(old);
    // Drop a stale selection when the data set changes (month/mode switch).
    if (_selected != null && _selected! >= widget.slices.length) {
      _selected = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final slices = widget.slices;
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
          child: _Pie(
            slices: slices,
            chartPalette: widget.chartPalette,
            selectedIndex: _selected,
            onTouched: _toggle,
          ),
        ),
        const SizedBox(height: 12),
        Divider(height: 1, color: palette.border),
        for (var i = 0; i < slices.length; i++)
          _CategoryRow(
            slice: slices[i],
            color: widget.chartPalette[i % widget.chartPalette.length],
            selected: _selected == i,
            onTap: () => _toggle(i),
          ),
      ],
    );
  }
}

class _Pie extends StatelessWidget {
  const _Pie({
    required this.slices,
    required this.chartPalette,
    required this.selectedIndex,
    required this.onTouched,
  });
  final List<StatsSlice> slices;
  final List<Color> chartPalette;
  final int? selectedIndex;
  final ValueChanged<int?> onTouched;

  @override
  Widget build(BuildContext context) {
    return PieChart(
      PieChartData(
        sectionsSpace: 0,
        centerSpaceRadius: 0,
        startDegreeOffset: -90,
        pieTouchData: PieTouchData(
          touchCallback: (event, response) {
            // Select on tap-up only; ignore the stream of move/down events.
            if (event is! FlTapUpEvent) return;
            onTouched(response?.touchedSection?.touchedSectionIndex);
          },
        ),
        sections: [
          for (var i = 0; i < slices.length; i++)
            PieChartSectionData(
              value: slices[i].amount.amount.toDouble(),
              color: chartPalette[i % chartPalette.length],
              // Selected slice pops out and shows its share.
              radius: i == selectedIndex ? 114 : 100,
              title: i == selectedIndex ? '${slices[i].percent.round()}%' : '',
              titleStyle: OewangFonts.sans(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
        ],
      ),
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({
    required this.slice,
    required this.color,
    required this.selected,
    required this.onTap,
  });

  final StatsSlice slice;
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return InkWell(
      onTap: onTap,
      child: Container(
        color: selected ? palette.muted : null,
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
      ),
    );
  }
}

// ── Note tab ─────────────────────────────────────────────────────────────────

/// Note tab — transactions grouped by note (`name`) with a count + summed
/// amount, sorted by count then amount.
class _NoteBody extends StatelessWidget {
  const _NoteBody({required this.rows});
  final List<NoteRow> rows;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    if (rows.isEmpty) {
      return Center(
        child: Text(
          'No data for this month',
          style: OewangFonts.sans(color: palette.mutedForeground),
        ),
      );
    }
    return Column(
      children: [
        // Column header: Note · count (sorted desc) · Amount.
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: palette.border)),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Note',
                  style: OewangFonts.sans(color: palette.mutedForeground),
                ),
              ),
              const Icon(Icons.sort, size: 18, color: OewangColors.coral),
              Expanded(
                child: Text(
                  'Amount',
                  textAlign: TextAlign.right,
                  style: OewangFonts.sans(color: palette.mutedForeground),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.separated(
            itemCount: rows.length,
            separatorBuilder: (_, _) =>
                Divider(height: 1, color: palette.border),
            itemBuilder: (context, i) => _NoteRowTile(row: rows[i]),
          ),
        ),
      ],
    );
  }
}

class _NoteRowTile extends StatelessWidget {
  const _NoteRowTile({required this.row});
  final NoteRow row;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Expanded(
            flex: 5,
            child: Text(
              row.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: OewangFonts.sans(color: palette.foreground),
            ),
          ),
          SizedBox(
            width: 40,
            child: Text(
              '${row.count}',
              textAlign: TextAlign.center,
              style: OewangFonts.sans(color: palette.mutedForeground),
            ),
          ),
          Expanded(
            flex: 4,
            child: MoneyText(
              amount: row.amount,
              color: palette.foreground,
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Budget tab ───────────────────────────────────────────────────────────────

/// Budget tab — monthly budget summary (remaining + progress) over the
/// per-category spending list for the active mode.
class _BudgetBody extends StatelessWidget {
  const _BudgetBody({required this.statusAsync, required this.slices});

  final AsyncValue<List<BudgetStatus>> statusAsync;
  final List<StatsSlice> slices;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final totals = BudgetTotals.fromStatuses(
      statusAsync.valueOrNull ?? const [],
    );
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        _BudgetHeader(totals: totals),
        Container(height: 8, color: palette.muted),
        for (var i = 0; i < slices.length; i++)
          _BudgetSpendRow(slice: slices[i]),
      ],
    );
  }
}

class _BudgetHeader extends StatelessWidget {
  const _BudgetHeader({required this.totals});
  final BudgetTotals totals;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final remaining = totals.totalBudget - totals.totalSpent;
    // Fraction of the current month elapsed — drives the "Today" marker.
    final now = DateTime.now();
    final daysInMonth = DateTime(now.year, now.month + 1, 0).day;
    final todayFrac = (now.day / daysInMonth).clamp(0.0, 1.0);
    final spentFrac = totals.totalBudget.amount <= 0
        ? 0.0
        : (totals.totalSpent.amount / totals.totalBudget.amount).clamp(
            0.0,
            1.0,
          );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Remaining (Monthly)',
                      style: OewangFonts.sans(
                        color: palette.mutedForeground,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 4),
                    MoneyText(
                      amount: remaining,
                      color: palette.foreground,
                      fontSize: 26,
                    ),
                  ],
                ),
              ),
              GestureDetector(
                onTap: () => context.push(AppRoutes.budgetSettings),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  color: palette.muted,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Budget Setting',
                        style: OewangFonts.sans(color: palette.foreground),
                      ),
                      Icon(
                        Icons.chevron_right,
                        size: 18,
                        color: palette.mutedForeground,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          _MonthlyBar(
            spentFrac: spentFrac,
            todayFrac: todayFrac,
            percent: totals.percent,
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  AmountFormat.number(totals.totalBudget.amount, decimals: 2),
                  style: OewangFonts.currency(color: palette.foreground),
                ),
              ),
              Expanded(
                child: Text(
                  AmountFormat.number(totals.totalSpent.amount, decimals: 2),
                  textAlign: TextAlign.center,
                  style: OewangFonts.currency(color: OewangColors.blue),
                ),
              ),
              Expanded(
                child: Text(
                  AmountFormat.number(remaining.amount, decimals: 2),
                  textAlign: TextAlign.right,
                  style: OewangFonts.currency(color: palette.foreground),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The grey track with a spent fill, a "Today" marker bubble, and the percent.
class _MonthlyBar extends StatelessWidget {
  const _MonthlyBar({
    required this.spentFrac,
    required this.todayFrac,
    required this.percent,
  });

  final double spentFrac;
  final double todayFrac;
  final int percent;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Row(
      children: [
        SizedBox(
          width: 60,
          child: Text(
            'Monthly',
            style: OewangFonts.sans(
              color: palette.mutedForeground,
              fontSize: 13,
            ),
          ),
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (context, c) => SizedBox(
              height: 28,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  // Track + spent fill.
                  Positioned.fill(
                    top: 10,
                    child: Container(
                      color: palette.muted,
                      alignment: Alignment.centerLeft,
                      child: FractionallySizedBox(
                        widthFactor: spentFrac,
                        child: Container(color: OewangColors.coral),
                      ),
                    ),
                  ),
                  // "Today" bubble pinned at the elapsed fraction.
                  Positioned(
                    left: (c.maxWidth * todayFrac - 22).clamp(
                      0.0,
                      c.maxWidth - 44,
                    ),
                    top: -2,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: palette.mutedForeground,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        'Today',
                        style: OewangFonts.sans(
                          color: palette.background,
                          fontSize: 11,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        SizedBox(
          width: 44,
          child: Text(
            '$percent%',
            textAlign: TextAlign.right,
            style: OewangFonts.sans(color: palette.foreground),
          ),
        ),
      ],
    );
  }
}

/// A category spend row in the Budget tab: emoji+label (label already carries
/// the emoji from the API) + amount, no `Rp` prefix.
class _BudgetSpendRow extends StatelessWidget {
  const _BudgetSpendRow({required this.slice});
  final StatsSlice slice;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: palette.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              slice.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: OewangFonts.sans(color: palette.foreground),
            ),
          ),
          Text(
            AmountFormat.number(slice.amount.amount, decimals: 2),
            style: OewangFonts.currency(color: palette.foreground),
          ),
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
