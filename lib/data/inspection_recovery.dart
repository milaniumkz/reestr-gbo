/// Pending form state only. Never contains auth tokens, passwords or identity videos.
class InspectionRecoverySnapshot {
  const InspectionRecoverySnapshot({required this.fields, required this.files});
  final Map<String, dynamic> fields;
  final Map<String, List<int>> files;
}
