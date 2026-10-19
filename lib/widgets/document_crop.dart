import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';
import 'package:image/image.dart' as img;

Rect documentFrameRect(Size size, double aspectRatio) {
  final width = math.min(size.width * .9, size.height * .82 * aspectRatio);
  return Rect.fromCenter(center: size.center(Offset.zero), width: width, height: width / aspectRatio);
}

Uint8List cropDocumentPhoto(Map<String, Object> input) {
  final decoded = img.decodeImage(input['bytes'] as Uint8List);
  if (decoded == null) throw StateError('Не удалось обработать фото');
  final image = img.bakeOrientation(decoded);
  final previewRatio = input['previewRatio'] as double;
  final frameRatio = input['frameRatio'] as double;
  final frame = documentFrameRect(Size(previewRatio, 1), frameRatio);
  // Camera preview can be a central crop of the full-resolution still image.
  final visibleWidth = math.min(image.width.toDouble(), image.height * previewRatio);
  final visibleHeight = visibleWidth / previewRatio;
  final left = (image.width - visibleWidth) / 2 + frame.left / previewRatio * visibleWidth;
  final top = (image.height - visibleHeight) / 2 + frame.top * visibleHeight;
  final cropped = img.copyCrop(image, x: left.round(), y: top.round(), width: (frame.width / previewRatio * visibleWidth).round(), height: (frame.height * visibleHeight).round());
  final resized = cropped.width > 2200 || cropped.height > 2200
      ? img.copyResize(cropped, width: cropped.width >= cropped.height ? 2200 : null, height: cropped.height > cropped.width ? 2200 : null)
      : cropped;
  return Uint8List.fromList(img.encodeJpg(resized, quality: 90));
}
