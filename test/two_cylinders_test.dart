import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/main.dart';
import 'package:reestr_ts_demo/data/models.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'test_fonts.dart';

void main() {
  setUpAll(loadTestFonts);
  testWidgets(
    'second serial is conditional and cleared when returning to a single cylinder',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize = const Size(designWidth, designHeight);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        const MaterialApp(home: ErsiDemo(initialScreen: 17)),
      );
      await tester.pump(const Duration(milliseconds: 300));
      final second = find.byWidgetPredicate(
        (w) =>
            w is TextField &&
            w.decoration?.labelText == 'НОМЕР ВТОРОГО БАЛЛОНА',
      );
      expect(second, findsNothing);
      await tester.tap(find.byType(CheckboxListTile));
      await tester.pump();
      expect(second, findsOneWidget);
      await tester.ensureVisible(second);
      await tester.enterText(second, 'CYL-SECOND');
      await tester.ensureVisible(find.byType(CheckboxListTile));
      await tester.tap(find.byType(CheckboxListTile));
      await tester.pump();
      expect(second, findsNothing);
      await tester.tap(find.byType(CheckboxListTile));
      await tester.pump();
      expect(tester.widget<TextField>(second).controller!.text, isEmpty);
    },
  );
  testWidgets('independent cylinder fields keep gas and GBO equipment shared', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(designWidth, designHeight);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      const MaterialApp(home: ErsiDemo(initialScreen: 17)),
    );
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pump();
    for (final label in ['НОМЕР ВТОРОГО БАЛЛОНА', 'ОБЪЕМ ВТОРОГО БАЛЛОНА']) {
      expect(
        find.byWidgetPredicate(
          (w) => w is TextField && w.decoration?.labelText == label,
        ),
        findsOneWidget,
      );
    }
    expect(find.text('Тип второго баллона'), findsOneWidget);
    expect(find.textContaining('Редуктор второго'), findsNothing);
    expect(find.textContaining('ЭБУ второго'), findsNothing);
    expect(find.textContaining('Тип газа второго'), findsNothing);
    Finder field(String label) => find.byWidgetPredicate(
      (w) => w is TextField && w.decoration?.labelText == label,
    );
    await tester.ensureVisible(field('ОБЪЕМ'));
    await tester.enterText(field('ОБЪЕМ'), '54');
    await tester.ensureVisible(field('ОБЪЕМ ВТОРОГО БАЛЛОНА'));
    await tester.enterText(field('ОБЪЕМ ВТОРОГО БАЛЛОНА'), '80');
    expect(tester.widget<TextField>(field('ОБЪЕМ')).controller!.text, '54');
    expect(
      tester.widget<TextField>(field('ОБЪЕМ ВТОРОГО БАЛЛОНА')).controller!.text,
      '80',
    );
    final firstShape = find.ancestor(
      of: find.text('Тороидальный').first,
      matching: find.byType(Chip),
    );
    final secondShape = find.ancestor(
      of: find.text('Цилиндрический').last,
      matching: find.byType(Chip),
    );
    await tester.ensureVisible(firstShape);
    await tester.tap(firstShape);
    await tester.pump();
    await tester.ensureVisible(secondShape);
    await tester.tap(secondShape);
    await tester.pump();
    expect(
      tester.widget<Chip>(firstShape).backgroundColor,
      isNot(Colors.white),
    );
    expect(
      tester.widget<Chip>(secondShape).backgroundColor,
      isNot(Colors.white),
    );
    await tester.ensureVisible(find.text('Продолжить'));
    await tester.tap(find.text('Продолжить'));
    await tester.pump();
    expect(find.textContaining('производитель второго баллона'), findsWidgets);
  });
  test(
    'restores complete independent values without filling legacy gaps from the first cylinder',
    () {
      final data = {
        'usesTwoCylinders': true,
        'secondCylinderSerial': 'B',
        'secondCylinderManufacturer': 'SECOND',
        'secondCylinderVolumeLiters': 80,
        'secondCylinderShape': 'Цилиндрический',
        'secondCylinderProducedAt': '2025-02-01T00:00:00Z',
        'secondCylinderInspectedAt': '2026-11-02T00:00:00Z',
        'secondCylinderValidUntil': '2028-11-02T00:00:00Z',
        'vehicle': {
          'cylinders': [
            {
              'serialNumber': 'A',
              'manufacturer': 'FIRST',
              'volumeLiters': 54,
              'shape': 'Тороидальный',
              'fuelType': 'СНГ',
            },
          ],
        },
      };
      final item = InspectionSummary.fromJson(data);
      expect(item.cylinderManufacturer, 'FIRST');
      expect(item.cylinderVolume, '54');
      expect(item.cylinderShape, 'Тороидальный');
      expect(item.secondCylinder.manufacturer, 'SECOND');
      expect(item.secondCylinder.volume, '80');
      expect(item.secondCylinder.shape, 'Цилиндрический');
      expect(item.secondCylinder.producedAt, '2025-02-01');
      expect(item.secondCylinder.validUntil, '2028-11-02');
      final certificate = RegistryVehicle.fromCertificateJson({
        'inspection': data,
        'vehicle': data['vehicle'],
      });
      expect(certificate.secondCylinder.manufacturer, 'SECOND');
      data.remove('secondCylinderManufacturer');
      expect(
        InspectionSummary.fromJson(data).secondCylinder.manufacturer,
        isEmpty,
      );
    },
  );
  test('restores pair and ignores obsolete second-cylinder documents', () {
    final item = InspectionSummary.fromJson({
      'usesTwoCylinders': true,
      'secondCylinderSerial': 'B',
      'photos': [
        {'id': 'old', 'type': 'cylinder_work_record_2', 'cylinderSerial': 'A'},
        {
          'id': 'current',
          'type': 'cylinder_work_record_2',
          'cylinderSerial': 'B',
        },
        {'id': 'first', 'type': 'cylinder_work_record'},
      ],
    });
    expect(item.usesTwoCylinders, isTrue);
    expect(item.secondCylinderSerial, 'B');
    expect(item.files.map((f) => f.id), ['current', 'first']);
    final legacy = InspectionSummary.fromJson({});
    expect(legacy.usesTwoCylinders, isFalse);
  });
}
