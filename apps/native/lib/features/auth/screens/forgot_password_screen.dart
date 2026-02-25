import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/services/auth_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_text_styles.dart';
import '../../../shared/shared.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailCtrl = TextEditingController();
  bool _loading = false;
  bool _sent = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty || !email.contains('@')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid email address.')),
      );
      return;
    }

    setState(() => _loading = true);
    final result = await AuthService.resetPassword(email);
    if (!mounted) return;
    setState(() => _loading = false);

    if (result.success) {
      setState(() => _sent = true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.error ?? 'Failed to send reset email.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(leading: BackButton(onPressed: () => context.pop())),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: _sent
                ? _SuccessView(email: _emailCtrl.text)
                : _FormView(
                    emailCtrl: _emailCtrl,
                    loading: _loading,
                    onSend: _send,
                  ),
          ),
        ),
      ),
    );
  }
}

// ─── Form view ────────────────────────────────────────────────────────────────
class _FormView extends StatelessWidget {
  const _FormView({
    required this.emailCtrl,
    required this.loading,
    required this.onSend,
  });
  final TextEditingController emailCtrl;
  final bool loading;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Reset password', style: AppTextStyles.displayMedium),
        const SizedBox(height: 8),
        Text(
          "Enter your email and we'll send a reset link.",
          style: AppTextStyles.bodyMedium.copyWith(
            color: AppColors.textSecondary,
          ),
        ),
        const SizedBox(height: 32),
        AppTextField(
          label: 'Email',
          controller: emailCtrl,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          prefixIcon: const Icon(Icons.email_outlined),
          onFieldSubmitted: (_) => onSend(),
        ),
        const SizedBox(height: 24),
        AppButton(
          label: 'Send Reset Link',
          onPressed: onSend,
          isLoading: loading,
        ),
      ],
    );
  }
}

// ─── Success view ─────────────────────────────────────────────────────────────
class _SuccessView extends StatelessWidget {
  const _SuccessView({required this.email});
  final String email;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            color: AppColors.surfaceElevated,
            borderRadius: BorderRadius.circular(36),
          ),
          child: const Icon(
            Icons.mark_email_read_outlined,
            color: AppColors.income,
            size: 36,
          ),
        ),
        const SizedBox(height: 24),
        Text('Check your inbox', style: AppTextStyles.displayMedium),
        const SizedBox(height: 12),
        Text(
          'We sent a password reset link to\n$email',
          textAlign: TextAlign.center,
          style: AppTextStyles.bodyMedium.copyWith(
            color: AppColors.textSecondary,
          ),
        ),
        const SizedBox(height: 32),
        AppButton.outlined(
          label: 'Back to Sign In',
          onPressed: () => context.go('/login'),
        ),
      ],
    );
  }
}
