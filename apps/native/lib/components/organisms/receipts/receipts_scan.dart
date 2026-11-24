import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:oewang/components/molecules/confirm_dialog.dart';
import 'package:oewang/components/organisms/receipts/receipts_scan_view_model.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/core/router/app_router.dart';

/// Scan a receipt from the camera or the gallery (MOB-8) and open the
/// transaction form on what was read. Writers only: both the upload and the
/// parse are admin+ routes.
Future<void> scanReceipt(BuildContext context, WidgetRef ref) async {
  final source = await showModalBottomSheet<ImageSource>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: const Text('Take photo'),
            onTap: () => Navigator.of(ctx).pop(ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Choose from gallery'),
            onTap: () => Navigator.of(ctx).pop(ImageSource.gallery),
          ),
        ],
      ),
    ),
  );
  if (source == null) return;

  // Re-encoded as JPEG at this size, a photo lands near 1 MB: well inside
  // the vault's 10 MB, and enough resolution for the reader.
  final picked = await ImagePicker().pickImage(
    source: source,
    maxWidth: 2000,
    maxHeight: 2000,
    imageQuality: 85,
  );
  if (picked == null || !context.mounted) return;

  final vm = ReceiptScanViewModel(
    vault: ref.read(vaultRepositoryProvider),
    receipts: ref.read(receiptsRepositoryProvider),
  );
  final navigator = Navigator.of(context, rootNavigator: true);
  final messenger = ScaffoldMessenger.of(context);
  void say(String text) =>
      messenger.showSnackBar(SnackBar(content: Text(text)));

  unawaited(
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      useRootNavigator: true,
      builder: (_) => const PopScope(
        canPop: false,
        child: AlertDialog(
          content: Row(
            children: [
              CircularProgressIndicator.adaptive(),
              SizedBox(width: 16),
              Text('Reading the receipt'),
            ],
          ),
        ),
      ),
    ),
  );
  final outcome = await vm.scan(File(picked.path));
  navigator.pop();
  if (!context.mounted) return;

  switch (outcome) {
    case ReceiptScanDraft(:final draft, :final readable):
      if (!readable) say('Could not read this receipt. Enter it by hand.');
      await context.push(AppRoutes.transactionForm, extra: draft);
    case ReceiptScanBusy(:final vaultFileId):
      final queue = await showConfirmDialog(
        context,
        title: 'The reader is busy',
        message:
            'The receipt is saved in the vault. Queue it to be read '
            'when the reader is back?',
        confirmLabel: 'Queue',
        isDestructive: false,
      );
      if (!queue) return;
      switch (await vm.queue(vaultFileId)) {
        case Success():
          say('Queued. It will be read shortly.');
        case Failure(:final error):
          say(error.message);
      }
    case ReceiptScanFailed(:final error):
      say(error.message);
  }
}
