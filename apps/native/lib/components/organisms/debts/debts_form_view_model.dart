import 'package:flutter/foundation.dart';
import 'package:oewang/core/command/command.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/contacts_repository.dart';
import 'package:oewang/data/repositories/debts_repository.dart';
import 'package:oewang/domain/models/contact.dart';
import 'package:oewang/domain/models/debt.dart';

class DebtFormState {
  const DebtFormState({
    this.contactId,
    this.type = DebtType.receivable,
    this.amount = 0,
    this.description = '',
    this.dueDate,
  });

  final String? contactId;
  final DebtType type;
  final num amount;
  final String description;
  final DateTime? dueDate;

  bool get isValid => contactId != null && amount > 0;

  DebtFormState copyWith({
    String? contactId,
    DebtType? type,
    num? amount,
    String? description,
    DateTime? dueDate,
  }) => DebtFormState(
    contactId: contactId ?? this.contactId,
    type: type ?? this.type,
    amount: amount ?? this.amount,
    description: description ?? this.description,
    dueDate: dueDate ?? this.dueDate,
  );
}

/// Owns the debt form state and the Save command (create or update). On edit
/// the type and contact are fixed (matches the web) — only amount, due date,
/// and description change.
class DebtFormViewModel extends ChangeNotifier {
  DebtFormViewModel({
    required DebtsRepository debts,
    required ContactsRepository contacts,
    Debt? editing,
  }) : _debts = debts,
       _contacts = contacts,
       _editingId = editing?.id,
       _editingContactName = editing?.contactName {
    if (editing != null) {
      _state = DebtFormState(
        contactId: editing.contactId,
        type: editing.type,
        amount: editing.amount.amount,
        description: editing.description ?? '',
        dueDate: editing.dueDate,
      );
    }
    save = Command<void, void>(_runSave)..addListener(notifyListeners);
    if (!isEditing) _loadContacts();
  }

  final DebtsRepository _debts;
  final ContactsRepository _contacts;
  final String? _editingId;
  final String? _editingContactName;

  bool get isEditing => _editingId != null;
  String get editingContactName => _editingContactName ?? '';

  DebtFormState _state = const DebtFormState();
  List<Contact> _contactOptions = const [];

  late final Command<void, void> save;

  DebtFormState get state => _state;
  List<Contact> get contactOptions => _contactOptions;
  bool get canSave => _state.isValid && !save.running;

  void setType(DebtType type) {
    _state = _state.copyWith(type: type);
    notifyListeners();
  }

  void setContact(String id) {
    _state = _state.copyWith(contactId: id);
    notifyListeners();
  }

  void setAmount(num amount) {
    _state = _state.copyWith(amount: amount);
    notifyListeners();
  }

  void setDescription(String value) {
    _state = _state.copyWith(description: value);
    notifyListeners();
  }

  void setDueDate(DateTime date) {
    _state = _state.copyWith(dueDate: date);
    notifyListeners();
  }

  /// Creates a contact by name, adds it to the options, and selects it.
  Future<void> addContact(String name) async {
    final res = await _contacts.create(name: name);
    res.fold((c) {
      _contactOptions = [c, ..._contactOptions];
      _state = _state.copyWith(contactId: c.id);
    }, (_) {});
    notifyListeners();
  }

  Future<Result<void, AppError>?> submit() async {
    if (!_state.isValid) return null;
    await save.run(null);
    final err = save.error;
    if (err != null) return Failure<void, AppError>(err);
    return const Success<void, AppError>(null);
  }

  Future<Result<void, AppError>> _runSave(void _) {
    final id = _editingId;
    return id == null
        ? _debts.create(
            contactId: _state.contactId!,
            type: _state.type,
            amount: _state.amount,
            description: _state.description,
            dueDate: _state.dueDate,
          )
        : _debts.update(
            id: id,
            amount: _state.amount,
            description: _state.description,
            dueDate: _state.dueDate,
          );
  }

  Future<void> _loadContacts() async {
    final res = await _contacts.list();
    res.fold((cs) => _contactOptions = cs, (_) => _contactOptions = const []);
    notifyListeners();
  }

  @override
  void dispose() {
    save
      ..removeListener(notifyListeners)
      ..dispose();
    super.dispose();
  }
}
