import 'dart:typed_data';
import 'dart:ui';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:reestr_ts_demo/widgets/document_crop.dart';

void main() {
  test('only the region inside the visible document frame is saved', () {
    final source = img.Image(width: 1000, height: 1400);
    img.fill(source, color: img.ColorRgb8(255, 0, 0));
    final frame = documentFrameRect(const Size(1000, 1400), 1.6);
    img.fillRect(source, x1: frame.left.floor(), y1: frame.top.floor(), x2: frame.right.ceil(), y2: frame.bottom.ceil(), color: img.ColorRgb8(0, 0, 255));
    final cropped = img.decodeJpg(cropDocumentPhoto({'bytes': Uint8List.fromList(img.encodePng(source)), 'previewRatio': 1000 / 1400, 'frameRatio': 1.6}))!;
    expect(cropped.width / cropped.height, closeTo(1.6, .01));
    for (final point in [const Offset(0,0), Offset((cropped.width-1).toDouble(),(cropped.height-1).toDouble())]) {
      final pixel = cropped.getPixel(point.dx.toInt(), point.dy.toInt());
      expect(pixel.r, lessThan(15));expect(pixel.b, greaterThan(235));
    }
  });
  test('a portrait document frame stays within the camera preview', () {
    for (final size in [const Size(360, 480), const Size(800, 400)]) {
      final frame=documentFrameRect(size,.71);
      expect(frame.left, greaterThanOrEqualTo(0));expect(frame.top,greaterThanOrEqualTo(0));
      expect(frame.right,lessThanOrEqualTo(size.width));expect(frame.bottom,lessThanOrEqualTo(size.height));
      expect(frame.width/frame.height,closeTo(.71,.001));
    }
  });
}
