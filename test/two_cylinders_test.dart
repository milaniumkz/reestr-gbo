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
            (w.decoration?.labelText ?? '').contains('ВТОРОГО'),
      );
      expect(second, findsNothing);
      await tester.tap(find.byType(CheckboxListTile));
      await tester.pump();
      expect(second, findsOneWidget);
      await tester.enterText(second, 'CYL-SECOND');
      await tester.tap(find.byType(CheckboxListTile));
      await tester.pump();
      expect(second, findsNothing);
      await tester.tap(find.byType(CheckboxListTile));
      await tester.pump();
      expect(tester.widget<TextField>(second).controller!.text, isEmpty);
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
