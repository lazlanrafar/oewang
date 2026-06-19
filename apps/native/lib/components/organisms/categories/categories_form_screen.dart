import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/category.dart' as cat;

/// Add (when [category] is null, using [createType]) or edit a category.
/// Always a full page — pops `true` on success so the list can refresh.
class CategoryFormScreen extends ConsumerStatefulWidget {
  const CategoryFormScreen({this.category, this.createType, super.key})
    : assert(
        category != null || createType != null,
        'Provide a category to edit or a createType to add',
      );
  final cat.Category? category;
  final cat.CategoryType? createType;

  @override
  ConsumerState<CategoryFormScreen> createState() => _CategoryFormScreenState();
}

class _CategoryFormScreenState extends ConsumerState<CategoryFormScreen> {
  late final _ctl = TextEditingController(text: widget.category?.name ?? '');
  bool _saving = false;
  String? _error;

  bool get _isCreate => widget.category == null;
  cat.CategoryType get _type =>
      widget.category?.type ?? widget.createType!;

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
    final repo = ref.read(categoriesRepositoryProvider);
    final name = _ctl.text.trim();
    final res = _isCreate
        ? await repo.create(name: name, type: _type)
        : await repo.update(id: widget.category!.id, name: name);
    if (!mounted) return;
    setState(() => _saving = false);
    res.fold(
      (_) => Navigator.of(context).pop(true),
      (e) => setState(() => _error = e.message),
    );
  }

  @override
  Widget build(BuildContext context) {
    final headerLabel = _type == cat.CategoryType.income ? 'Income' : 'Exp.';
    return Scaffold(
      appBar: PageAppBar(
        title: _isCreate ? 'Add' : 'Edit',
        backLabel: headerLabel,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  if (widget.category?.emoji != null) ...[
                    Text(
                      widget.category!.emoji!,
                      style: const TextStyle(fontSize: 22),
                    ),
                    const SizedBox(width: 8),
                  ],
                  Expanded(child: Input(controller: _ctl, autofocus: true)),
                ],
              ),
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
