import 'package:flutter/material.dart';
import '../l10n/app_language.dart';

Future<bool> confirmInspectionAddress(
  BuildContext context, {
  required Future<String> Function() resolve,
}) async =>
    await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _InspectionAddressGate(resolve: resolve),
    ) ??
    false;

class _InspectionAddressGate extends StatefulWidget {
  const _InspectionAddressGate({required this.resolve});
  final Future<String> Function() resolve;
  @override
  State<_InspectionAddressGate> createState() => _InspectionAddressGateState();
}

class _InspectionAddressGateState extends State<_InspectionAddressGate> {
  bool busy = true;
  String? address;
  bool failed = false;

  @override
  void initState() {
    super.initState();
    attempt();
  }

  Future<void> attempt() async {
    setState(() {
      busy = true;
      failed = false;
      address = null;
    });
    try {
      final value = (await widget.resolve()).trim();
      if (value.isEmpty || value.toUpperCase().startsWith('GPS')) {
        throw StateError('Address unavailable');
      }
      if (mounted) setState(() => address = value);
    } catch (_) {
      if (mounted) setState(() => failed = true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(tr(context, 'Адрес места инспекции')),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (busy) ...[
          const Center(child: CircularProgressIndicator()),
          const SizedBox(height: 16),
          Text(tr(context, 'Определяем адрес по координатам…')),
        ],
        if (failed)
          Text(
            tr(
              context,
              'Адрес инспекции не определился. Проверьте интернет и геолокацию. Без адреса продолжить нельзя.',
            ),
          ),
        if (address != null) Text(address!),
      ],
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(false),
        child: Text(tr(context, 'Отмена')),
      ),
      if (failed)
        FilledButton(
          onPressed: busy ? null : attempt,
          child: Text(tr(context, 'Попробовать снова определить адрес')),
        ),
      if (address != null && !busy)
        FilledButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(tr(context, 'Продолжить')),
        ),
    ],
  );
}
