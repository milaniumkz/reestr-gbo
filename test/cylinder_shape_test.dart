import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/main.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'test_fonts.dart';

void main() {
  setUpAll(loadTestFonts);
  testWidgets('requires explicit cylinder shape selection before continuing', (
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
    Finder shape(String name) =>
        find.ancestor(of: find.text(name), matching: find.byType(Chip));
    final toroidal = shape('Тороидальный');
    final cylindrical = shape('Цилиндрический');
    expect(tester.widget<Chip>(toroidal).backgroundColor, Colors.white);
    expect(tester.widget<Chip>(cylindrical).backgroundColor, Colors.white);
    await tester.ensureVisible(find.text('Продолжить'));
    await tester.tap(find.text('Продолжить'));
    await tester.pump();
    expect(find.text(cylinderShapeRequiredMessage), findsOneWidget);
    expect(find.text('Проверьте данные'), findsOneWidget);
    for (final chosen in [toroidal, cylindrical]) {
      await tester.ensureVisible(chosen);
      await tester.tap(chosen);
      await tester.pump();
      expect(tester.widget<Chip>(chosen).backgroundColor, isNot(Colors.white));
      expect(find.text(cylinderShapeRequiredMessage), findsNothing);
    }
    expect(tester.widget<Chip>(toroidal).backgroundColor, Colors.white);
    expect(
      tester.widget<Chip>(cylindrical).backgroundColor,
      isNot(Colors.white),
    );
    await tester.ensureVisible(find.text('Продолжить'));
    await tester.tap(find.text('Продолжить'));
    await tester.pump();
    expect(find.text(cylinderShapeRequiredMessage), findsNothing);
    expect(
      find.textContaining(RegExp('тип газа', caseSensitive: false)),
      findsWidgets,
    );
  });
}
