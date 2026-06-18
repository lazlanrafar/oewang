import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/transaction_settings.dart';
import 'package:oewang/ui/core/form/form_drawer.dart';
import 'package:oewang/ui/core/form/select_field.dart';

/// Global workspace transaction settings (IMG_3355). Every row is live —
/// changes PATCH `/v1/settings/transaction`. The Note button row is
/// intentionally omitted.
class TransactionSettingsScreen extends ConsumerWidget {
  const TransactionSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(transactionSettingsProvider);
    final scheme = ref.watch(transactionColorSchemeProvider);
    final ctl = ref.read(transactionSettingsProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [Icon(Icons.chevron_left), Text('Settings')],
          ),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        leadingWidth: 130,
        title: Text('Transaction Settings', style: OewangFonts.sans(fontSize: 17)),
      ),
      body: SafeArea(
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => Center(
            child: Text('Failed to load settings', style: OewangFonts.sans()),
          ),
          data: (s) => ListView(
            children: [
              _Row(
                label: 'Monthly Start Date',
                value: s.monthlyStartDate.toString(),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => MonthlyStartDateScreen(settings: s),
                  ),
                ),
              ),
              _Row(
                label: 'Weekly Start Day',
                value: s.weeklyStartDay,
                onTap: () => _pick(
                  context,
                  title: 'Weekly Start Day',
                  options: _weekdays.map((d) => (value: d, label: d)).toList(),
                  current: s.weeklyStartDay,
                  onSelected: (v) => ctl.patch({'weeklyStartDay': v}),
                ),
              ),
              _Row(
                label: 'Carry-over Setting',
                value: s.carryOver ? 'On' : 'Off',
                onTap: () => _pickBool(
                  context,
                  title: 'Carry-over Setting',
                  current: s.carryOver,
                  onSelected: (v) => ctl.patch({'carryOver': v}),
                ),
              ),
              _Row(
                label: 'Period Setting',
                value: s.period,
                onTap: () => _pick(
                  context,
                  title: 'Period Setting',
                  options: _periods.map((p) => (value: p, label: p)).toList(),
                  current: s.period,
                  onSelected: (v) => ctl.patch({'period': v}),
                ),
              ),
              _Row(
                label: 'Income-Expenses Color Setting',
                value: scheme == TransactionColorScheme.blueRed
                    ? 'Inc. Blue / Exp. Red'
                    : 'Inc. Red / Exp. Blue',
                onTap: () => _pick(
                  context,
                  title: 'Income-Expenses Color Setting',
                  options: const [
                    (
                      value: TransactionColorScheme.blueRed,
                      label: 'Income: Blue, Expenses: Red',
                    ),
                    (
                      value: TransactionColorScheme.redBlue,
                      label: 'Income: Red, Expenses: Blue',
                    ),
                  ],
                  current: scheme,
                  onSelected: (v) =>
                      ctl.patch({'incomeExpensesColor': v.settingValue}),
                ),
              ),
              _Row(
                label: 'Autocomplete',
                value: s.autocomplete ? 'On' : 'Off',
                onTap: () => _pickBool(
                  context,
                  title: 'Autocomplete',
                  current: s.autocomplete,
                  onSelected: (v) => ctl.patch({'autocomplete': v}),
                ),
              ),
              _Row(
                label: 'Time Input',
                value: s.timeInput,
                onTap: () => _pick(
                  context,
                  title: 'Time Input',
                  options:
                      _timeInputs.map((t) => (value: t, label: t)).toList(),
                  current: s.timeInput,
                  onSelected: (v) => ctl.patch({'timeInput': v}),
                ),
              ),
              _Row(
                label: 'Start Screen (Daily/Calendar)',
                value: s.startScreen,
                onTap: () => _pick(
                  context,
                  title: 'Start Screen (Daily/Calendar)',
                  options:
                      _startScreens.map((v) => (value: v, label: v)).toList(),
                  current: s.startScreen,
                  onSelected: (v) => ctl.patch({'startScreen': v}),
                ),
              ),
              _Row(
                label: 'Swipe',
                value: s.swipeAction,
                onTap: () => _pick(
                  context,
                  title: 'Swipe',
                  options:
                      _swipeActions.map((v) => (value: v, label: v)).toList(),
                  current: s.swipeAction,
                  onSelected: (v) => ctl.patch({'swipeAction': v}),
                ),
              ),
              _Row(
                label: 'Show description',
                value: s.showDescription ? 'On' : 'Off',
                onTap: () => _pickBool(
                  context,
                  title: 'Show description',
                  current: s.showDescription,
                  onSelected: (v) => ctl.patch({'showDescription': v}),
                ),
              ),
              _Row(
                label: 'Input order',
                value:
                    s.inputOrder == 'Amount' ? 'From Amount' : 'From Category',
                onTap: () => _pick(
                  context,
                  title: 'Input order',
                  options: const [
                    (value: 'Amount', label: 'From Amount'),
                    (value: 'Category', label: 'From Category'),
                  ],
                  current: s.inputOrder,
                  onSelected: (v) => ctl.patch({'inputOrder': v}),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

const _weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const _periods = ['Monthly', 'Weekly', 'Daily', 'Yearly'];
const _timeInputs = ['None', 'None, Desc.', 'Time'];
const _startScreens = ['Daily', 'Calendar', 'Weekly', 'Monthly', 'Summary'];
const _swipeActions = ['Change Date', 'Delete', 'None'];

typedef _Option<T> = ({T value, String label});

Future<void> _pick<T>(
  BuildContext context, {
  required String title,
  required List<_Option<T>> options,
  required T current,
  required ValueChanged<T> onSelected,
}) async {
  final picked = await showModalBottomSheet<T>(
    context: context,
    showDragHandle: true,
    builder: (_) => _OptionSheet<T>(title: title, options: options, current: current),
  );
  if (picked != null && picked != current) onSelected(picked);
}

Future<void> _pickBool(
  BuildContext context, {
  required String title,
  required bool current,
  required ValueChanged<bool> onSelected,
}) => _pick<bool>(
  context,
  title: title,
  options: const [(value: false, label: 'Off'), (value: true, label: 'On')],
  current: current,
  onSelected: onSelected,
);

class _OptionSheet<T> extends StatelessWidget {
  const _OptionSheet({
    required this.title,
    required this.options,
    required this.current,
  });
  final String title;
  final List<_Option<T>> options;
  final T current;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                title,
                style: OewangFonts.sans(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  color: palette.foreground,
                ),
              ),
            ),
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final opt in options)
                  InkWell(
                    onTap: () => Navigator.of(context).pop(opt.value),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 16,
                      ),
                      decoration: BoxDecoration(
                        border: Border(top: BorderSide(color: palette.border)),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              opt.label,
                              style: OewangFonts.sans(
                                color: opt.value == current
                                    ? OewangColors.coral
                                    : palette.foreground,
                              ),
                            ),
                          ),
                          if (opt.value == current)
                            const Icon(
                              Icons.check,
                              color: OewangColors.coral,
                              size: 20,
                            ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value, this.onTap});
  final String label;
  final String value;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: palette.border)),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(label, style: OewangFonts.sans(color: palette.foreground)),
            ),
            Text(value, style: OewangFonts.sans(color: OewangColors.coral)),
          ],
        ),
      ),
    );
  }
}

/// Sub-screen for Monthly Start Date (IMG_3356): pick the day-of-month plus how
/// a weekend start date is shifted. Saves both fields on tap.
class MonthlyStartDateScreen extends ConsumerStatefulWidget {
  const MonthlyStartDateScreen({required this.settings, super.key});
  final TransactionSettings settings;

  @override
  ConsumerState<MonthlyStartDateScreen> createState() =>
      _MonthlyStartDateScreenState();
}

class _MonthlyStartDateScreenState
    extends ConsumerState<MonthlyStartDateScreen> {
  late int _date = widget.settings.monthlyStartDate;
  late String _handling = widget.settings.monthlyStartDateWeekendHandling;
  bool _saving = false;

  static const _handlingOptions = [
    (value: 'no-changes', label: 'No changes'),
    (value: 'previous-friday', label: 'Previous Friday'),
    (value: 'following-monday', label: 'Following Monday'),
  ];

  Future<void> _save() async {
    setState(() => _saving = true);
    await ref.read(transactionSettingsProvider.notifier).patch({
      'monthlyStartDate': _date,
      'monthlyStartDateWeekendHandling': _handling,
    });
    if (mounted) await Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [Icon(Icons.chevron_left), Text('Back')],
          ),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        leadingWidth: 110,
        title: Text('Monthly Start Date', style: OewangFonts.sans(fontSize: 17)),
      ),
      body: SafeArea(
        child: FormDrawerHost(
          child: ListView(
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            Builder(
              builder: (ctx) => InkWell(
                onTap: () => _pickStartDate(ctx),
                child: SelectField(
                  label: 'Start Date',
                  value: _date.toString(),
                  onTap: () => _pickStartDate(ctx),
                ),
              ),
            ),
            Divider(height: 1, color: palette.border),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                'If monthly start date is weekend,',
                style: OewangFonts.sans(color: palette.mutedForeground),
              ),
            ),
            const SizedBox(height: 8),
            RadioGroup<String>(
              groupValue: _handling,
              onChanged: (v) => setState(() => _handling = v ?? _handling),
              child: Column(
                children: [
                  for (final opt in _handlingOptions)
                    RadioListTile<String>(
                      dense: true,
                      visualDensity: const VisualDensity(vertical: -3),
                      contentPadding:
                          const EdgeInsets.symmetric(horizontal: 8),
                      value: opt.value,
                      activeColor: OewangColors.coral,
                      title: Text(
                        opt.label,
                        style: OewangFonts.sans(color: palette.foreground),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: OewangColors.coral,
                  minimumSize: const Size.fromHeight(52),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                onPressed: _saving ? null : _save,
                child: Text(
                  'Save',
                  style: OewangFonts.sans(color: Colors.white, fontSize: 16),
                ),
              ),
            ),
          ],
          ),
        ),
      ),
    );
  }

  void _pickStartDate(BuildContext ctx) {
    openGridDrawer<int>(
      ctx,
      id: 'monthly_start_date',
      title: 'Start Date',
      items: [for (var d = 1; d <= 31; d++) d],
      labelOf: (d) => d.toString(),
      idOf: (d) => d.toString(),
      selectedId: _date.toString(),
      columns: 7,
      onSelected: (d) => setState(() => _date = d),
    );
  }
}
