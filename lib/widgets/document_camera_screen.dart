import 'dart:async';
import '../camera/document_bounds.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'document_crop.dart';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart' hide Text;
import 'uppercase_text.dart';
import '../platform/local_file.dart';

class DocumentCameraScreen extends StatefulWidget {
  const DocumentCameraScreen({
    super.key,
    required this.title,
    this.frameAspectRatio = 0.71,
    this.requireDocumentBounds = true,
  });
  final String title;
  final double frameAspectRatio;
  final bool requireDocumentBounds;
  @override
  State<DocumentCameraScreen> createState() => _DocumentCameraScreenState();
}

class _DocumentCameraScreenState extends State<DocumentCameraScreen>
    with WidgetsBindingObserver {
  CameraController? _controller;
  bool _initializing = false;
  bool _busy = false;
  bool _completed = false;
  String? _error;
  final _gate = DocumentFrameGate();
  bool _analyzing = false;
  int _generation = 0;
  DateTime _lastFrame = DateTime.fromMillisecondsSinceEpoch(0);
  Timer? _freshness;
  Timer? _autoCapture;
  bool _waitForDocumentExit = false;
  bool get _aligned =>
      !widget.requireDocumentBounds || _gate.visualAligned(DateTime.now());
  bool get _ready =>
      !widget.requireDocumentBounds || _gate.ready(DateTime.now());

  Future<void> _startAnalysis(CameraController controller) async {
    if (!widget.requireDocumentBounds) return;
    final generation = ++_generation;
    _gate.reset();
    await controller.startImageStream((image) async {
      final now = DateTime.now();
      if (_analyzing ||
          _busy ||
          now.difference(_lastFrame).inMilliseconds < 300) {
        return;
      }
      _lastFrame = now;
      _analyzing = true;
      try {
        final bgra = image.format.group == ImageFormatGroup.bgra8888;
        if (!bgra &&
            image.format.group != ImageFormatGroup.yuv420 &&
            image.format.group != ImageFormatGroup.nv21) {
          throw StateError('Unsupported camera format');
        }
        final plane = image.planes.first;
        final rotation = image.width > image.height
            ? controller.description.sensorOrientation
            : 0;
        final input = sampleDocumentLuma(
          bytes: plane.bytes,
          width: image.width,
          height: image.height,
          rowStride: plane.bytesPerRow,
          pixelStride: bgra ? 4 : plane.bytesPerPixel ?? 1,
          rotation: rotation,
          bgra: bgra,
        );
        input['frameRatio'] = widget.frameAspectRatio;
        final result = await compute(analyzeDocumentFrame, input);
        if (mounted && generation == _generation && !_busy) {
          setState(() => _gate.update(result, now));
          if (!result.fits) _waitForDocumentExit = false;
          if (_ready && !_waitForDocumentExit && _autoCapture == null) {
            _autoCapture = Timer(const Duration(milliseconds: 120), () {
              _autoCapture = null;
              if (mounted && generation == _generation && _ready && !_busy) {
                unawaited(_capture(automatic: true));
              }
            });
          } else if (!_ready) {
            _autoCapture?.cancel();
            _autoCapture = null;
          }
        }
      } catch (_) {
        if (mounted && generation == _generation) setState(() => _gate.reset());
      } finally {
        _analyzing = false;
      }
    });
    _freshness?.cancel();
    _freshness = Timer.periodic(const Duration(milliseconds: 400), (_) {
      if (mounted && !_busy) setState(() {});
    });
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_initialize());
  }

  Future<void> _focusDocument(CameraController controller) async {
    // Unsupported autofocus or metering controls must never prevent a photo.
    for (final configure in <Future<void> Function()>[
      () => controller.setFocusMode(FocusMode.auto),
      () => controller.setFocusPoint(const Offset(.5, .5)),
      () => controller.setExposurePoint(const Offset(.5, .5)),
    ]) {
      try {
        await configure().timeout(const Duration(milliseconds: 300));
      } catch (_) {}
    }
  }

  Future<void> _initialize() async {
    if (_initializing) return;
    _initializing = true;
    try {
      final cameras = await availableCameras();
      if (!mounted) return;
      if (cameras.isEmpty) {
        throw StateError('Камера не найдена');
      }
      final camera = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );
      final controller = CameraController(
        camera,
        ResolutionPreset.high,
        enableAudio: false,
      );
      _controller = controller;
      await controller.initialize();
      await controller.lockCaptureOrientation(DeviceOrientation.portraitUp);
      await _focusDocument(controller);
      if (!mounted) {
        await controller.dispose();
        return;
      }
      await _startAnalysis(controller);
      if (mounted) setState(() => _error = null);
    } catch (error) {
      if (mounted) {
        setState(
          () =>
              _error = error is CameraException && error.code.contains('Denied')
              ? 'Разрешите доступ к камере в настройках приложения'
              : 'Не удалось открыть камеру. Вернитесь и выберите файл.',
        );
      }
    } finally {
      _initializing = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (state == AppLifecycleState.inactive &&
        controller?.value.isInitialized == true) {
      _generation++;
      _gate.reset();
      _freshness?.cancel();
      _autoCapture?.cancel();
      _autoCapture = null;
      _controller = null;
      unawaited(controller!.dispose());
      if (mounted) setState(() {});
    } else if (state == AppLifecycleState.resumed && _controller == null) {
      unawaited(_initialize());
    }
  }

  Future<void> _capture({bool automatic = false}) async {
    final controller = _controller;
    if (_busy ||
        _completed ||
        (automatic && !_ready) ||
        controller?.value.isInitialized != true) {
      return;
    }
    setState(() => _busy = true);
    try {
      _generation++;
      if (controller!.value.isStreamingImages) {
        await controller.stopImageStream();
      }
      await Future<void>.delayed(const Duration(milliseconds: 80));
      if (!mounted || !identical(controller, _controller)) return;
      final photo = await controller.takePicture();
      final cropped = await compute(cropDocumentPhoto, <String, Object>{
        'bytes': await photo.readAsBytes(),
        'previewRatio': 1 / controller.value.aspectRatio,
        'frameRatio': widget.frameAspectRatio,
        'requireDocumentBounds': automatic && widget.requireDocumentBounds,
      });
      final file = PickedLocalFile(
        name: 'document-${DateTime.now().millisecondsSinceEpoch}.jpg',
        bytes: cropped,
      );
      if (mounted) {
        _completed = true;
        Navigator.of(context).pop(file);
      }
    } catch (error) {
      if (automatic) _waitForDocumentExit = true;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              error is StateError
                  ? error.message.toString()
                  : 'Не удалось сделать фото. Попробуйте ещё раз.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        if (!_completed &&
            identical(controller, _controller) &&
            controller!.value.isInitialized &&
            !controller.value.isStreamingImages) {
          try {
            await _startAnalysis(controller);
          } catch (_) {
            if (mounted) {
              setState(
                () => _error =
                    'Не удалось проверить границы документа. Откройте камеру заново.',
              );
            }
          }
        }
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _generation++;
    _freshness?.cancel();
    _autoCapture?.cancel();
    final controller = _controller;
    if (controller != null) unawaited(controller.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text(widget.title),
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
      ),
      body: _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Colors.white),
                  textAlign: TextAlign.center,
                ),
              ),
            )
          : controller?.value.isInitialized != true
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Expanded(
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final ratio = 1 / controller!.value.aspectRatio;
                      final width =
                          constraints.maxWidth < constraints.maxHeight * ratio
                          ? constraints.maxWidth
                          : constraints.maxHeight * ratio;
                      return Center(
                        child: SizedBox(
                          width: width,
                          height: width / ratio,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              CameraPreview(controller),
                              IgnorePointer(
                                child: CustomPaint(
                                  painter: DocumentFramePainter(
                                    widget.frameAspectRatio,
                                    ready: _aligned,
                                  ),
                                ),
                              ),
                              const Positioned(
                                left: 8,
                                right: 8,
                                bottom: 8,
                                child: Text(
                                  'В СНИМОК ПОПАДЁТ ТОЛЬКО ОБЛАСТЬ ВНУТРИ РАМКИ',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 12,
                                    backgroundColor: Colors.black54,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
                if (widget.requireDocumentBounds)
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    child: Text(
                      _ready ? documentAutoMessage : documentManualMessage,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: _aligned ? Colors.greenAccent : Colors.white,
                      ),
                    ),
                  ),
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: SizedBox(
                      width: double.infinity,
                      height: 56,
                      child: FilledButton.icon(
                        onPressed: _busy ? null : _capture,
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF007A4D),
                          foregroundColor: Colors.white,
                          disabledBackgroundColor: const Color(0xFF455A64),
                          disabledForegroundColor: Colors.white,
                          side: const BorderSide(color: Colors.white54),
                          textStyle: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        icon: Icon(
                          _busy
                              ? Icons.hourglass_top_rounded
                              : Icons.camera_alt,
                        ),
                        label: Text(_busy ? 'Съёмка…' : 'Сделать фото'),
                      ),
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class DocumentFramePainter extends CustomPainter {
  const DocumentFramePainter(this.aspectRatio, {this.ready = false});
  final bool ready;
  final double aspectRatio;
  @override
  void paint(Canvas canvas, Size size) {
    final rect = documentFrameRect(size, aspectRatio);
    final mask = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & size)
      ..addRRect(RRect.fromRectAndRadius(rect, const Radius.circular(12)));
    canvas.drawPath(mask, Paint()..color = Colors.black45);
    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, const Radius.circular(12)),
      Paint()
        ..color = ready ? Colors.greenAccent : Colors.orangeAccent
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
  }

  @override
  bool shouldRepaint(DocumentFramePainter oldDelegate) =>
      oldDelegate.aspectRatio != aspectRatio || oldDelegate.ready != ready;
}
