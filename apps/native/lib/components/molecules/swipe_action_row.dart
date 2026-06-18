import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

// Width of the revealed Delete action (also how far the row slides left).
const double _kDeleteWidth = 96;
const double _kRowHeight = 56;

/// A settings-list row with a red minus toggle that slides the row left to
/// reveal a Delete action, an edit button, and an optional drag handle.
/// Shared by the Categories, Account Group, and Accounts setting lists.
///
/// Tapping the row body while open cancels (re-hides) the Delete action.
/// Pass [dragIndex] to show a drag handle (wrapped in a
/// [ReorderableDragStartListener]); omit it for non-reorderable lists.
class SwipeActionRow extends StatelessWidget {
  const SwipeActionRow({
    required this.title,
    required this.isOpen,
    required this.onToggleOpen,
    required this.onEdit,
    required this.onDelete,
    this.leading,
    this.dragIndex,
    super.key,
  });

  final String title;
  final bool isOpen;
  final VoidCallback onToggleOpen;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final Widget? leading;
  final int? dragIndex;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SizedBox(
      height: _kRowHeight,
      child: Stack(
        children: [
          // Delete action behind, pinned to the right edge.
          Positioned(
            top: 0,
            bottom: 0,
            right: 0,
            width: _kDeleteWidth,
            child: GestureDetector(
              onTap: onDelete,
              child: ColoredBox(
                color: OewangColors.coral,
                child: Center(
                  child: Text(
                    'Delete',
                    style: OewangFonts.sans(color: Colors.white, fontSize: 15),
                  ),
                ),
              ),
            ),
          ),
          // Foreground row — slides left to reveal the Delete action.
          AnimatedPositioned(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            top: 0,
            bottom: 0,
            left: isOpen ? -_kDeleteWidth : 0,
            right: isOpen ? _kDeleteWidth : 0,
            // Tapping the row body (anywhere but the action buttons) while the
            // Delete action is revealed cancels it.
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: isOpen ? onToggleOpen : null,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: palette.background,
                  border: Border(bottom: BorderSide(color: palette.border)),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Row(
                    children: [
                      IconButton(
                        tooltip: 'Delete',
                        onPressed: onToggleOpen,
                        icon: const Icon(
                          Icons.remove_circle,
                          color: OewangColors.coral,
                          size: 18,
                        ),
                      ),
                      if (leading != null) ...[
                        leading!,
                        const SizedBox(width: 8),
                      ],
                      Expanded(
                        child: Text(
                          title,
                          style: OewangFonts.sans(color: palette.foreground),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Edit',
                        onPressed: onEdit,
                        icon: Icon(Icons.edit_outlined,
                            color: palette.mutedForeground),
                      ),
                      if (dragIndex != null)
                        ReorderableDragStartListener(
                          index: dragIndex!,
                          child: Padding(
                            padding:
                                const EdgeInsets.symmetric(horizontal: 8),
                            child: Icon(Icons.drag_handle,
                                color: palette.mutedForeground),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
