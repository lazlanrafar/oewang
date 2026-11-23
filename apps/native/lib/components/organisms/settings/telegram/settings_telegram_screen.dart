import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/organisms/settings/telegram/settings_telegram_view_model.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:url_launcher/url_launcher.dart';

final telegramViewModelProvider =
    ChangeNotifierProvider.autoDispose<TelegramViewModel>(
      (ref) => TelegramViewModel(
        telegram: ref.watch(telegramRepositoryProvider),
        openLink: (link) =>
            launchUrl(link, mode: LaunchMode.externalApplication),
      ),
    );

class TelegramScreen extends ConsumerStatefulWidget {
  const TelegramScreen({super.key});

  @override
  ConsumerState<TelegramScreen> createState() => _TelegramScreenState();
}

class _TelegramScreenState extends ConsumerState<TelegramScreen> {
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    // Linking finishes in Telegram; coming back is when the status changed.
    _lifecycle = AppLifecycleListener(
      onResume: () => ref.read(telegramViewModelProvider).load(),
    );
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => ref.read(telegramViewModelProvider).load(),
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final vm = ref.watch(telegramViewModelProvider);
    final status = vm.status;
    final palette = context.palette;
    final textStyle = OewangFonts.sans(
      color: palette.mutedForeground,
      fontSize: 14,
    );

    return Scaffold(
      appBar: const PageAppBar(title: 'Telegram', backLabel: 'Settings'),
      body: SafeArea(
        child: status == null && vm.error == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(OewangSpacing.xl),
                children: [
                  if (status != null && !status.enabled)
                    Text(
                      'Telegram is not set up on this server.',
                      style: textStyle,
                    )
                  else if (status != null && status.linked) ...[
                    Text(
                      status.telegramUsername == null
                          ? 'Linked to Telegram.'
                          : 'Linked to @${status.telegramUsername}.',
                      style: textStyle,
                    ),
                    const SizedBox(height: OewangSpacing.lg),
                    Button(
                      label: 'Unlink',
                      variant: ButtonVariant.outlined,
                      loading: vm.busy,
                      onPressed: vm.unlink,
                    ),
                  ] else if (status != null) ...[
                    Text(
                      'Send receipts and ask questions from Telegram. '
                      'Linking opens a chat with @${status.botUsername}.',
                      style: textStyle,
                    ),
                    const SizedBox(height: OewangSpacing.lg),
                    Button(
                      label: 'Link Telegram',
                      loading: vm.busy,
                      onPressed: vm.link,
                    ),
                  ],
                  if (vm.error != null) ...[
                    const SizedBox(height: OewangSpacing.md),
                    Text(
                      vm.error!.message,
                      style: OewangFonts.sans(
                        color: OewangColors.coral,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ],
              ),
      ),
    );
  }
}
