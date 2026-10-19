import 'package:flutter/material.dart';

/// Uses the decoded image proportions so the complete document fills its block.
class DocumentImageFrame extends StatefulWidget {
  const DocumentImageFrame({super.key, required this.image, required this.child});
  final ImageProvider image;
  final Widget child;
  @override
  State<DocumentImageFrame> createState() => _DocumentImageFrameState();
}

class _DocumentImageFrameState extends State<DocumentImageFrame> {
  ImageStream? _stream;
  ImageStreamListener? _listener;
  double _ratio = .71;
  @override
  void didChangeDependencies() { super.didChangeDependencies(); _resolve(); }
  @override
  void didUpdateWidget(covariant DocumentImageFrame oldWidget) { super.didUpdateWidget(oldWidget); if (oldWidget.image != widget.image) _resolve(); }
  void _resolve() {
    if (_listener != null) _stream?.removeListener(_listener!);
    _stream = widget.image.resolve(createLocalImageConfiguration(context));
    _listener = ImageStreamListener((info, synchronousCall) {
      final ratio = info.image.width / info.image.height;
      if (mounted && ratio != _ratio) {
        if (synchronousCall) { _ratio = ratio; } else { setState(() => _ratio = ratio); }
      }
    }, onError: (Object error, StackTrace? stack) {});
    _stream!.addListener(_listener!);
  }
  @override
  void dispose() { if (_listener != null) _stream?.removeListener(_listener!); super.dispose(); }
  @override
  Widget build(BuildContext context) => AspectRatio(aspectRatio: _ratio, child: widget.child);
}
