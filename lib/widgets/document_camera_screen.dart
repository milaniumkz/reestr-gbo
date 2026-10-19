import 'dart:async';
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
  });
  final String title;
  final double frameAspectRatio;
  @override
  State<DocumentCameraScreen> createState() => _DocumentCameraScreenState();
}

class _DocumentCameraScreenState extends State<DocumentCameraScreen>
    with WidgetsBindingObserver {
  CameraController? _controller;
  bool _initializing = false;
  bool _busy = false;
  String? _error;
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
      setState(() => _error = null);
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
      _controller = null;
      unawaited(controller!.dispose());
      if (mounted) setState(() {});
    } else if (state == AppLifecycleState.resumed && _controller == null) {
      unawaited(_initialize());
    }
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (_busy || controller?.value.isInitialized != true) return;
    setState(() => _busy = true);
    try {
      final photo = await controller!.takePicture();
      final cropped = await compute(cropDocumentPhoto, <String, Object>{'bytes': await photo.readAsBytes(), 'previewRatio': 1 / controller.value.aspectRatio, 'frameRatio': widget.frameAspectRatio});
      final file = PickedLocalFile(name: 'document-${DateTime.now().millisecondsSinceEpoch}.jpg', bytes: cropped);
      if (mounted) Navigator.of(context).pop(file);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Не удалось сделать фото. Попробуйте ещё раз.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
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
                  child: LayoutBuilder(builder: (context, constraints) {
                    final ratio = 1 / controller!.value.aspectRatio;
                    final width = constraints.maxWidth < constraints.maxHeight * ratio ? constraints.maxWidth : constraints.maxHeight * ratio;
                    return Center(child: SizedBox(width: width, height: width / ratio,
                      child: Stack(fit: StackFit.expand, children: [
                        CameraPreview(controller),
                        IgnorePointer(child: CustomPaint(painter: DocumentFramePainter(widget.frameAspectRatio))),
                        const Positioned(left: 8, right: 8, bottom: 8, child: Text('В СНИМОК ПОПАДЁТ ТОЛЬКО ОБЛАСТЬ ВНУТРИ РАМКИ', textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontSize: 12, backgroundColor: Colors.black54))),
                      ]),
                    ));
                  }),
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
  const DocumentFramePainter(this.aspectRatio);
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
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
  }

  @override
  bool shouldRepaint(DocumentFramePainter oldDelegate) =>
      oldDelegate.aspectRatio != aspectRatio;
}
