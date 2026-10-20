import '../l10n/app_language.dart';
import 'package:flutter/material.dart' as material;

/// Uppercase presentation only; stored values and editable input are unchanged.
class Text extends material.Text {
  const Text(
    super.data, {
    super.key,
    super.style,
    super.strutStyle,
    super.textAlign,
    super.textDirection,
    super.locale,
    super.softWrap,
    super.overflow,
    super.textScaler,
    super.maxLines,
    super.semanticsLabel,
    super.textWidthBasis,
    super.textHeightBehavior,
    super.selectionColor,
  });
  @override
  material.Widget build(material.BuildContext context) => material.Text(
    tr(context, data!).toUpperCase(),
    style: style,
    strutStyle: strutStyle,
    textAlign: textAlign,
    textDirection: textDirection,
    locale: locale,
    softWrap: softWrap,
    overflow: overflow,
    textScaler: textScaler,
    maxLines: maxLines,
    semanticsLabel: semanticsLabel == null
        ? null
        : tr(context, semanticsLabel!).toUpperCase(),
    textWidthBasis: textWidthBasis,
    textHeightBehavior: textHeightBehavior,
    selectionColor: selectionColor,
  ).build(context);
}
