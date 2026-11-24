import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/invite/invite_accept_view_model.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/router/invite_route.dart';
import 'package:oewang/data/repositories_fake/invites_repository_fake.dart';
import 'package:oewang/data/repositories_fake/users_repository_fake.dart';

InviteRoute decide(
  String wanted, {
  required bool signedIn,
  String location = acceptInvitePath,
  String? pending,
}) => inviteRoute(
  wanted: Uri.parse(wanted),
  location: location,
  signedIn: signedIn,
  pending: pending,
  registerLocation: AppRoutes.register,
);

void main() {
  group('MOB-9 an invitation link in the router', () {
    const link = 'https://app.oewang.com/accept-invite?token=abc';

    test('signed out: keep the token and go to sign up', () {
      final step = decide(link, signedIn: false);
      expect(step.redirect, AppRoutes.register);
      expect(step.stash, 'abc');
    });

    test('signed out with no token: sign up, nothing kept', () {
      final step = decide('/accept-invite', signedIn: false);
      expect(step.redirect, AppRoutes.register);
      expect(step.stash, isNull);
    });

    test('signed in: the accept screen runs, workspace or not', () {
      expect(decide(link, signedIn: true).stay, isTrue);
    });

    test('held by the splash while the session loaded: on to accept', () {
      final step = decide(
        '/accept-invite?token=abc',
        location: '/splash',
        signedIn: true,
      );
      expect(step.redirect, '/accept-invite?token=abc');
    });

    test('a kept token brings a fresh sign-in back to accept it', () {
      final step = decide(
        AppRoutes.onboarding,
        location: AppRoutes.onboarding,
        signedIn: true,
        pending: 'abc',
      );
      expect(step.redirect, acceptInvitePath);
    });

    test('no invitation in play: the router carries on', () {
      final step = decide(
        AppRoutes.trans,
        location: AppRoutes.trans,
        signedIn: true,
      );
      expect(step.redirect, isNull);
      expect(step.stay, isFalse);
      expect(step.stash, isNull);
    });
  });

  group('MOB-9 accepting an invitation', () {
    late List<String> switched;
    late InvitesRepositoryFake invites;

    InviteAcceptViewModel vm({AppError? switchError}) {
      switched = [];
      invites = InvitesRepositoryFake();
      return InviteAcceptViewModel(
        invites: invites,
        users: UsersRepositoryFake(),
        switchTo: (id) async {
          switched.add(id);
          return switchError;
        },
      );
    }

    test('the invited account joins and the session moves there', () async {
      final model = vm();
      await model.accept('invite-token');
      expect(model.status, InviteAcceptStatus.joined);
      expect(switched, ['ws-invited']);
    });

    test(
      'the wrong account is told which address it is signed in as',
      () async {
        final model = vm();
        await model.accept('someone-elses-token');
        expect(model.status, InviteAcceptStatus.invalid);
        expect(model.email, 'tester@oewang.com');
        expect(switched, isEmpty);
      },
    );

    test('a link with no token says it is incomplete', () async {
      final model = vm();
      await model.accept(null);
      expect(model.status, InviteAcceptStatus.missing);
      expect(invites.accepted, isEmpty);
    });

    test('no connection: retryable, not reported as invalid', () async {
      final model = vm(switchError: const NetworkError());
      await model.accept('invite-token');
      expect(model.status, InviteAcceptStatus.failed);
    });
  });
}
