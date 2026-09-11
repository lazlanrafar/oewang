import 'package:flutter/material.dart';
import 'package:flutter_contacts/flutter_contacts.dart' as fc;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_host.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_metrics.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_field_row.dart';
import 'package:oewang/components/atoms/inputs/contexts/input_context_select.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/atoms/section_label.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/molecules/segmented_tabs.dart';
import 'package:oewang/components/organisms/debts/debts_form_view_model.dart';
import 'package:oewang/components/organisms/debts/import_contacts_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/contact.dart';
import 'package:oewang/domain/models/debt.dart';

final debtFormVmProvider = ChangeNotifierProvider.autoDispose
    .family<DebtFormViewModel, Debt?>(
      (ref, editing) => DebtFormViewModel(
        debts: ref.watch(debtsRepositoryProvider),
        contacts: ref.watch(contactsRepositoryProvider),
        editing: editing,
      ),
    );

T? _firstOrNull<T>(Iterable<T> items, bool Function(T) test) {
  for (final item in items) {
    if (test(item)) return item;
  }
  return null;
}

/// Create / edit a debt. On edit the type and contact are fixed (matches the
/// web) — only the amount, due date, and notes change.
class DebtFormScreen extends ConsumerStatefulWidget {
  const DebtFormScreen({super.key, this.debt});

  final Debt? debt;

  @override
  ConsumerState<DebtFormScreen> createState() => _DebtFormScreenState();
}

class _DebtFormScreenState extends ConsumerState<DebtFormScreen> {
  static const _labelWidth = 110.0;
  late final TextEditingController _notes = TextEditingController(
    text: widget.debt?.description ?? '',
  );
  bool _autoOpenedContact = false;

  void _maybeAutoOpenContact(BuildContext context, DebtFormViewModel vm) {
    if (_autoOpenedContact ||
        vm.isEditing ||
        vm.state.contactId != null ||
        vm.contactOptions.isEmpty) {
      return;
    }
    _autoOpenedContact = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      openListDrawer<Contact>(
        context,
        id: 'Contact',
        title: 'Contact',
        items: vm.contactOptions,
        labelOf: (c) => c.name,
        idOf: (c) => c.id,
        searchable: true,
        extraHeaderActions: [_importContactsButton(vm)],
        onSelected: (c) => vm.setContact(c.id),
      );
    });
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _onSave() async {
    final vm = ref.read(debtFormVmProvider(widget.debt));
    final res = await vm.submit();
    if (res == null || !mounted) return;
    res.fold(
      (_) {
        ref.read(debtsRevisionProvider.notifier).bump();
        Navigator.of(context).pop(true);
      },
      (_) {
        /* error rendered via VM */
      },
    );
  }

  Future<void> _newContact(DebtFormViewModel vm) async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New contact'),
        content: Input(controller: controller, autofocus: true, hintText: 'Name'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: const Text('Add'),
          ),
        ],
      ),
    );
    if (name != null && name.isNotEmpty) await vm.addContact(name);
  }

  Widget _importContactsButton(DebtFormViewModel vm) {
    return IconButton(
      tooltip: 'Import from phone',
      visualDensity: VisualDensity.compact,
      onPressed: () => _importFromPhone(vm),
      icon: const Icon(Icons.contacts, color: DrawerMetrics.onHeader),
    );
  }

  Future<void> _importFromPhone(DebtFormViewModel vm) async {
    final granted = await fc.FlutterContacts.requestPermission();
    if (!granted) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Contacts permission denied.')),
      );
      return;
    }
    final device = await fc.FlutterContacts.getContacts(withProperties: true);
    final existing = vm.contactOptions.map((c) => c.name.toLowerCase()).toSet();
    final seen = <String>{};
    final candidates = <(String, String?)>[];
    for (final c in device) {
      final name = c.displayName.trim();
      if (name.isEmpty) continue;
      final key = name.toLowerCase();
      if (existing.contains(key) || !seen.add(key)) continue;
      final phone = c.phones.isEmpty ? null : c.phones.first.number;
      candidates.add((name, phone));
    }
    if (!mounted) return;
    if (candidates.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No new contacts to import.')),
      );
      return;
    }
    final picked = await Navigator.of(context).push<List<(String, String?)>>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => ImportContactsScreen(candidates: candidates),
      ),
    );
    if (picked == null || picked.isEmpty || !mounted) return;
    final created = await vm.importContacts(picked);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Imported $created contact${created == 1 ? '' : 's'}.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final vm = ref.watch(debtFormVmProvider(widget.debt));
    final palette = context.palette;
    final dueDate = vm.state.dueDate;

    return Scaffold(
      appBar: PageAppBar(
        title: vm.isEditing ? 'Edit' : 'Add',
        backLabel: 'Debts',
      ),
      body: SafeArea(
        child: FormDrawerHost(
          child: Column(
            children: [
              Expanded(
                child: Builder(
                  builder: (context) {
                    _maybeAutoOpenContact(context, vm);
                    return ListView(
                  padding: EdgeInsets.zero,
                  children: [
                    if (!vm.isEditing)
                      OewangSegmentedTabs<DebtType>(
                        selected: vm.state.type,
                        onChanged: vm.setType,
                        segments: const [
                          SegmentItem(
                            value: DebtType.receivable,
                            label: 'Owed to you',
                          ),
                          SegmentItem(
                            value: DebtType.payable,
                            label: 'You owe',
                          ),
                        ],
                      ),
                    if (vm.isEditing)
                      FormFieldRow(
                        label: 'Contact',
                        labelWidth: _labelWidth,
                        underline: true,
                        child: Text(
                          vm.editingContactName,
                          style: OewangFonts.sans(color: palette.foreground),
                        ),
                      )
                    else
                      Input(
                        context: InputContext.select,
                        label: 'Contact',
                        variant: InputVariant.underline,
                        labelWidth: _labelWidth,
                        placeholder: 'Choose a contact',
                        trailing: TextButton(
                          onPressed: () => _newContact(vm),
                          child: Text('New', style: OewangFonts.sans()),
                        ),
                        entity: EntitySelect<Contact>(
                          value: _firstOrNull(
                            vm.contactOptions,
                            (c) => c.id == vm.state.contactId,
                          ),
                          items: vm.contactOptions,
                          labelOf: (c) => c.name,
                          idOf: (c) => c.id,
                          searchable: true,
                          extraHeaderActions: [_importContactsButton(vm)],
                          onSelected: (c) => vm.setContact(c.id),
                        ),
                      ),
                    Input(
                      context: InputContext.amount,
                      label: 'Amount',
                      variant: InputVariant.underline,
                      labelWidth: _labelWidth,
                      amount: vm.state.amount,
                      onAmountChanged: vm.setAmount,
                    ),
                    Input(
                      context: InputContext.date,
                      label: 'Due date',
                      variant: InputVariant.underline,
                      labelWidth: _labelWidth,
                      placeholder: 'Optional',
                      date: dueDate,
                      datePattern: 'EEE, dd/MM/yyyy',
                      onDateChanged: vm.setDueDate,
                    ),
                    const SizedBox(height: 24),
                    Container(height: 8, color: palette.muted),
                    const SectionLabel('Notes'),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      child: Input(
                        variant: InputVariant.underline,
                        controller: _notes,
                        hintText: 'Optional note',
                        maxLines: 5,
                        minLines: 3,
                        onChanged: vm.setDescription,
                      ),
                    ),
                    if (vm.save.error != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                        child: Text(
                          vm.save.error!.message,
                          textAlign: TextAlign.center,
                          style: OewangFonts.sans(color: OewangColors.coral),
                        ),
                      ),
                  ],
                    );
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Button(
                  label: 'Save',
                  loading: vm.save.running,
                  onPressed: vm.canSave ? _onSave : null,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Receivable / payable segmented selector shown only when creating.
