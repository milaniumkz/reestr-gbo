import 'dart:math' as math;
import 'identity_face_guide_model.dart';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart' hide Text;
import '../widgets/uppercase_text.dart';

class IdentityCameraFrame extends StatelessWidget {
  const IdentityCameraFrame({
    super.key,
    required this.camera,
    this.sample = IdentityFaceSample.unavailable,
    this.height = 320,
    required this.recording,
    required this.instruction,
  });
  final CameraController camera;
  final double height;
  final IdentityFaceSample sample;
  final bool recording;
  final String instruction;
  @override
  Widget build(BuildContext context) => SizedBox(
    height: height,
    child: ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: Stack(
        fit: StackFit.expand,
        children: [
          CameraPreview(camera),
          IgnorePointer(
            child: CustomPaint(
              painter: _FaceGuidePainter(
                facePosition(sample) == IdentityFacePosition.centered
                    ? Colors.greenAccent
                    : sample.available
                    ? Colors.redAccent
                    : Colors.white,
              ),
            ),
          ),
          Positioned(
            top: 12,
            left: 12,
            right: 12,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.black87,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                instruction,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          Positioned(
            bottom: 10,
            left: 12,
            right: 12,
            child: Text(
              facePositionText(facePosition(sample)),
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                backgroundColor: Colors.black87,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

Rect identityFaceOval(Size size) => Rect.fromCenter(
  center: Offset(size.width / 2, size.height * .54),
  width: math.min(size.width * .62, size.height * .46),
  height: size.height * .70,
);

class _FaceGuidePainter extends CustomPainter {
  const _FaceGuidePainter(this.color);
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    final oval = identityFaceOval(size);
    final mask = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & size)
      ..addOval(oval);
    canvas.drawPath(mask, Paint()..color = Colors.black.withValues(alpha: .48));
    canvas.drawOval(
      oval,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
  }

  @override
  bool shouldRepaint(covariant _FaceGuidePainter oldDelegate) =>
      oldDelegate.color != color;
}
