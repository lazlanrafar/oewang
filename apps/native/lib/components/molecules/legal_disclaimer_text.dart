import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/constants/legal_links.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:url_launcher/url_launcher.dart';

/// "By {action} you agree to our Terms of service & Privacy policy" — shared
/// by the login and register screens, with real tappable links (opens the
/// marketing site's live pages via [EnvConfig.websiteUrl]).
class LegalDisclaimerText extends ConsumerStatefulWidget {
  const LegalDisclaimerText({required this.action, super.key});

  /// e.g. 'signing in' / 'signing up'.
  final String action;

  @override
  ConsumerState<LegalDisclaimerText> createState() =>
      _LegalDisclaimerTextState();
}

class _LegalDisclaimerTextState extends ConsumerState<LegalDisclaimerText> {
  late final TapGestureRecognizer _terms = TapGestureRecognizer()
    ..onTap = () => _open(termsOfServiceUrl(ref.read(envProvider)));
  late final TapGestureRecognizer _privacy = TapGestureRecognizer()
    ..onTap = () => _open(privacyPolicyUrl(ref.read(envProvider)));

  @override
  void dispose() {
    _terms.dispose();
    _privacy.dispose();
    super.dispose();
  }

  Future<void> _open(String url) async {
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final linkStyle = OewangFonts.sans(
      color: palette.foreground,
      fontSize: 12,
    ).copyWith(decoration: TextDecoration.underline);
    final baseStyle = OewangFonts.sans(
      color: palette.mutedForeground,
      fontSize: 12,
    );
    return Text.rich(
      TextSpan(
        style: baseStyle,
        children: [
          TextSpan(text: 'By ${widget.action} you agree to our '),
          TextSpan(
            text: 'Terms of service',
            style: linkStyle,
            recognizer: _terms,
          ),
          const TextSpan(text: ' & '),
          TextSpan(
            text: 'Privacy policy',
            style: linkStyle,
            recognizer: _privacy,
          ),
        ],
      ),
      textAlign: TextAlign.center,
    );
  }
}
