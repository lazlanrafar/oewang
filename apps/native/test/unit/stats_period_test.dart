import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/stats/stats_screen.dart';

void main() {
  group('rangeFor', () {
    test('month → first..last day of the anchor month', () {
      final r = rangeFor(DateTime(2026, 6, 15), StatsPeriod.month);
      expect(r.from, DateTime(2026, 6, 1));
      expect(r.to, DateTime(2026, 6, 30));
    });

    test('year → Jan 1..Dec 31 of the anchor year', () {
      final r = rangeFor(DateTime(2026, 6, 15), StatsPeriod.year);
      expect(r.from, DateTime(2026, 1, 1));
      expect(r.to, DateTime(2026, 12, 31));
    });

    test('week → Monday..Sunday containing the anchor', () {
      // 2026-06-17 is a Wednesday → week is Mon 15th .. Sun 21st.
      final r = rangeFor(DateTime(2026, 6, 17), StatsPeriod.week);
      expect(r.from, DateTime(2026, 6, 15));
      expect(r.to, DateTime(2026, 6, 21));
      expect(r.from.weekday, DateTime.monday);
      expect(r.to.weekday, DateTime.sunday);
    });

    test('week spanning a month boundary', () {
      // 2026-07-01 is a Wednesday → week starts Mon Jun 29th.
      final r = rangeFor(DateTime(2026, 7, 1), StatsPeriod.week);
      expect(r.from, DateTime(2026, 6, 29));
      expect(r.to, DateTime(2026, 7, 5));
    });
  });
}
