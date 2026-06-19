import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_metrics.dart';
import 'package:oewang/core/theme/oewang_palette.dart';

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
