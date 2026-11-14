import 'package:flutter/material.dart';

class IdentityFaceSample {
  const IdentityFaceSample(this.faces, {this.available = true});
  final List<Rect> faces; // Normalized coordinates of the upright preview.
  final bool available;
  static const unavailable = IdentityFaceSample([], available: false);
}

enum IdentityFacePosition {
  unavailable,
  missing,
  multiple,
  small,
  outside,
  centered,
}

IdentityFacePosition facePosition(IdentityFaceSample sample) {
  if (!sample.available) return IdentityFacePosition.unavailable;
  if (sample.faces.isEmpty) return IdentityFacePosition.missing;
  if (sample.faces.length != 1) return IdentityFacePosition.multiple;
  final f = sample.faces.single;
  if (f.height < .28 || f.width < .18) return IdentityFacePosition.small;
  if (f.height > .85 ||
      f.width > .78 ||
      (f.center.dx - .5).abs() > .12 ||
      (f.center.dy - .54).abs() > .13) {
    return IdentityFacePosition.outside;
  }
  return IdentityFacePosition.centered;
}

String facePositionText(IdentityFacePosition position) => switch (position) {
  IdentityFacePosition.unavailable => 'Поместите лицо в овал',
  IdentityFacePosition.missing => 'Поместите лицо в овал',
  IdentityFacePosition.multiple => 'В кадре должно быть только одно лицо',
  IdentityFacePosition.small => 'Поднесите телефон немного ближе',
  IdentityFacePosition.outside => 'Поместите лицо в центр овала',
  IdentityFacePosition.centered => 'Лицо в центре',
};
