import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/platform/local_file.dart';
import 'package:reestr_ts_demo/widgets/captured_photo_preview.dart';
import 'test_fonts.dart';

Future<void> _decodePhoto(WidgetTester tester) async {
  final image = tester.widget<Image>(find.byType(Image));
  await tester.runAsync(
    () => precacheImage(image.image, tester.element(find.byType(Image))),
  );
  await tester.pumpAndSettle();
}

class _Host extends StatelessWidget {
  const _Host(this.capture, this.done);
  final Future<PickedLocalFile?> Function() capture;
  final void Function(PickedLocalFile?) done;
  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: ElevatedButton(
        onPressed: () async => done(
          await capturePhotoWithPreview(
            context,
            title: 'Фото техпаспорта',
            capture: capture,
          ),
        ),
        child: const Text('Camera'),
      ),
    ),
  );
}

void main() {
  setUpAll(loadTestFonts);
  final first = PickedLocalFile(
    name: 'first.png',
    bytes: base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGP4z8AARww4OQD1MQv1NXv7ggAAAABJRU5ErkJggg==',
    ),
  );
  final second = PickedLocalFile(
    name: 'second.png',
    bytes: base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAD0lEQVR4nGNgYPiPhHBxAN1JC/U39qNPAAAAAElFTkSuQmCC',
    ),
  );

  testWidgets(
    'automatic capture waits for an explicit confirmation and shows the full zoomable image',
    (tester) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var completed = false;
      PickedLocalFile? accepted;
      await tester.pumpWidget(
        MaterialApp(
          home: _Host(() async => first, (file) {
            completed = true;
            accepted = file;
          }),
        ),
      );
      await tester.tap(find.text('Camera'));
      await tester.pumpAndSettle();
      await _decodePhoto(tester);
      expect(completed, false);
      expect(find.byType(InteractiveViewer), findsOneWidget);
      expect(tester.widget<Image>(find.byType(Image)).fit, BoxFit.contain);
      final confirm = find.widgetWithText(FilledButton, 'Использовать фото');
      expect(tester.widget<FilledButton>(confirm).onPressed, isNotNull);
      expect(tester.getRect(confirm).bottom, lessThanOrEqualTo(640));
      expect(
        tester.getRect(find.widgetWithText(OutlinedButton, 'Переснять')).bottom,
        lessThanOrEqualTo(640),
      );
      await tester.tap(confirm);
      await tester.pumpAndSettle();
      expect(completed, true);
      expect(identical(accepted, first), true);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'retake discards the first shot and returns only the confirmed replacement',
    (tester) async {
      var captures = 0, completed = 0;
      PickedLocalFile? accepted;
      await tester.pumpWidget(
        MaterialApp(
          home: _Host(() async => ++captures == 1 ? first : second, (file) {
            completed++;
            accepted = file;
          }),
        ),
      );
      await tester.tap(find.text('Camera'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(OutlinedButton, 'Переснять'));
      await tester.pumpAndSettle();
      await _decodePhoto(tester);
      expect(captures, 2);
      expect(completed, 0);
      expect(
        identical(
          (tester.widget<Image>(find.byType(Image)).image as MemoryImage).bytes,
          second.bytes,
        ),
        true,
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Использовать фото'));
      await tester.pumpAndSettle();
      expect(completed, 1);
      expect(identical(accepted, second), true);
    },
  );
  testWidgets(
    'closing preview cancels without reopening the camera or accepting a photo',
    (tester) async {
      var captures = 0, completed = 0;
      PickedLocalFile? accepted;
      await tester.pumpWidget(
        MaterialApp(
          home: _Host(
            () async {
              captures++;
              return first;
            },
            (file) {
              completed++;
              accepted = file;
            },
          ),
        ),
      );
      await tester.tap(find.text('Camera'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(CloseButton));
      await tester.pumpAndSettle();
      expect(captures, 1);
      expect(completed, 1);
      expect(accepted, isNull);
    },
  );
  testWidgets('cancelling the camera does not open a preview', (tester) async {
    var completed = false;
    await tester.pumpWidget(
      MaterialApp(
        home: _Host(() async => null, (file) {
          completed = true;
          expect(file, isNull);
        }),
      ),
    );
    await tester.tap(find.text('Camera'));
    await tester.pumpAndSettle();
    expect(completed, true);
    expect(find.byType(InteractiveViewer), findsNothing);
  });
  testWidgets(
    'an unreadable file cannot be confirmed and still offers retake',
    (tester) async {
      var completed = false;
      await tester.pumpWidget(
        MaterialApp(
          home: _Host(
            () async =>
                const PickedLocalFile(name: 'bad.jpg', bytes: [1, 2, 3]),
            (_) {
              completed = true;
            },
          ),
        ),
      );
      await tester.tap(find.text('Camera'));
      await tester.pumpAndSettle();
      expect(completed, false);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Использовать фото'),
            )
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<OutlinedButton>(
              find.widgetWithText(OutlinedButton, 'Переснять'),
            )
            .onPressed,
        isNotNull,
      );
      expect(
        find.text('Не удалось открыть фото. Переснимите его.'),
        findsOneWidget,
      );
    },
  );
}
