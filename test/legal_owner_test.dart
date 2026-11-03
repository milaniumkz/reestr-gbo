import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/main.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'test_fonts.dart';

void main() {
  setUpAll(loadTestFonts);
  testWidgets('legal owner requires BIN and individual keeps existing fields', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(designWidth, designHeight);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      const MaterialApp(home: ErsiDemo(initialScreen: 15, showStepper: false)),
    );
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('БИН ВЛАДЕЛЬЦА'), findsNothing);
    await tester.tap(find.text('Юридическое лицо'));
    await tester.pump();
    expect(find.text('БИН ВЛАДЕЛЬЦА'), findsOneWidget);
    final binField = find.widgetWithText(TextField, 'ВВЕДИТЕ БИН ИЗ 12 ЦИФР');
    await tester.enterText(binField, '0011400000019abc');
    expect(find.text('001140000001'), findsOneWidget);
    await tester.tap(find.text('Физическое лицо'));
    await tester.pump();
    expect(find.text('БИН ВЛАДЕЛЬЦА'), findsNothing);
    await tester.tap(find.text('Юридическое лицо'));
    await tester.pump();
    expect(find.text('001140000001'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
