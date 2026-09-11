import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:oewang/core/theme/oewang_palette.dart';

/// Shown for the brief window between app start and `sessionControllerProvider`
/// resolving (a local secure-storage read + JWT decode — no network call).
///
/// The router's `initialLocation` points here instead of straight at the
/// authenticated shell so no screen ever mounts and fetches workspace-scoped
/// data before the workspace id is actually known — see `app_router.dart`'s
/// `redirect`.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Scaffold(
      backgroundColor: palette.background,
      body: Center(
        child: SvgPicture.asset(
          Theme.of(context).brightness == Brightness.dark
              ? 'assets/icons/logo-text-white.svg'
              : 'assets/icons/logo-text-black.svg',
          width: 120,
          height: 120 * 223 / 609,
        ),
      ),
    );
  }
}
