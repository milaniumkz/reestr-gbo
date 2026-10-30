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
      _controller = null;
      unawaited(controller!.dispose());
      if (mounted) setState(() {});
    } else if (state == AppLifecycleState.resumed && _controller == null) {
      unawaited(_initialize());
    }
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (_busy || !_ready || controller?.value.isInitialized != true) return;
    setState(() => _busy = true);
    try {
      _generation++;
      if (controller!.value.isStreamingImages) {
        await controller.stopImageStream();
      }
      final photo = await controller.takePicture();
      final cropped = await compute(cropDocumentPhoto, <String, Object>{
        'bytes': await photo.readAsBytes(),
        'previewRatio': 1 / controller.value.aspectRatio,
        'frameRatio': widget.frameAspectRatio,
        'requireDocumentBounds': widget.requireDocumentBounds,
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
                                    ready: _ready,
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
                      _ready ? documentReadyMessage : _gate.message,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: _ready ? Colors.greenAccent : Colors.white,
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
                        onPressed: _busy || !_ready ? null : _capture,
                        icon: const Icon(Icons.camera_alt),
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
