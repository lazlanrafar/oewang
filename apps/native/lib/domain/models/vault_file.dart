import 'package:flutter/foundation.dart';

/// A file in the workspace vault (`/v1/vault/files`, D90). Its `id` is what a
/// transaction's `attachmentIds` reference. Fields other than [id] are
/// optional because an attachment tile knows only the id.
@immutable
class VaultFile {
  const VaultFile({
    required this.id,
    this.name,
    this.type,
    this.size,
    this.tags = const [],
    this.thumbnail,
    this.usedBy = 0,
    this.createdAt,
  });

  factory VaultFile.fromJson(Map<String, dynamic> json) => VaultFile(
    id: json['id'] as String,
    name: json['name'] as String?,
    type: json['type'] as String?,
    size: (json['size'] as num?)?.toInt(),
    tags: (json['tags'] as List?)?.whereType<String>().toList() ?? const [],
    thumbnail: json['thumbnail'] as bool?,
    usedBy: (json['used_by'] as num?)?.toInt() ?? 0,
    createdAt: DateTime.tryParse(json['created_at'] as String? ?? ''),
  );

  final String id;
  final String? name;
  final String? type;
  final int? size;
  final List<String> tags;

  /// `false` when no preview can be made, `null` until first asked for (D91).
  final bool? thumbnail;

  /// Live transactions carrying this file.
  final int usedBy;
  final DateTime? createdAt;

  bool get isImage => type?.startsWith('image/') ?? false;

  /// Whether a tile should ask for a preview at all (vault.md#thumbnails).
  bool get hasPreview => (thumbnail ?? true) && isImage;
}

/// The vault list's filters (`GET /v1/vault/files`, VLT-6).
@immutable
class VaultQuery {
  const VaultQuery({this.search = '', this.type, this.sort = 'newest'});

  final String search;

  /// `image` or `pdf`; null for every type.
  final String? type;
  final String sort;

  bool get isFiltered => search.isNotEmpty || type != null;
}
