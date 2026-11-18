import '../data/inspection_recovery.dart';

class InspectionRecoveryStore {
  Future<InspectionRecoverySnapshot?> read(String owner) async => null;
  Future<void> save(String owner, InspectionRecoverySnapshot snapshot) async {}
  Future<void> markVersion(String owner, String id, int version) async {}
  Future<void> clear(String owner) async {}
  Future<List<InspectionRecoveryDraft>> list(String owner) async => [];
  Future<InspectionRecoverySnapshot?> readDraft(String owner, String id) =>
      read(owner);
  Future<void> clearDraft(String owner, String id) => clear(owner);
}
