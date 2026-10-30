// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use
import '../l10n/kk_catalog.dart';
import '../camera/document_bounds.dart';
import 'dart:typed_data';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;
import 'local_file.dart';
import 'dart:math' as math;

Future<PickedLocalFile?> captureDocumentPhoto({
  double frameAspectRatio = 0.71,
  bool requireDocumentBounds = true,
  String languageCode = 'ru',
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
    ..setAttribute(
      'aria-label',
      translateKazakh('Съёмка документа', languageCode),
    )
    ..style.cssText =
        'position:fixed;inset:0;z-index:2147483647;background:#101010;font-family:Arial,sans-serif;display:flex;flex-direction:column;padding:16px;box-sizing:border-box';
  final video = html.VideoElement()
    ..autoplay = true
    ..muted = true
    ..setAttribute('playsinline', '')
    ..style.cssText =
        'width:100%;height:calc(100% - 80px);object-fit:contain;flex:1;min-height:0';
  final capture = html.ButtonElement()
    ..text = translateKazakh('СДЕЛАТЬ ФОТО', languageCode).toUpperCase()
    ..disabled = true
    ..style.cssText =
        'padding:14px;border:0;border-radius:12px;background:#007a4d;color:white;font-size:16px;flex:1';
  final cancel = html.ButtonElement()
    ..text = translateKazakh('ОТМЕНА', languageCode).toUpperCase()
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
    ..text = translateKazakh(
      'В СНИМОК ПОПАДЁТ ТОЛЬКО ОБЛАСТЬ ВНУТРИ РАМКИ',
      languageCode,
    ).toUpperCase()
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
  final gate = DocumentFrameGate();
  Timer? analysisTimer;
  final analysisCanvas = html.CanvasElement();
  DocumentBounds checkFrame([html.CanvasElement? snapshot]) {
    if (video.videoWidth == 0 || video.videoHeight == 0) {
      return const DocumentBounds(documentMissingMessage);
    }
    final scale = math.min(
      1.0,
      320 / math.max(video.videoWidth, video.videoHeight),
    );
    final w = (video.videoWidth * scale).round(),
        h = (video.videoHeight * scale).round();
    analysisCanvas.width = w;
    analysisCanvas.height = h;
    analysisCanvas.context2D.drawImageScaled(snapshot ?? video, 0, 0, w, h);
    final rgba = analysisCanvas.context2D.getImageData(0, 0, w, h).data;
    final gray = Uint8List(w * h);
    for (var i = 0; i < gray.length; i++) {
      gray[i] =
          (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >>
          8;
    }
    return analyzeDocumentFrame({
      'gray': gray,
      'width': w,
      'height': h,
      'frameRatio': frameAspectRatio,
    });
  }

  void refreshGate() {
    final ready = gate.ready(DateTime.now());
    capture.disabled = !ready;
    frame.style.borderColor = ready ? '#65ffad' : '#ffb74d';
    hint.text = translateKazakh(
      ready ? documentReadyMessage : gate.message,
      languageCode,
    ).toUpperCase();
  }

  final captureSub = capture.onClick.listen((_) {
    try {
      if (requireDocumentBounds && !gate.ready(DateTime.now())) {
        refreshGate();
        return;
      }
      // Analyze and crop one frozen full-resolution frame, not two video frames.
      final snapshot = html.CanvasElement(
        width: video.videoWidth,
        height: video.videoHeight,
      );
      snapshot.context2D.drawImage(video, 0, 0);
      if (requireDocumentBounds) {
        gate.update(checkFrame(snapshot), DateTime.now());
        refreshGate();
        if (!gate.ready(DateTime.now())) return;
      }
      final bounds = video.getBoundingClientRect();
      final scale = math.min(
        bounds.width / video.videoWidth,
        bounds.height / video.videoHeight,
      );
      final visibleWidth = video.videoWidth * scale;
      final visibleHeight = video.videoHeight * scale;
      final widthInView = math.min(
        visibleWidth * .9,
        visibleHeight * .82 * frameAspectRatio,
      );
      final sourceWidth = widthInView / scale;
      final sourceHeight = sourceWidth / frameAspectRatio;
      final outputScale = math.min(
        1.0,
        2200 / math.max(sourceWidth, sourceHeight),
      );
      final outputWidth = (sourceWidth * outputScale).round();
      final outputHeight = (sourceHeight * outputScale).round();
      final canvas = html.CanvasElement(
        width: outputWidth,
        height: outputHeight,
      );
      canvas.context2D.drawImageScaledFromSource(
        snapshot,
        (video.videoWidth - sourceWidth) / 2,
        (video.videoHeight - sourceHeight) / 2,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputWidth,
        outputHeight,
      );
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
      final scale = math.min(
        bounds.width / video.videoWidth,
        bounds.height / video.videoHeight,
      );
      final width = math.min(
        video.videoWidth * scale * .9,
        video.videoHeight * scale * .82 * frameAspectRatio,
      );
      frame.style.width = '${width}px';
      frame.style.height = '${width / frameAspectRatio}px';
      frame.style.boxSizing = 'border-box';
    }

    alignFrame();
    resizeSub = html.window.onResize.listen((_) {
      alignFrame();
      gate.reset();
      if (requireDocumentBounds) refreshGate();
    });
    if (requireDocumentBounds) {
      refreshGate();
      analysisTimer = Timer.periodic(const Duration(milliseconds: 300), (_) {
        if (result.isCompleted) return;
        try {
          gate.update(checkFrame(), DateTime.now());
        } catch (_) {
          gate.reset();
        }
        refreshGate();
      });
    } else {
      capture.disabled = false;
    }
    return await result.future.timeout(
      const Duration(minutes: 5),
      onTimeout: () => null,
    );
  } finally {
    analysisTimer?.cancel();
    video.pause();
    final tracks = (stream as JSObject).callMethod<JSArray<JSObject>>(
      'getTracks'.toJS,
    );
    for (final track in tracks.toDart) {
      track.callMethod<JSAny?>('stop'.toJS);
    }
    await cancelSub.cancel();
    await keySub.cancel();
    await captureSub.cancel();
    await resizeSub?.cancel();
    overlay.remove();
  }
}
