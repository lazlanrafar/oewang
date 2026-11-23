import 'package:intl/intl.dart';

/// Display formatting for date fields. The field is read-only and shows the
/// chosen day through here (`19 Jun 2026` by default).
abstract class DateFormatter {
  static const defaultPattern = 'dd MMM yyyy';

  static String format(DateTime date, {String pattern = defaultPattern}) =>
      DateFormat(pattern).format(date);
}
