import 'package:flutter/material.dart';
import '../data/models.dart';
import '../l10n/app_language.dart';

class PhotoRotationScope extends InheritedWidget {
  const PhotoRotationScope({
    super.key,
    required this.busy,
    required this.onRotate,
    required super.child,
  });
  final bool busy;
  final Future<void> Function(InspectionFileInfo file, int turns)? onRotate;
  static PhotoRotationScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<PhotoRotationScope>();
  @override
  bool updateShouldNotify(PhotoRotationScope oldWidget) =>
      busy != oldWidget.busy || onRotate != oldWidget.onRotate;
}

class PhotoRotationButtons extends StatelessWidget {
  const PhotoRotationButtons({super.key, required this.file});
  final InspectionFileInfo file;
  @override
  Widget build(BuildContext context) {
    final scope = PhotoRotationScope.maybeOf(context);
    if (scope?.onRotate == null || !file.isImage) {
      return const SizedBox.shrink();
    }
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        if (scope!.busy)
          const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        IconButton(
          tooltip: tr(context, 'Повернуть влево и сохранить'),
          onPressed: scope.busy ? null : () => scope.onRotate!(file, -1),
          icon: const Icon(Icons.rotate_left),
        ),
        IconButton(
          tooltip: tr(context, 'Повернуть вправо и сохранить'),
          onPressed: scope.busy ? null : () => scope.onRotate!(file, 1),
          icon: const Icon(Icons.rotate_right),
        ),
      ],
    );
  }
}
