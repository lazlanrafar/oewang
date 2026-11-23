// The M4 path against a running local stack (MOB-8): scan a receipt into a
// saved transaction, upload, open, rename and delete a vault file, then ask
// the assistant about this month's spending over the sealed SSE stream and
// rename and delete that chat. Every call is OWE1 to the real API, and the
// chat and receipt answers come from the real AI service.
//
//   docker compose -f infra/docker-compose.yml up        # api on :3002
//   cd apps/native
//   fvm flutter drive -d <simulator> \
//     --driver=test_driver/integration_test.dart \
//     --target=integration_test/m4_ai_flow_test.dart \
//     --dart-define-from-file=env/dev.json \
//     --dart-define=FIXTURES=/tmp/oew-fixtures \
//     [--dart-define=M4_EMAIL=... --dart-define=M4_PASSWORD=...]
//
// Simulator only: the fixtures are read from the host's disk. Copy
// integration_test/fixtures to /tmp/oew-fixtures first: a simulator app that
// opens a file under ~/Documents blocks forever on macOS privacy (TCC), and
// `open` blocking freezes the whole UI isolate. Without
// M4_EMAIL the test signs up a new account and workspace (register is rate
// limited, so pass the printed credentials on later runs).
//
// The native photo picker cannot be driven from a test, so the picker's
// platform is replaced by one that hands back a fixture file.

import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker_platform_interface/image_picker_platform_interface.dart';
import 'package:integration_test/integration_test.dart';
import 'package:oewang/app.dart';
import 'package:oewang/components/organisms/auth/auth_onboarding_screen.dart';
import 'package:oewang/components/organisms/auth/auth_register_screen.dart';
import 'package:oewang/components/organisms/chat/chat_artifact_card.dart';
import 'package:oewang/components/organisms/chat/chat_screen.dart';
import 'package:oewang/components/organisms/chat/chat_sessions_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_form_screen.dart';
import 'package:oewang/components/organisms/vault/vault_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/services/push/push_messaging.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';
import 'package:oewang/domain/models/category.dart';
import 'package:oewang/domain/models/wallet.dart';

const _fixtures = String.fromEnvironment('FIXTURES');
const _email = String.fromEnvironment('M4_EMAIL');
const _password = String.fromEnvironment(
  'M4_PASSWORD',
  defaultValue: 'mobile-test-password-1',
);

/// A line the host reads from the run's output (credentials, screenshot
/// cues, the stream's shape).
// The test's console is the only channel back to the host.
// ignore: avoid_print
void _out(String line) => print(line);

/// No push: the system's notification prompt would sit over the app for the
/// whole run, and push is not what this flow checks.
class _NoPush implements PushMessaging {
  @override
  String get platform => 'ios';
  @override
  Future<bool> requestPermission() async => false;
  @override
  Future<String?> token() async => null;
  @override
  Stream<String> get tokenRefresh => const Stream.empty();
  @override
  Stream<String?> get tapped => const Stream.empty();
  @override
  Future<String?> launchedFrom() async => null;
}

/// Hands back the next queued file instead of opening the photo library.
class _FixturePicker extends ImagePickerPlatform {
  final next = <String>[];

  @override
  Future<XFile?> getImageFromSource({
    required ImageSource source,
    ImagePickerOptions options = const ImagePickerOptions(),
  }) async => XFile(next.removeAt(0));
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<void> waitFor(
    WidgetTester tester,
    Finder finder, {
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final end = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(end)) {
      await tester.pump(const Duration(milliseconds: 200));
      if (finder.evaluate().isNotEmpty) {
        await tester.pump(const Duration(milliseconds: 600));
        return;
      }
    }
    fail('timed out waiting for $finder');
  }

  Future<void> waitGone(WidgetTester tester, Finder finder) async {
    for (var i = 0; i < 150; i++) {
      if (finder.evaluate().isEmpty) return;
      await tester.pump(const Duration(milliseconds: 200));
    }
    fail('still showing $finder');
  }

  Future<void> tapText(WidgetTester tester, String label) async {
    // Closes the keyboard. Done would submit forms that save on Done.
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.ensureVisible(find.text(label).last);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text(label).last);
    await tester.pump(const Duration(milliseconds: 300));
  }

  /// Opens a row of the More tab, scrolling to it first.
  Future<void> openFromMore(WidgetTester tester, String title) async {
    await tester.tap(find.text('More').last);
    await waitFor(tester, find.text('Assistant'));
    await tester.tap(find.text(title).last);
    await tester.pump(const Duration(milliseconds: 600));
  }

  /// `binding.takeScreenshot` comes back blank once the keyboard has opened,
  /// so the host takes the picture: the run's output is watched for this
  /// line and `xcrun simctl io <udid> screenshot` is run on it.
  Future<void> shot(WidgetTester tester, String name) async {
    await tester.pump(const Duration(milliseconds: 400));
    _out('M4_SHOT $name');
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
  }

  Future<void> back(WidgetTester tester) async {
    await tester.tap(find.byIcon(Icons.chevron_left).last);
    await tester.pump(const Duration(milliseconds: 600));
  }

  testWidgets('MOB-8 receipt scan, vault and chat on the device', (
    tester,
  ) async {
    expect(_fixtures, isNotEmpty, reason: 'pass --dart-define=FIXTURES=...');
    expect(
      File('$_fixtures/receipt.jpg').existsSync(),
      isTrue,
      reason: 'no fixtures at $_fixtures',
    );
    final picker = _FixturePicker();
    ImagePickerPlatform.instance = picker;

    await Firebase.initializeApp();
    await SecureStorageService().clear();
    final prefs = await PreferencesService.open();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          envProvider.overrideWithValue(EnvConfig.fromDefines()),
          preferencesServiceProvider.overrideWithValue(prefs),
          pushMessagingProvider.overrideWithValue(_NoPush()),
        ],
        child: const OewangApp(),
      ),
    );
    await waitFor(tester, find.text('Login'));

    // 1. Sign in, or sign up once into a fresh workspace.
    if (_email.isNotEmpty) {
      await tester.enterText(find.byType(TextField).at(0), _email);
      await tester.enterText(find.byType(TextField).at(1), _password);
      await tester.pump();
      await tester.tap(find.text('Login'));
    } else {
      final stamp = DateTime.now().millisecondsSinceEpoch;
      final email = 'm4-$stamp@oewang.local';
      await tester.tap(find.text('Sign up'));
      await waitFor(tester, find.text('Create account'));
      Finder f(int i) => find
          .descendant(
            of: find.byType(RegisterScreen),
            matching: find.byType(TextField),
          )
          .at(i);
      await tester.enterText(f(0), 'M4 Test');
      await tester.enterText(f(1), email);
      await tester.enterText(f(2), _password);
      await tester.enterText(f(3), _password);
      _out('M4_CREDS {"M4_EMAIL":"$email","M4_PASSWORD":"$_password"}');
      await tapText(tester, 'Create account');
      await waitFor(tester, find.text('Create workspace'));
      await tester.enterText(
        find
            .descendant(
              of: find.byType(OnboardingScreen),
              matching: find.byType(TextField),
            )
            .first,
        'M4 $stamp',
      );
      await tapText(tester, 'Continue');
    }
    await waitFor(tester, find.text('Trans.'));

    final container = ProviderScope.containerOf(
      tester.element(find.byType(OewangApp)),
    );
    final category =
        ((await container
                    .read(categoriesRepositoryProvider)
                    .list(type: CategoryType.expense))
                as Success<List<Category>, AppError>)
            .value
            .first;
    final walletName =
        ((await container.read(walletsRepositoryProvider).list())
                as Success<List<Wallet>, AppError>)
            .value
            .first
            .name;

    // 2. Receipt scan: upload, parse, the form opens prefilled, save.
    picker.next.add('$_fixtures/receipt.jpg');
    await tester.tap(find.byTooltip('Scan a receipt'));
    await waitFor(tester, find.text('Choose from gallery'));
    await tester.tap(find.text('Choose from gallery'));
    await tester.pump(const Duration(milliseconds: 300));
    // The prefilled form; the queue offer when the reader did not answer
    // (AI_UNAVAILABLE, EXTRACTION_NO_ANSWER, a timeout); or a snackbar.
    final busy = find.text('The reader is busy');
    final form = find.byType(TransactionFormScreen);
    await waitFor(
      tester,
      find.byWidgetPredicate(
        (w) =>
            w is TransactionFormScreen ||
            w is SnackBar ||
            (w is Text && w.data == 'The reader is busy'),
      ),
      timeout: const Duration(seconds: 90),
    );
    if (busy.evaluate().isNotEmpty) {
      _out('M4_RECEIPT queued: the reader did not answer');
      await shot(tester, '01-receipt-busy');
      await tester.tap(find.text('Queue').last);
      await waitFor(tester, find.text('Queued. It will be read shortly.'));
      await shot(tester, '02-receipt-queued');
    } else if (find.byType(SnackBar).evaluate().isNotEmpty) {
      await shot(tester, '01-receipt-failed');
      final said = find
          .descendant(of: find.byType(SnackBar), matching: find.byType(Text))
          .evaluate()
          .map((e) => (e.widget as Text).data)
          .join(' ');
      fail('receipt scan said: $said');
    } else {
      _out('M4_RECEIPT prefilled');
      // The reader's total, as the form shows it.
      expect(
        find.descendant(of: form, matching: find.textContaining('60.000')),
        findsWidgets,
        reason: 'the form did not open prefilled with the receipt total',
      );
      await shot(tester, '01-receipt-prefilled');
      await tapText(tester, 'Category');
      await waitFor(tester, find.text(category.name));
      await tester.tap(find.text(category.name).last);
      await tester.pump(const Duration(milliseconds: 500));
      if (find.text(walletName).evaluate().isEmpty) {
        await tapText(tester, 'Account');
      }
      await waitFor(tester, find.text(walletName));
      await tester.tap(find.text(walletName).last);
      await tester.pump(const Duration(milliseconds: 500));
      await tapText(tester, 'Save');
      await waitGone(tester, form);
      await waitFor(tester, find.textContaining('60.000'));
      await shot(tester, '02-receipt-saved');
    }

    // 3. Vault: upload, thumbnail, open, rename, delete.
    await openFromMore(tester, 'Vault');
    final vault = find.byType(VaultScreen);
    await waitFor(
      tester,
      find.descendant(of: vault, matching: find.byType(Image)),
    );
    picker.next.add('$_fixtures/vault.jpg');
    await tester.tap(find.byTooltip('Upload'));
    await waitFor(
      tester,
      find.descendant(of: vault, matching: find.text('vault.jpg')),
      timeout: const Duration(seconds: 40),
    );
    // Two thumbnails now: the receipt and this upload.
    final thumbs = find.descendant(of: vault, matching: find.byType(Image));
    for (var i = 0; i < 50 && thumbs.evaluate().length < 2; i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
    expect(thumbs, findsAtLeastNWidgets(2));
    await shot(tester, '03-vault-thumbnails');
    await tester.tap(find.text('vault.jpg').last);
    await waitFor(tester, find.text('Open or share'));
    await waitFor(tester, find.byTooltip('Rename'));
    await shot(tester, '04-vault-sheet');
    await tester.tap(find.byTooltip('Rename'));
    await waitFor(tester, find.text('Rename'));
    await tester.enterText(find.byType(TextField).last, 'vault-renamed.jpg');
    await tapText(tester, 'Save');
    await waitFor(tester, find.text('vault-renamed.jpg'));
    await shot(tester, '05-vault-renamed');
    await tapText(tester, 'Delete');
    await waitFor(tester, find.text('Delete vault-renamed.jpg?'));
    await tester.tap(find.text('Delete').last);
    await waitGone(tester, find.text('vault-renamed.jpg'));
    await back(tester);

    // 4. Chat: a new session, a question that needs a tool, the answer
    // streamed in parts.
    await openFromMore(tester, 'Chat');
    await waitFor(tester, find.byType(ChatSessionsScreen));
    await tester.tap(find.byTooltip('New chat'));
    await waitFor(tester, find.byType(ChatScreen));
    await tester.enterText(
      find.descendant(
        of: find.byType(ChatScreen),
        matching: find.byType(TextField),
      ),
      'How much did I spend this month?',
    );
    await tester.pump();
    await tester.tap(find.byTooltip('Send'));
    await tester.pump(const Duration(milliseconds: 300));

    final vm = container.read(chatVmProvider(null));
    final partials = <int>{};
    final end = DateTime.now().add(const Duration(seconds: 120));
    while (DateTime.now().isBefore(end)) {
      await tester.pump(const Duration(milliseconds: 100));
      if (vm.turn.isActive) {
        if (vm.turn.text.isNotEmpty && partials.add(vm.turn.text.length)) {
          if (partials.length == 2) _out('M4_SHOT 06-chat-streaming');
        }
      } else if (vm.messages.length >= 2 || vm.turn.errorCode != null) {
        break;
      }
    }
    expect(vm.turn.errorCode, isNull, reason: 'the turn failed');
    expect(vm.messages.last.content, isNotEmpty);
    expect(vm.messages.last.toolCalls, isNotEmpty, reason: 'no tool was used');
    expect(partials.length, greaterThan(1), reason: 'not streamed in parts');
    _out(
      'M4_STREAM parts=${partials.length} '
      'tools=${vm.messages.last.toolCalls.map((c) => c.name).toList()} '
      'artifact=${find.byType(ChatArtifactCard).evaluate().isNotEmpty}',
    );
    await shot(tester, '07-chat-answer');

    // 5. Rename and delete the session from the list.
    await back(tester);
    final sessions = find.byType(ChatSessionsScreen);
    await waitFor(
      tester,
      find.descendant(of: sessions, matching: find.byType(ListTile)),
    );
    await tester.longPress(
      find.descendant(of: sessions, matching: find.byType(ListTile)).first,
    );
    await waitFor(tester, find.text('Rename'));
    await tester.tap(find.text('Rename').last);
    await waitFor(tester, find.byType(TextField));
    await tester.enterText(find.byType(TextField).last, 'M4 spending');
    await tapText(tester, 'Save');
    await waitFor(
      tester,
      find.descendant(of: sessions, matching: find.text('M4 spending')),
    );
    await shot(tester, '08-chat-renamed');
    await tester.longPress(find.text('M4 spending').last);
    await waitFor(tester, find.text('Delete'));
    await tester.tap(find.text('Delete').last);
    await waitFor(tester, find.text('Delete chat?'));
    await tester.tap(find.text('Delete').last);
    await waitGone(
      tester,
      find.descendant(of: sessions, matching: find.text('M4 spending')),
    );
    await shot(tester, '09-chat-deleted');
  });
}
