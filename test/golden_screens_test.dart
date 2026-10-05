import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/main.dart';

import 'test_fonts.dart';

void main() {
  setUpAll(loadTestFonts);
  const runGoldens = bool.fromEnvironment('RUN_GOLDENS');

  testWidgets('captures 40 coded screens for visual QA', (tester) async {
    tester.view.physicalSize = const Size(designWidth, designHeight);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    for (var index = 0; index < screenTitles.length; index++) {
      final key = GlobalKey();

      await tester.pumpWidget(
        MaterialApp(
          debugShowCheckedModeBanner: false,
          home: RepaintBoundary(
            key: key,
            child: ErsiDemo(initialScreen: index, showStepper: false),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byKey(key),
        matchesGoldenFile('goldens/flutter/page-${index + 1}.png'),
      );
    }
  }, skip: !runGoldens);
}
