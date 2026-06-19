import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/organisms/auth/auth_onboarding_view_model.dart';
import 'package:oewang/components/organisms/settings/currency/settings_currency_picker_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/currency.dart';

final onboardingViewModelProvider =
    ChangeNotifierProvider.autoDispose<OnboardingViewModel>(
      (ref) => OnboardingViewModel(
        auth: ref.watch(authRepositoryProvider),
        workspaces: ref.watch(workspacesRepositoryProvider),
      ),
    );

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _nameCtl = TextEditingController();

  @override
  void dispose() {
    _nameCtl.dispose();
    super.dispose();
  }

  Future<void> _openCurrencyPicker() async {
    final picked = await Navigator.of(context).push<CurrencyInfo>(
      MaterialPageRoute(builder: (_) => const CurrencyPickerScreen()),
    );
    if (picked != null && mounted) {
      ref.read(onboardingViewModelProvider).setCurrency(picked);
    }
  }

  Future<void> _submit() async {
    final vm = ref.read(onboardingViewModelProvider);
    final session = await vm.submit();
    if (!mounted || session == null) return;
    ref.read(sessionControllerProvider.notifier).onLoggedIn(session);
  }

  @override
  Widget build(BuildContext context) {
    final vm = ref.watch(onboardingViewModelProvider);
    final palette = context.palette;
    final c = vm.currency;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: palette.background,
        elevation: 0,
        title: Text(
          'Create workspace',
          style: OewangFonts.sans(
            color: palette.foreground,
            fontSize: 17,
            fontWeight: FontWeight.w500,
          ),
        ),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(OewangSpacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Tell us about your workspace',
                style: OewangFonts.sans(
                  color: palette.mutedForeground,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: OewangSpacing.lg),
              Input(
                controller: _nameCtl,
                label: 'Workspace name',
                hintText: 'My Company',
                variant: InputVariant.outlined,
                onChanged: vm.setName,
              ),
              const SizedBox(height: OewangSpacing.lg),
              Text(
                'Base currency',
                style: OewangFonts.sans(
                  color: palette.foreground,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 6),
              GestureDetector(
                onTap: _openCurrencyPicker,
                child: Container(
                  width: double.infinity,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  decoration: BoxDecoration(
                    color: palette.background,
                    border: Border.all(color: palette.border),
                  ),
                  child: Text(
                    '${c.code} - ${c.country} (${c.symbol})',
                    style: OewangFonts.sans(color: palette.foreground),
                  ),
                ),
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
              const Spacer(),
              Button(
                label: 'Continue',
                height: 48,
                loading: vm.submitting,
                onPressed: vm.canSubmit ? _submit : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
