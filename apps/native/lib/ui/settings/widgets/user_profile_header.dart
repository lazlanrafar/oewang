import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/user_profile.dart';

/// FutureProvider keyed on the session so a relogin re-fetches the profile.
final userProfileProvider = FutureProvider.autoDispose<UserProfile?>((
  ref,
) async {
  // Rebuild when a refresh happens (workspace switched + JWT re-issued).
  ref.watch(sessionControllerProvider);
  final session = ref.read(sessionControllerProvider).valueOrNull;
  if (session == null) return null;
  final res = await ref.read(usersRepositoryProvider).getProfile();
  return res.fold((ok) => ok, (_) => null);
});

/// Inline profile header that sits at the very top of the More tab — centered
/// medium avatar with a camera badge, name (tap pencil to edit), email below.
class UserProfileHeader extends ConsumerWidget {
  const UserProfileHeader({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(userProfileProvider);
    return async.when(
      data: (profile) =>
          profile == null ? const _Skeleton() : _Body(profile: profile),
      loading: () => const _Skeleton(),
      error: (_, _) => const _Skeleton(),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.profile});
  final UserProfile profile;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _saving = false;

  Future<void> _pickAvatar() async {
    if (_saving) return;
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 90,
    );
    if (picked == null || !mounted) return;
    setState(() => _saving = true);
    final res = await ref
        .read(usersRepositoryProvider)
        .uploadAvatar(File(picked.path));
    if (!mounted) return;
    setState(() => _saving = false);
    res.fold(
      (_) => ref.invalidate(userProfileProvider),
      (e) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      ),
    );
  }

  Future<void> _editName() async {
    if (_saving) return;
    final newName = await showDialog<String>(
      context: context,
      builder: (ctx) =>
          _EditNameDialog(initial: widget.profile.name ?? ''),
    );
    if (newName == null || newName.isEmpty || !mounted) return;
    if (newName == widget.profile.name) return;
    setState(() => _saving = true);
    final res =
        await ref.read(usersRepositoryProvider).updateProfile(name: newName);
    if (!mounted) return;
    setState(() => _saving = false);
    res.fold(
      (_) => ref.invalidate(userProfileProvider),
      (e) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 32, 16, 16),
      child: Column(
        children: [
          GestureDetector(
            onTap: _pickAvatar,
            child: Stack(
              children: [
                _Avatar(profile: widget.profile, palette: palette, size: 96),
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Material(
                    color: palette.primary,
                    shape: const CircleBorder(),
                    elevation: 2,
                    child: InkWell(
                      onTap: _saving ? null : _pickAvatar,
                      customBorder: const CircleBorder(),
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Icon(
                          Icons.photo_camera,
                          size: 16,
                          color: palette.primaryForeground,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          GestureDetector(
            onTap: _editName,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  widget.profile.displayName,
                  style: OewangFonts.sans(
                    color: palette.foreground,
                    fontSize: 20,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 6),
                Icon(
                  Icons.edit_outlined,
                  size: 16,
                  color: palette.mutedForeground,
                ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          Text(
            widget.profile.email,
            style: OewangFonts.sans(
              color: palette.mutedForeground,
              fontSize: 14,
            ),
          ),
          if (_saving) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: palette.foreground,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.profile,
    required this.palette,
    required this.size,
  });

  final UserProfile profile;
  final OewangPalette palette;
  final double size;

  @override
  Widget build(BuildContext context) {
    final initial = profile.displayName.isNotEmpty
        ? profile.displayName[0].toUpperCase()
        : '?';
    final fallback = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: palette.muted,
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        initial,
        style: OewangFonts.sans(
          color: palette.foreground,
          fontSize: size * 0.4,
          fontWeight: FontWeight.w500,
        ),
      ),
    );

    final url = profile.profilePicture;
    if (url == null || url.isEmpty || url.startsWith('fake://')) {
      return fallback;
    }
    return ClipOval(
      child: CachedNetworkImage(
        imageUrl: url,
        width: size,
        height: size,
        fit: BoxFit.cover,
        placeholder: (_, _) => fallback,
        errorWidget: (_, _, _) => fallback,
      ),
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 32, 16, 16),
      child: Column(
        children: [
          Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(
              color: palette.muted,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(height: 16),
          Container(height: 16, width: 140, color: palette.muted),
          const SizedBox(height: 6),
          Container(height: 12, width: 100, color: palette.muted),
        ],
      ),
    );
  }
}

/// Owns its TextEditingController so it lives exactly as long as the dialog,
/// avoiding "used after dispose" during the dismiss animation.
class _EditNameDialog extends StatefulWidget {
  const _EditNameDialog({required this.initial});
  final String initial;

  @override
  State<_EditNameDialog> createState() => _EditNameDialogState();
}

class _EditNameDialogState extends State<_EditNameDialog> {
  late final _ctl = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return AlertDialog(
      backgroundColor: palette.card,
      title: Text(
        'Edit name',
        style: OewangFonts.sans(color: palette.foreground),
      ),
      content: TextField(
        controller: _ctl,
        autofocus: true,
        decoration: const InputDecoration(hintText: 'Your name'),
        style: OewangFonts.sans(color: palette.foreground),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(_ctl.text.trim()),
          child: const Text('Save'),
        ),
      ],
    );
  }
}
