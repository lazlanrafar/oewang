import 'package:decimal/decimal.dart';
import 'package:flutter/foundation.dart';

/// What `POST /v1/ai/receipt/parse` read from an image already in the vault
/// (AI-1). Nothing is persisted (AI-2): this only prefills the form.
///
/// Every field is checked rather than cast, as the web's `$lib/receipt`
/// does: the draft crossed two services with a model at the far end. A date
/// in prose or a figure that is not a decimal string is dropped, never
/// guessed at.
@immutable
class ReceiptDraft {
  const ReceiptDraft({
    required this.vaultFileId,
    this.merchant,
    this.date,
    this.total,
    this.currency,
    this.lowConfidence = const [],
    this.corrected = const [],
  });

  factory ReceiptDraft.fromJson(Map<String, dynamic> json) {
    final draft = json['draft'] is Map
        ? json['draft'] as Map
        : const <String, Object?>{};
    final quality = json['quality'] is Map
        ? json['quality'] as Map
        : const <String, Object?>{};
    final merchant = draft['merchant'];
    final currency = draft['currency'];
    final corrected = quality['corrected_fields'];
    final low = quality['low_confidence_fields'];
    return ReceiptDraft(
      vaultFileId: json['vault_file_id'] as String,
      merchant: merchant is String && merchant.trim().isNotEmpty
          ? merchant.trim()
          : null,
      date: _day(draft['date']),
      total: draft['total'] is String
          ? Decimal.tryParse(draft['total'] as String)
          : null,
      currency: currency is String ? currency : null,
      lowConfidence: low is List ? low.whereType<String>().toList() : const [],
      // Each entry is `{field, model_value}`; an older API sent bare names.
      corrected: corrected is List
          ? [
              for (final c in corrected)
                if (c is String)
                  c
                else if (c is Map && c['field'] is String)
                  c['field'] as String,
            ]
          : const [],
    );
  }

  final String vaultFileId;
  final String? merchant;
  final DateTime? date;
  final Decimal? total;
  final String? currency;
  final List<String> lowConfidence;
  final List<String> corrected;

  /// Neither a total nor a date: the image did not become a draft (AI-3).
  bool get isEmpty => total == null && date == null;
}

DateTime? _day(Object? value) {
  if (value is! String) return null;
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(value);
  if (m == null) return null;
  final day = DateTime(int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
  // DateTime rolls 2026-02-31 over to March; that is a misread, not a date.
  return day.month == int.parse(m[2]!) && day.day == int.parse(m[3]!)
      ? day
      : null;
}
