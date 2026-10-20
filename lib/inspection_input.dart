import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Keyboard preferences are confined to inspection forms, not account passwords.
class InspectionInputScope extends InheritedWidget {
  const InspectionInputScope({
    super.key,
    required this.enabled,
    required super.child,
  });
  final bool enabled;
  static bool enabledOf(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<InspectionInputScope>()
          ?.enabled ??
      false;
  @override
  bool updateShouldNotify(InspectionInputScope oldWidget) =>
      enabled != oldWidget.enabled;
}

/// Preserve punctuation, Cyrillic/Kazakh letters and cursor position on paste/edit.
class InspectionUppercaseFormatter extends TextInputFormatter {
  const InspectionUppercaseFormatter();
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    if (newValue.composing.isValid && !newValue.composing.isCollapsed) {
      return newValue;
    }
    int offset(int value) => value < 0
        ? value
        : newValue.text
              .substring(0, value.clamp(0, newValue.text.length))
              .toUpperCase()
              .length;
    return newValue.copyWith(
      text: newValue.text.toUpperCase(),
      selection: TextSelection(
        baseOffset: offset(newValue.selection.baseOffset),
        extentOffset: offset(newValue.selection.extentOffset),
        affinity: newValue.selection.affinity,
        isDirectional: newValue.selection.isDirectional,
      ),
      composing: TextRange.empty,
    );
  }
}
