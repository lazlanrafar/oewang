import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/molecules/segmented_tabs.dart';
import 'package:oewang/components/organisms/settings/feedback/feedback_form_view_model.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/data/repositories/feedback_repository.dart';

final feedbackFormVmProvider = ChangeNotifierProvider.autoDispose(
  (ref) => FeedbackFormViewModel(feedback: ref.watch(feedbackRepositoryProvider)),
);

class FeedbackFormScreen extends ConsumerStatefulWidget {
  const FeedbackFormScreen({super.key});

  @override
  ConsumerState<FeedbackFormScreen> createState() => _FeedbackFormScreenState();
}

class _FeedbackFormScreenState extends ConsumerState<FeedbackFormScreen> {
  Future<void> _pickScreenshot(FeedbackFormViewModel vm) async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 90,
    );
    if (picked == null) return;
    vm.setScreenshot(File(picked.path));
  }

  Future<void> _onSend(FeedbackFormViewModel vm) async {
    await vm.submit();
    if (!mounted) return;
    if (vm.save.error == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Thanks — we got it.')));
      Navigator.of(context).pop(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final vm = ref.watch(feedbackFormVmProvider);

    return Scaffold(
      appBar: const PageAppBar(title: 'Send Feedback', backLabel: 'Settings'),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 16),
                children: [
                  OewangSegmentedTabs<FeedbackType>(
                    selected: vm.state.type,
                    onChanged: vm.setType,
                    segments: const [
                      SegmentItem(value: FeedbackType.bug, label: 'Bug'),
                      SegmentItem(
                        value: FeedbackType.featureRequest,
                        label: 'Feature',
                      ),
                      SegmentItem(value: FeedbackType.other, label: 'Other'),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Input(
                      variant: InputVariant.underline,
                      hintText: 'What happened, or what would you like to see?',
                      maxLines: 5,
                      minLines: 3,
                      onChanged: vm.setMessage,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        TextButton.icon(
                          onPressed: () => _pickScreenshot(vm),
                          icon: const Icon(Icons.image_outlined),
                          label: Text(
                            vm.state.screenshot == null
                                ? 'Attach screenshot'
                                : 'Change screenshot',
                          ),
                        ),
                        if (vm.state.screenshot != null)
                          IconButton(
                            tooltip: 'Remove',
                            onPressed: () => vm.setScreenshot(null),
                            icon: const Icon(Icons.close),
                          ),
                      ],
                    ),
                  ),
                  if (vm.state.screenshot != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: ClipRRect(
                        child: Image.file(
                          vm.state.screenshot!,
                          height: 120,
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                  if (vm.save.error != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      child: Text(
                        vm.save.error!.message,
                        textAlign: TextAlign.center,
                        style: OewangFonts.sans(color: OewangColors.coral),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Button(
                label: 'Send',
                loading: vm.save.running,
                onPressed: vm.canSave ? () => _onSend(vm) : null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
