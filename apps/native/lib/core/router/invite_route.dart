import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The path of an invitation link, `https://app.oewang.com/accept-invite?token=`
/// (WS-3), the same on the web and in the app (MOB-9).
const acceptInvitePath = '/accept-invite';

/// An invitation token waiting for the person to sign in or sign up. Memory
/// only: the token is a credential.
final pendingInviteProvider = StateProvider<String?>((ref) => null);

/// What the router does about invitations on one navigation.
class InviteRoute {
  const InviteRoute({this.redirect, this.stash, this.stay = false});

  /// Where to go instead.
  final String? redirect;

  /// A token to keep for after sign-in.
  final String? stash;

  /// Let the navigation through, skipping the workspace rule: accepting is
  /// how someone with no workspace joins one (D109).
  final bool stay;

  static const none = InviteRoute();
}

/// Decides an invitation's turn in the router redirect (MOB-9).
///
/// [wanted] is where the navigation is going, or where the splash screen
/// held it while the session loaded; [location] is the matched location.
/// Signed out, the token is kept and the person goes to sign up, as the
/// invited address usually has no account yet; signed in, the accept screen
/// runs. A kept token brings the person back to it after signing in.
InviteRoute inviteRoute({
  required Uri wanted,
  required String location,
  required bool signedIn,
  required String? pending,
  required String registerLocation,
}) {
  if (wanted.path == acceptInvitePath) {
    if (!signedIn) {
      final token = wanted.queryParameters['token'];
      return InviteRoute(
        redirect: registerLocation,
        stash: token == null || token.isEmpty ? null : token,
      );
    }
    if (location == acceptInvitePath) return const InviteRoute(stay: true);
    return InviteRoute(
      redirect: Uri(
        path: acceptInvitePath,
        queryParameters: wanted.queryParameters.isEmpty
            ? null
            : wanted.queryParameters,
      ).toString(),
    );
  }
  if (signedIn && pending != null) {
    return location == acceptInvitePath
        ? const InviteRoute(stay: true)
        : const InviteRoute(redirect: acceptInvitePath);
  }
  return InviteRoute.none;
}
