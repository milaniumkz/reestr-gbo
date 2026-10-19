// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use
import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;
import 'local_file.dart';
import 'dart:math' as math;

Future<PickedLocalFile?> captureDocumentPhoto({
  double frameAspectRatio = 0.71,
}) async {
  final devices = html.window.navigator.mediaDevices;
  if (devices == null) {
    throw StateError('Камера недоступна. Откройте веб-версию по HTTPS.');
  }
  final stream = await devices.getUserMedia({
    'audio': false,
    'video': {
      'facingMode': {'ideal': 'environment'},
      'width': {'ideal': 1800},
    },
  });
  final result = Completer<PickedLocalFile?>();
  final overlay = html.DivElement()
    ..setAttribute('role', 'dialog')
    ..setAttribute('aria-modal', 'true')
    ..setAttribute('aria-label', 'Съёмка документа')
    ..style.cssText =
        'position:fixed;inset:0;z-index:2147483647;background:#101010;display:flex;flex-direction:column;padding:16px;box-sizing:border-box';
  final video = html.VideoElement()
    ..autoplay = true
    ..muted = true
    ..setAttribute('playsinline', '')
    ..style.cssText =
        'width:100%;height:calc(100% - 80px);object-fit:contain;flex:1;min-height:0';
  final capture = html.ButtonElement()
    ..text = 'СДЕЛАТЬ ФОТО'
    ..disabled = true
    ..style.cssText =
        'padding:14px;border:0;border-radius:12px;background:#007a4d;color:white;font-size:16px;flex:1';
  final cancel = html.ButtonElement()
    ..text = 'ОТМЕНА'
    ..style.cssText =
        'padding:14px;border:0;border-radius:12px;background:white;color:#123;font-size:16px;flex:1';
  final controls = html.DivElement()
    ..style.cssText = 'display:flex;gap:12px;padding-top:16px';
  controls.children.addAll([cancel, capture]);
  final preview = html.DivElement()
    ..style.cssText = 'position:relative;flex:1;min-height:0;overflow:hidden';
  video.style.cssText = 'width:100%;height:100%;object-fit:contain';
  final frame = html.DivElement()
    ..style.cssText =
        'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(90%,${frameAspectRatio * 70}vh);aspect-ratio:$frameAspectRatio;border:3px solid white;border-radius:12px;box-shadow:0 0 0 999px rgba(0,0,0,.35);pointer-events:none';
  final hint = html.DivElement()
    ..text = 'В СНИМОК ПОПАДЁТ ТОЛЬКО ОБЛАСТЬ ВНУТРИ РАМКИ'
    ..style.cssText =
        'position:absolute;bottom:12px;left:12px;right:12px;text-align:center;color:white;font-size:16px';
  preview.children.addAll([video, frame, hint]);
  overlay.children.addAll([preview, controls]);
  final cancelSub = cancel.onClick.listen((_) {
    if (!result.isCompleted) result.complete(null);
  });
  final keySub = html.window.onKeyDown.listen((event) {
    if (event.key == 'Escape' && !result.isCompleted) result.complete(null);
  });
  StreamSubscription<html.Event>? resizeSub;
  final captureSub = capture.onClick.listen((_) {
    try {
      final bounds = video.getBoundingClientRect();
      final scale = math.min(bounds.width / video.videoWidth, bounds.height / video.videoHeight);
      final visibleWidth = video.videoWidth * scale;
      final visibleHeight = video.videoHeight * scale;
      final widthInView = math.min(visibleWidth * .9, visibleHeight * .82 * frameAspectRatio);
      final sourceWidth = widthInView / scale;
      final sourceHeight = sourceWidth / frameAspectRatio;
      final outputScale = math.min(1.0, 2200 / math.max(sourceWidth, sourceHeight));
      final canvas = html.CanvasElement(width: (sourceWidth * outputScale).round(), height: (sourceHeight * outputScale).round());
      canvas.context2D.drawImageScaledFromSource(video, (video.videoWidth - sourceWidth) / 2, (video.videoHeight - sourceHeight) / 2, sourceWidth, sourceHeight, canvas.width, canvas.height);
      final data = canvas.toDataUrl('image/jpeg', 0.82);
      if (!result.isCompleted) {
        result.complete(
          PickedLocalFile(
            name: 'document-${DateTime.now().millisecondsSinceEpoch}.jpg',
            bytes: base64Decode(data.split(',').last),
          ),
        );
      }
    } catch (error, trace) {
      if (!result.isCompleted) result.completeError(error, trace);
    }
  });
  try {
    html.document.body?.append(overlay);
    final ready = video.onLoadedMetadata.first;
    video.srcObject = stream;
    final canStart = await Future.any<bool>([
      ready.timeout(const Duration(seconds: 15)).then((_) => true),
      result.future.then((_) => false),
    ]);
    if (!canStart || result.isCompleted) {
      return await result.future;
    }
    await video.play();
    void alignFrame() {
      final bounds = video.getBoundingClientRect();
      final scale = math.min(bounds.width / video.videoWidth, bounds.height / video.videoHeight);
      final width = math.min(video.videoWidth * scale * .9, video.videoHeight * scale * .82 * frameAspectRatio);
      frame.style.width = '${width}px';
      frame.style.height = '${width / frameAspectRatio}px';
      frame.style.boxSizing = 'border-box';
    }
    alignFrame();
    resizeSub = html.window.onResize.listen((_) => alignFrame());
    capture.disabled = false;
    return await result.future.timeout(
      const Duration(minutes: 5),
      onTimeout: () => null,
    );
  } finally {
    video.pause();
    for (final track in stream.getTracks()) {
      track.stop();
    }
    await cancelSub.cancel();
    await keySub.cancel();
    await captureSub.cancel();
    await resizeSub?.cancel();
    overlay.remove();
  }
}
