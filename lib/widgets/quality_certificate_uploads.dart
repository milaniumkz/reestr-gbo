import 'package:flutter/material.dart' hide Text;
import 'uppercase_text.dart';

/// Keep both certificate upload slots visible throughout quality review.
class QualityCertificateUploads extends StatelessWidget {
  const QualityCertificateUploads({
    super.key,
    required this.usesTwoCylinders,
    required this.firstSerial,
    required this.secondSerial,
    required this.firstUploaded,
    required this.secondUploaded,
    required this.busy,
    this.canUpload = true,
    required this.onUploadFirst,
    required this.onUploadSecond,
  });

  final bool usesTwoCylinders;
  final String firstSerial;
  final String secondSerial;
  final bool firstUploaded;
  final bool secondUploaded;
  final bool busy;
  final bool canUpload;
  final VoidCallback onUploadFirst;
  final VoidCallback onUploadSecond;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      if (!canUpload)
        const Padding(
          padding: EdgeInsets.only(bottom: 12),
          child: Text(
            'Загрузка доступна только сотруднику, который проверяет эту инспекцию.',
          ),
        ),
      if (usesTwoCylinders)
        const Padding(
          padding: EdgeInsets.only(bottom: 12),
          child: Text(
            'Для двух баллонов загрузите два свидетельства — отдельно для каждого.',
            style: TextStyle(color: Color(0xFF173A30), height: 1.4),
          ),
        ),
      _slot(
        key: const ValueKey('quality-certificate-first'),
        title: usesTwoCylinders ? 'Первый баллон' : 'Свидетельство',
        serial: firstSerial,
        uploaded: firstUploaded,
        button: usesTwoCylinders
            ? 'Загрузить свидетельство первого баллона'
            : 'Загрузить свидетельство',
        onUpload: onUploadFirst,
      ),
      if (usesTwoCylinders) ...[
        const SizedBox(height: 12),
        _slot(
          key: const ValueKey('quality-certificate-second'),
          title: 'Второй баллон',
          serial: secondSerial,
          uploaded: secondUploaded,
          button: 'Загрузить свидетельство второго баллона',
          onUpload: onUploadSecond,
        ),
      ],
    ],
  );

  Widget _slot({
    required Key key,
    required String title,
    required String serial,
    required bool uploaded,
    required String button,
    required VoidCallback onUpload,
  }) => Container(
    key: key,
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: const Color(0xFFB7D8C7)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        if (serial.trim().isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('№ $serial'),
          ),
        const SizedBox(height: 10),
        Row(
          children: [
            Icon(
              uploaded ? Icons.check_circle : Icons.file_upload_outlined,
              color: uploaded
                  ? const Color(0xFF007A4D)
                  : const Color(0xFF7F918A),
              size: 20,
            ),
            const SizedBox(width: 8),
            Expanded(child: Text(uploaded ? 'Загружено' : 'Не загружено')),
          ],
        ),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: busy || !canUpload ? null : onUpload,
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF007A4D),
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(52),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          ),
          icon: const Icon(Icons.upload_file_rounded),
          label: Text(button, textAlign: TextAlign.center),
        ),
      ],
    ),
  );
}
