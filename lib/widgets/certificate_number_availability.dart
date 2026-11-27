import 'dart:async';
import 'package:flutter/material.dart';
import '../l10n/app_language.dart';

/// Check on blur, without requesting location or leaving the form. Results from
/// an older number/account/inspection must never describe the current field.
class CertificateNumberAvailability extends StatefulWidget {
  const CertificateNumberAvailability({
    super.key,
    required this.value,
    required this.scopeKey,
    required this.check,
    required this.child,
  });
  final String value;
  final String scopeKey;
  final Future<bool> Function(String number) check;
  final Widget child;

  @override
  State<CertificateNumberAvailability> createState() =>
      _CertificateNumberAvailabilityState();
}

class _CertificateNumberAvailabilityState
    extends State<CertificateNumberAvailability> {
  int _generation = 0;
  bool _focused = false;
  bool _checking = false;
  bool _error = false;
  String? _message;

  @override
  void didUpdateWidget(covariant CertificateNumberAvailability oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value ||
        oldWidget.scopeKey != widget.scopeKey) {
      _generation++;
      _checking = false;
      _message = null;
    }
  }

  Future<void> _check() async {
    if (!mounted || widget.value.trim().isEmpty) return;
    final generation = ++_generation;
    final number = widget.value;
    setState(() {
      _checking = true;
      _error = false;
      _message = 'Проверка номера свидетельства';
    });
    bool available;
    try {
      available = await widget.check(number);
    } catch (_) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _checking = false;
        _error = true;
        _message = 'Не удалось проверить номер. Повторите проверку.';
      });
      return;
    }
    if (!mounted || generation != _generation) return;
    setState(() {
      _checking = false;
      _error = !available;
      _message = available
          ? 'Номер свидетельства доступен'
          : 'Свидетельство с таким номером уже есть в этом инспекционном органе';
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Focus(
      canRequestFocus: false,
      skipTraversal: true,
      onFocusChange: (focused) {
        final left = _focused && !focused;
        _focused = focused;
        if (left) unawaited(_check());
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          widget.child,
          if (_message != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Semantics(
                container: true,
                liveRegion: true,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_checking) ...[
                      const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                      const SizedBox(width: 8),
                    ],
                    Expanded(
                      child: Text(
                        tr(context, _message!),
                        style: TextStyle(
                          color: _error ? colors.error : colors.primary,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
