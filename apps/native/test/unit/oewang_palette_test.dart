import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';

void main() {
  group('OewangPalette', () {
    test('dark + light expose different surface tokens', () {
      final dark = OewangPalette.dark();
      final light = OewangPalette.light();
      expect(dark.background, OewangColors.background);
      expect(light.background, OewangColorsLight.background);
      expect(dark.foreground == light.foreground, isFalse);
      expect(dark.card == light.card, isFalse);
      expect(dark.muted == light.muted, isFalse);
      expect(dark.border == light.border, isFalse);
    });

    test('lerp at t=0.0 returns self, t=1.0 returns other', () {
      final dark = OewangPalette.dark();
      final light = OewangPalette.light();
      final atStart = dark.lerp(light, 0);
      final atEnd = dark.lerp(light, 1);
      expect(atStart.background, dark.background);
      expect(atEnd.background, light.background);
    });

    test('copyWith preserves all other tokens', () {
      final dark = OewangPalette.dark();
      const fresh = OewangColorsLight.background;
      final flipped = dark.copyWith(background: fresh);
      expect(flipped.background, fresh);
      expect(flipped.foreground, dark.foreground);
      expect(flipped.card, dark.card);
    });
  });
}
