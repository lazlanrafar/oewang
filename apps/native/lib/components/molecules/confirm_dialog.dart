import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';

/// Platform-native confirmation alert: `CupertinoAlertDialog` chrome/actions
/// on iOS & macOS, Material `AlertDialog`/`TextButton` everywhere else — via
/// `AlertDialog.adaptive` + `showAdaptiveDialog`. Returns `true` only if the
/// destructive/confirm action was tapped.
Future<bool> showConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Delete',
  String cancelLabel = 'Cancel',
  bool isDestructive = true,
}) async {
  final result = await showAdaptiveDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog.adaptive(
      title: Text(title),
      content: Text(message),
      actions: [
        _adaptiveAction(
          context: ctx,
          onPressed: () => Navigator.of(ctx).pop(false),
          child: Text(cancelLabel),
        ),
        _adaptiveAction(
          context: ctx,
          onPressed: () => Navigator.of(ctx).pop(true),
          isDestructive: isDestructive,
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result ?? false;
}

Widget _adaptiveAction({
  required BuildContext context,
  required VoidCallback onPressed,
  required Widget child,
  bool isDestructive = false,
}) {
  switch (Theme.of(context).platform) {
    case TargetPlatform.iOS:
    case TargetPlatform.macOS:
      return CupertinoDialogAction(
        onPressed: onPressed,
        isDestructiveAction: isDestructive,
        child: child,
      );
    case TargetPlatform.android:
    case TargetPlatform.fuchsia:
    case TargetPlatform.linux:
    case TargetPlatform.windows:
      return TextButton(
        onPressed: onPressed,
        child: DefaultTextStyle.merge(
          style: TextStyle(color: isDestructive ? OewangColors.coral : null),
          child: child,
        ),
      );
  }
}
