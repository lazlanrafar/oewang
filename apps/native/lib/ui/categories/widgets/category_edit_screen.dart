import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/category.dart' as cat;
import 'package:oewang/ui/core/button.dart';
import 'package:oewang/ui/core/page_app_bar.dart';

class CategoryEditScreen extends ConsumerStatefulWidget {
  const CategoryEditScreen({required this.category, super.key});
  final cat.Category category;

  @override
  ConsumerState<CategoryEditScreen> createState() => _CategoryEditScreenState();
}

class _CategoryEditScreenState extends ConsumerState<CategoryEditScreen> {
  late final _ctl = TextEditingController(text: widget.category.name);
  bool _saving = false;
  String? _error;

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
    final res = await ref.read(categoriesRepositoryProvider).update(
      id: widget.category.id,
      name: _ctl.text.trim(),
    );
    if (!mounted) return;
    setState(() => _saving = false);
    res.fold(
      (_) => Navigator.of(context).pop(true),
      (e) => setState(() => _error = e.message),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final headerLabel = widget.category.type == cat.CategoryType.income
        ? 'Income'
        : 'Exp.';
    return Scaffold(
      appBar: PageAppBar(
        title: 'Edit',
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
                  if (widget.category.emoji != null) ...[
                    Text(
                      widget.category.emoji!,
                      style: const TextStyle(fontSize: 22),
                    ),
                    const SizedBox(width: 8),
                  ],
                  Expanded(
                    child: TextField(
                      controller: _ctl,
                      decoration:
                          const InputDecoration(border: InputBorder.none),
                      style: OewangFonts.sans(
                        color: palette.foreground,
                        fontSize: 16,
                      ),
                    ),
                  ),
                ],
              ),
              Divider(color: palette.border),
              const SizedBox(height: 16),
              if (_error != null) ...[
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: OewangFonts.sans(color: OewangColors.coral),
                ),
                const SizedBox(height: 12),
              ],
              Button(
                label: 'Save',
                loading: _saving,
                onPressed: _ctl.text.trim().isEmpty ? null : _save,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
