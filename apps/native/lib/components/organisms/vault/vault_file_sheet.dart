import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/molecules/confirm_dialog.dart';
import 'package:oewang/components/molecules/rename_dialog.dart';
import 'package:oewang/components/organisms/vault/vault_view_model.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/vault_file.dart';
import 'package:share_plus/share_plus.dart';

/// One file: preview, details, and its actions (vault.md#the-file-sheet).
/// Rename and delete are a writer's; opening and sharing are anyone's.
Future<void> showVaultFileSheet(
  BuildContext context, {
  required VaultViewModel vm,
  required VaultFile file,
  required bool canWrite,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) => _VaultFileSheet(vm: vm, file: file, canWrite: canWrite),
);

class _VaultFileSheet extends StatefulWidget {
  const _VaultFileSheet({
    required this.vm,
    required this.file,
    required this.canWrite,
  });

  final VaultViewModel vm;
  final VaultFile file;
  final bool canWrite;

  @override
  State<_VaultFileSheet> createState() => _VaultFileSheetState();
}

class _VaultFileSheetState extends State<_VaultFileSheet> {
  late VaultFile _file = widget.file;

  /// The whole file, fetched once for the preview and reused to share.
  late final Future<Result<Uint8List, Object>> _bytes = widget.vm.download(
    widget.file,
  );

  void _say(String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  Future<void> _share() async {
    final res = await _bytes;
    if (!mounted) return;
    switch (res) {
      case Success(:final value):
        await SharePlus.instance.share(
          ShareParams(
            files: [
              XFile.fromData(value, mimeType: _file.type, name: _file.name),
            ],
            fileNameOverrides: [_file.name ?? 'file'],
          ),
        );
      case Failure(:final error):
        _say('$error');
    }
  }

  Future<void> _rename() async {
    final name = await showRenameDialog(context, _file.name ?? '');
    if (name == null || !mounted) return;
    final error = await widget.vm.rename(_file, name);
    if (!mounted) return;
    if (error != null) return _say(error.message);
    setState(
      () => _file = widget.vm.files.firstWhere(
        (f) => f.id == _file.id,
        orElse: () => _file,
      ),
    );
  }

  Future<void> _delete() async {
    final used = _file.usedBy;
    final ok = await showConfirmDialog(
      context,
      title: 'Delete ${_file.name ?? 'file'}?',
      message: used > 0
          ? 'The file is removed from the vault. It is attached to $used '
                'transaction${used == 1 ? '' : 's'}, which will lose it.'
          : 'The file is removed from the vault.',
    );
    if (!ok || !mounted) return;
    final error = await widget.vm.delete(_file);
    if (!mounted) return;
    if (error != null) return _say(error.message);
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final muted = OewangFonts.sans(
      color: palette.mutedForeground,
      fontSize: 13,
    );
    final size = _file.size;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          OewangSpacing.lg,
          0,
          OewangSpacing.lg,
          OewangSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    _file.name ?? '',
                    style: OewangFonts.sans(
                      color: palette.foreground,
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                if (widget.canWrite)
                  IconButton(
                    tooltip: 'Rename',
                    onPressed: _rename,
                    icon: const Icon(Icons.edit_outlined),
                  ),
              ],
            ),
            const SizedBox(height: OewangSpacing.sm),
            AspectRatio(
              aspectRatio: 16 / 9,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(OewangRadius.lg),
                child: ColoredBox(
                  color: palette.muted,
                  child: _file.isImage
                      ? FutureBuilder(
                          future: _bytes,
                          builder: (_, snap) => switch (snap.data) {
                            Success(:final value) => Image.memory(
                              value,
                              fit: BoxFit.contain,
                              // Bytes that do not decode, as the API's
                              // own preview refuses them (D91).
                              errorBuilder: (_, _, _) => Icon(
                                Icons.broken_image_outlined,
                                color: palette.mutedForeground,
                              ),
                            ),
                            Failure() => Icon(
                              Icons.broken_image_outlined,
                              color: palette.mutedForeground,
                            ),
                            null => const Center(
                              child: CircularProgressIndicator.adaptive(),
                            ),
                          },
                        )
                      : Icon(
                          Icons.picture_as_pdf_outlined,
                          size: 48,
                          color: palette.mutedForeground,
                        ),
                ),
              ),
            ),
            const SizedBox(height: OewangSpacing.md),
            Text(
              [
                (_file.type ?? '').split('/').last.toUpperCase(),
                if (size != null) formatFileSize(size),
                if (_file.createdAt != null)
                  DateFormat('d MMM yyyy').format(_file.createdAt!.toLocal()),
                'used by ${_file.usedBy}',
              ].join(' · '),
              style: muted,
            ),
            if (_file.tags.isNotEmpty) ...[
              const SizedBox(height: OewangSpacing.sm),
              Wrap(
                spacing: OewangSpacing.xs,
                children: [for (final t in _file.tags) Chip(label: Text(t))],
              ),
            ],
            const SizedBox(height: OewangSpacing.lg),
            Button(label: 'Open or share', onPressed: _share),
            if (widget.canWrite) ...[
              const SizedBox(height: OewangSpacing.sm),
              Button(
                label: 'Delete',
                variant: ButtonVariant.danger,
                onPressed: _delete,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Bytes in words: "512 KB", "1.4 MB".
String formatFileSize(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}
