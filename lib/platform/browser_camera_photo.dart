// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use
import 'dart:html' as html;
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

/// Use still-photo capture where supported, with a video fallback at the caller.
Future<html.CanvasElement?> captureStillPhoto(
  html.MediaStreamTrack track,
) async {
  if (!globalContext.has('ImageCapture')) return null;
  final constructor = globalContext.getProperty<JSFunction>(
    'ImageCapture'.toJS,
  );
  final camera = constructor.callAsConstructor<JSObject>(track as JSObject);
  JSObject? settings;
  try {
    final caps = (await camera
        .callMethod<JSPromise<JSObject>>('getPhotoCapabilities'.toJS)
        .toDart
        .timeout(const Duration(seconds: 2)));
    final width = caps
        .getProperty<JSObject>('imageWidth'.toJS)
        .getProperty<JSNumber>('max'.toJS)
        .toDartDouble
        .toInt();
    final height = caps
        .getProperty<JSObject>('imageHeight'.toJS)
        .getProperty<JSNumber>('max'.toJS)
        .toDartDouble
        .toInt();
    // Keep the existing server decoder's 40 MP limit. Larger sensors can use
    // their normal device-selected binned photo mode instead of maximum mode.
    if (width > 0 && height > 0 && width * height <= 40000000) {
      settings = JSObject()
        ..setProperty('imageWidth'.toJS, width.toJS)
        ..setProperty('imageHeight'.toJS, height.toJS);
    }
  } catch (_) {
    /* Photo capability negotiation is optional. */
  }
  final blob = await camera
      .callMethod<JSPromise<JSObject>>('takePhoto'.toJS, settings)
      .toDart
      .timeout(const Duration(seconds: 10));
  final url = html.Url.createObjectUrlFromBlob(blob as html.Blob);
  final image = html.ImageElement();
  try {
    final loaded = image.onLoad.first.timeout(const Duration(seconds: 6));
    image.src = url;
    await loaded;
    final width = image.naturalWidth, height = image.naturalHeight;
    if (width <= 0 || height <= 0 || width * height > 40000000) return null;
    return html.CanvasElement(width: width, height: height)
      ..context2D.drawImage(image, 0, 0);
  } finally {
    image.src = '';
    html.Url.revokeObjectUrl(url);
  }
}
