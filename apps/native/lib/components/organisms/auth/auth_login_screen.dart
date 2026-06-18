import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/input.dart';
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
      (_) {/* error is rendered via the VM */},
    );
  }

  // ponytail: native OAuth (deep-link round-trip) isn't wired yet; keep the
  // buttons faithful to the web design and stub the action until it is.
  void _social(String provider) =>
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$provider sign-in is coming soon')),
      );

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
                Text(
                  'Welcome to Oewang',
                  textAlign: TextAlign.center,
                  style: OewangFonts.sans(
                    color: palette.foreground,
                    fontSize: 24,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: OewangSpacing.xxl),
                Button(
                  label: 'Continue with Google',
                  variant: ButtonVariant.outlined,
                  leading: const _GoogleGlyph(),
                  onPressed: () => _social('Google'),
                ),
                const SizedBox(height: OewangSpacing.md),
                Button(
                  label: 'Continue with GitHub',
                  variant: ButtonVariant.outlined,
                  leading: Icon(Icons.code, size: 18, color: palette.foreground),
                  onPressed: () => _social('GitHub'),
                ),
                const SizedBox(height: OewangSpacing.lg),
                _OrDivider(palette: palette),
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
                    height: 48,
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

class _OrDivider extends StatelessWidget {
  const _OrDivider({required this.palette});
  final OewangPalette palette;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Divider(color: palette.border)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            'or',
            style: OewangFonts.sans(
              color: palette.mutedForeground,
              fontSize: 13,
            ),
          ),
        ),
        Expanded(child: Divider(color: palette.border)),
      ],
    );
  }
}

// ponytail: no brand-icon dependency; render Google's "G" as a styled glyph.
class _GoogleGlyph extends StatelessWidget {
  const _GoogleGlyph();

  @override
  Widget build(BuildContext context) {
    return Text(
      'G',
      style: OewangFonts.sans(
        color: context.palette.foreground,
        fontSize: 16,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}
