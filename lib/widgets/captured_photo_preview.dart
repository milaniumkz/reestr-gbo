import 'dart:typed_data';
import 'package:flutter/material.dart' hide Text;
import '../platform/local_file.dart';
import 'uppercase_text.dart';
import 'cylinder_label_photo_guide.dart';

enum _PhotoDecision { use, retake }

/// Camera streams are closed by the capture implementation before review.
/// Only an explicitly accepted shot is returned to the inspection form.
Future<PickedLocalFile?> capturePhotoWithPreview(
  BuildContext context, {
  required String title,
  required Future<PickedLocalFile?> Function() capture,
  bool requireLabelContext = false,
  Future<void> Function(PickedLocalFile)? validate,
}) async {
  while (context.mounted) {
    final file = await capture();
    if (!context.mounted || file == null || file.bytes.isEmpty) return null;
    final decision = await Navigator.of(context).push<_PhotoDecision>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => _CapturedPhotoPreview(
          title: title,
          file: file,
          validate: validate,
          requireLabelContext: requireLabelContext,
        ),
      ),
    );
    if (!context.mounted || decision == null) return null;
    if (decision == _PhotoDecision.use) return file;
  }
  return null;
}

class _CapturedPhotoPreview extends StatefulWidget {
  const _CapturedPhotoPreview({
    required this.title,
    required this.file,
    this.validate,
    required this.requireLabelContext,
  });
  final Future<void> Function(PickedLocalFile)? validate;
  final bool requireLabelContext;
  final String title;
  final PickedLocalFile file;
  @override
  State<_CapturedPhotoPreview> createState() => _CapturedPhotoPreviewState();
}

class _CapturedPhotoPreviewState extends State<_CapturedPhotoPreview> {
  late final ImageProvider _image;
  bool _checking = false;
  String? _error;
  Future<void> _accept() async {
    setState(() {
      _checking = true;
      _error = null;
    });
    try {
      await widget.validate?.call(widget.file);
      if (mounted) Navigator.of(context).pop(_PhotoDecision.use);
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error.toString().replaceFirst('Bad state: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  bool _readable = false;
  bool _contextConfirmed = false;
  @override
  void initState() {
    super.initState();
    final bytes = widget.file.bytes;
    _image = ResizeImage(
      MemoryImage(bytes is Uint8List ? bytes : Uint8List.fromList(bytes)),
      width: 1800,
      height: 1800,
      policy: ResizeImagePolicy.fit,
      allowUpscaling: false,
    );
  }

  @override
  void dispose() {
    // Repeated retakes must not retain old full-resolution images in the cache.
    _image.evict();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.black,
    appBar: AppBar(
      title: const Text('Предпросмотр фото'),
      backgroundColor: Colors.black,
      foregroundColor: Colors.white,
    ),
    body: SafeArea(
      top: false,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text(
              widget.title,
              style: const TextStyle(color: Colors.white),
            ),
          ),
          Expanded(
            child: InteractiveViewer(
              minScale: 1,
              maxScale: 5,
              child: SizedBox.expand(
                child: Image(
                  image: _image,
                  fit: BoxFit.contain,
                  frameBuilder: (_, child, frame, loaded) {
                    if ((loaded || frame != null) && !_readable) {
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (mounted && !_readable) {
                          setState(() => _readable = true);
                        }
                      });
                    }
                    return child;
                  },
                  errorBuilder: (_, _, _) {
                    return const Center(
                      child: Text(
                        'Не удалось открыть фото. Переснимите его.',
                        style: TextStyle(color: Colors.white),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
          ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * .55,
            ),
            child: SingleChildScrollView(
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                color: Colors.white,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      widget.requireLabelContext
                          ? labelPhotoInstructions
                          : 'Увеличьте фото и проверьте резкость. Если текст размыт — переснимите.',
                      textAlign: TextAlign.center,
                    ),
                    if (widget.requireLabelContext)
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _contextConfirmed,
                        onChanged: (value) =>
                            setState(() => _contextConfirmed = value == true),
                        controlAffinity: ListTileControlAffinity.leading,
                        title: const Text(labelPhotoConfirmation),
                      ),
                    if (_error != null)
                      Text(
                        _error!,
                        style: const TextStyle(color: Colors.red),
                        textAlign: TextAlign.center,
                      ),
                    if (_checking) const LinearProgressIndicator(),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _checking
                                ? null
                                : () => Navigator.of(
                                    context,
                                  ).pop(_PhotoDecision.retake),
                            icon: const Icon(Icons.camera_alt_outlined),
                            label: const Text('Переснять'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: FilledButton(
                            onPressed:
                                !_checking &&
                                    _readable &&
                                    (!widget.requireLabelContext ||
                                        _contextConfirmed)
                                ? _accept
                                : null,
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xFF007A4D),
                            ),
                            child: const Text('Использовать фото'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
