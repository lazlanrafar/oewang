import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Standard screen header: centered title + a `‹ backLabel` leading button.
///
/// Title color follows the theme — passing `OewangFonts.sans(fontSize: 17)`
/// directly rendered white in light mode because that helper defaults to the
/// dark foreground. `surfaceTintColor: transparent` also kills M3's grey
/// scrolled-under tint.
class PageAppBar extends StatelessWidget implements PreferredSizeWidget {
  const PageAppBar({
    required this.title,
    this.backLabel = 'Back',
    this.actions,
    super.key,
  });

  final String title;
  final String backLabel;
  final List<Widget>? actions;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return AppBar(
      surfaceTintColor: Colors.transparent,
      leading: IconButton(
        tooltip: backLabel,
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.only(left: 16, right: 8),
        icon: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.chevron_left),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                backLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        onPressed: () => Navigator.of(context).maybePop(),
      ),
      leadingWidth: 130,
      title: Text(
        title,
        style: OewangFonts.sans(color: palette.foreground, fontSize: 17),
      ),
      actions: actions,
    );
  }
}
