import 'package:dio/dio.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../network/api_client.dart';

/// Result wrapper for auth operations
class AuthResult {
  final bool success;
  final String? error;
  final String? appToken;
  final String? workspaceId;

  const AuthResult._({
    required this.success,
    this.error,
    this.appToken,
    this.workspaceId,
  });

  factory AuthResult.ok({String? appToken, String? workspaceId}) =>
      AuthResult._(success: true, appToken: appToken, workspaceId: workspaceId);

  factory AuthResult.fail(String error) =>
      AuthResult._(success: false, error: error);
}

/// Auth service — abstracts Supabase + API token exchange.
///
/// Modes:
///   - [enterGuestMode]    → sets SessionManager to guest, no network required
///   - [signInWithEmail]   → Supabase auth → POST /v1/auth/token → app JWT
///   - [signInWithGoogle]  → Google ID token → Supabase → POST /v1/auth/token
///
/// All network API calls go through [ApiClient] which auto-attaches the JWT.
abstract class AuthService {
  static SupabaseClient get _supabase => Supabase.instance.client;

  // ─── Email auth ───────────────────────────────────────────────────────────

  /// Sign in with email + password
  static Future<AuthResult> signInWithEmail(
    String email,
    String password,
  ) async {
    try {
      final res = await _supabase.auth.signInWithPassword(
        email: email.trim(),
        password: password,
      );
      if (res.session == null) {
        return AuthResult.fail('Sign in failed. Check your credentials.');
      }

      return _exchangeToken(res.session!.accessToken);
    } on AuthException catch (e) {
      return AuthResult.fail(e.message);
    } catch (_) {
      return AuthResult.fail('An unexpected error occurred.');
    }
  }

  /// Sign up with email + password
  static Future<AuthResult> signUpWithEmail(
    String email,
    String password,
  ) async {
    try {
      final res = await _supabase.auth.signUp(
        email: email.trim(),
        password: password,
      );
      if (res.session == null) {
        return AuthResult.ok(); // Email confirmation required
      }
      return _exchangeToken(res.session!.accessToken);
    } on AuthException catch (e) {
      return AuthResult.fail(e.message);
    } catch (_) {
      return AuthResult.fail('An unexpected error occurred.');
    }
  }

  // ─── Google Sign-In ───────────────────────────────────────────────────────

  /// Sign in with Google via Supabase OAuth (browser-based).
  ///
  /// Opens the system browser for Google sign-in. Supabase handles the OAuth
  /// callback via the deep link configured in your Supabase dashboard.
  ///
  /// Setup required in Supabase Dashboard:
  ///   Auth → URL Configuration → Redirect URLs → add `okane://login-callback`
  ///   Auth → Providers → Google → enable + add your OAuth credentials
  static Future<AuthResult> signInWithGoogle() async {
    try {
      await _supabase.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: 'okane://login-callback',
      );

      // signInWithOAuth opens a browser — Supabase will call back via deep link.
      // The calling screen should listen to authStateStream for the new session.
      return AuthResult.ok();
    } on AuthException catch (e) {
      return AuthResult.fail(e.message);
    } catch (e) {
      return AuthResult.fail('Google sign-in failed: ${e.toString()}');
    }
  }

  // ─── Password reset ───────────────────────────────────────────────────────

  /// Send password reset email via Supabase.
  static Future<AuthResult> resetPassword(String email) async {
    try {
      await _supabase.auth.resetPasswordForEmail(email.trim());
      return AuthResult.ok();
    } on AuthException catch (e) {
      return AuthResult.fail(e.message);
    } catch (_) {
      return AuthResult.fail('Failed to send reset email.');
    }
  }

  // ─── Sign out ─────────────────────────────────────────────────────────────

  /// Sign out — clears Supabase session, app JWT, and auth mode.
  /// Returns user to the login/welcome screen.
  static Future<void> signOut() async {
    try {
      await _supabase.auth.signOut();
    } catch (_) {
      // Don't block sign-out if Supabase call fails (guest mode has no session)
    }
    await ApiClient.instance.clearToken();
  }

  // ─── Utils ────────────────────────────────────────────────────────────────

  /// Reactive auth state stream from Supabase
  static Stream<AuthState> get authStateStream =>
      _supabase.auth.onAuthStateChange;

  // ─── Private ──────────────────────────────────────────────────────────────

  /// Exchange Supabase access token for the app JWT from apps/api.
  static Future<AuthResult> _exchangeToken(String supabaseToken) async {
    try {
      final res = await ApiClient.instance.dio.post(
        '/auth/token',
        options: Options(headers: {'Authorization': 'Bearer $supabaseToken'}),
      );

      final data = res.data?['data'];
      final appToken = data?['token'] as String?;
      final workspaceId = data?['workspace_id'] as String?;

      if (appToken == null) return AuthResult.fail('Token exchange failed.');

      await ApiClient.instance.setToken(appToken);
      return AuthResult.ok(appToken: appToken, workspaceId: workspaceId);
    } catch (_) {
      return AuthResult.fail(
        'Could not reach the server. Check your connection.',
      );
    }
  }
}
