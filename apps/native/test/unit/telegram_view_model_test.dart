import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/settings/telegram/settings_telegram_view_model.dart';
import 'package:oewang/data/repositories_fake/telegram_repository_fake.dart';

void main() {
  group('MOB-9 Telegram in Settings', () {
    late TelegramRepositoryFake repo;
    late List<Uri> opened;

    TelegramViewModel vm({bool enabled = true, bool opens = true}) {
      repo = TelegramRepositoryFake(enabled: enabled);
      opened = [];
      return TelegramViewModel(
        telegram: repo,
        openLink: (link) async {
          opened.add(link);
          return opens;
        },
      );
    }

    test('shows the status from the API', () async {
      final model = vm();
      await model.load();
      expect(model.status!.enabled, isTrue);
      expect(model.status!.linked, isFalse);
      expect(model.status!.botUsername, 'oewang_bot');
    });

    test(
      'link opens the one-time t.me link; resume picks up the link',
      () async {
        final model = vm();
        await model.load();
        await model.link();
        expect(opened.single.host, 't.me');
        expect(model.status!.linked, isFalse, reason: 'finished in Telegram');

        repo.completeLink();
        await model.load(); // what the screen runs on resume
        expect(model.status!.linked, isTrue);
        expect(model.status!.telegramUsername, 'someone');
      },
    );

    test('unlink ends the link and reloads', () async {
      final model = vm();
      repo.completeLink();
      await model.load();
      await model.unlink();
      expect(model.status!.linked, isFalse);
      expect(model.busy, isFalse);
    });

    test('no bot configured: shown as off, link refused', () async {
      final model = vm(enabled: false);
      await model.load();
      expect(model.status!.enabled, isFalse);
      await model.link();
      expect(model.error?.code, 'TELEGRAM_DISABLED');
      expect(opened, isEmpty);
    });

    test('Telegram not installed and no browser: says so', () async {
      final model = vm(opens: false);
      await model.link();
      expect(model.error?.message, 'Could not open Telegram');
    });
  });
}
