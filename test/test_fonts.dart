import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/services.dart';

Future<void> loadTestFonts() async {
  final textBytes = await _readFirstExisting([
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
  ]);
  final flutterRoot = Platform.environment['FLUTTER_ROOT'];
  final iconBytes = await _readFirstExisting([
    if (flutterRoot != null)
      '$flutterRoot/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
    '/Volumes/PD1000/job/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
  ]);
  final textData = ByteData.view(Uint8List.fromList(textBytes).buffer);
  final iconData = ByteData.view(Uint8List.fromList(iconBytes).buffer);
  await (FontLoader('Roboto')..addFont(Future.value(textData))).load();
  await (FontLoader('MaterialIcons')..addFont(Future.value(iconData))).load();
}

Future<List<int>> _readFirstExisting(List<String> paths) async {
  for (final path in paths) {
    final file = File(path);
    if (await file.exists()) return file.readAsBytes();
  }
  throw FileSystemException('No test font found', paths.join(', '));
}
