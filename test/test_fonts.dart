import 'dart:io';

import 'package:flutter/services.dart';

Future<void> loadTestFonts() async {
  final textBytes = await File(
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  ).readAsBytes();
  final iconBytes = await File(
    '/Volumes/PD1000/job/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
  ).readAsBytes();
  final textData = ByteData.view(Uint8List.fromList(textBytes).buffer);
  final iconData = ByteData.view(Uint8List.fromList(iconBytes).buffer);
  await (FontLoader('Roboto')..addFont(Future.value(textData))).load();
  await (FontLoader('MaterialIcons')..addFont(Future.value(iconData))).load();
}
