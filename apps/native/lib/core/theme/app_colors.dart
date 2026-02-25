import 'package:flutter/material.dart';

abstract class AppColors {
  // Background
  static const background = Color(0xFF12121F);
  static const surface = Color(0xFF1C1C2E);
  static const surfaceElevated = Color(0xFF252538);

  // Brand / accent
  static const accent = Color(0xFFE53935); // red — expense
  static const income = Color(0xFF42A5F5); // blue — income
  static const primary = Color(0xFFE53935);

  // Text
  static const textPrimary = Color(0xFFF5F5F5);
  static const textSecondary = Color(0xFF9E9E9E);
  static const textDisabled = Color(0xFF555566);

  // Border / divider
  static const border = Color(0xFF2A2A3E);
  static const divider = Color(0xFF2A2A3E);

  // Status
  static const error = Color(0xFFEF5350);
  static const success = Color(0xFF66BB6A);
  static const warning = Color(0xFFFFA726);

  // Input
  static const inputFill = Color(0xFF1E1E30);
  static const inputBorder = Color(0xFF3A3A50);
  static const inputFocusedBorder = Color(0xFFE53935);
}
