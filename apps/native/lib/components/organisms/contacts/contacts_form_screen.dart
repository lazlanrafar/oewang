import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/atoms/section_label.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/contact.dart';

/// Add (when [contact] is null) or edit a contact: name, email, phone and a
/// note (CON-1). Pops `true` on success, sent or queued (MOB-10).
class ContactFormScreen extends ConsumerStatefulWidget {
  const ContactFormScreen({this.contact, super.key});
  final Contact? contact;

  @override
  ConsumerState<ContactFormScreen> createState() => _ContactFormScreenState();
}

class _ContactFormScreenState extends ConsumerState<ContactFormScreen> {
  late final _name = TextEditingController(text: widget.contact?.name ?? '');
  late final _email = TextEditingController(text: widget.contact?.email ?? '');
  late final _phone = TextEditingController(text: widget.contact?.phone ?? '');
  late final _note = TextEditingController(text: widget.contact?.note ?? '');
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_name, _email, _phone, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final repo = ref.read(contactsRepositoryProvider);
    final c = widget.contact;
    final res = c == null
        ? await repo.create(
            name: _name.text,
            email: _email.text,
            phone: _phone.text,
            note: _note.text,
          )
        : await repo.update(
            id: c.id,
            name: _name.text,
            email: _email.text,
            phone: _phone.text,
            note: _note.text,
          );
    if (!mounted) return;
    setState(() => _saving = false);
    res.fold(
      (_) => Navigator.of(context).pop(true),
      (e) => setState(() => _error = e.message),
    );
  }

  Widget _field(String label, TextEditingController c, {TextInputType? type}) =>
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: Input(controller: c, hintText: label, keyboardType: type),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: PageAppBar(
        title: widget.contact == null ? 'Add' : 'Edit',
        backLabel: 'Contacts',
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                children: [
                  const SectionLabel('Contact'),
                  _field('Name', _name),
                  _field('Email', _email, type: TextInputType.emailAddress),
                  _field('Phone', _phone, type: TextInputType.phone),
                  const SectionLabel('Notes'),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    child: Input(
                      controller: _note,
                      hintText: 'Optional note',
                      maxLines: 5,
                      minLines: 3,
                    ),
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        _error!,
                        textAlign: TextAlign.center,
                        style: OewangFonts.sans(color: OewangColors.coral),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: ListenableBuilder(
                listenable: _name,
                builder: (context, _) => Button(
                  label: 'Save',
                  loading: _saving,
                  onPressed: _name.text.trim().isEmpty ? null : _save,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
