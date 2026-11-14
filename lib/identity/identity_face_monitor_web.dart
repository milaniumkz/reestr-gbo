import 'dart:convert';
import 'dart:js_interop';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'identity_face_guide_model.dart';

@JS('intercityFaceGuide.start')
external JSPromise<JSAny?> _startGuide(JSFunction callback);
@JS('intercityFaceGuide.recording')
external void _recordingGuide();
@JS('intercityFaceGuide.stop')
external void _stopGuide();

const identityCameraFormat = ImageFormatGroup.unknown;

class IdentityFaceMonitor {
  bool get usesCameraStream => false;
  Future<void> start(
    CameraController camera,
    void Function(IdentityFaceSample) report,
  ) async {
    try {
      await _startGuide(
        ((JSString raw) {
          final value = jsonDecode(raw.toDart) as Map;
          report(
            IdentityFaceSample([
              for (final f in value['faces'] as List? ?? [])
                Rect.fromLTWH(
                  (f['x'] as num).toDouble(),
                  (f['y'] as num).toDouble(),
                  (f['w'] as num).toDouble(),
                  (f['h'] as num).toDouble(),
                ),
            ], available: value['available'] == true),
          );
        }).toJS,
      ).toDart;
    } catch (_) {
      report(IdentityFaceSample.unavailable);
    }
  }

  void process(CameraImage image) {}
  Future<void> beforeRecording(CameraController camera) async {
    try {
      _recordingGuide();
    } catch (_) {}
  }

  Future<void> stop() async {
    try {
      _stopGuide();
    } catch (_) {}
  }

  Future<void> dispose() => stop();
}
