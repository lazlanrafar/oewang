import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/molecules/confirm_dialog.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/contact.dart';

final _contactsProvider = FutureProvider.autoDispose<List<Contact>>((
  ref,
) async {
  ref.watch(debtsRevisionProvider);
  final res = await ref.watch(contactsRepositoryProvider).list();
  return res.fold((c) => c, (e) => throw e);
});

/// The people debts are with (CON-2), adapted from the web's `/contacts`
/// with the old app's list rows: search, add, edit, merge into another
/// contact (CON-4) and delete (CON-3). A member only reads (MOB-5).
class ContactsScreen extends ConsumerStatefulWidget {
  const ContactsScreen({super.key});

  @override
  ConsumerState<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends ConsumerState<ContactsScreen> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _bump() => ref.read(debtsRevisionProvider.notifier).bump();

  void _error(String message) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(message)));

  Future<void> _add() async {
    final saved = await context.push<bool>(AppRoutes.contactForm);
    if (saved ?? false) _bump();
  }

  Future<void> _edit(Contact c) async {
    final saved = await context.push<bool>(
      AppRoutes.contactEditFor(c.id),
      extra: c,
    );
    if (saved ?? false) _bump();
  }

  Future<void> _delete(Contact c) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Delete contact',
      message: 'Delete "${c.name}"?',
    );
    if (!ok) return;
    final res = await ref.read(contactsRepositoryProvider).delete(c.id);
    if (!mounted) return;
    res.fold((_) => _bump(), (e) => _error(e.message));
  }

  Future<void> _merge(Contact c, List<Contact> all) async {
    final palette = context.palette;
    final others = [
      for (final o in all)
        if (o.id != c.id) o,
    ];
    final into = await showModalBottomSheet<Contact>(
      context: context,
      builder: (sheet) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            ListTile(
              title: Text(
                'Merge "${c.name}" into',
                style: OewangFonts.sans(
                  color: palette.foreground,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            for (final o in others)
              ListTile(
                title: Text(
                  o.name,
                  style: OewangFonts.sans(color: palette.foreground),
                ),
                onTap: () => Navigator.of(sheet).pop(o),
              ),
          ],
        ),
      ),
    );
    if (into == null || !mounted) return;
    final ok = await showConfirmDialog(
      context,
      title: 'Merge contacts',
      message:
          'Move every debt of "${c.name}" to "${into.name}" and delete '
          '"${c.name}"?',
      confirmLabel: 'Merge',
    );
    if (!ok) return;
    final res = await ref
        .read(contactsRepositoryProvider)
        .merge(id: c.id, intoId: into.id);
    if (!mounted) return;
    res.fold((_) => _bump(), (e) => _error(e.message));
  }

  Future<void> _actions(Contact c, List<Contact> all) async {
    final palette = context.palette;
    await showModalBottomSheet<void>(
      context: context,
      builder: (sheet) {
        ListTile tile(
          IconData icon,
          String label,
          VoidCallback run, [
          Color? c,
        ]) => ListTile(
          leading: Icon(icon, color: c ?? palette.foreground),
          title: Text(
            label,
            style: OewangFonts.sans(color: c ?? palette.foreground),
          ),
          onTap: () {
            Navigator.of(sheet).pop();
            run();
          },
        );
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              tile(Icons.edit_outlined, 'Edit', () => _edit(c)),
              if (all.length > 1)
                tile(Icons.merge_type, 'Merge into…', () => _merge(c, all)),
              tile(
                Icons.delete_outline,
                'Delete',
                () => _delete(c),
                OewangColors.coral,
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final canWrite = ref.watch(canWriteProvider);
    final async = ref.watch(_contactsProvider);
    return Scaffold(
      appBar: PageAppBar(
        title: 'Contacts',
        backLabel: 'Debts',
        actions: [
          if (canWrite)
            IconButton(
              tooltip: 'Add contact',
              onPressed: _add,
              icon: Icon(Icons.add, color: palette.foreground),
            ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: Input(
                controller: _search,
                hintText: 'Search name, email or phone',
                onChanged: (_) => setState(() {}),
              ),
            ),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(
                  child: Text(
                    "Couldn't load contacts",
                    style: OewangFonts.sans(color: palette.mutedForeground),
                  ),
                ),
                data: (all) {
                  final q = _search.text.trim().toLowerCase();
                  final visible = [
                    for (final c in all)
                      if (q.isEmpty ||
                          [c.name, c.email, c.phone].any(
                            (f) => f != null && f.toLowerCase().contains(q),
                          ))
                        c,
                  ];
                  if (visible.isEmpty) {
                    return Center(
                      child: Text(
                        all.isEmpty ? 'No contacts yet' : 'No contacts match',
                        style: OewangFonts.sans(color: palette.mutedForeground),
                      ),
                    );
                  }
                  return ListView(
                    children: [
                      for (final c in visible)
                        ListTile(
                          title: Text(
                            c.name,
                            style: OewangFonts.sans(
                              color: palette.foreground,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          subtitle: Text(
                            [c.email, c.phone].whereType<String>().join(' · '),
                            style: OewangFonts.sans(
                              color: palette.mutedForeground,
                              fontSize: 12,
                            ),
                          ),
                          onTap: canWrite ? () => _actions(c, all) : null,
                        ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
