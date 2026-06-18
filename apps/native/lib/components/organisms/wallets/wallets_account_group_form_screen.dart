import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/input.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/wallet_group.dart';

/// Add (when [group] is null) or edit an account group.
/// Always a full page — pops `true` on success so the list can refresh.
class AccountGroupFormScreen extends ConsumerStatefulWidget {
  const AccountGroupFormScreen({this.group, super.key});
  final WalletGroup? group;

  @override
  ConsumerState<AccountGroupFormScreen> createState() =>
      _AccountGroupFormScreenState();
}

class _AccountGroupFormScreenState
    extends ConsumerState<AccountGroupFormScreen> {
  late final _ctl = TextEditingController(text: widget.group?.name ?? '');
  bool _saving = false;
  String? _error;

  bool get _isCreate => widget.group == null;

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final repo = ref.read(walletGroupsRepositoryProvider);
    final name = _ctl.text.trim();
    final res = _isCreate
        ? await repo.create(name: name)
        : await repo.update(id: widget.group!.id, name: name);
    if (!mounted) return;
    setState(() => _saving = false);
    res.fold(
      (_) => Navigator.of(context).pop(true),
      (e) => setState(() => _error = e.message),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: PageAppBar(
        title: _isCreate ? 'Add' : 'Edit',
        backLabel: 'Group',
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Input(controller: _ctl, autofocus: true),
              const SizedBox(height: 16),
              if (_error != null) ...[
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: OewangFonts.sans(color: OewangColors.coral),
                ),
                const SizedBox(height: 12),
              ],
              ListenableBuilder(
                listenable: _ctl,
                builder: (context, _) => Button(
                  label: 'Save',
                  loading: _saving,
                  onPressed: _ctl.text.trim().isEmpty ? null : _save,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
