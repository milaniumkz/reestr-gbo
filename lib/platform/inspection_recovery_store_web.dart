import 'dart:convert';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';
import '../data/inspection_recovery.dart';

@JS('ersiInspectionRecovery.read')
external JSPromise<JSAny?> _read(JSString owner, [JSString? id]);
@JS('ersiInspectionRecovery.list')
external JSPromise<JSArray<JSObject>> _list(JSString owner);
@JS('ersiInspectionRecovery.save')
external JSPromise<JSAny?> _save(
  JSString owner,
  JSString fields,
  JSArray<JSObject> files,
);
@JS('ersiInspectionRecovery.markVersion')
external JSPromise<JSAny?> _markVersion(
  JSString owner,
  JSString id,
  JSNumber version,
);
@JS('ersiInspectionRecovery.clear')
external JSPromise<JSAny?> _clear(JSString owner, [JSString? id]);

class InspectionRecoveryStore {
  final _versions = Expando<int>();
  int _nextVersion = 0;
  Future<void> markVersion(String owner, String id, int version) async {
    await _markVersion(owner.toJS, id.toJS, version.toJS).toDart;
  }

  Future<List<InspectionRecoveryDraft>> list(String owner) async => [
    for (final item in (await _list(owner.toJS).toDart).toDart)
      InspectionRecoveryDraft(
        id: item.getProperty<JSString>('id'.toJS).toDart,
        fields:
            jsonDecode(item.getProperty<JSString>('fields'.toJS).toDart)
                as Map<String, dynamic>,
        savedAt: item.getProperty<JSString>('savedAt'.toJS).toDart,
      ),
  ];
  Future<InspectionRecoverySnapshot?> readDraft(String owner, String id) =>
      _readSnapshot(owner, id);
  Future<void> clearDraft(String owner, String id) async {
    await _clear(owner.toJS, id.toJS).toDart;
  }

  Future<InspectionRecoverySnapshot?> read(String owner) =>
      _readSnapshot(owner, null);
  Future<InspectionRecoverySnapshot?> _readSnapshot(
    String owner,
    String? id,
  ) async {
    final raw = await _read(owner.toJS, id?.toJS).toDart;
    if (raw == null) return null;
    final result = raw as JSObject;
    final fields =
        jsonDecode(result.getProperty<JSString>('fields'.toJS).toDart)
            as Map<String, dynamic>;
    final files = <String, List<int>>{};
    for (final entry
        in result.getProperty<JSArray<JSObject>>('files'.toJS).toDart) {
      files[entry.getProperty<JSString>('type'.toJS).toDart] = entry
          .getProperty<JSUint8Array>('bytes'.toJS)
          .toDart;
    }
    return InspectionRecoverySnapshot(fields: fields, files: files);
  }

  Future<void> save(String owner, InspectionRecoverySnapshot snapshot) async {
    final files = <JSObject>[];
    for (final entry in snapshot.files.entries) {
      final file = JSObject();
      final bytes = entry.value is Uint8List
          ? entry.value as Uint8List
          : Uint8List.fromList(entry.value);
      file.setProperty('type'.toJS, entry.key.toJS);
      file.setProperty('bytes'.toJS, bytes.toJS);
      file.setProperty(
        'version'.toJS,
        (_versions[entry.value] ??= ++_nextVersion).toJS,
      );
      files.add(file);
    }
    await _save(
      owner.toJS,
      jsonEncode(snapshot.fields).toJS,
      files.toJS,
    ).toDart;
  }

  Future<void> clear(String owner) async {
    await _clear(owner.toJS).toDart;
  }
}
