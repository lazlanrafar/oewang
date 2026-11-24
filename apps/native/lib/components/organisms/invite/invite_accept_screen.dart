import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/organisms/invite/invite_accept_view_model.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/router/invite_route.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

final inviteAcceptViewModelProvider =
    ChangeNotifierProvider.autoDispose<InviteAcceptViewModel>(
      (ref) => InviteAcceptViewModel(
        invites: ref.watch(invitesRepositoryProvider),
        users: ref.watch(usersRepositoryProvider),
        switchTo: (id) =>
            ref.read(sessionControllerProvider.notifier).switchTo(id),
      ),
    );

/// Where an invitation link lands once signed in (MOB-9). A usable one moves
/// on to the workspace; this only stays on screen to say why one did not.
class InviteAcceptScreen extends ConsumerStatefulWidget {
  const InviteAcceptScreen({this.token, super.key});

  /// From the link; null when it was kept through sign-in instead.
  final String? token;

  @override
  ConsumerState<InviteAcceptScreen> createState() => _InviteAcceptScreenState();
}

class _InviteAcceptScreenState extends ConsumerState<InviteAcceptScreen> {
  String? _token;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final pending = ref.read(pendingInviteProvider.notifier);
      _token = widget.token ?? pending.state;
      pending.state = null;
      _accept();
    });
  }

  Future<void> _accept() async {
    final vm = ref.read(inviteAcceptViewModelProvider);
    await vm.accept(_token);
    if (mounted && vm.status == InviteAcceptStatus.joined) {
      context.go(AppRoutes.trans);
    }
  }

  @override
  Widget build(BuildContext context) {
    final vm = ref.watch(inviteAcceptViewModelProvider);
    final palette = context.palette;

    final (title, body) = switch (vm.status) {
      InviteAcceptStatus.missing => (
        'This invitation cannot be used',
        'The link is incomplete. Open it again from the email.',
      ),
      InviteAcceptStatus.invalid => (
        'This invitation cannot be used',
        'It may have expired, been revoked or used already, or it was sent '
            'to a different email address than ${vm.email}. Ask whoever '
            'invited you for a new one.',
      ),
      InviteAcceptStatus.failed => (
        'Could not join the workspace',
        vm.failure ?? '',
      ),
      _ => (null, null),
    };

    return Scaffold(
      body: SafeArea(
        child: title == null
            ? const Center(child: CircularProgressIndicator())
            : Padding(
                padding: const EdgeInsets.all(OewangSpacing.xl),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      title,
                      style: OewangFonts.sans(
                        color: palette.foreground,
                        fontSize: 17,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: OewangSpacing.md),
                    Text(
                      body!,
                      style: OewangFonts.sans(
                        color: palette.mutedForeground,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: OewangSpacing.xl),
                    if (vm.status == InviteAcceptStatus.failed)
                      Button(label: 'Try again', onPressed: _accept)
                    else
                      Button(
                        label: 'Go to the app',
                        onPressed: () => context.go(AppRoutes.trans),
                      ),
                  ],
                ),
              ),
      ),
    );
  }
}
