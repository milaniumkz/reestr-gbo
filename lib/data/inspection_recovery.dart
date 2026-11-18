import 'dart:math';

/// Pending form state only. Never contains auth tokens, passwords or identity videos.
class InspectionRecoverySnapshot {
  const InspectionRecoverySnapshot({required this.fields, required this.files});
  final Map<String, dynamic> fields;
  final Map<String, List<int>> files;
}

String newInspectionDraftId() {
  final random = Random.secure();
  final bytes = List.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

class InspectionRecoveryDraft {
  const InspectionRecoveryDraft({
    required this.id,
    required this.fields,
    required this.savedAt,
  });
  final String id;
  final Map<String, dynamic> fields;
  final String savedAt;
}
