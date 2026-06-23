import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/money.dart';

/// Renders a [Money] amount with Hedvig Serif + tabular figures so columns
/// stay aligned in lists. When [color] is null, defaults to the active
/// palette's foreground so the value reads correctly in light + dark mode.
class MoneyText extends StatelessWidget {
  const MoneyText({
    required this.amount,
    this.color,
    this.fontSize = 13,
    this.fontWeight = FontWeight.w400,
    this.textAlign,
    super.key,
  });

  final Money amount;
  final Color? color;
  final double fontSize;
  final FontWeight fontWeight;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    final resolved = color ?? context.palette.foreground;
    return Text(
      amount.format(),
      textAlign: textAlign,
      style: OewangFonts.currency(
        color: resolved,
        fontSize: fontSize,
        fontWeight: fontWeight,
      ),
    );
  }
}
