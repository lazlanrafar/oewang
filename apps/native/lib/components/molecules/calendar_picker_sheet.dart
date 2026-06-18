import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/ui/core/form/drawer_header.dart';
import 'package:oewang/ui/core/form/drawer_metrics.dart';

/// WMoney-style calendar content: a black "Date / Today / close" header, month
/// navigation, a Sunday-start weekday row (Sun red, Sat blue) and a full-bleed
/// month table that fills the panel. The selected day is a filled square.
/// Tapping a day (or "Today") reports through [onSelected]; never touches the
/// Navigator.
class CalendarContent extends StatefulWidget {
  const CalendarContent({
    required this.initial,
    required this.onSelected,
    this.onClose,
    this.firstDate,
    this.lastDate,
    super.key,
  });

  final DateTime initial;
  final ValueChanged<DateTime> onSelected;
  final VoidCallback? onClose;
  final DateTime? firstDate;
  final DateTime? lastDate;

  @override
  State<CalendarContent> createState() => _CalendarContentState();
}

class _CalendarContentState extends State<CalendarContent> {
  late DateTime _visibleMonth =
      DateTime(widget.initial.year, widget.initial.month);
  late final DateTime _selected = _dateOnly(widget.initial);

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  void _stepMonth(int delta) {
    setState(() {
      _visibleMonth = DateTime(_visibleMonth.year, _visibleMonth.month + delta);
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Column(
      mainAxisSize: MainAxisSize.max,
      children: [
        FormDrawerHeader(
          title: 'Date',
          onClose: widget.onClose,
          actions: [
            TextButton(
              onPressed: () => widget.onSelected(_dateOnly(DateTime.now())),
              child: Text(
                'Today',
                style: OewangFonts.sans(color: DrawerMetrics.onHeader),
              ),
            ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            children: [
              IconButton(
                onPressed: () => _stepMonth(-1),
                icon: Icon(Icons.chevron_left, color: palette.foreground),
              ),
              Expanded(
                child: Text(
                  DateFormat('MMM yyyy').format(_visibleMonth),
                  textAlign: TextAlign.center,
                  style: OewangFonts.sans(
                    color: palette.foreground,
                    fontSize: 16,
                  ),
                ),
              ),
              IconButton(
                onPressed: () => _stepMonth(1),
                icon: Icon(Icons.chevron_right, color: palette.foreground),
              ),
            ],
          ),
        ),
        _WeekdayHeader(palette: palette),
        Expanded(
          child: _MonthGrid(
            month: _visibleMonth,
            selected: _selected,
            firstDate: widget.firstDate,
            lastDate: widget.lastDate,
            onTap: widget.onSelected,
          ),
        ),
      ],
    );
  }
}

class _WeekdayHeader extends StatelessWidget {
  const _WeekdayHeader({required this.palette});
  final OewangPalette palette;

  @override
  Widget build(BuildContext context) {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return ColoredBox(
      color: palette.muted,
      child: Row(
        children: [
          for (var i = 0; i < labels.length; i++)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  labels[i],
                  textAlign: TextAlign.center,
                  style: OewangFonts.sans(
                    fontSize: 12,
                    color: i == 0
                        ? OewangColors.coral
                        : (i == 6
                            ? Colors.blueAccent
                            : palette.mutedForeground),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({
    required this.month,
    required this.selected,
    required this.onTap,
    this.firstDate,
    this.lastDate,
  });

  final DateTime month; // first day of the visible month
  final DateTime selected;
  final ValueChanged<DateTime> onTap;
  final DateTime? firstDate;
  final DateTime? lastDate;

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  bool _enabled(DateTime d) {
    if (firstDate != null && d.isBefore(_dateOnly(firstDate!))) return false;
    if (lastDate != null && d.isAfter(_dateOnly(lastDate!))) return false;
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final first = DateTime(month.year, month.month);
    final leading = first.weekday % 7; // Sunday-start leading days
    final start = first.subtract(Duration(days: leading));
    final today = _dateOnly(DateTime.now());

    return Column(
      children: [
        for (var week = 0; week < 6; week++)
          Expanded(
            child: Row(
              children: [
                for (var col = 0; col < 7; col++)
                  Expanded(
                    child: _DayCell(
                      date: start.add(Duration(days: week * 7 + col)),
                      month: month.month,
                      column: col,
                      selected: selected,
                      today: today,
                      enabled: _enabled,
                      sameDay: _sameDay,
                      onTap: onTap,
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.date,
    required this.month,
    required this.column,
    required this.selected,
    required this.today,
    required this.enabled,
    required this.sameDay,
    required this.onTap,
  });

  final DateTime date;
  final int month;
  final int column;
  final DateTime selected;
  final DateTime today;
  final bool Function(DateTime) enabled;
  final bool Function(DateTime, DateTime) sameDay;
  final ValueChanged<DateTime> onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final inMonth = date.month == month;
    final isSelected = sameDay(date, selected);
    final isToday = sameDay(date, today);
    final on = enabled(date);

    final Color textColor;
    if (isSelected) {
      textColor = Colors.white;
    } else if (!inMonth || !on) {
      textColor = palette.mutedForeground;
    } else if (column == 0) {
      textColor = OewangColors.coral;
    } else if (column == 6) {
      textColor = Colors.blueAccent;
    } else {
      textColor = palette.foreground;
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        color: isSelected
            ? DrawerMetrics.daySelected
            : (inMonth ? null : palette.muted),
        border: Border(
          right: BorderSide(color: palette.border),
          bottom: BorderSide(color: palette.border),
        ),
      ),
      child: InkWell(
        onTap: on ? () => onTap(DateTime(date.year, date.month, date.day)) : null,
        child: Stack(
          children: [
            if (isToday && !isSelected)
              Positioned(
                top: 4,
                right: 4,
                child: Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: palette.mutedForeground,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            Center(
              child: Text(
                '${date.day}',
                style: OewangFonts.sans(color: textColor, fontSize: 15),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Modal fallback — opens [CalendarContent] as a fixed-height bottom sheet.
class CalendarPickerSheet {
  const CalendarPickerSheet._();

  static Future<DateTime?> show(
    BuildContext context, {
    required DateTime initial,
    DateTime? firstDate,
    DateTime? lastDate,
  }) {
    return showModalBottomSheet<DateTime>(
      context: context,
      backgroundColor: DrawerMetrics.surface(context),
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        top: false,
        child: SizedBox(
          height: DrawerMetrics.height,
          child: CalendarContent(
            initial: initial,
            firstDate: firstDate,
            lastDate: lastDate,
            onSelected: (d) => Navigator.of(sheetContext).pop(d),
            onClose: () => Navigator.of(sheetContext).pop(),
          ),
        ),
      ),
    );
  }
}
