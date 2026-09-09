/// Sync status dictionary. Kept separate from widgets so both supported
/// languages use the same status vocabulary.
class SyncStrings {
  const SyncStrings(this.languageCode);
  final String languageCode;
  bool get _id => languageCode == 'id';
  String pending(int count) => _id
      ? '$count perubahan menunggu sinkronisasi'
      : '$count changes waiting to sync';
  String get failed =>
      _id ? 'Perubahan belum tersinkron' : 'Changes could not sync';
}
