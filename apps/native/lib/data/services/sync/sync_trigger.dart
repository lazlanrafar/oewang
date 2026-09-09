import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:oewang/data/services/connectivity/connectivity_service.dart';
import 'package:oewang/data/services/sync/sync_service.dart';

/// Calls [SyncService.flush] on the two foreground signals that matter: the
/// device coming back online, and the app returning to the foreground (in
/// case a flush was missed while backgrounded). No OS-level background task
/// — see [SyncService]'s doc comment for why that's out of scope.
class SyncTrigger extends WidgetsBindingObserver {
  SyncTrigger({
    required ConnectivityService connectivity,
    required SyncService sync,
  }) : _sync = sync {
    _sub = connectivity.onOnline.listen((_) {
      if (_foreground) unawaited(_sync.flush());
    });
    WidgetsBinding.instance.addObserver(this);
    unawaited(_sync.flush());
    _timer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (_foreground) unawaited(_sync.flush());
    });
  }

  final SyncService _sync;
  late final Timer _timer;
  bool _foreground = true;
  late final StreamSubscription<bool> _sub;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (_foreground) {
      unawaited(_sync.flush());
    }
  }

  void dispose() {
    _timer.cancel();
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_sub.cancel());
  }
}
