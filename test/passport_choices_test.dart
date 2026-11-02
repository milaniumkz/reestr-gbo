import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/main.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'test_fonts.dart';

void main() {
  setUpAll(loadTestFonts);
  testWidgets(
    'passport offers physical camera, photo file and electronic PDF',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize = const Size(designWidth, designHeight);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        const MaterialApp(home: ErsiDemo(initialScreen: 20)),
      );
      await tester.pump(const Duration(milliseconds: 300));
      for (final label in [
        'Сфотографировать бумажный техпаспорт',
        'Загрузить фото техпаспорта',
        'Загрузить электронный PDF',
      ]) {
        expect(find.text(label), findsOneWidget);
      }
      expect(tester.takeException(), isNull);
    },
  );
}
