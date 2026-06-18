import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/organisms/auth/auth_login_view_model.dart';
import 'package:oewang/config/dependencies.dart';
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
    res.fold(
      (session) =>
          ref.read(sessionControllerProvider.notifier).onLoggedIn(session),
      (_) {/* error is rendered via the VM */},
    );
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
                Text(
                  'Oewang',
                  textAlign: TextAlign.center,
                  style: OewangFonts.sans(
                    color: palette.foreground,
                    fontSize: 32,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: OewangSpacing.sm),
                Text(
                  'Sign in to continue',
                  textAlign: TextAlign.center,
                  style: OewangFonts.sans(color: palette.mutedForeground),
                ),
                const SizedBox(height: OewangSpacing.xxl),
                TextField(
                  controller: _emailCtl,
                  onChanged: vm.setEmail,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(hintText: 'Email'),
                ),
                const SizedBox(height: OewangSpacing.md),
                TextField(
                  controller: _passwordCtl,
                  onChanged: vm.setPassword,
                  obscureText: true,
                  autofillHints: const [AutofillHints.password],
                  decoration: const InputDecoration(hintText: 'Password'),
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
                const SizedBox(height: OewangSpacing.xl),
                Button(
                  label: 'Sign in',
                  height: 52,
                  loading: vm.submit.running,
                  onPressed: vm.canSubmit ? _onSubmit : null,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
