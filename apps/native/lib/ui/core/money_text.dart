import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/money.dart';

/// Renders a [Money] amount with Hedvig Serif + tabular figures so columns
/// stay aligned in lists. Color is caller-controlled — the
/// [TransactionColors] theme extension picks income vs expense.
class MoneyText extends StatelessWidget {
  const MoneyText({
    required this.amount,
    this.color = OewangColors.foreground,
    this.fontSize = 13,
    this.fontWeight = FontWeight.w400,
    this.textAlign,
    super.key,
  });

  final Money amount;
  final Color color;
  final double fontSize;
  final FontWeight fontWeight;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    return Text(
      amount.format(),
      textAlign: textAlign,
      style: OewangFonts.currency(
        color: color,
        fontSize: fontSize,
        fontWeight: fontWeight,
      ),
    );
  }
}
