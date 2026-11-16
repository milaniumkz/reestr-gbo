import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image;
import 'package:reestr_ts_demo/platform/encoded_image_dimensions.dart';

void main() {
  test('JPEG and PNG dimensions are read without altering original bytes', () {
    final picture = image.Image(width: 160, height: 80);
    for (final raw in [image.encodeJpg(picture), image.encodePng(picture)]) {
      final bytes = Uint8List.fromList(raw), original = Uint8List.fromList(raw);
      expect(encodedImageDimensions(bytes), (width: 160, height: 80));
      expect(bytes, original);
    }
  });
  test(
    'oversized JPEG is identified from its header without decoding pixels',
    () {
      final bytes = Uint8List.fromList(
        image.encodeJpg(image.Image(width: 16, height: 8)),
      );
      for (var p = 2; p + 9 < bytes.length; p++) {
        if (bytes[p] == 255 && [192, 194].contains(bytes[p + 1])) {
          final data = ByteData.sublistView(bytes);
          data.setUint16(p + 5, 9000, Endian.big);
          data.setUint16(p + 7, 12000, Endian.big);
          break;
        }
      }
      final size = encodedImageDimensions(bytes)!;
      expect(size.width * size.height, 108000000);
    },
  );
  test('GIF and extended WebP are read from bounded headers', () {
    expect(
      encodedImageDimensions(
        Uint8List.fromList([71, 73, 70, 56, 57, 97, 128, 2, 224, 1]),
      ),
      (width: 640, height: 480),
    );
    final webp = Uint8List(30)
      ..setRange(0, 4, 'RIFF'.codeUnits)
      ..setRange(8, 12, 'WEBP'.codeUnits)
      ..setRange(12, 16, 'VP8X'.codeUnits);
    webp[24] = 127;
    webp[25] = 2;
    webp[27] = 223;
    webp[28] = 1;
    expect(encodedImageDimensions(webp), (width: 640, height: 480));
  });
  test('truncated and unknown images never trigger a full-image decoder', () {
    for (final bytes in [
      Uint8List(0),
      Uint8List.fromList([255, 216, 255]),
      Uint8List.fromList('not an image'.codeUnits),
    ]) {
      expect(encodedImageDimensions(bytes), isNull);
    }
  });
}
