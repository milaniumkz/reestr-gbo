import 'dart:typed_data';
import 'dart:math' as math;
import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/camera/document_bounds.dart';

Map<String, Object> scene({
  int left = 35,
  int top = 55,
  int right = 165,
  int bottom = 240,
  int paper = 225,
  int background = 35,
  double ratio = .71,
}) {
  const w = 200, h = 300;
  final gray = Uint8List(w * h)..fillRange(0, w * h, background);
  for (var y = top.clamp(0, h); y < bottom.clamp(0, h); y++) {
    for (var x = left.clamp(0, w); x < right.clamp(0, w); x++) {
      gray[y * w + x] = paper;
    }
  }
  return {'gray': gray, 'width': w, 'height': h, 'frameRatio': ratio};
}

void main() {
  test(
    'requires the whole document inside the frame, not just a cropped center',
    () {
      expect(analyzeDocumentFrame(scene()).fits, isTrue);
      for (final input in [
        scene(left: 5, right: 165),
        scene(right: 195),
        scene(top: 10),
        scene(bottom: 295),
        scene(left: -20),
        scene(bottom: 350),
      ]) {
        expect(analyzeDocumentFrame(input).fits, isFalse);
      }
    },
  );
  test('works for dark documents, horizontal documents and low resolution', () {
    expect(
      analyzeDocumentFrame(scene(paper: 35, background: 200)).fits,
      isTrue,
    );
    expect(
      analyzeDocumentFrame(
        scene(left: 25, right: 175, top: 108, bottom: 192, ratio: 1.6),
      ).fits,
      isTrue,
    );
  });
  test(
    'rejects empty previews, small documents and interior table outlines',
    () {
      expect(analyzeDocumentFrame(scene(paper: 35)).fits, isFalse);
      expect(
        analyzeDocumentFrame(
          scene(left: 65, right: 135, top: 100, bottom: 200),
        ).fits,
        isFalse,
      );
      final input = scene(paper: 225, background: 225);
      final gray = input['gray'] as Uint8List;
      for (var y = 55; y < 240; y++) {
        for (var x = 35; x < 165; x++) {
          if (x < 37 || x >= 163 || y < 57 || y >= 238) gray[y * 200 + x] = 25;
        }
      }
      expect(analyzeDocumentFrame(input).fits, isFalse);
    },
  );
  test('accepts perspective and sensor noise with printed text inside', () {
    final input = scene(paper: 35), gray = input['gray'] as Uint8List;
    final polygon = [
      [40, 65],
      [154, 58],
      [167, 232],
      [37, 244],
    ];
    final random = math.Random(42);
    for (var y = 0; y < 300; y++) {
      for (var x = 0; x < 200; x++) {
        var inside = false;
        for (var i = 0, j = 3; i < 4; j = i++) {
          final a = polygon[i], b = polygon[j];
          if ((a[1] > y) != (b[1] > y) &&
              x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) {
            inside = !inside;
          }
        }
        gray[y * 200 + x] = (inside ? 225 : 35) + random.nextInt(17) - 8;
      }
    }
    for (var y = 100; y < 200; y += 12) {
      for (var x = 60; x < 140; x++) {
        gray[y * 200 + x] = 45;
      }
    }
    expect(analyzeDocumentFrame(input).fits, isTrue);
  });
  test(
    'shutter needs three stable frames, relocks immediately and expires',
    () {
      final gate = DocumentFrameGate(), now = DateTime(2026);
      final valid = analyzeDocumentFrame(scene());
      for (var i = 0; i < 2; i++) {
        gate.update(valid, now.add(Duration(milliseconds: i * 300)));
        expect(gate.ready(now.add(Duration(milliseconds: i * 300))), isFalse);
      }
      gate.update(valid, now.add(const Duration(milliseconds: 600)));
      expect(gate.ready(now.add(const Duration(milliseconds: 600))), isTrue);
      expect(gate.ready(now.add(const Duration(milliseconds: 1600))), isFalse);
      gate.update(
        analyzeDocumentFrame(scene(right: 195)),
        now.add(const Duration(milliseconds: 700)),
      );
      expect(gate.ready(now.add(const Duration(milliseconds: 700))), isFalse);
    },
  );
  test(
    'luma sampling handles padded rows, pixel stride and sensor rotation',
    () {
      final bytes = Uint8List.fromList([
        1,
        0,
        2,
        0,
        99,
        99,
        3,
        0,
        4,
        0,
        99,
        99,
        5,
        0,
        6,
        0,
        99,
        99,
      ]);
      final sampled = sampleDocumentLuma(
        bytes: bytes,
        width: 2,
        height: 3,
        rowStride: 6,
        pixelStride: 2,
        rotation: 90,
      );
      expect(sampled['width'], 3);
      expect(sampled['height'], 2);
      expect(sampled['gray'], [5, 3, 1, 6, 4, 2]);
    },
  );
}
