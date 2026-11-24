import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/layouts/bottom_nav.dart';
import 'package:oewang/components/layouts/fab.dart';
import 'package:oewang/components/organisms/receipts/receipts_scan.dart';
import 'package:oewang/components/organisms/sync/sync_status_banner.dart';
import 'package:oewang/components/organisms/transactions/transactions_month_controller.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';

/// Hosts the 5-tab bottom-nav shell. Each tab is its own [StatefulShellBranch]
/// so back-stacks are preserved per tab.
class MainShell extends ConsumerWidget {
  const MainShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  static const int _transactionsTabIndex = 0;

  void _onSelect(int index) {
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  void _onAddTransaction(BuildContext context) {
    context.push(AppRoutes.transactionForm);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final index = navigationShell.currentIndex;
    // A viewer gets no add button (MOB-5).
    final showFab =
        index == _transactionsTabIndex && ref.watch(canWriteProvider);
    final month = ref.watch(monthControllerProvider);

    return Scaffold(
      body: navigationShell,
      // Scan sits above Add on the Trans. tab, for writers only: the upload
      // and the read are admin+ routes (MOB-8).
      floatingActionButton: showFab
          ? Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                FloatingActionButton.small(
                  heroTag: 'scanReceipt',
                  tooltip: 'Scan a receipt',
                  onPressed: () => scanReceipt(context, ref),
                  child: const Icon(Icons.document_scanner_outlined),
                ),
                const SizedBox(height: 12),
                OewangFab(onPressed: () => _onAddTransaction(context)),
              ],
            )
          : null,
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SyncStatusBanner(),
          OewangBottomNav(
            currentIndex: index,
            onSelect: _onSelect,
            month: month,
          ),
        ],
      ),
    );
  }
}
