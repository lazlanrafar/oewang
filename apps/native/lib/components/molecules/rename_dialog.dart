import 'package:flutter/material.dart';

/// A one-field rename dialog. Null when cancelled or left blank.
Future<String?> showRenameDialog(BuildContext context, String current) =>
    showAdaptiveDialog<String>(
      context: context,
      builder: (_) => _RenameDialog(current),
    );

class _RenameDialog extends StatefulWidget {
  const _RenameDialog(this.current);

  final String current;

  @override
  State<_RenameDialog> createState() => _RenameDialogState();
}

class _RenameDialogState extends State<_RenameDialog> {
  late final _controller = TextEditingController(text: widget.current);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _save() {
    final name = _controller.text.trim();
    Navigator.of(context).pop(name.isEmpty ? null : name);
  }

  @override
  Widget build(BuildContext context) => AlertDialog.adaptive(
    title: const Text('Rename'),
    content: Material(
      type: MaterialType.transparency,
      child: TextField(
        controller: _controller,
        autofocus: true,
        onSubmitted: (_) => _save(),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text('Cancel'),
      ),
      TextButton(onPressed: _save, child: const Text('Save')),
    ],
  );
}
