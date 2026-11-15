import 'package:flutter/material.dart' hide Text;
import 'uppercase_text.dart';

const labelPhotoInstructions =
    'Один снимок: бирка или выбитая маркировка целиком — примерно половина кадра. По краям виден баллон. Номер и даты читаются.';
const labelPhotoConfirmation =
    'Я проверил: бирка или маркировка целиком, вокруг виден баллон, номер и даты читаются';

class CylinderLabelPhotoGuide extends StatelessWidget {
  const CylinderLabelPhotoGuide({super.key});
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('Как снять бирку'),
          const SizedBox(height: 8),
          Semantics(
            label: labelPhotoInstructions,
            child: const SizedBox(
              height: 112,
              width: double.infinity,
              child: CustomPaint(painter: _LabelGuidePainter()),
            ),
          ),
          const SizedBox(height: 8),
          const Text(labelPhotoInstructions),
        ],
      ),
    ),
  );
}

class _LabelGuidePainter extends CustomPainter {
  const _LabelGuidePainter();
  @override
  void paint(Canvas canvas, Size size) {
    final bounds = Offset.zero & size;
    canvas.drawRRect(
      RRect.fromRectAndRadius(bounds.deflate(2), const Radius.circular(10)),
      Paint()..color = const Color(0xffe7f4ee),
    );
    final cylinder = Rect.fromLTWH(
      size.width * .08,
      10,
      size.width * .84,
      size.height - 20,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(cylinder, const Radius.circular(34)),
      Paint()..color = const Color(0xffb4c3c0),
    );
    final plate = Rect.fromCenter(
      center: bounds.center,
      width: size.width * .45,
      height: 66,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(plate, const Radius.circular(4)),
      Paint()..color = const Color(0xfff5f6f2),
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(plate, const Radius.circular(4)),
      Paint()
        ..color = const Color(0xff425c52)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
    for (final dx in [plate.left + 6, plate.right - 6]) {
      canvas.drawCircle(
        Offset(dx, plate.top + 6),
        2,
        Paint()..color = const Color(0xff425c52),
      );
      canvas.drawCircle(
        Offset(dx, plate.bottom - 6),
        2,
        Paint()..color = const Color(0xff425c52),
      );
    }
    for (var i = 0; i < 4; i++) {
      canvas.drawLine(
        Offset(plate.left + 16, plate.top + 16 + i * 10),
        Offset(plate.right - 16 - (i % 2) * 12, plate.top + 16 + i * 10),
        Paint()
          ..color = const Color(0xff425c52)
          ..strokeWidth = 2,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _LabelGuidePainter oldDelegate) => false;
}
