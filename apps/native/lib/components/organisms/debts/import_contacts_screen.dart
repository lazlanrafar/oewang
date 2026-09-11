import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Review/select screen for importing phone contacts into the app. [candidates]
/// is already deduped against the app's existing contacts by the caller. Pops
/// the picked subset, or `null` if the user cancels.
class ImportContactsScreen extends StatefulWidget {
  const ImportContactsScreen({required this.candidates, super.key});

  final List<(String name, String? phone)> candidates;

  @override
  State<ImportContactsScreen> createState() => _ImportContactsScreenState();
}

class _ImportContactsScreenState extends State<ImportContactsScreen> {
  late final Set<int> _selected = {
    for (var i = 0; i < widget.candidates.length; i++) i,
  };

  void _toggleAll() {
    setState(() {
      if (_selected.length == widget.candidates.length) {
        _selected.clear();
      } else {
        _selected
          ..clear()
          ..addAll(List.generate(widget.candidates.length, (i) => i));
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final allSelected = _selected.length == widget.candidates.length;
    return Scaffold(
      appBar: PageAppBar(
        title: 'Import contacts',
        backLabel: 'Cancel',
        actions: [
          TextButton(
            onPressed: _toggleAll,
            child: Text(
              allSelected ? 'Deselect all' : 'Select all',
              style: OewangFonts.sans(color: palette.foreground),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView.separated(
                padding: EdgeInsets.zero,
                itemCount: widget.candidates.length,
                separatorBuilder: (_, _) =>
                    Divider(height: 1, color: palette.border),
                itemBuilder: (context, index) {
                  final (name, phone) = widget.candidates[index];
                  final checked = _selected.contains(index);
                  return CheckboxListTile(
                    value: checked,
                    controlAffinity: ListTileControlAffinity.leading,
                    activeColor: palette.primary,
                    onChanged: (_) => setState(() {
                      if (checked) {
                        _selected.remove(index);
                      } else {
                        _selected.add(index);
                      }
                    }),
                    title: Text(
                      name,
                      style: OewangFonts.sans(color: palette.foreground),
                    ),
                    subtitle: phone == null
                        ? null
                        : Text(
                            phone,
                            style: OewangFonts.sans(
                              color: palette.mutedForeground,
                              fontSize: 12,
                            ),
                          ),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Button(
                label: 'Import (${_selected.length})',
                onPressed: _selected.isEmpty
                    ? null
                    : () => Navigator.of(context).pop([
                          for (final i in _selected) widget.candidates[i],
                        ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
