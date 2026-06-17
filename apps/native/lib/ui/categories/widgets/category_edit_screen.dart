import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/category.dart' as cat;

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
      appBar: AppBar(
        leading: IconButton(
          icon: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.chevron_left),
              Text(headerLabel),
            ],
          ),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        leadingWidth: 130,
        title: Text('Edit', style: OewangFonts.sans(fontSize: 17)),
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
              SizedBox(
                height: 48,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: palette.primary,
                    foregroundColor: palette.primaryForeground,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(OewangRadius.md),
                    ),
                  ),
                  onPressed:
                      _saving || _ctl.text.trim().isEmpty ? null : _save,
                  child: _saving
                      ? SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: palette.primaryForeground,
                          ),
                        )
                      : Text(
                          'Save',
                          style: OewangFonts.sans(
                            color: palette.primaryForeground,
                            fontSize: 15,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
