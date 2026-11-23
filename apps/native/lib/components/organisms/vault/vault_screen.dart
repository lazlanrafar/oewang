import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/organisms/vault/vault_file_sheet.dart';
import 'package:oewang/components/organisms/vault/vault_view_model.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/vault_file.dart';

final vaultVmProvider = ChangeNotifierProvider.autoDispose<VaultViewModel>(
  (ref) => VaultViewModel(ref.watch(vaultRepositoryProvider)),
);

/// The workspace's files (D90), as the web's `/vault` grid: search, type and
/// sort on the server, 30 at a time, previews from the API's thumbnails.
class VaultScreen extends ConsumerStatefulWidget {
  const VaultScreen({super.key});

  @override
  ConsumerState<VaultScreen> createState() => _VaultScreenState();
}

class _VaultScreenState extends ConsumerState<VaultScreen> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _upload(VaultViewModel vm) async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 2000,
      maxHeight: 2000,
      imageQuality: 85,
    );
    if (picked == null) return;
    final error = await vm.upload(File(picked.path));
    if (error != null && mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final vm = ref.watch(vaultVmProvider);
    final canWrite = ref.watch(canWriteProvider);
    final palette = context.palette;
    final muted = OewangFonts.sans(
      color: palette.mutedForeground,
      fontSize: 13,
    );
    final q = vm.query;

    Widget body;
    if (vm.files.isEmpty && vm.loading) {
      body = const Center(child: CircularProgressIndicator.adaptive());
    } else if (vm.files.isEmpty && vm.error != null) {
      body = Center(child: Text(vm.error!.message, style: muted));
    } else if (vm.files.isEmpty && q.isFiltered) {
      body = Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('No files match these filters.', style: muted),
            TextButton(
              onPressed: () {
                _search.clear();
                vm.setQuery(VaultQuery(sort: q.sort));
              },
              child: const Text('Clear filters'),
            ),
          ],
        ),
      );
    } else if (vm.files.isEmpty) {
      body = Center(
        child: Text(
          'No files yet. Receipts and statements you upload land here.',
          style: muted,
          textAlign: TextAlign.center,
        ),
      );
    } else {
      body = NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.extentAfter < 400) unawaited(vm.loadMore());
          return false;
        },
        child: GridView.builder(
          padding: const EdgeInsets.all(OewangSpacing.lg),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            mainAxisSpacing: OewangSpacing.md,
            crossAxisSpacing: OewangSpacing.md,
            childAspectRatio: 0.78,
          ),
          itemCount: vm.files.length,
          itemBuilder: (_, i) => _Tile(
            vm: vm,
            file: vm.files[i],
            onTap: () => showVaultFileSheet(
              context,
              vm: vm,
              file: vm.files[i],
              canWrite: canWrite,
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: PageAppBar(
        title: 'Vault',
        actions: [
          if (canWrite)
            vm.uploading
                ? const Padding(
                    padding: EdgeInsets.all(OewangSpacing.md),
                    child: CircularProgressIndicator.adaptive(),
                  )
                : IconButton(
                    tooltip: 'Upload',
                    onPressed: () => _upload(vm),
                    icon: const Icon(Icons.upload_outlined),
                  ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                OewangSpacing.lg,
                OewangSpacing.sm,
                OewangSpacing.lg,
                0,
              ),
              child: TextField(
                controller: _search,
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  hintText: 'Search files',
                  prefixIcon: Icon(Icons.search),
                ),
                onSubmitted: (text) => vm.setQuery(
                  VaultQuery(search: text.trim(), type: q.type, sort: q.sort),
                ),
              ),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: OewangSpacing.lg),
              child: Row(
                children: [
                  for (final (type, label) in const [
                    (null, 'All'),
                    ('image', 'Images'),
                    ('pdf', 'PDFs'),
                  ])
                    Padding(
                      padding: const EdgeInsets.only(right: OewangSpacing.sm),
                      child: ChoiceChip(
                        label: Text(label),
                        selected: q.type == type,
                        onSelected: (_) => vm.setQuery(
                          VaultQuery(
                            search: q.search,
                            type: type,
                            sort: q.sort,
                          ),
                        ),
                      ),
                    ),
                  PopupMenuButton<String>(
                    tooltip: 'Sort',
                    initialValue: q.sort,
                    icon: const Icon(Icons.sort),
                    onSelected: (sort) => vm.setQuery(
                      VaultQuery(search: q.search, type: q.type, sort: sort),
                    ),
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'newest', child: Text('Newest')),
                      PopupMenuItem(value: 'name_asc', child: Text('Name A-Z')),
                      PopupMenuItem(
                        value: 'name_desc',
                        child: Text('Name Z-A'),
                      ),
                      PopupMenuItem(value: 'size_desc', child: Text('Largest')),
                      PopupMenuItem(value: 'size_asc', child: Text('Smallest')),
                    ],
                  ),
                ],
              ),
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.vm, required this.file, required this.onTap});

  final VaultViewModel vm;
  final VaultFile file;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    unawaited(vm.loadThumbnail(file));
    final thumb = vm.thumbnails[file.id];
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(OewangRadius.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(OewangRadius.lg),
              child: ColoredBox(
                color: palette.muted,
                child: SizedBox.expand(
                  child: thumb != null
                      ? Image.memory(thumb, fit: BoxFit.cover)
                      : Icon(
                          file.isImage
                              ? Icons.image_outlined
                              : Icons.picture_as_pdf_outlined,
                          color: palette.mutedForeground,
                        ),
                ),
              ),
            ),
          ),
          const SizedBox(height: OewangSpacing.xs),
          Text(
            file.name ?? '',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: OewangFonts.sans(color: palette.foreground, fontSize: 12),
          ),
          Text(
            formatFileSize(file.size ?? 0),
            style: OewangFonts.sans(
              color: palette.mutedForeground,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}
