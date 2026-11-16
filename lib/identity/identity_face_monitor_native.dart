import 'package:camera/camera.dart';
import 'identity_face_guide_model.dart';

// The server performs all mandatory face/liveness checks. Keep native camera
// support on existing iOS 14 devices without adding an iOS 15.5-only plugin.
const identityCameraFormat = ImageFormatGroup.unknown;

class IdentityFaceMonitor {
  Future<void> waitForCamera(CameraController camera) async {
    if (!camera.value.isInitialized) throw StateError('Камера не готова');
  }

  bool get usesCameraStream => false;
  bool isCameraLive(CameraController camera) => camera.value.isInitialized;
  Future<void> start(
    CameraController camera,
    void Function(IdentityFaceSample) report,
  ) async {
    report(IdentityFaceSample.unavailable);
  }

  void process(CameraImage image) {}
  Future<void> beforeRecording(CameraController camera) async {}
  Future<void> stop() async {}
  Future<void> dispose() async {}
}
