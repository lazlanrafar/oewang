import 'package:oewang/domain/models/currency.dart';

/// Static catalog (subset of ISO 4217) used by the currency picker. Lives in
/// `data/` because it's a hardcoded reference set — when the workspace gets a
/// real currency endpoint this gets swapped out for a repository.
class CurrencyCatalog {
  const CurrencyCatalog._();

  static const List<CurrencyInfo> all = [
    CurrencyInfo(code: 'AUD', country: 'Australia', symbol: r'A$'),
    CurrencyInfo(code: 'BRL', country: 'Brazil', symbol: r'R$'),
    CurrencyInfo(code: 'CAD', country: 'Canada', symbol: r'C$'),
    CurrencyInfo(code: 'CHF', country: 'Switzerland', symbol: 'CHF'),
    CurrencyInfo(code: 'CNY', country: 'China', symbol: '¥'),
    CurrencyInfo(code: 'EUR', country: 'Eurozone', symbol: '€'),
    CurrencyInfo(code: 'GBP', country: 'United Kingdom', symbol: '£'),
    CurrencyInfo(code: 'HKD', country: 'Hong Kong', symbol: r'HK$'),
    CurrencyInfo(code: 'IDR', country: 'Indonesia', symbol: 'Rp'),
    CurrencyInfo(code: 'INR', country: 'India', symbol: '₹'),
    CurrencyInfo(code: 'IRR', country: 'Iranian', symbol: 'IRR'),
    CurrencyInfo(code: 'ISK', country: 'Iceland', symbol: 'Íkr'),
    CurrencyInfo(code: 'JMD', country: 'Jamaica', symbol: r'J$'),
    CurrencyInfo(code: 'JPY', country: 'Japan', symbol: 'JP¥'),
    CurrencyInfo(code: 'JOD', country: 'Jordan', symbol: 'JD'),
    CurrencyInfo(code: 'KES', country: 'Kenya', symbol: 'KSh'),
    CurrencyInfo(code: 'KGS', country: 'Kyrgyzstan', symbol: 'som'),
    CurrencyInfo(code: 'KHR', country: 'Cambodia', symbol: '៛'),
    CurrencyInfo(code: 'KRW', country: 'Korea', symbol: '원'),
    CurrencyInfo(code: 'KWD', country: 'Kuwait', symbol: 'د.ك'),
    CurrencyInfo(code: 'KYD', country: 'Cayman Islands', symbol: 'KYD'),
    CurrencyInfo(code: 'KZT', country: 'Kazakhstan', symbol: '₸'),
    CurrencyInfo(code: 'LAK', country: 'Laos', symbol: '₭'),
    CurrencyInfo(code: 'MXN', country: 'Mexico', symbol: r'M$'),
    CurrencyInfo(code: 'MYR', country: 'Malaysia', symbol: 'RM'),
    CurrencyInfo(code: 'NOK', country: 'Norway', symbol: 'kr'),
    CurrencyInfo(code: 'NZD', country: 'New Zealand', symbol: r'NZ$'),
    CurrencyInfo(code: 'PHP', country: 'Philippines', symbol: '₱'),
    CurrencyInfo(code: 'SEK', country: 'Sweden', symbol: 'kr'),
    CurrencyInfo(code: 'SGD', country: 'Singapore', symbol: r'S$'),
    CurrencyInfo(code: 'THB', country: 'Thailand', symbol: '฿'),
    CurrencyInfo(code: 'TWD', country: 'Taiwan', symbol: r'NT$'),
    CurrencyInfo(code: 'USD', country: 'USA', symbol: r'US$'),
    CurrencyInfo(code: 'VND', country: 'Vietnam', symbol: '₫'),
    CurrencyInfo(code: 'ZAR', country: 'South Africa', symbol: 'R'),
  ];

  /// Returns the [all] list filtered by a case-insensitive [query] against
  /// the code or the country name. Empty query → unfiltered.
  static List<CurrencyInfo> search(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return all;
    return all
        .where(
          (c) =>
              c.code.toLowerCase().contains(q) ||
              c.country.toLowerCase().contains(q),
        )
        .toList();
  }

  /// Groups by the first letter of the code. Used by the alphabetised picker.
  static Map<String, List<CurrencyInfo>> groupByLetter(
    List<CurrencyInfo> items,
  ) {
    final map = <String, List<CurrencyInfo>>{};
    for (final c in items) {
      final letter = c.code.substring(0, 1).toUpperCase();
      map.putIfAbsent(letter, () => <CurrencyInfo>[]).add(c);
    }
    final sortedKeys = map.keys.toList()..sort();
    return {for (final k in sortedKeys) k: map[k]!};
  }
}
