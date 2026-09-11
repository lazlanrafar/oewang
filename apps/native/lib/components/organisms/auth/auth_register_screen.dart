import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/organisms/auth/auth_register_view_model.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

final registerViewModelProvider =
    ChangeNotifierProvider.autoDispose<RegisterViewModel>(
      (ref) => RegisterViewModel(ref.watch(authRepositoryProvider)),
    );

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _nameCtl = TextEditingController();
  final _emailCtl = TextEditingController();
  final _passwordCtl = TextEditingController();
  final _confirmCtl = TextEditingController();

  @override
  void dispose() {
    _nameCtl.dispose();
    _emailCtl.dispose();
    _passwordCtl.dispose();
    _confirmCtl.dispose();
    super.dispose();
  }

  Future<void> _onSubmit() async {
    final vm = ref.read(registerViewModelProvider);
    final res = await vm.run();
    if (!mounted || res == null) return;
    // Registered (no workspace yet) → log in; the router routes a logged-in
    // user without a workspace to onboarding.
    res.fold(
      (session) =>
          ref.read(sessionControllerProvider.notifier).onLoggedIn(session),
      (_) {/* error rendered via the VM */},
    );
  }

  @override
  Widget build(BuildContext context) {
    final vm = ref.watch(registerViewModelProvider);
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
                  'Create an account to get started',
                  textAlign: TextAlign.center,
                  style: OewangFonts.sans(
                    color: palette.mutedForeground,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: OewangSpacing.xxl),
                Input(
                  controller: _nameCtl,
                  label: 'Name',
                  hintText: 'Jane Doe',
                  variant: InputVariant.outlined,
                  autofillHints: const [AutofillHints.name],
                  onChanged: vm.setName,
                ),
                const SizedBox(height: OewangSpacing.md),
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
                  autofillHints: const [AutofillHints.newPassword],
                  onChanged: vm.setPassword,
                ),
                const SizedBox(height: OewangSpacing.md),
                Input(
                  controller: _confirmCtl,
                  label: 'Confirm Password',
                  variant: InputVariant.outlined,
                  obscureText: true,
                  autofillHints: const [AutofillHints.newPassword],
                  onChanged: vm.setConfirm,
                  onSubmitted: (_) => _onSubmit(),
                ),
                if (vm.mismatchMessage != null || vm.errorMessage != null) ...[
                  const SizedBox(height: OewangSpacing.md),
                  Text(
                    vm.mismatchMessage ?? vm.errorMessage!,
                    textAlign: TextAlign.center,
                    style: OewangFonts.sans(
                      color: OewangColors.coral,
                      fontSize: 13,
                    ),
                  ),
                ],
                const SizedBox(height: OewangSpacing.lg),
                Button(
                  label: 'Create account',
                  loading: vm.submit.running,
                  onPressed: vm.canSubmit ? _onSubmit : null,
                ),
                const SizedBox(height: OewangSpacing.lg),
                _SignInRow(palette: palette),
                const SizedBox(height: OewangSpacing.xxl),
                Text(
                  'By signing up you agree to our Terms of service & Privacy policy',
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

class _SignInRow extends StatelessWidget {
  const _SignInRow({required this.palette});
  final OewangPalette palette;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          'Already have an account? ',
          style: OewangFonts.sans(
            color: palette.mutedForeground,
            fontSize: 13,
          ),
        ),
        GestureDetector(
          onTap: () => context.go(AppRoutes.login),
          child: Text(
            'Sign in',
            style: OewangFonts.sans(
              color: palette.foreground,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ).copyWith(decoration: TextDecoration.underline),
          ),
        ),
      ],
    );
  }
}
