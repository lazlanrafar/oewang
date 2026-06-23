import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/organisms/transactions/transactions_row.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/domain/models/transaction.dart';

/// All transactions in a wide window (last ~2 years) used for client-side
/// search — the list API has no text-search param. Rebuilt on the revision.
final _searchPoolProvider = FutureProvider.autoDispose<List<Transaction>>((
  ref,
) async {
  ref.watch(transactionsRevisionProvider);
  final now = DateTime.now();
  final res = await ref
      .watch(transactionsRepositoryProvider)
      .list(
        TransactionsListQuery(
          from: DateTime(now.year - 2, now.month),
          to: DateTime(now.year, now.month + 1, 0),
          limit: 1000,
        ),
      );
  return res.fold((txs) => txs, (_) => <Transaction>[]);
});

/// Matches [t] against a lowercased [q] across note, category, wallet, amount.
bool matchesQuery(Transaction t, String q) {
  if (q.isEmpty) return true;
  final haystack = [
    t.name,
    t.description,
    t.category?.name,
    t.wallet?.name,
    t.amount.amount.toString(),
  ].whereType<String>().join(' ').toLowerCase();
  return haystack.contains(q);
}

/// Full-screen transaction search opened from the Trans. header.
class TransactionSearchScreen extends ConsumerStatefulWidget {
  const TransactionSearchScreen({super.key});

  @override
  ConsumerState<TransactionSearchScreen> createState() =>
      _TransactionSearchScreenState();
}

class _TransactionSearchScreenState
    extends ConsumerState<TransactionSearchScreen> {
  final _controller = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _clear() {
    _controller.clear();
    setState(() => _query = '');
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final pool = ref.watch(_searchPoolProvider);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // Section 1 — back button + "Search" title.
            SizedBox(
              height: 48,
              child: Row(
                children: [
                  IconButton(
                    icon: Icon(Icons.chevron_left, color: palette.foreground),
                    onPressed: () => Navigator.of(context).maybePop(),
                  ),
                  Text(
                    'Search',
                    style: OewangFonts.sans(
                      color: palette.foreground,
                      fontSize: 17,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            // Section 2 — the Input field with a clear button.
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 8, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Input(
                      controller: _controller,
                      autofocus: true,
                      hintText: 'Search notes, categories, accounts…',
                      onChanged: (v) =>
                          setState(() => _query = v.trim().toLowerCase()),
                    ),
                  ),
                  IconButton(
                    icon: Icon(Icons.close, color: palette.mutedForeground),
                    onPressed: _query.isEmpty ? null : _clear,
                  ),
                ],
              ),
            ),
            Divider(height: 1, color: palette.border),
            Expanded(child: _results(palette, pool)),
          ],
        ),
      ),
    );
  }

  Widget _results(OewangPalette palette, AsyncValue<List<Transaction>> pool) {
    return pool.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Text(
          e.toString(),
          style: OewangFonts.sans(color: OewangColors.coral),
        ),
      ),
      data: (txs) {
        if (_query.isEmpty) {
          return _Hint(text: 'Search your transactions', palette: palette);
        }
        final results = txs.where((t) => matchesQuery(t, _query)).toList()
          ..sort((a, b) => b.date.compareTo(a.date));
        if (results.isEmpty) {
          return _Hint(text: 'No matches', palette: palette);
        }
        return ListView.separated(
          itemCount: results.length,
          separatorBuilder: (_, _) => Divider(height: 1, color: palette.border),
          itemBuilder: (context, i) {
            final t = results[i];
            return TransactionRow(
              transaction: t,
              onTap: () => context.push(AppRoutes.transactionForm, extra: t),
            );
          },
        );
      },
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.text, required this.palette});
  final String text;
  final OewangPalette palette;

  @override
  Widget build(BuildContext context) => Center(
    child: Text(text, style: OewangFonts.sans(color: palette.mutedForeground)),
  );
}
