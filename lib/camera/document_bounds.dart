import 'dart:math' as math;
import 'dart:typed_data';

const documentOutsideMessage = 'Поместите документ целиком внутрь рамки';
const documentMissingMessage =
    'Покажите все четыре края документа на контрастном фоне';
const documentSmallMessage =
    'Поднесите документ ближе, сохраняя края внутри рамки';
const documentHoldMessage = 'Документ в рамке. Удерживайте камеру неподвижно';
const documentReadyMessage = 'Документ в рамке. Можно фотографировать';

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
  final gray = input['gray'] as Uint8List;
  final w = input['width'] as int, h = input['height'] as int;
  final ratio = input['frameRatio'] as double;
  if (w < 32 || h < 32 || gray.length != w * h || ratio <= 0) {
    return const DocumentBounds(documentMissingMessage);
  }
  final gradient = Uint16List(w * h);
  final edges = Uint8List(w * h);
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
      if (gradient[i] < 95) continue;
      // Close small gaps without connecting distant text lines to the outline.
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          edges[i + oy * w + ox] = 1;
        }
      }
    }
  }
  final queue = Int32List(w * h);
  List<DocumentPoint>? best;
  var bestArea = 0.0;
  for (var start = 0; start < edges.length; start++) {
    if (edges[start] == 0) continue;
    var head = 0, tail = 1;
    queue[0] = start;
    edges[start] = 0;
    final points = <DocumentPoint>[];
    while (head < tail) {
      final i = queue[head++], x = i % w, y = i ~/ w;
      // Use actual gradient pixels, not the dilated outline for geometry.
      if (gradient[i] >= 95) {
        points.add(DocumentPoint(x.toDouble(), y.toDouble()));
      }
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          final nx = x + ox, ny = y + oy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          final next = ny * w + nx;
          if (edges[next] == 0) continue;
          edges[next] = 0;
          queue[tail++] = next;
        }
      }
    }
    if (points.length < (w + h) * .32) continue;
    final hull = _hull(points);
    if (hull.length < 4) continue;
    final hullArea = _area(hull);
    final quad = List<DocumentPoint>.of(hull);
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
    final area = _area(quad);
    if (area < w * h * .08 || area < hullArea * .91 || area <= bestArea) {
      continue;
    }
    if (!_rectangle(quad) || !_boundary(gray, gradient, w, h, quad)) continue;
    best = quad;
    bestArea = area;
  }
  if (best == null) return const DocumentBounds(documentMissingMessage);
  final fw = math.min(w * .9, h * .82 * ratio), fh = fw / ratio;
  final left = (w - fw) / 2, top = (h - fh) / 2;
  // A safety margin avoids clipping at the crop edge and tolerates pixel noise.
  final margin = math.max(2.0, math.min(fw, fh) * .025);
  // Anchor at the top-left corner so tiny changes in tilt cannot reorder it.
  var anchor = 0;
  for (var i = 1; i < 4; i++) {
    if (best[i].x + best[i].y < best[anchor].x + best[anchor].y) anchor = i;
  }
  final ordered = List.generate(4, (i) => best![(anchor + i) % 4]);
  final corners = ordered.map((p) => DocumentPoint(p.x / w, p.y / h)).toList();
  if (best.any(
    (p) =>
        p.x < left + margin ||
        p.x > left + fw - margin ||
        p.y < top + margin ||
        p.y > top + fh - margin,
  )) {
    return DocumentBounds(documentOutsideMessage, corners);
  }
  if (bestArea < fw * fh * .38) {
    return DocumentBounds(documentSmallMessage, corners);
  }
  return DocumentBounds(documentReadyMessage, corners);
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
    if (!cosine.isFinite || cosine.abs() > .6) return false;
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
  var polarity = 0;
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
        if (gradient[py * w + px] >= 95) edge = true;
      }
      if (edge) supported++;
      // A paper/background step, rather than an interior printed table border.
      final difference =
          (sample(x + nx * 4, y + ny * 4) +
              sample(x + nx * 6, y + ny * 6) -
              sample(x - nx * 4, y - ny * 4) -
              sample(x - nx * 6, y - ny * 6)) /
          2;
      if (difference > 14) positive++;
      if (difference < -14) negative++;
    }
    if (supported < 16 || math.max(positive, negative) < 16) return false;
    final sign = positive >= negative ? 1 : -1;
    if (polarity != 0 && sign != polarity) return false;
    polarity = sign;
  }
  return true;
}

// Three consistent frames are required. Any failure or stale preview relocks
// the shutter; the still image is independently checked before it is returned.
class DocumentFrameGate {
  DocumentBounds? _last;
  DateTime? _checkedAt;
  int _stable = 0;
  String get message => _last?.fits == true
      ? documentHoldMessage
      : _last?.message ?? documentMissingMessage;
  void reset() {
    _last = null;
    _checkedAt = null;
    _stable = 0;
  }

  bool ready(DateTime now) =>
      _stable >= 3 &&
      _checkedAt != null &&
      now.difference(_checkedAt!) <= const Duration(milliseconds: 900);
  void update(DocumentBounds result, DateTime now) {
    final previous = _last;
    final continuous =
        _checkedAt != null &&
        now.difference(_checkedAt!) <= const Duration(milliseconds: 900);
    final stable =
        previous?.fits == true &&
        result.fits &&
        List.generate(
          4,
          (i) => math.max(
            (previous!.corners[i].x - result.corners[i].x).abs(),
            (previous.corners[i].y - result.corners[i].y).abs(),
          ),
        ).every((d) => d < .025);
    _stable = result.fits ? (stable && continuous ? _stable + 1 : 1) : 0;
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
