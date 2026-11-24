import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/vault_repository.dart';
import 'package:oewang/domain/models/vault_file.dart';

/// The vault list (VLT-6): filters, paging, previews and the writes a
/// writer may make. Filters run on the server across every page.
class VaultViewModel extends ChangeNotifier {
  VaultViewModel(this._repo) {
    unawaited(reload());
  }

  final VaultRepository _repo;
  bool _disposed = false;
  int _page = 1;
  int _generation = 0;

  VaultQuery query = const VaultQuery();
  List<VaultFile> files = const [];
  bool hasMore = false;
  bool loading = false;
  bool uploading = false;
  AppError? error;

  /// Previews by file id; null once one was refused, so it is asked once.
  final Map<String, Uint8List?> thumbnails = {};

  void setQuery(VaultQuery next) {
    query = next;
    unawaited(reload());
  }

  Future<void> reload() async {
    _page = 1;
    files = const [];
    await _fetch();
  }

  Future<void> loadMore() async {
    if (!hasMore || loading) return;
    _page++;
    await _fetch();
  }

  Future<void> _fetch() async {
    // A filter changed while a page was in flight: drop the stale answer.
    final generation = ++_generation;
    loading = true;
    error = null;
    _notify();
    final res = await _repo.list(query, page: _page);
    if (generation != _generation) return;
    loading = false;
    switch (res) {
      case Success(:final value):
        files = [...files, ...value.files];
        hasMore = value.hasMore;
      case Failure(error: final e):
        error = e;
    }
    _notify();
  }

  Future<void> loadThumbnail(VaultFile file) async {
    if (!file.hasPreview || thumbnails.containsKey(file.id)) return;
    thumbnails[file.id] = null;
    final res = await _repo.thumbnail(file.id);
    if (res case Success(:final value)) {
      thumbnails[file.id] = value;
      _notify();
    }
  }

  Future<AppError?> upload(File file) async {
    uploading = true;
    _notify();
    final res = await _repo.upload(file);
    uploading = false;
    _notify();
    if (res case Failure(:final error)) return error;
    await reload();
    return null;
  }

  /// One file's metadata by id, for a push that names it (PUSH-5).
  Future<Result<VaultFile, AppError>> file(String id) => _repo.get(id);

  Future<Result<Uint8List, AppError>> download(VaultFile file) =>
      _repo.download(file);

  Future<AppError?> rename(VaultFile file, String name) async {
    final res = await _repo.rename(file.id, name);
    switch (res) {
      case Success(:final value):
        // The PATCH answer carries no `used_by`; keep the list's.
        final renamed = VaultFile(
          id: file.id,
          name: value.name,
          type: file.type,
          size: file.size,
          tags: file.tags,
          thumbnail: file.thumbnail,
          usedBy: file.usedBy,
          createdAt: file.createdAt,
        );
        files = [for (final f in files) f.id == file.id ? renamed : f];
        _notify();
        return null;
      case Failure(:final error):
        return error;
    }
  }

  Future<AppError?> delete(VaultFile file) async {
    final res = await _repo.delete(file.id);
    if (res case Failure(:final error)) return error;
    files = files.where((f) => f.id != file.id).toList();
    _notify();
    return null;
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
