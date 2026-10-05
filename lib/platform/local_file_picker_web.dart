// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use

import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;
import 'dart:typed_data';

import 'local_file.dart';

Future<PickedLocalFile?> pickLocalFile(List<String> extensions) async {
  final input = html.FileUploadInputElement()
    ..accept = extensions.map((item) => '.$item').join(',')
    ..multiple = false
    ..style.display = 'none';
  final completer = Completer<PickedLocalFile?>();
  html.document.body?.append(input);
  input.onChange.first.then((_) async {
    try {
      final file = input.files?.isNotEmpty == true ? input.files!.first : null;
      if (file == null) {
        if (!completer.isCompleted) completer.complete(null);
        return;
      }
      final bytes = await _readFileBytes(file);
      if (!completer.isCompleted) {
        completer.complete(PickedLocalFile(name: file.name, bytes: bytes));
      }
    } catch (error, stackTrace) {
      if (!completer.isCompleted) {
        completer.completeError(error, stackTrace);
      }
    }
  });
  input.click();
  try {
    return await completer.future.timeout(
      const Duration(minutes: 5),
      onTimeout: () => null,
    );
  } finally {
    input.remove();
  }
}

Future<Uint8List> _readFileBytes(html.File file) async {
  final bufferBytes = await _readAsArrayBuffer(file);
  if (bufferBytes.isNotEmpty) return bufferBytes;
  return _readAsDataUrl(file);
}

Future<Uint8List> _readAsArrayBuffer(html.File file) async {
  final reader = html.FileReader();
  reader.readAsArrayBuffer(file);
  await reader.onLoadEnd.first;
  if (reader.error != null) return Uint8List(0);
  return _bytesFromReaderResult(reader.result);
}

Future<Uint8List> _readAsDataUrl(html.File file) async {
  final reader = html.FileReader();
  reader.readAsDataUrl(file);
  await reader.onLoadEnd.first;
  final result = reader.result;
  if (reader.error != null || result is! String || !result.contains(',')) {
    return Uint8List(0);
  }
  return base64Decode(result.split(',').last);
}

Uint8List _bytesFromReaderResult(Object? result) {
  return switch (result) {
    ByteBuffer buffer => Uint8List.view(buffer),
    Uint8List data => data,
    List<int> data => Uint8List.fromList(data),
    _ => Uint8List(0),
  };
}
