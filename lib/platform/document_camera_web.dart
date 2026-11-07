// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use
import '../l10n/kk_catalog.dart';
import '../camera/document_bounds.dart';
import 'dart:typed_data';
import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;
import 'local_file.dart';
import 'browser_camera_session.dart';
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
  final cameraSelect = html.SelectElement()
    ..id = 'ersi-camera-device'
    ..setAttribute('aria-label', translateKazakh('Камера', languageCode))
    ..style.cssText =
        'flex:1;min-width:120px;min-height:44px;padding:10px;border-radius:10px;background:white;color:#123;font-size:16px';
  final refresh = html.ButtonElement()
    ..text = translateKazakh('Обновить камеры', languageCode)
    ..style.cssText =
        'min-height:44px;padding:10px;border:0;border-radius:10px;background:#e8f5ee;color:#003c2b;font-size:14px';
  final cameraLabel = html.LabelElement()
    ..htmlFor = cameraSelect.id
    ..text = translateKazakh('Камера', languageCode)
    ..style.cssText =
        'display:block;color:white;font-size:14px;margin-bottom:6px';
  final cameraRow = html.DivElement()
    ..style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
  cameraRow.children.addAll([cameraSelect, refresh]);
  final help = html.DetailsElement()
    ..style.cssText =
        'color:white;font-size:14px;margin:10px 0;max-height:24vh;overflow:auto';
  help.children.addAll([
    html.Element.tag('summary')
      ..text = translateKazakh('Подключить USB-эндоскоп', languageCode),
    html.ParagraphElement()
      ..text = translateKazakh(
        'Подключите эндоскоп через USB/OTG, закройте другие приложения камеры и нажмите «Обновить камеры». В списке доступны только камеры, которые Android и браузер распознают. Если эндоскопа нет в списке, съёмка через сайт с этой моделью недоступна.',
        languageCode,
      ),
  ]);
  final status = html.DivElement()
    ..setAttribute('role', 'status')
    ..setAttribute('aria-live', 'polite')
    ..style.cssText =
        'color:#ffd59b;font-size:14px;padding:4px 0;flex-shrink:0';
  final cameraControls = html.DivElement();
  cameraControls.children.addAll([cameraLabel, cameraRow, help, status]);
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
  overlay.children.addAll([cameraControls, preview, controls]);
  final cancelSub = cancel.onClick.listen((_) {
    if (!result.isCompleted) result.complete(null);
  });
  final keySub = html.window.onKeyDown.listen((event) {
    if (event.key == 'Escape' && !result.isCompleted) result.complete(null);
  });
  StreamSubscription<html.Event>? resizeSub;
  final gate = DocumentFrameGate();
  Timer? analysisTimer;
  Timer? autoCapture;
  var automaticCapture = false;
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

  late BrowserCameraSession session;
  void refreshGate() {
    final ready = session.ready && gate.ready(DateTime.now());
    capture.disabled = !session.ready || session.opening;
    capture.style.backgroundColor = '#007a4d';
    capture.style.color = '#ffffff';
    frame.style.borderColor = gate.visualAligned(DateTime.now())
        ? '#65ffad'
        : '#ffb74d';
    hint.text = translateKazakh(
      ready ? documentAutoMessage : documentManualMessage,
      languageCode,
    ).toUpperCase();
    if (ready &&
        requireDocumentBounds &&
        autoCapture == null &&
        !result.isCompleted) {
      autoCapture = Timer(const Duration(milliseconds: 120), () {
        autoCapture = null;
        if (!result.isCompleted && gate.ready(DateTime.now())) {
          automaticCapture = true;
          try {
            capture.click();
          } finally {
            automaticCapture = false;
          }
        }
      });
    } else if (!ready) {
      autoCapture?.cancel();
      autoCapture = null;
    }
  }

  final captureSub = capture.onClick.listen((_) {
    try {
      if (result.isCompleted || !session.ready || session.opening) return;
      final automatic = automaticCapture;
      if (automatic && requireDocumentBounds && !gate.ready(DateTime.now())) {
        refreshGate();
        return;
      }
      // Analyze and crop one frozen full-resolution frame, not two video frames.
      final snapshot = html.CanvasElement(
        width: video.videoWidth,
        height: video.videoHeight,
      );
      snapshot.context2D.drawImage(video, 0, 0);
      if (automatic && requireDocumentBounds) {
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

  session = BrowserCameraSession(devices, video, () {
    if (result.isCompleted) return;
    cameraSelect.children.clear();
    if (session.cameras.isEmpty) {
      cameraSelect.append(
        html.OptionElement(
          data: translateKazakh('Нет доступных камер', languageCode),
          value: '',
        ),
      );
    } else {
      if (!session.cameras.any((camera) => camera.id == session.selectedId)) {
        cameraSelect.append(
          html.OptionElement(
            data: translateKazakh('Выберите камеру', languageCode),
            value: '',
          ),
        );
      }
      for (var i = 0; i < session.cameras.length; i++) {
        final camera = session.cameras[i];
        cameraSelect.append(
          html.OptionElement(
            data: camera.label.isEmpty
                ? '${translateKazakh('Камера', languageCode)} ${i + 1}'
                : camera.label,
            value: camera.id,
          ),
        );
      }
    }
    cameraSelect.value = session.selectedId ?? '';
    cameraSelect.disabled = session.opening || session.cameras.isEmpty;
    refresh.disabled = session.opening;
    status.text = session.opening
        ? translateKazakh('Подключаем камеру…', languageCode)
        : session.error == null
        ? ''
        : translateKazakh(session.error!, languageCode);
    frame.hidden = !session.ready;
    hint.hidden = !session.ready;
    if (!session.ready) {
      gate.reset();
      autoCapture?.cancel();
      autoCapture = null;
    } else {
      alignFrame();
    }
    capture.disabled = !session.ready || session.opening;
    if (requireDocumentBounds && session.ready) refreshGate();
  });
  final selectSub = cameraSelect.onChange.listen((_) {
    final id = cameraSelect.value;
    if (id != null && id.isNotEmpty) unawaited(session.open(deviceId: id));
  });
  final refreshSub = refresh.onClick.listen((_) {
    unawaited(session.refresh(openIfIdle: true));
  });
  final helpSub = help.on['toggle'].listen((_) {
    if (session.ready) alignFrame();
  });
  try {
    html.document.body?.append(overlay);
    unawaited(session.open());
    resizeSub = html.window.onResize.listen((_) {
      if (session.ready) alignFrame();
      gate.reset();
      if (requireDocumentBounds) refreshGate();
    });
    if (requireDocumentBounds) {
      analysisTimer = Timer.periodic(const Duration(milliseconds: 300), (_) {
        if (result.isCompleted || !session.ready || session.opening) return;
        try {
          gate.update(checkFrame(), DateTime.now());
        } catch (_) {
          gate.reset();
        }
        refreshGate();
      });
    }
    return await result.future.timeout(
      const Duration(minutes: 5),
      onTimeout: () => null,
    );
  } finally {
    analysisTimer?.cancel();
    autoCapture?.cancel();
    await session.dispose();
    await selectSub.cancel();
    await refreshSub.cancel();
    await helpSub.cancel();
    await cancelSub.cancel();
    await keySub.cancel();
    await captureSub.cancel();
    await resizeSub?.cancel();
    overlay.remove();
  }
}
