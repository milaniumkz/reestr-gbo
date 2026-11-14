import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/services.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'identity_face_guide_model.dart';

final identityCameraFormat = Platform.isAndroid
    ? ImageFormatGroup.nv21
    : ImageFormatGroup.bgra8888;

class IdentityFaceMonitor {
  final _detector = FaceDetector(
    options: FaceDetectorOptions(performanceMode: FaceDetectorMode.fast),
  );
  CameraController? _camera;
  void Function(IdentityFaceSample)? _report;
  bool _processing = false, _stopped = true;
  DateTime _last = DateTime.fromMillisecondsSinceEpoch(0);
  bool get usesCameraStream => true;
  Future<void> start(
    CameraController camera,
    void Function(IdentityFaceSample) report,
  ) async {
    _camera = camera;
    _report = report;
    _stopped = false;
    try {
      await camera.startImageStream(process);
    } catch (_) {
      report(IdentityFaceSample.unavailable);
    }
  }

  Future<void> beforeRecording(CameraController camera) async {
    if (camera.value.isStreamingImages) await camera.stopImageStream();
  }

  void process(CameraImage image) async {
    final camera = _camera;
    if (_stopped ||
        _processing ||
        camera == null ||
        DateTime.now().difference(_last).inMilliseconds < 350) {
      return;
    }
    _processing = true;
    _last = DateTime.now();
    try {
      const rotations = {
        DeviceOrientation.portraitUp: 0,
        DeviceOrientation.landscapeLeft: 90,
        DeviceOrientation.portraitDown: 180,
        DeviceOrientation.landscapeRight: 270,
      };
      final device = rotations[camera.value.deviceOrientation] ?? 0;
      final sensor = camera.description.sensorOrientation;
      final degrees = Platform.isIOS
          ? sensor
          : camera.description.lensDirection == CameraLensDirection.front
          ? (sensor + device) % 360
          : (sensor - device + 360) % 360;
      final rotation = InputImageRotationValue.fromRawValue(degrees)!;
      Uint8List bytes;
      InputImageFormat format;
      int stride;
      if (Platform.isIOS) {
        bytes = image.planes.first.bytes;
        format = InputImageFormat.bgra8888;
        stride = image.planes.first.bytesPerRow;
      } else {
        format = InputImageFormat.nv21;
        stride = image.width;
        if (image.planes.length == 1) {
          bytes = image.planes.first.bytes;
        } else {
          // CameraX may describe NV21 as three YUV planes; account for padding.
          bytes = Uint8List(image.width * image.height * 3 ~/ 2);
          var out = 0;
          final y = image.planes[0], u = image.planes[1], v = image.planes[2];
          for (var row = 0; row < image.height; row++) {
            for (var col = 0; col < image.width; col++) {
              bytes[out++] = y.bytes[row * y.bytesPerRow + col];
            }
          }
          for (var row = 0; row < image.height ~/ 2; row++) {
            for (var col = 0; col < image.width ~/ 2; col++) {
              bytes[out++] =
                  v.bytes[row * v.bytesPerRow + col * (v.bytesPerPixel ?? 1)];
              bytes[out++] =
                  u.bytes[row * u.bytesPerRow + col * (u.bytesPerPixel ?? 1)];
            }
          }
        }
      }
      final input = InputImage.fromBytes(
        bytes: bytes,
        metadata: InputImageMetadata(
          size: Size(image.width.toDouble(), image.height.toDouble()),
          rotation: rotation,
          format: format,
          bytesPerRow: stride,
        ),
      );
      final faces = await _detector.processImage(input);
      // The iOS plugin returns bounds in the supplied BGRA buffer axes.
      final rotated = !Platform.isIOS && (degrees == 90 || degrees == 270);
      final width = (rotated ? image.height : image.width).toDouble();
      final height = (rotated ? image.width : image.height).toDouble();
      if (!_stopped) {
        _report?.call(
          IdentityFaceSample([
            for (final f in faces)
              Rect.fromLTWH(
                f.boundingBox.left / width,
                f.boundingBox.top / height,
                f.boundingBox.width / width,
                f.boundingBox.height / height,
              ),
          ]),
        );
      }
    } catch (_) {
      if (!_stopped) _report?.call(IdentityFaceSample.unavailable);
    } finally {
      _processing = false;
    }
  }

  Future<void> stop() async {
    _stopped = true;
  }

  Future<void> dispose() async {
    _stopped = true;
    await _detector.close();
  }
}
