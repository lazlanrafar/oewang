import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/drawer_metrics.dart';
import 'package:oewang/components/molecules/amount_keypad_sheet.dart';
import 'package:oewang/components/molecules/calendar_picker_sheet.dart';
import 'package:oewang/components/molecules/entity_picker_sheet.dart';
import 'package:oewang/components/molecules/grid_picker_sheet.dart';
import 'package:oewang/core/theme/oewang_palette.dart';

/// Holds which in-form drawer (if any) is currently open. A single panel at the
/// bottom of the screen renders [builder]; swapping fields just swaps the
/// builder, so the form behind stays interactive (non-modal).
class FormDrawerController extends ChangeNotifier {
  String? _id;
  WidgetBuilder? _builder;

  String? get activeId => _id;
  bool get isOpen => _builder != null;
  WidgetBuilder? get builder => _builder;

  void open(String id, WidgetBuilder builder) {
    if (_id == id && _builder != null) return; // already showing this field
    // Drop any text-field focus so its row stops looking "active" while a
    // picker/keypad panel is open.
    FocusManager.instance.primaryFocus?.unfocus();
    _id = id;
    _builder = builder;
    notifyListeners();
  }

  void close() {
    if (_builder == null) return;
    _id = null;
    _builder = null;
    notifyListeners();
  }
}

/// Exposes the [FormDrawerController] to descendant fields without rebuilding
/// them (the controller instance is stable).
class FormDrawerScope extends InheritedWidget {
  const FormDrawerScope({
    required this.controller,
    required super.child,
    super.key,
  });

  final FormDrawerController controller;

  static FormDrawerController? maybeOf(BuildContext context) {
    final element =
        context.getElementForInheritedWidgetOfExactType<FormDrawerScope>();
    return (element?.widget as FormDrawerScope?)?.controller;
  }

  @override
  bool updateShouldNotify(FormDrawerScope oldWidget) =>
      controller != oldWidget.controller;
}

/// Wraps a form so its fields can open a shared, non-modal drawer pinned to the
/// bottom. The form is dimmed (but still tappable) while a drawer is open, and
/// every drawer is rendered at the same fixed height.
class FormDrawerHost extends StatefulWidget {
  const FormDrawerHost({required this.child, super.key});

  final Widget child;

  @override
  State<FormDrawerHost> createState() => _FormDrawerHostState();
}

class _FormDrawerHostState extends State<FormDrawerHost> {
  final FormDrawerController _controller = FormDrawerController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return FormDrawerScope(
      controller: _controller,
      child: ListenableBuilder(
        listenable: _controller,
        builder: (context, _) {
          final open = _controller.isOpen;
          // A real split: the form occupies the top, the input panel the bottom.
          // Flat, square, full-width — no scrim, no rounded corners.
          return Column(
            children: [
              Expanded(child: widget.child),
              if (open)
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: DrawerMetrics.surface(context),
                    border: Border(top: BorderSide(color: palette.border)),
                  ),
                  child: SafeArea(
                    top: false,
                    // Fixed height so every panel is exactly the same size.
                    child: SizedBox(
                      height: DrawerMetrics.height,
                      child: _AnimatedDrawerBody(
                        child: KeyedSubtree(
                          key: ValueKey(_controller.activeId),
                          child: _controller.builder!(context),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

/// Cross-fades drawer content on swap without changing the (fixed) height.
class _AnimatedDrawerBody extends StatelessWidget {
  const _AnimatedDrawerBody({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 140),
      layoutBuilder: (currentChild, previousChildren) => Stack(
        alignment: Alignment.topCenter,
        children: [
          ...previousChildren,
          if (currentChild != null) currentChild,
        ],
      ),
      child: child,
    );
  }
}

/// Opens the amount keypad — in the shared panel when a [FormDrawerHost] is an
/// ancestor, otherwise as a modal bottom sheet.
void openAmountDrawer(
  BuildContext context, {
  required String id,
  required num initial,
  required ValueChanged<num> onChanged,
  String title = 'Amount',
  String currency = 'IDR',
  ValueChanged<String>? onCurrencyChanged,
  bool showCurrencyTabs = true,
}) {
  final controller = FormDrawerScope.maybeOf(context);
  if (controller != null) {
    controller.open(
      id,
      (_) => AmountKeypad(
        initial: initial,
        title: title,
        currency: currency,
        showCurrencyTabs: showCurrencyTabs,
        onChanged: onChanged,
        onCurrencyChanged: onCurrencyChanged,
        onSubmit: (_) => controller.close(),
        onClose: controller.close,
      ),
    );
  } else {
    AmountKeypadSheet.show(
      context,
      initial: initial,
      onChanged: onChanged,
      title: title,
      currency: currency,
      showCurrencyTabs: showCurrencyTabs,
      onCurrencyChanged: onCurrencyChanged,
    );
  }
}

/// Opens a grid picker — shared panel when hosted, else modal.
void openGridDrawer<T>(
  BuildContext context, {
  required String id,
  required String title,
  required List<T> items,
  required String Function(T) labelOf,
  required String Function(T) idOf,
  required ValueChanged<T> onSelected,
  String? Function(T)? leadingOf,
  String? selectedId,
  int columns = 3,
}) {
  final controller = FormDrawerScope.maybeOf(context);
  if (controller != null) {
    controller.open(
      id,
      (_) => GridPickerContent<T>(
        title: title,
        items: items,
        labelOf: labelOf,
        leadingOf: leadingOf,
        idOf: idOf,
        selectedId: selectedId,
        columns: columns,
        onSelected: (item) {
          onSelected(item);
          controller.close();
        },
        onClose: controller.close,
      ),
    );
  } else {
    GridPickerSheet.show<T>(
      context,
      title: title,
      items: items,
      labelOf: labelOf,
      leadingOf: leadingOf,
      idOf: idOf,
      selectedId: selectedId,
      columns: columns,
    ).then((picked) {
      if (picked != null) onSelected(picked);
    });
  }
}

/// Opens a vertical-list picker — shared panel when hosted, else modal.
void openListDrawer<T>(
  BuildContext context, {
  required String id,
  required String title,
  required List<T> items,
  required String Function(T) labelOf,
  required String Function(T) idOf,
  required ValueChanged<T> onSelected,
  String? Function(T)? subtitleOf,
}) {
  final controller = FormDrawerScope.maybeOf(context);
  if (controller != null) {
    controller.open(
      id,
      (_) => EntityListContent<T>(
        title: title,
        items: items,
        labelOf: labelOf,
        subtitleOf: subtitleOf,
        onSelected: (item) {
          onSelected(item);
          controller.close();
        },
        onClose: controller.close,
      ),
    );
  } else {
    EntityPickerSheet.show<T>(
      context,
      title: title,
      items: items,
      labelOf: labelOf,
      idOf: idOf,
      subtitleOf: subtitleOf,
    ).then((picked) {
      if (picked != null) onSelected(picked);
    });
  }
}

/// Opens the calendar — shared panel when hosted, else modal.
void openDateDrawer(
  BuildContext context, {
  required String id,
  required DateTime initial,
  required ValueChanged<DateTime> onSelected,
  DateTime? firstDate,
  DateTime? lastDate,
}) {
  final controller = FormDrawerScope.maybeOf(context);
  if (controller != null) {
    controller.open(
      id,
      (_) => CalendarContent(
        initial: initial,
        firstDate: firstDate,
        lastDate: lastDate,
        onSelected: (d) {
          onSelected(d);
          controller.close();
        },
        onClose: controller.close,
      ),
    );
  } else {
    CalendarPickerSheet.show(
      context,
      initial: initial,
      firstDate: firstDate,
      lastDate: lastDate,
    ).then((picked) {
      if (picked != null) onSelected(picked);
    });
  }
}
