import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// 4-tab bottom navigation matching IMG_1826 / IMG_1834 / IMG_1835 / IMG_1844.
///
/// - Trans icon embeds today's `dd/MM` (e.g. 05/01).
/// - Active tab tints icon + label with [OewangColors.coral].
/// - Tap dispatches via [onSelect]; the parent (router shell) handles routing.
class OewangBottomNav extends StatelessWidget {
  const OewangBottomNav({
    required this.currentIndex,
    required this.onSelect,
    super.key,
    DateTime? today,
  }) : _today = today;

  final int currentIndex;
  final ValueChanged<int> onSelect;
  final DateTime? _today;

  static const List<_NavItem> _items = [
    _NavItem(label: 'Trans', icon: Icons.menu_book_outlined),
    _NavItem(label: 'Stats', icon: Icons.bar_chart),
    _NavItem(label: 'Accounts', icon: Icons.savings_outlined),
    _NavItem(label: 'More', icon: Icons.more_horiz),
  ];

  @override
  Widget build(BuildContext context) {
    final today = _today ?? DateTime.now();
    final dayLabel = DateFormat('dd/MM').format(today);

    return DecoratedBox(
      decoration: const BoxDecoration(
        color: OewangColors.background,
        border: Border(top: BorderSide(color: OewangColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Row(
            children: [
              for (var i = 0; i < _items.length; i++)
                Expanded(
                  child: _NavButton(
                    item: _items[i],
                    selected: i == currentIndex,
                    onTap: () => onSelect(i),
                    overrideLabel: i == 0 ? dayLabel : null,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem {
  const _NavItem({required this.label, required this.icon});
  final String label;
  final IconData icon;
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.item,
    required this.selected,
    required this.onTap,
    this.overrideLabel,
  });

  final _NavItem item;
  final bool selected;
  final VoidCallback onTap;
  final String? overrideLabel;

  @override
  Widget build(BuildContext context) {
    final color =
        selected ? OewangColors.coral : OewangColors.mutedForeground;
    final label = overrideLabel ?? item.label;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(OewangRadius.sm),
        child: Semantics(
          button: true,
          selected: selected,
          label: item.label,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(item.icon, color: color, size: 22),
              const SizedBox(height: 2),
              Text(
                label,
                style: OewangFonts.sans(color: color, fontSize: 11),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
