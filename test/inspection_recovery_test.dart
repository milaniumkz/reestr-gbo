import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/main.dart';
import 'package:reestr_ts_demo/data/api_client.dart';
import 'package:reestr_ts_demo/data/repositories.dart';
import 'package:reestr_ts_demo/data/inspection_recovery.dart';
import 'package:reestr_ts_demo/platform/inspection_recovery_store.dart';
import 'test_fonts.dart';

class MemoryRecovery extends InspectionRecoveryStore {
  final Map<String, InspectionRecoverySnapshot> entries = {};
  final reads = <String>[];
  final cleared = <String>[];
  bool failWrites = false;
  @override
  Future<InspectionRecoverySnapshot?> read(String owner) async {
    reads.add(owner);
    return entries[owner];
  }

  @override
  Future<void> save(String owner, InspectionRecoverySnapshot snapshot) async {
    if (failWrites) throw StateError('quota');
    entries[owner] = snapshot;
  }

  @override
  Future<void> clear(String owner) async {
    cleared.add(owner);
    entries.remove(owner);
  }
}

AppRepositories repositories({
  String user = 'inspector',
  bool verified = true,
  String draftStatus = 'draft',
}) => AppRepositories(
  api: ApiClient(
    baseUrl: 'https://example.test',
    httpClient: MockClient((r) async {
      Object json = {'items': []};
      final p = r.url.path;
      if (p == '/auth/refresh') {
        json = {
          'accessToken': 'token',
          'refreshToken': 'refresh',
          'user': {
            'sub': user,
            'phone': '+77000000000',
            'roles': ['inspection_org'],
          },
        };
      }
      if (p == '/auth/identity/status') {
        json = verified ? {'required': true, 'verified': true} : {};
      }
      if (p == '/organizations') {
        json = {
          'items': [
            {
              'id': 'org',
              'bin': '123456789012',
              'type': 'inspection_org',
              'name': 'Test IO',
              'status': 'active',
              'members': [
                {
                  'id': 'm',
                  'userId': user,
                  'role': 'inspector',
                  'user': {'id': user},
                },
              ],
            },
          ],
        };
      }
      if (p == '/inspections/existing') {
        json = {
          'id': 'existing',
          'status': draftStatus,
          'certificateNumber': '777',
          'organization': {'id': 'org', 'name': 'Test IO'},
          'vehicle': {},
          'cylinder': {},
        };
      }
      return http.Response(
        jsonEncode(json),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }),
  ),
);
InspectionRecoverySnapshot snapshot({
  int screen = 15,
  String organization = 'org',
  String? draftId,
  Map<String, List<int>> files = const {},
}) => InspectionRecoverySnapshot(
  fields: {
    'screen': screen,
    'organizationId': organization,
    'ownerName': 'RECOVERED OWNER',
    'inspectionCertificateNumber': '777',
    'draftInspectionId': draftId,
    'cylinderPhotoName': files.isNotEmpty ? 'original.png' : null,
  },
  files: files,
);
void main() {
  setUpAll(loadTestFonts);
  setUp(
    () => SharedPreferences.setMockInitialValues({
      'accessToken': 'old',
      'refreshToken': 'refresh',
      'lastRoleCode': 'inspection_org',
      'lastOrganizationBin': '123456789012',
      'diagnosticLocationAsked': true,
    }),
  );
  Future<void> open(
    WidgetTester t,
    MemoryRecovery store, {
    String user = 'inspector',
    bool verified = true,
    String draftStatus = 'draft',
  }) async {
    await t.pumpWidget(
      MaterialApp(
        home: ErsiDemo(
          key: UniqueKey(),
          repositories: repositories(
            user: user,
            verified: verified,
            draftStatus: draftStatus,
          ),
          recoveryStore: store,
        ),
      ),
    );
    await t.pumpAndSettle();
  }

  testWidgets(
    'restores the actual step and persists edits instead of resetting to home',
    (t) async {
      final store = MemoryRecovery()..entries['inspector'] = snapshot();
      await open(t, store);
      final field = find
          .byType(TextField)
          .evaluate()
          .map((e) => e.widget as TextField)
          .firstWhere((f) => f.controller?.text == 'RECOVERED OWNER');
      await t.enterText(find.byWidget(field), 'NEW OWNER');
      await t.pump(const Duration(milliseconds: 450));
      expect(store.entries['inspector']!.fields['ownerName'], 'NEW OWNER');
      expect(
        store.entries['inspector']!.fields.keys,
        isNot(contains('authPassword')),
      );
      expect(
        store.entries['inspector']!.fields.keys,
        isNot(contains('accessToken')),
      );
      await t.pumpWidget(const SizedBox());
      await open(t, store);
      expect(
        t
            .widgetList<TextField>(find.byType(TextField))
            .any((f) => f.controller?.text == 'NEW OWNER'),
        isTrue,
      );
      await t.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'retired questionnaire is absent from package UI and legacy drafts while application stays',
    (t) async {
      final bytes = base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGP4z8AARww4OQD1MQv1NXv7ggAAAABJRU5ErkJggg==',
      );
      final seed = snapshot(screen: 22);
      final store = MemoryRecovery()
        ..entries['inspector'] = InspectionRecoverySnapshot(
          fields: {
            ...seed.fields,
            'packageDocumentNames': {
              'applicant_questionnaire': 'old.png',
              'applicant_application': 'application.png',
            },
            'packageDocumentUploaded': {
              'applicant_questionnaire': false,
              'applicant_application': false,
            },
          },
          files: {
            'applicant_questionnaire': bytes,
            'applicant_application': bytes,
          },
        );
      await open(t, store);
      expect(find.text('Заявка заявителя'), findsOneWidget);
      expect(find.text('Анкета оценки заявителя'), findsNothing);
      expect(find.text('5 обязательных файлов'), findsOneWidget);
      await t.pump(const Duration(milliseconds: 450));
      expect(
        store.entries['inspector']!.files.keys,
        contains('applicant_application'),
      );
      expect(
        store.entries['inspector']!.files.keys,
        isNot(contains('applicant_questionnaire')),
      );
      expect(
        (store.entries['inspector']!.fields['packageDocumentNames'] as Map)
            .keys,
        isNot(contains('applicant_questionnaire')),
      );
      await t.pumpWidget(const SizedBox());
    },
  );
  testWidgets('restores accepted original photo bytes on the photo step', (
    t,
  ) async {
    final bytes = base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGP4z8AARww4OQD1MQv1NXv7ggAAAABJRU5ErkJggg==',
    );
    final store = MemoryRecovery()
      ..entries['inspector'] = snapshot(
        screen: 18,
        files: {'primary_cylinder': bytes},
      );
    await open(t, store);
    final providers = t
        .widgetList<Image>(find.byType(Image))
        .map((w) => w.image)
        .whereType<ResizeImage>();
    expect(
      providers.any(
        (p) =>
            p.imageProvider is MemoryImage &&
            base64Encode((p.imageProvider as MemoryImage).bytes) ==
                base64Encode(bytes),
      ),
      isTrue,
    );
    await t.pumpWidget(const SizedBox());
  });
  testWidgets(
    'never restores another account or organization and still verifies identity first',
    (t) async {
      final store = MemoryRecovery()..entries['other'] = snapshot();
      await open(t, store);
      expect(store.reads, ['inspector']);
      expect(
        t
            .widgetList<TextField>(find.byType(TextField))
            .any((f) => f.controller?.text == 'RECOVERED OWNER'),
        isFalse,
      );
      await t.pumpWidget(const SizedBox());
      store.entries['inspector'] = snapshot(organization: 'different');
      await open(t, store);
      expect(
        t
            .widgetList<TextField>(find.byType(TextField))
            .any((f) => f.controller?.text == 'RECOVERED OWNER'),
        isFalse,
      );
      await t.pumpWidget(const SizedBox());
      store.reads.clear();
      await open(t, store, verified: false);
      expect(store.reads, isEmpty);
      await t.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'completed server inspections are not reopened as local editable drafts',
    (t) async {
      final store = MemoryRecovery()
        ..entries['inspector'] = snapshot(draftId: 'existing');
      await open(t, store, draftStatus: 'submitted');
      expect(store.cleared, ['inspector']);
      expect(
        t
            .widgetList<TextField>(find.byType(TextField))
            .any((f) => f.controller?.text == 'RECOVERED OWNER'),
        isFalse,
      );
      await t.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'storage failures leave the inspector and entered fields on the same step',
    (t) async {
      final store = MemoryRecovery()
        ..entries['inspector'] = snapshot()
        ..failWrites = true;
      await open(t, store);
      final field = t
          .widgetList<TextField>(find.byType(TextField))
          .firstWhere((f) => f.controller?.text == 'RECOVERED OWNER');
      await t.enterText(find.byWidget(field), 'UNSAVED OWNER');
      await t.pump(const Duration(milliseconds: 450));
      await t.pump();
      expect(
        t
            .widgetList<TextField>(find.byType(TextField))
            .any((f) => f.controller?.text == 'UNSAVED OWNER'),
        isTrue,
      );
      await t.pumpWidget(const SizedBox());
    },
  );
}
