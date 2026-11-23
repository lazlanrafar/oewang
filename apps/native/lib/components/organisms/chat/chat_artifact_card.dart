import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:oewang/components/molecules/hatch_bar.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/chat.dart';
import 'package:oewang/domain/models/money.dart';

/// An analysis the API built for a tool call (D88), drawn inline under the
/// answer that made it. The web opens these in a side canvas; a phone has no
/// room beside the conversation, so the card sits in it.
///
/// Every figure is the API's decimal string, formatted here (D27); bar
/// lengths read a double for geometry only (D89).
class ChatArtifactCard extends StatelessWidget {
  const ChatArtifactCard({required this.artifact, super.key});

  final ChatArtifact artifact;

  @override
  Widget build(BuildContext context) {
    final p = artifact.payload;
    final currency = p['currency_code'] as String? ?? 'IDR';
    String money(Object? v) =>
        v is String ? Money.parse(v, currency: currency).format() : '-';

    final (title, stats, rows) = switch (artifact.kind) {
      'spending' => (
        'Spending',
        [
          ('Total spent', money(_figure(p['total']))),
          ('Transactions', '${p['count'] ?? 0}'),
        ],
        _shares(p['categories'], money),
      ),
      'income' => (
        'Income',
        [
          ('Total earned', money(_figure(p['total']))),
          ('Monthly average', money(p['average_monthly'])),
        ],
        _months(p['months'], money),
      ),
      'burn-rate' => (
        'Burn rate',
        [
          ('Average burn', money(p['average_monthly'])),
          ('Months above it', '${p['months_above_average'] ?? 0}'),
        ],
        _months(p['months'], money),
      ),
      _ => (
        'Budget',
        [('Spent', money(p['spent'])), ('Remaining', money(p['remaining']))],
        _budgets(p['budgets'], money),
      ),
    };

    final palette = context.palette;
    final muted = OewangFonts.sans(
      color: palette.mutedForeground,
      fontSize: 12,
    );
    final summary = p['summary'];
    return Container(
      margin: const EdgeInsets.only(top: OewangSpacing.sm),
      padding: const EdgeInsets.all(OewangSpacing.md),
      decoration: BoxDecoration(
        color: palette.card,
        border: Border.all(color: palette.border),
        borderRadius: BorderRadius.circular(OewangRadius.xl),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: OewangFonts.sans(
              color: palette.foreground,
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (p['from'] is String && p['to'] is String)
            Text('${p['from']} to ${p['to']}', style: muted),
          const SizedBox(height: OewangSpacing.md),
          Row(
            children: [
              for (final (label, value) in stats)
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label, style: muted),
                      Text(
                        value,
                        style: OewangFonts.currency(
                          color: palette.foreground,
                          fontSize: 15,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          if (rows.isNotEmpty) const SizedBox(height: OewangSpacing.md),
          for (final row in rows)
            Padding(
              padding: const EdgeInsets.only(bottom: OewangSpacing.sm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          row.label,
                          style: OewangFonts.sans(
                            color: palette.foreground,
                            fontSize: 13,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Text(row.value, style: muted),
                    ],
                  ),
                  const SizedBox(height: OewangSpacing.xs),
                  HatchBar(fraction: row.fraction, tone: row.tone),
                ],
              ),
            ),
          if (summary is String && summary.isNotEmpty)
            Text(summary, style: muted),
        ],
      ),
    );
  }
}

typedef _Row = ({String label, String value, double fraction, HatchTone tone});

Object? _figure(Object? figure) => figure is Map ? figure['value'] : null;

double _num(Object? v) =>
    v is String ? (Decimal.tryParse(v)?.toDouble() ?? 0) : 0;

List<Map<String, dynamic>> _list(Object? v) =>
    v is List ? v.whereType<Map<String, dynamic>>().toList() : const [];

List<_Row> _scaled(List<_Row> rows) {
  final top = rows.fold<double>(0, (m, r) => r.fraction > m ? r.fraction : m);
  return [
    for (final r in rows)
      (
        label: r.label,
        value: r.value,
        fraction: top == 0 ? 0 : r.fraction / top,
        tone: r.tone,
      ),
  ];
}

List<_Row> _shares(Object? categories, String Function(Object?) money) =>
    _scaled([
      for (final c in _list(categories))
        (
          label:
              c['name'] as String? ??
              (c['other'] == true ? 'Other' : 'Uncategorized'),
          value: '${money(c['total'])}  ${c['share_formatted'] ?? ''}'.trim(),
          fraction: _num(c['total']),
          tone: HatchTone.neutral,
        ),
    ]);

List<_Row> _months(Object? months, String Function(Object?) money) => _scaled([
  for (final m in _list(months))
    (
      label: _monthLabel(m['month']),
      value: money(m['value']),
      fraction: _num(m['value']),
      tone: HatchTone.neutral,
    ),
]);

/// Fullest first, amber from 80%, red past 100% (D103), by the API's state.
List<_Row> _budgets(Object? budgets, String Function(Object?) money) => [
  for (final b in _list(budgets))
    (
      label: b['category_name'] as String? ?? '',
      value: '${money(b['spent'])} / ${money(b['amount'])}',
      fraction: ((b['percent'] as num?) ?? 0) / 100,
      tone: switch (b['state']) {
        'over' => HatchTone.over,
        'warning' => HatchTone.warning,
        _ => HatchTone.neutral,
      },
    ),
];

/// `2026-03` as "Mar 2026", built from the parts so no timezone moves it.
String _monthLabel(Object? month) {
  if (month is! String) return '';
  final parts = month.split('-');
  final year = int.tryParse(parts.first);
  final index = parts.length > 1 ? int.tryParse(parts[1]) : null;
  if (year == null || index == null) return month;
  return DateFormat('MMM yyyy').format(DateTime(year, index));
}
