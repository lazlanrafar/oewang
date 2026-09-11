import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/molecules/or_divider.dart';
import 'package:oewang/components/molecules/provider_icon.dart';
import 'package:oewang/components/organisms/auth/auth_login_view_model.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

final loginViewModelProvider =
    ChangeNotifierProvider.autoDispose<LoginViewModel>(
      (ref) => LoginViewModel(ref.watch(authRepositoryProvider)),
    );

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailCtl = TextEditingController();
  final _passwordCtl = TextEditingController();

  // Mirrors the web "Show other options" flow: email/password is hidden until
  // the user opts in past the social buttons.
  bool _showEmail = false;

  @override
  void dispose() {
    _emailCtl.dispose();
    _passwordCtl.dispose();
    super.dispose();
  }

  Future<void> _onSubmit() async {
    final vm = ref.read(loginViewModelProvider);
    final res = await vm.run();
    if (!mounted || res == null) return;
    res.fold(
      (session) =>
          ref.read(sessionControllerProvider.notifier).onLoggedIn(session),
      (_) {
        /* error is rendered via the VM */
      },
    );
  }

  Future<void> _social(String provider) async {
    final vm = ref.read(loginViewModelProvider);
    final res = await vm.signInWithOAuth(provider);
    if (!mounted || res == null) return;
    res.fold(
      (session) =>
          ref.read(sessionControllerProvider.notifier).onLoggedIn(session),
      (error) => ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message))),
    );
  }

  // ponytail: Apple/Facebook sign-in isn't wired yet (needs native Sign in
  // with Apple + a Facebook OAuth app) — stub the action until it is.
  void _comingSoon(String provider) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text('$provider sign-in is coming soon')));

  @override
  Widget build(BuildContext context) {
    final vm = ref.watch(loginViewModelProvider);
    final palette = context.palette;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(OewangSpacing.xl),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: SvgPicture.asset(
                    Theme.of(context).brightness == Brightness.dark
                        ? 'assets/icons/logo-text-white.svg'
                        : 'assets/icons/logo-text-black.svg',
                    width: 96,
                    height: 96 * 223 / 609,
                  ),
                ),
                const SizedBox(height: OewangSpacing.sm),
                Text(
                  'Sign in to track transactions',
                  textAlign: TextAlign.center,
                  style: OewangFonts.sans(
                    color: palette.mutedForeground,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: OewangSpacing.xxl),
                Button(
                  label: 'Continue with Google',
                  variant: ButtonVariant.outlined,
                  leading: const ProviderIcon('ic-google.svg'),
                  loading: vm.oauthSignIn.running,
                  onPressed: vm.oauthSignIn.running
                      ? null
                      : () => _social('google'),
                ),
                const SizedBox(height: OewangSpacing.md),
                // iOS ships Apple as the second option (App Store guideline
                // for apps offering third-party login); Android ships
                // Facebook instead. Both are coming-soon stubs for now —
                // only Google (native) and Google/GitHub (web) are wired.
                if (Platform.isIOS)
                  Button(
                    label: 'Continue with Apple',
                    variant: ButtonVariant.outlined,
                    leading: ProviderIcon(
                      'ic-apple.svg',
                      tint: palette.foreground,
                    ),
                    onPressed: () => _comingSoon('Apple'),
                  )
                else
                  Button(
                    label: 'Continue with Facebook',
                    variant: ButtonVariant.outlined,
                    leading: const ProviderIcon('ic-facebook.svg'),
                    onPressed: () => _comingSoon('Facebook'),
                  ),
                const SizedBox(height: OewangSpacing.lg),
                OrDivider(palette: palette),
                const SizedBox(height: OewangSpacing.lg),
                if (!_showEmail)
                  Button(
                    label: 'Show other options',
                    variant: ButtonVariant.outlined,
                    onPressed: () => setState(() => _showEmail = true),
                  )
                else ...[
                  Input(
                    controller: _emailCtl,
                    label: 'Email Address',
                    hintText: 'you@example.com',
                    variant: InputVariant.outlined,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    onChanged: vm.setEmail,
                  ),
                  const SizedBox(height: OewangSpacing.md),
                  Input(
                    controller: _passwordCtl,
                    label: 'Password',
                    variant: InputVariant.outlined,
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                    onChanged: vm.setPassword,
                    onSubmitted: (_) => _onSubmit(),
                  ),
                  if (vm.errorMessage != null) ...[
                    const SizedBox(height: OewangSpacing.md),
                    Text(
                      vm.errorMessage!,
                      textAlign: TextAlign.center,
                      style: OewangFonts.sans(
                        color: OewangColors.coral,
                        fontSize: 13,
                      ),
                    ),
                  ],
                  const SizedBox(height: OewangSpacing.lg),
                  Button(
                    label: 'Login',
                    loading: vm.submit.running,
                    onPressed: vm.canSubmit ? _onSubmit : null,
                  ),
                ],
                const SizedBox(height: OewangSpacing.lg),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      "Don't have an account? ",
                      style: OewangFonts.sans(
                        color: palette.mutedForeground,
                        fontSize: 13,
                      ),
                    ),
                    GestureDetector(
                      onTap: () => context.push(AppRoutes.register),
                      child: Text(
                        'Sign up',
                        style: OewangFonts.sans(
                          color: palette.foreground,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ).copyWith(decoration: TextDecoration.underline),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: OewangSpacing.xxl),
                Text(
                  'By signing in you agree to our Terms of service & Privacy policy',
                  textAlign: TextAlign.center,
                  style: OewangFonts.sans(
                    color: palette.mutedForeground,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
