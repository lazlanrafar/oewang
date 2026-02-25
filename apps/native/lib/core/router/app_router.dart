import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../network/api_client.dart';
import 'app_routes.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/register_screen.dart';
import '../../features/auth/screens/forgot_password_screen.dart';
import '../../features/dashboard/screens/dashboard_screen.dart';

final appRouter = GoRouter(
  initialLocation: AppRoutes.login,
  redirect: _globalRedirect,
  routes: [
    GoRoute(
      path: AppRoutes.login,
      name: 'login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: AppRoutes.register,
      name: 'register',
      builder: (context, state) => const RegisterScreen(),
    ),
    GoRoute(
      path: AppRoutes.forgotPassword,
      name: 'forgot-password',
      builder: (context, state) => const ForgotPasswordScreen(),
    ),
    GoRoute(
      path: AppRoutes.dashboard,
      name: 'dashboard',
      builder: (context, state) => const DashboardScreen(),
    ),
  ],
);

/// Global redirect guard:
///   - Has app JWT → dashboard (if attempting an auth route)
///   - No JWT      → login
Future<String?> _globalRedirect(
  BuildContext context,
  GoRouterState state,
) async {
  final token = await ApiClient.instance.getToken();
  final isAuthRoute = AppRoutes.authRoutes.contains(state.matchedLocation);

  if (token != null && isAuthRoute) return AppRoutes.dashboard;
  if (token == null && !isAuthRoute) return AppRoutes.login;
  return null;
}
