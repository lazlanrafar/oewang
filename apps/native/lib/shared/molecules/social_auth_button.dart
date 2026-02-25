import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../atoms/atoms.dart';

/// A social OAuth provider button molecule.
///
/// Composed of [AppButton.outlined] + a provider icon atom.
/// Supports Google (and can be extended to Apple, GitHub, etc.)
class SocialAuthButton extends StatelessWidget {
  const SocialAuthButton({
    super.key,
    required this.provider,
    required this.onPressed,
    this.isLoading = false,
  });

  final SocialProvider provider;
  final VoidCallback onPressed;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return AppButton.outlined(
      label: provider.label,
      onPressed: onPressed,
      isLoading: isLoading,
      leadingIcon: _ProviderIcon(provider: provider),
    );
  }
}

enum SocialProvider {
  google(label: 'Continue with Google'),
  apple(label: 'Continue with Apple');

  const SocialProvider({required this.label});
  final String label;
}

class _ProviderIcon extends StatelessWidget {
  const _ProviderIcon({required this.provider});
  final SocialProvider provider;

  @override
  Widget build(BuildContext context) {
    return switch (provider) {
      SocialProvider.google => Container(
        width: 20,
        height: 20,
        decoration: const BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
        ),
        child: const Center(
          child: Text(
            'G',
            style: TextStyle(
              color: Color(0xFF4285F4),
              fontWeight: FontWeight.w700,
              fontSize: 13,
              height: 1,
            ),
          ),
        ),
      ),
      SocialProvider.apple => Icon(
        Icons.apple,
        color: context.colors.foreground,
        size: 20,
      ),
    };
  }
}
