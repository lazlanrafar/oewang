import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// One of `assets/icons/ic-{google,github,apple,facebook}.svg`. Google/Facebook
/// ship their own brand colors (no [tint]); Apple/GitHub are single-color
/// glyphs meant to inherit the button's foreground color via [tint].
class ProviderIcon extends StatelessWidget {
  const ProviderIcon(this.asset, {this.tint, super.key});
  final String asset;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset(
      'assets/icons/$asset',
      width: 18,
      height: 18,
      colorFilter: tint == null
          ? null
          : ColorFilter.mode(tint!, BlendMode.srcIn),
    );
  }
}
