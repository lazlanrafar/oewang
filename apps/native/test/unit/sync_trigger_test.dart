import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:oewang/data/services/connectivity/connectivity_service.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/data/services/sync/sync_trigger.dart';

class Signal extends Mock implements ConnectivityService {}

class Sync extends Mock implements SyncService {}

void main() {
  testWidgets(
    'should retry queued writes only while foregrounded and stop after disposal',
    (tester) async {
      final signal = Signal();
      final sync = Sync();
      final events = StreamController<bool>();
      var calls = 0;
      when(() => signal.onOnline).thenAnswer((_) => events.stream);
      when(sync.flush).thenAnswer((_) async {
        calls++;
      });
      final trigger = SyncTrigger(connectivity: signal, sync: sync);
      expect(calls, 1);
      events.add(true);
      await tester.pump();
      expect(calls, 2);
      await tester.pump(const Duration(seconds: 5));
      expect(calls, 3);
      trigger.didChangeAppLifecycleState(AppLifecycleState.paused);
      await tester.pump(const Duration(seconds: 10));
      expect(calls, 3);
      trigger.didChangeAppLifecycleState(AppLifecycleState.resumed);
      expect(calls, 4);
      trigger.dispose();
      await tester.pump(const Duration(seconds: 10));
      expect(calls, 4);
      unawaited(events.close());
      await tester.pump();
    },
  );
}
