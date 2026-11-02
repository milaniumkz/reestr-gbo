import 'dart:math' as math;
import 'dart:typed_data';

const documentOutsideMessage = 'Поместите документ целиком внутрь рамки';
const documentMissingMessage =
    'Покажите все четыре края документа на контрастном фоне';
const documentSmallMessage =
    'Поднесите документ ближе, сохраняя края внутри рамки';
const documentHoldMessage = 'Документ в рамке. Удерживайте камеру неподвижно';
const documentReadyMessage = 'Документ в рамке. Можно фотографировать';
const documentAutoMessage = 'Документ в рамке. Автоматическая съёмка…';
const documentManualMessage =
    'Наведите документ в рамку. Можно сделать фото вручную';

class DocumentPoint {
  const DocumentPoint(this.x, this.y);
  final double x, y;
}

class DocumentBounds {
  const DocumentBounds(this.message, [this.corners = const []]);
  final String message;
  final List<DocumentPoint> corners;
  bool get fits => message == documentReadyMessage;
}

// Pure Dart: pixels stay on the device. This detects a visible rectangular
// boundary, not document identity, authenticity or readability.
DocumentBounds analyzeDocumentFrame(Map<String, Object> input) {
  final gray = input['gray'] as Uint8List,
      w = input['width'] as int,
      h = input['height'] as int,
      ratio = input['frameRatio'] as double;
  if (w < 32 || h < 32 || gray.length != w * h || ratio <= 0) {
    return const DocumentBounds(documentMissingMessage);
  }
  final fw = math.min(w * .9, h * .82 * ratio),
      fh = fw / ratio,
      left = (w - fw) / 2,
      top = (h - fh) / 2;
  bool inside(List<DocumentPoint> points) => points.every(
    (p) =>
        p.x >= left + 1 &&
        p.x <= left + fw - 1 &&
        p.y >= top + 1 &&
        p.y <= top + fh - 1,
  );
  final gradient = Uint16List(w * h),
      edges = Uint8List(w * h),
      histogram = List<int>.filled(256, 0);
  for (final value in gray) {
    histogram[value]++;
  }
  for (var y = 1; y < h - 1; y++) {
    for (var x = 1; x < w - 1; x++) {
      final i = y * w + x;
      final dx =
          -gray[i - w - 1] -
          2 * gray[i - 1] -
          gray[i + w - 1] +
          gray[i - w + 1] +
          2 * gray[i + 1] +
          gray[i + w + 1];
      final dy =
          -gray[i - w - 1] -
          2 * gray[i - w] -
          gray[i - w + 1] +
          gray[i + w - 1] +
          2 * gray[i + w] +
          gray[i + w + 1];
      gradient[i] = dx.abs() + dy.abs();
      if (gradient[i] < 40) continue;
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          edges[i + oy * w + ox] = 1;
        }
      }
    }
  }
  List<DocumentPoint>? best;
  var bestArea = 0.0;
  var bestInside = false;
  void consider(List<DocumentPoint> points) {
    if (points.length < (w + h) * .23) return;
    final hull = _hull(points);
    if (hull.length < 4) return;
    final hullArea = _area(hull), quad = List<DocumentPoint>.of(hull);
    while (quad.length > 4) {
      var remove = 0, smallest = double.infinity;
      for (var i = 0; i < quad.length; i++) {
        final loss = _cross(
          quad[(i + quad.length - 1) % quad.length],
          quad[i],
          quad[(i + 1) % quad.length],
        ).abs();
        if (loss < smallest) {
          smallest = loss;
          remove = i;
        }
      }
      quad.removeAt(remove);
    }
    final area = _area(quad), fits = inside(quad);
    if (area < w * h * .06 ||
        area < hullArea * .86 ||
        (!fits && bestInside) ||
        (fits == bestInside && area <= bestArea)) {
      return;
    }
    if (!_rectangle(quad) || !_boundary(gray, gradient, w, h, quad)) return;
    best = quad;
    bestArea = area;
    bestInside = fits;
  }

  for (final points in _contours(edges, w, h, gradient: gradient)) {
    consider(points);
  }
  // Paper/background segmentation remains useful when a hand or busy background
  // connects unrelated edges to the document outline. Otsu adapts to illumination.
  var total = 0.0;
  for (var i = 0; i < 256; i++) {
    total += i * histogram[i];
  }
  var count = 0, sum = 0.0, variance = -1.0, threshold = 128;
  for (var i = 0; i < 255; i++) {
    count += histogram[i];
    sum += i * histogram[i];
    final other = gray.length - count;
    if (count == 0 || other == 0) continue;
    final difference = sum / count - (total - sum) / other;
    final score = count * other * difference * difference;
    if (score > variance) {
      variance = score;
      threshold = i;
    }
  }
  for (final level in {
    threshold,
    math.min(240, math.max(180, threshold + 20)),
  }) {
    final mask = Uint8List(w * h);
    for (var i = 0; i < gray.length; i++) {
      if (gray[i] > level) mask[i] = 1;
    }
    for (final points in _contours(mask, w, h)) {
      consider(points);
    }
  }
  if (best == null) return const DocumentBounds(documentMissingMessage);
  var anchor = 0;
  for (var i = 1; i < 4; i++) {
    if (best![i].x + best![i].y < best![anchor].x + best![anchor].y) anchor = i;
  }
  final corners = List.generate(4, (i) {
    final p = best![(anchor + i) % 4];
    return DocumentPoint(p.x / w, p.y / h);
  });
  if (!bestInside) return DocumentBounds(documentOutsideMessage, corners);
  if (bestArea < fw * fh * .32) {
    return DocumentBounds(documentSmallMessage, corners);
  }
  return DocumentBounds(documentReadyMessage, corners);
}

Iterable<List<DocumentPoint>> _contours(
  Uint8List mask,
  int w,
  int h, {
  Uint16List? gradient,
}) sync* {
  final remaining = Uint8List.fromList(mask), queue = Int32List(w * h);
  for (var start = 0; start < remaining.length; start++) {
    if (remaining[start] == 0) continue;
    var head = 0, tail = 1, touchesEdge = false;
    queue[0] = start;
    remaining[start] = 0;
    final points = <DocumentPoint>[];
    while (head < tail) {
      final i = queue[head++], x = i % w, y = i ~/ w;
      if (x == 0 || x == w - 1 || y == 0 || y == h - 1) touchesEdge = true;
      final boundary =
          x == 0 ||
          x == w - 1 ||
          y == 0 ||
          y == h - 1 ||
          mask[i - 1] == 0 ||
          mask[i + 1] == 0 ||
          mask[i - w] == 0 ||
          mask[i + w] == 0;
      if (gradient != null ? gradient[i] >= 40 : boundary) {
        points.add(DocumentPoint(x.toDouble(), y.toDouble()));
      }
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          final nx = x + ox, ny = y + oy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          final next = ny * w + nx;
          if (remaining[next] == 0) continue;
          remaining[next] = 0;
          queue[tail++] = next;
        }
      }
    }
    if (!touchesEdge) yield points;
  }
}

double _cross(DocumentPoint a, DocumentPoint b, DocumentPoint c) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
double _area(List<DocumentPoint> p) {
  var sum = 0.0;
  for (var i = 0; i < p.length; i++) {
    final n = p[(i + 1) % p.length];
    sum += p[i].x * n.y - n.x * p[i].y;
  }
  return sum.abs() / 2;
}

List<DocumentPoint> _hull(List<DocumentPoint> points) {
  points.sort((a, b) => a.x == b.x ? a.y.compareTo(b.y) : a.x.compareTo(b.x));
  final lower = <DocumentPoint>[], upper = <DocumentPoint>[];
  for (final p in points) {
    while (lower.length >= 2 &&
        _cross(lower[lower.length - 2], lower.last, p) <= 0) {
      lower.removeLast();
    }
    lower.add(p);
  }
  for (final p in points.reversed) {
    while (upper.length >= 2 &&
        _cross(upper[upper.length - 2], upper.last, p) <= 0) {
      upper.removeLast();
    }
    upper.add(p);
  }
  return [
    ...lower.take(math.max(0, lower.length - 1)),
    ...upper.take(math.max(0, upper.length - 1)),
  ];
}

bool _rectangle(List<DocumentPoint> p) {
  for (var i = 0; i < 4; i++) {
    final a = p[(i + 3) % 4], b = p[i], c = p[(i + 1) % 4];
    final ax = a.x - b.x, ay = a.y - b.y, cx = c.x - b.x, cy = c.y - b.y;
    final cosine =
        (ax * cx + ay * cy) /
        math.sqrt((ax * ax + ay * ay) * (cx * cx + cy * cy));
    if (!cosine.isFinite || cosine.abs() > .72) return false;
  }
  return true;
}

bool _boundary(
  Uint8List gray,
  Uint16List gradient,
  int w,
  int h,
  List<DocumentPoint> p,
) {
  final center = DocumentPoint(
    p.fold<double>(0, (v, p) => v + p.x) / 4,
    p.fold<double>(0, (v, p) => v + p.y) / 4,
  );
  int sample(double x, double y) =>
      gray[y.round().clamp(0, h - 1) * w + x.round().clamp(0, w - 1)];

  for (var i = 0; i < 4; i++) {
    final a = p[i], b = p[(i + 1) % 4], dx = b.x - a.x, dy = b.y - a.y;
    final length = math.sqrt(dx * dx + dy * dy);
    var nx = -dy / length, ny = dx / length;
    if (nx * (center.x - (a.x + b.x) / 2) + ny * (center.y - (a.y + b.y) / 2) <
        0) {
      nx = -nx;
      ny = -ny;
    }
    var supported = 0, positive = 0, negative = 0;
    for (var n = 0; n < 24; n++) {
      final t = .08 + .84 * n / 23, x = a.x + dx * t, y = a.y + dy * t;
      var edge = false;
      for (var offset = -2; offset <= 2; offset++) {
        final px = (x + nx * offset).round().clamp(0, w - 1),
            py = (y + ny * offset).round().clamp(0, h - 1);
        if (gradient[py * w + px] >= 40) edge = true;
      }
      if (edge) supported++;
      // A paper/background step, rather than an interior printed table border.
      final difference =
          (sample(x + nx * 4, y + ny * 4) +
              sample(x + nx * 6, y + ny * 6) -
              sample(x - nx * 4, y - ny * 4) -
              sample(x - nx * 6, y - ny * 6)) /
          2;
      if (difference > 8) positive++;
      if (difference < -8) negative++;
    }
    if (supported < 13 || positive + negative < 12) return false;
  }
  return true;
}

// Automatic capture needs two consistent visible frames. Brief outline misses
// retain the visual hint, but can never authorize an automatic shutter.
class DocumentFrameGate {
  DocumentBounds? _last, _lastGood;
  DateTime? _checkedAt, _lastGoodAt;
  int _stable = 0;
  String get message => _last?.fits == true
      ? documentHoldMessage
      : _last?.message ?? documentMissingMessage;
  void reset() {
    _last = _lastGood = null;
    _checkedAt = _lastGoodAt = null;
    _stable = 0;
  }

  bool aligned(DateTime now) =>
      _last?.fits == true &&
      _checkedAt != null &&
      now.difference(_checkedAt!) <= const Duration(milliseconds: 900);
  bool visualAligned(DateTime now) =>
      _lastGoodAt != null &&
      now.difference(_lastGoodAt!) <= const Duration(milliseconds: 650);
  bool ready(DateTime now) => aligned(now) && _stable >= 2;
  void update(DocumentBounds result, DateTime now) {
    final previous = _lastGood;
    final continuous =
        _lastGoodAt != null &&
        now.difference(_lastGoodAt!) <= const Duration(milliseconds: 750);
    final stable =
        previous?.fits == true &&
        result.fits &&
        List.generate(
          4,
          (i) => math.max(
            (previous!.corners[i].x - result.corners[i].x).abs(),
            (previous.corners[i].y - result.corners[i].y).abs(),
          ),
        ).every((d) => d < .06);
    if (result.fits) {
      _stable = stable && continuous ? _stable + 1 : 1;
      _lastGood = result;
      _lastGoodAt = now;
    } else if (!continuous) {
      _stable = 0;
    }
    _last = result;
    _checkedAt = now;
  }
}

// Sample camera Y or BGRA planes, respecting row/pixel padding and the sensor
// rotation. No full-resolution frame is retained between callbacks.
Map<String, Object> sampleDocumentLuma({
  required Uint8List bytes,
  required int width,
  required int height,
  required int rowStride,
  int pixelStride = 1,
  int rotation = 0,
  bool bgra = false,
}) {
  final sideways = rotation == 90 || rotation == 270;
  final orientedW = sideways ? height : width,
      orientedH = sideways ? width : height;
  final scale = math.min(1.0, 320 / math.max(orientedW, orientedH));
  final w = (orientedW * scale).round(), h = (orientedH * scale).round();
  final gray = Uint8List(w * h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      final ox = (x / scale).floor().clamp(0, orientedW - 1),
          oy = (y / scale).floor().clamp(0, orientedH - 1);
      final int sx, sy;
      switch (rotation) {
        case 90:
          sx = oy;
          sy = height - 1 - ox;
        case 180:
          sx = width - 1 - ox;
          sy = height - 1 - oy;
        case 270:
          sx = width - 1 - oy;
          sy = ox;
        default:
          sx = ox;
          sy = oy;
      }
      final index = sy * rowStride + sx * pixelStride;
      if (index < 0 || index + (bgra ? 2 : 0) >= bytes.length) {
        throw StateError('Unsupported camera plane');
      }
      gray[y * w + x] = bgra
          ? ((bytes[index + 2] * 77 +
                    bytes[index + 1] * 150 +
                    bytes[index] * 29) >>
                8)
          : bytes[index];
    }
  }
  return {'gray': gray, 'width': w, 'height': h};
}
