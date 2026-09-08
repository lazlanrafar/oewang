import 'package:connectivity_plus/connectivity_plus.dart';

/// Thin wrapper over `connectivity_plus`. Exposes only the one signal the
/// offline sync layer needs: the offline→online transition.
class ConnectivityService {
  ConnectivityService([Connectivity? connectivity])
    : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  Future<bool> isOnline() async {
    final results = await _connectivity.checkConnectivity();
    return _hasConnection(results);
  }

  /// Emits `true` only on an offline→online transition (deduped) — the one
  /// edge that should trigger a sync flush.
  Stream<bool> get onOnline => _connectivity.onConnectivityChanged
      .map(_hasConnection)
      .distinct()
      .where((online) => online);

  bool _hasConnection(List<ConnectivityResult> results) =>
      results.any((r) => r != ConnectivityResult.none);
}
