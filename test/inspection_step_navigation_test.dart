import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/main.dart';
import 'package:reestr_ts_demo/data/inspection_recovery.dart';
import 'inspection_recovery_test.dart' show MemoryRecovery, repositories;
import 'test_fonts.dart';

final original = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGP4z8AARww4OQD1MQv1NXv7ggAAAABJRU5ErkJggg==',
);
final docs = [
  'applicant_application',
  'gas_work_record',
  'cylinder_work_record',
  'gas_inspection_report',
  'cylinder_inspection_report',
];
InspectionRecoverySnapshot seed(
  int step, {
  Map<String, dynamic> fields = const {},
  Map<String, List<int>>? files,
}) => InspectionRecoverySnapshot(
  fields: {
    'screen': step,
    'organizationId': 'org',
    'ownerName': 'SYNTHETIC OWNER',
    'ownerAddress': 'TEST ADDRESS',
    'inspectionCertificateNumber': '777',
    'cylinderNumber': 'TEST-1',
    'cylinderPhotoName': 'tag.png',
    'vehiclePhotoName': 'vehicle.png',
    'techPassportPhotoName': 'passport.png',
    'packageDocumentNames': {for (final type in docs) type: '$type.png'},
    ...fields,
  },
  files:
      files ??
      {
        'primary_cylinder': original,
        'primary_vehicle': original,
        'primary_tech': original,
        for (final type in docs) type: original,
      },
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
  Future<MemoryRecovery> open(
    WidgetTester t,
    InspectionRecoverySnapshot snapshot,
  ) async {
    final store = MemoryRecovery()..entries['inspector'] = snapshot;
    await t.pumpWidget(
      MaterialApp(
        home: ErsiDemo(
          key: UniqueKey(),
          repositories: repositories(),
          recoveryStore: store,
        ),
      ),
    );
    await t.pumpAndSettle();
    return store;
  }

  Future<void> dismissNotice(WidgetTester t) async {
    final close = find.byIcon(Icons.close_rounded);
    if (close.evaluate().isNotEmpty) {
      await t.tap(close.first);
      await t.pumpAndSettle();
    }
  }

  Future<void> back(WidgetTester t) async {
    await dismissNotice(t);
    await t.tap(find.byIcon(Icons.chevron_left_rounded).first);
    await t.pumpAndSettle();
  }

  Future<void> forward(WidgetTester t, String label) async {
    await dismissNotice(t);
    final button = find.text(label);
    await t.ensureVisible(button);
    await t.tap(button);
    await t.pump(const Duration(milliseconds: 450));
    await t.pumpAndSettle();
  }

  for (final starting in [19, 23]) {
    testWidgets(
      'restored step $starting returns through every preceding step without leaving or losing files',
      (t) async {
        final store = await open(t, seed(starting));
        for (var step = starting - 1; step >= 15; step--) {
          await back(t);
          expect(store.entries['inspector']!.fields['screen'], step);
          expect(
            store.entries['inspector']!.fields['ownerName'],
            'SYNTHETIC OWNER',
          );
          expect(
            store.entries['inspector']!.files['primary_cylinder'],
            original,
          );
          expect(find.text('Мои инспекции'), findsNothing);
          if (step == 18) {
            await forward(t, 'Далее');
            expect(store.entries['inspector']!.fields['screen'], 19);
            await back(t);
            expect(store.entries['inspector']!.fields['screen'], 18);
          }
        }
        expect(store.cleared, isEmpty);
        await back(t);
        expect(find.text('Мои инспекции'), findsOneWidget);
        expect(store.entries['inspector']!.files['primary_cylinder'], original);
        await t.pumpWidget(const SizedBox());
      },
    );
  }
  for (final step in [18, 19, 20]) {
    testWidgets(
      'a filename without accepted bytes never enables the photo next button at $step',
      (t) async {
        await open(t, seed(step, files: {}));
        expect(find.text('Далее'), findsNothing);
        await t.pumpWidget(const SizedBox());
      },
    );
  }
  testWidgets(
    'missing first tag in a resumed vehicle step routes straight to the tag instead of skipping it',
    (t) async {
      final store = await open(
        t,
        seed(19, files: {'primary_vehicle': original}),
      );
      await forward(t, 'Далее');
      expect(store.entries['inspector']!.fields['screen'], 18);
      expect(find.text('Ошибка: Добавьте фото бирки баллона'), findsOneWidget);
      await t.pumpWidget(const SizedBox());
    },
  );
  testWidgets('two cylinders cannot advance with an empty second tag file', (
    t,
  ) async {
    final store = await open(
      t,
      seed(
        18,
        fields: {'usesTwoCylinders': true, 'secondCylinderNumber': 'TEST-2'},
        files: {'primary_cylinder': original, 'cylinder_label_2': []},
      ),
    );
    await forward(t, 'Далее');
    expect(store.entries['inspector']!.fields['screen'], 18);
    expect(find.text('Добавьте фото бирки второго баллона'), findsOneWidget);
    await t.pumpWidget(const SizedBox());
  });
  testWidgets(
    'a resumed validity step with missing passport goes directly to its photo step',
    (t) async {
      final store = await open(
        t,
        seed(
          21,
          files: {'primary_cylinder': original, 'primary_vehicle': original},
        ),
      );
      await forward(t, 'Продолжить');
      expect(store.entries['inspector']!.fields['screen'], 20);
      expect(find.text('Ошибка: Добавьте техпаспорт'), findsOneWidget);
      await t.pumpWidget(const SizedBox());
    },
  );
  testWidgets('document filenames alone cannot enable review', (t) async {
    await open(
      t,
      seed(
        22,
        files: {
          'primary_cylinder': original,
          'primary_vehicle': original,
          'primary_tech': original,
        },
      ),
    );
    expect(find.text('Далее'), findsNothing);
    await t.pumpWidget(const SizedBox());
  });
  testWidgets(
    'final local missing-tag error goes to the tag, not cylinder data, and back remains sequential',
    (t) async {
      final store = await open(
        t,
        seed(
          23,
          files: {
            'primary_vehicle': original,
            'primary_tech': original,
            for (final type in docs) type: original,
          },
        ),
      );
      await forward(t, 'Отправить в контроль качества');
      expect(store.entries['inspector']!.fields['screen'], 18);
      await back(t);
      expect(store.entries['inspector']!.fields['screen'], 17);
      expect(store.entries['inspector']!.files['primary_vehicle'], original);
      await t.pumpWidget(const SizedBox());
    },
  );
}
