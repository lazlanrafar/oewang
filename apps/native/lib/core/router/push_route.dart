import 'package:oewang/core/router/app_router.dart';

final _id = RegExp(r'^[A-Za-z0-9_-]{1,64}$');
final _month = RegExp(r'^\d{4}-(0[1-9]|1[0-2])$');

/// The app location a tapped push opens (PUSH-1, D116).
///
/// The API sends the web's route in `data.route`; each maps to the app's own
/// screen. The payload is input: only the known paths and a well-formed
/// parameter pass, and anything else opens home.
String pushLocation(Object? route) {
  final uri = route is String ? Uri.tryParse(route) : null;
  if (uri == null || uri.hasScheme || uri.hasAuthority) return AppRoutes.trans;
  final query = uri.queryParameters;
  String? param(String key, RegExp shape) {
    final value = query[key];
    return value != null && shape.hasMatch(value) ? value : null;
  }

  switch (uri.path) {
    case '/transactions':
      final detail = param('detail', _id);
      return detail == null
          ? AppRoutes.trans
          : '${AppRoutes.trans}?detail=$detail';
    case '/vault':
      // shortcut: no screen reads `detail`, `file` or `month` yet, so a push
      // opens the list, not the item; read them there when that is wanted.
      final file = param('file', _id);
      return file == null ? '/vault' : '/vault?file=$file';
    case '/budgets':
      final month = param('month', _month);
      return month == null
          ? AppRoutes.budgetSettings
          : '${AppRoutes.budgetSettings}?month=$month';
    case '/workspaces':
      // The workspace list is the switcher on the More tab.
      return AppRoutes.more;
  }
  return AppRoutes.trans;
}
