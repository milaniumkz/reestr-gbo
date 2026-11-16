import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/widgets/document_image_frame.dart';

void main() {
  testWidgets('leaving a local photo frame releases its decoded cache entry', (
    tester,
  ) async {
    final image = MemoryImage(
      base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGP4z8AARww4OQD1MQv1NXv7ggAAAABJRU5ErkJggg==',
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: DocumentImageFrame(
          image: image,
          evictOnDispose: true,
          child: Image(image: image),
        ),
      ),
    );
    await tester.runAsync(
      () => precacheImage(image, tester.element(find.byType(Image))),
    );
    await tester.pumpAndSettle();
    expect(PaintingBinding.instance.imageCache.containsKey(image), isTrue);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    expect(PaintingBinding.instance.imageCache.containsKey(image), isFalse);
  });
}
