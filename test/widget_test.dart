import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'test_fonts.dart';

void main() {
  setUpAll(loadTestFonts);

  testWidgets('shows login screen and enters the app', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(designWidth, designHeight);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const ErsiGboApp());
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.textContaining('Наблюдатель'), findsOneWidget);
    await tester.tap(find.textContaining('Деятельность').first);
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Способ доступа'), findsOneWidget);
    expect(find.text('Инспекционный орган'), findsOneWidget);
  });

  testWidgets('renders all PDF target screens without layout errors', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(designWidth, designHeight);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    for (var index = 0; index < screenTitles.length; index++) {
      await tester.pumpWidget(
        MaterialApp(
          debugShowCheckedModeBanner: false,
          home: ErsiDemo(
            key: ValueKey('qa-screen-$index'),
            initialScreen: index,
            showStepper: false,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.byKey(ValueKey('ersi-screen-$index')), findsOneWidget);
      expect(tester.takeException(), isNull, reason: screenTitles[index]);
    }
  });

  testWidgets('renders all screens on common mobile viewports', (tester) async {
    const sizes = [
      Size(320, 568),
      Size(360, 740),
      Size(375, 812),
      Size(390, 844),
      Size(430, 932),
    ];
    const textScales = [1.0, 1.15, 1.3];

    for (final size in sizes) {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;

      for (final textScale in textScales) {
        for (var index = 0; index < screenTitles.length; index++) {
          await tester.pumpWidget(
            MaterialApp(
              debugShowCheckedModeBanner: false,
              home: MediaQuery(
                data: MediaQueryData(
                  size: size,
                  textScaler: TextScaler.linear(textScale),
                ),
                child: ErsiDemo(
                  key: ValueKey('mobile-$size-$textScale-$index'),
                  initialScreen: index,
                  showStepper: false,
                ),
              ),
            ),
          );
          await tester.pump(const Duration(milliseconds: 300));

          expect(
            tester.takeException(),
            isNull,
            reason: '${screenTitles[index]} at $size textScale $textScale',
          );
        }
      }
    }

    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  });

  testWidgets('renders all screens on desktop web viewport', (tester) async {
    const sizes = [Size(1024, 768), Size(1366, 900), Size(1440, 900)];

    for (final size in sizes) {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;

      for (var index = 0; index < screenTitles.length; index++) {
        await tester.pumpWidget(
          MaterialApp(
            debugShowCheckedModeBanner: false,
            home: MediaQuery(
              data: const MediaQueryData(
                textScaler: TextScaler.linear(1.0),
              ).copyWith(size: size),
              child: ErsiDemo(
                key: ValueKey('desktop-$size-$index'),
                initialScreen: index,
                showStepper: false,
              ),
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 300));

        expect(
          tester.takeException(),
          isNull,
          reason: '${screenTitles[index]} at desktop $size',
        );
      }
    }

    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  });
}
