import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/widgets/quality_certificate_uploads.dart';
import 'test_fonts.dart';

void main() {
  setUpAll(loadTestFonts);

  testWidgets(
    'two cylinders keep separate upload actions after the first upload',
    (tester) async {
      tester.view.physicalSize = const Size(360, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var firstCalls = 0;
      var secondCalls = 0;
      var firstUploaded = false;
      Future<void> render() async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: QualityCertificateUploads(
                    usesTwoCylinders: true,
                    firstSerial: 'CYL-ONE',
                    secondSerial: 'CYL-TWO',
                    firstUploaded: firstUploaded,
                    secondUploaded: false,
                    busy: false,
                    onUploadFirst: () => firstCalls++,
                    onUploadSecond: () => secondCalls++,
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pump();
      }

      await render();
      expect(find.text('№ CYL-ONE'), findsOneWidget);
      expect(find.text('№ CYL-TWO'), findsOneWidget);
      final first = find.widgetWithText(
        FilledButton,
        'Загрузить свидетельство первого баллона',
      );
      final second = find.widgetWithText(
        FilledButton,
        'Загрузить свидетельство второго баллона',
      );
      await tester.ensureVisible(first);
      await tester.tap(first);
      expect(firstCalls, 1);
      expect(secondCalls, 0);
      firstUploaded = true;
      await render();
      expect(find.text('Загружено'), findsOneWidget);
      expect(find.text('Не загружено'), findsOneWidget);
      expect(second, findsOneWidget);
      await tester.ensureVisible(second);
      await tester.tap(second);
      expect(firstCalls, 1);
      expect(secondCalls, 1);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('single-cylinder review offers only its own certificate', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: QualityCertificateUploads(
            usesTwoCylinders: false,
            firstSerial: 'ONLY',
            secondSerial: '',
            firstUploaded: false,
            secondUploaded: false,
            busy: false,
            onUploadFirst: () {},
            onUploadSecond: () =>
                fail('No second-cylinder action for a single cylinder'),
          ),
        ),
      ),
    );
    expect(find.byType(FilledButton), findsOneWidget);
    expect(
      find.byKey(const ValueKey('quality-certificate-second')),
      findsNothing,
    );
  });

  testWidgets('busy upload disables both slots without hiding the second', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: QualityCertificateUploads(
              usesTwoCylinders: true,
              firstSerial: 'ONE',
              secondSerial: 'TWO',
              firstUploaded: true,
              secondUploaded: false,
              busy: true,
              onUploadFirst: () => fail('Upload already running'),
              onUploadSecond: () => fail('Upload already running'),
            ),
          ),
        ),
      ),
    );
    final buttons = tester
        .widgetList<FilledButton>(find.byType(FilledButton))
        .toList();
    expect(buttons, hasLength(2));
    expect(buttons.every((button) => button.onPressed == null), isTrue);
    expect(
      find.byKey(const ValueKey('quality-certificate-second')),
      findsOneWidget,
    );
  });
  testWidgets(
    'read-only quality review shows both slots without allowing uploads',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: QualityCertificateUploads(
                usesTwoCylinders: true,
                firstSerial: 'ONE',
                secondSerial: 'TWO',
                firstUploaded: false,
                secondUploaded: false,
                busy: false,
                canUpload: false,
                onUploadFirst: () => fail('Read-only'),
                onUploadSecond: () => fail('Read-only'),
              ),
            ),
          ),
        ),
      );
      final buttons = tester
          .widgetList<FilledButton>(find.byType(FilledButton))
          .toList();
      expect(buttons, hasLength(2));
      expect(buttons.every((button) => button.onPressed == null), isTrue);
      expect(
        find.byKey(const ValueKey('quality-certificate-second')),
        findsOneWidget,
      );
    },
  );
}
