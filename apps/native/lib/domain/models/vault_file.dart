import 'package:flutter/foundation.dart';

/// A file stored in the workspace vault (`POST /vault/upload`). Used to
/// attach a receipt image to a transaction via `attachmentIds`.
@immutable
class VaultFile {
  const VaultFile({required this.id, this.name, this.type, this.size});

  final String id;
  final String? name;
  final String? type;
  final int? size;
}
