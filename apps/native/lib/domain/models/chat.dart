/// Chat sessions, messages and tool calls (MOB-8), as the web reads them in
/// `apps/app/src/lib/chat-tools.ts` and `artifacts.ts`.
library;

import 'package:flutter/foundation.dart';

/// One opened event of a turn's stream: its name and its JSON data.
typedef ChatEvent = ({String event, String data});

@immutable
class ChatSessionSummary {
  const ChatSessionSummary({
    required this.id,
    required this.title,
    required this.updatedAt,
    this.lastMessage,
  });

  final String id;
  final String title;
  final String? lastMessage;
  final DateTime updatedAt;
}

enum ChatRole { user, assistant, system }

@immutable
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    this.toolCalls = const [],
  });

  final String id;
  final ChatRole role;
  final String content;
  final List<ToolCall> toolCalls;
}

enum ToolStatus { running, ok, failed }

/// An analysis panel the API built for a tool call (D88). The payload is the
/// API's report, never the model's.
@immutable
class ChatArtifact {
  const ChatArtifact(this.kind, this.payload);

  static const kinds = {'spending', 'income', 'burn-rate', 'budget'};

  /// A kind this app does not draw is dropped, not shown empty.
  static ChatArtifact? read(Object? type, Object? payload) =>
      type is String && kinds.contains(type) && payload is Map<String, dynamic>
      ? ChatArtifact(type, payload)
      : null;

  final String kind;
  final Map<String, dynamic> payload;
}

@immutable
class ToolCall {
  const ToolCall({
    required this.id,
    required this.name,
    this.status = ToolStatus.running,
    this.summary,
    this.artifact,
  });

  final String id;
  final String name;
  final ToolStatus status;

  /// The API's one line about what it did; null until the call answers.
  final String? summary;
  final ChatArtifact? artifact;

  ToolCall copyWith({
    ToolStatus? status,
    String? summary,
    ChatArtifact? artifact,
  }) => ToolCall(
    id: id,
    name: name,
    status: status ?? this.status,
    summary: summary ?? this.summary,
    artifact: artifact ?? this.artifact,
  );
}

/// The tool calls stored on a message (`attachments.tool_calls`), every
/// field checked: the attachments are loose JSON.
List<ToolCall> toolCallsFromAttachments(Object? attachments) {
  final raw = attachments is Map ? attachments['tool_calls'] : null;
  if (raw is! List) return const [];
  return [
    for (final entry in raw.whereType<Map<String, dynamic>>())
      if (entry['id'] is String && entry['name'] is String) _storedCall(entry),
  ];
}

ToolCall _storedCall(Map<String, dynamic> entry) {
  final result = entry['result'];
  final artifact = entry['artifact'];
  return ToolCall(
    id: entry['id'] as String,
    name: entry['name'] as String,
    // A stored call without a result never answered: the turn ended first.
    status: result is! Map
        ? ToolStatus.running
        : result['ok'] == true
        ? ToolStatus.ok
        : ToolStatus.failed,
    summary: result is Map ? result['summary'] as String? : null,
    artifact: artifact is Map
        ? ChatArtifact.read(artifact['type'], artifact['payload'])
        : null,
  );
}

const _toolLabels = {
  'get_workspace_context': 'Reading this workspace',
  'get_recent_transactions': 'Looking up transactions',
  'search_transactions': 'Searching transactions',
  'get_spending_summary': 'Calculating summary',
  'get_spending_analysis': 'Analysing your spending',
  'get_income_summary': 'Summarising your income',
  'get_burn_rate': 'Computing your monthly burn rate',
  'get_budget_status': 'Checking your budget',
  'create_transaction': 'Creating transaction',
  'update_transaction': 'Updating transaction',
  'delete_transaction': 'Deleting transaction',
  'add_transaction_items': 'Adding line items',
  'create_wallet': 'Creating wallet',
  'create_category': 'Creating category',
  'present_choices': 'Asking you to choose',
};

/// A tool's label: written, or derived from `verb_noun` so a tool added on
/// the service side still reads as progress rather than as an identifier.
String toolLabel(String name) {
  final written = _toolLabels[name];
  if (written != null) return written;
  final words = name
      .toLowerCase()
      .split(RegExp('[^a-z0-9]+'))
      .where((w) => w.isNotEmpty)
      .toList();
  if (words.isEmpty) return 'Working';
  final label = [_gerund(words.first), ...words.skip(1)].join(' ');
  return label[0].toUpperCase() + label.substring(1);
}

String _gerund(String word) {
  if (word.endsWith('ie')) return '${word.substring(0, word.length - 2)}ying';
  if (word.endsWith('ee')) return '${word}ing';
  if (word.endsWith('e')) return '${word.substring(0, word.length - 1)}ing';
  if (RegExp(r'^[^aeiou]*[aeiou][^aeiouwxy]$').hasMatch(word)) {
    return '$word${word[word.length - 1]}ing';
  }
  return '${word}ing';
}

/// Assistant text for display. The model writes entity links in a private
/// scheme (`[Cash](#wallet:clx…)`, D33); here they read as their label, and
/// no other link is ever followed (an external link in model output is an
/// injection surface).
// shortcut: plain text, no Markdown rendering or tappable entity links;
// add a Markdown widget when the chat needs tables or deep links.
String displayText(String text) => text
    .replaceAllMapped(RegExp(r'\[([^\]]*)\]\([^)]*\)'), (m) => m[1]!)
    .replaceAll('**', '');
