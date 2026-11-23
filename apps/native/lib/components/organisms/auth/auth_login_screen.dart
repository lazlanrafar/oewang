import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/molecules/legal_disclaimer_text.dart';
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
    final session = res.fold((s) => s, (_) => null);
    // The error is rendered via the VM; a failed /sync check is shown here.
    if (session == null) return;
    final error = await ref
        .read(sessionControllerProvider.notifier)
        .enter(session);
    if (error != null && mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

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
                const LegalDisclaimerText(action: 'signing in'),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
