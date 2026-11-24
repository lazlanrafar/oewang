import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/sync/sync_service.dart';

/// The queued writes that need the person (MOB-7): an edit whose row changed
/// or was deleted elsewhere (`409 STALE`), and a write the API refused.
/// Nothing is overwritten without a choice made here.
class SyncIssuesSheet extends ConsumerStatefulWidget {
  const SyncIssuesSheet({super.key});

  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.palette.background,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (_) => const SyncIssuesSheet(),
  );

  @override
  ConsumerState<SyncIssuesSheet> createState() => _SyncIssuesSheetState();
}

class _SyncIssuesSheetState extends ConsumerState<SyncIssuesSheet> {
  late Future<List<QueueEntry>> _issues = ref
      .read(syncServiceProvider)
      .issues();
  bool _busy = false;

  Future<void> _resolve(Future<void> Function() action) async {
    setState(() => _busy = true);
    await action();
    final next = ref.read(syncServiceProvider).issues();
    final left = await next;
    if (!mounted) return;
    if (left.isEmpty) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _issues = next;
      _busy = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final sync = ref.read(syncServiceProvider);
    return SafeArea(
      child: FutureBuilder<List<QueueEntry>>(
        future: _issues,
        builder: (context, snap) {
          final issues = snap.data ?? const [];
          return ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.symmetric(vertical: 8),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                child: Text(
                  'Changes to review',
                  style: OewangFonts.sans(
                    color: palette.foreground,
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              for (final e in issues) ...[
                Divider(height: 1, color: palette.border),
                _Issue(
                  entry: e,
                  busy: _busy,
                  onDiscard: () => _resolve(() => sync.discard(e)),
                  onApply: () => _resolve(() => sync.applyAnyway(e)),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _Issue extends StatelessWidget {
  const _Issue({
    required this.entry,
    required this.busy,
    required this.onDiscard,
    required this.onApply,
  });

  final QueueEntry entry;
  final bool busy;
  final VoidCallback onDiscard;
  final VoidCallback onApply;

  static const _things = {
    'transactions': 'Transaction',
    'wallets': 'Account',
    'categories': 'Category',
    'debts': 'Debt',
    'contacts': 'Contact',
  };

  static String _thing(String kind) =>
      _things[kind] ??
      (paymentDebtId(kind) != null
          ? 'Payment'
          : isMergeKind(kind)
          ? 'Contact merge'
          : kind);

  static const _acts = {
    QueueOp.create: 'new',
    QueueOp.update: 'edit',
    QueueOp.delete: 'delete',
  };

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final e = entry;
    final conflict = e.status == QueueStatus.conflict;
    final deleted = conflict && e.current == null;
    final name = e.payload?['name'] ?? e.before?['name'];
    final reason = !conflict
        ? (e.error ?? 'Refused')
        : deleted
        ? 'Deleted elsewhere since you changed it'
        : 'Changed elsewhere since you changed it';

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${_thing(e.kind)}'
            '${isMergeKind(e.kind) ? '' : ' ${_acts[e.op]}'}'
            '${name is String && name.isNotEmpty ? ': $name' : ''}',
            style: OewangFonts.sans(color: palette.foreground),
          ),
          const SizedBox(height: 4),
          Text(
            reason,
            style: OewangFonts.sans(
              color: palette.mutedForeground,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Button(
                  label: 'Discard my change',
                  variant: ButtonVariant.outlined,
                  onPressed: busy ? null : onDiscard,
                ),
              ),
              // An edit to a deleted row has nothing to apply to.
              if (conflict && !deleted) ...[
                const SizedBox(width: 8),
                Expanded(
                  child: Button(
                    label: 'Apply anyway',
                    onPressed: busy ? null : onApply,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
