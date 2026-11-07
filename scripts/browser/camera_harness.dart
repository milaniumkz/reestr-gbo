// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use
import 'dart:convert';
import 'dart:html' as html;
import 'package:reestr_ts_demo/platform/local_file_picker.dart';

void main() {
  final button = html.ButtonElement()..text = 'Launch camera';
  button.onClick.listen((_) async {
    html.document.querySelector('#result')?.remove();
    html.document.querySelector('#photo')?.remove();
    try {
      final file = await pickLocalFile(
        const ['jpg'],
        camera: true,
        frameAspectRatio: 1.6,
        requireDocumentBounds: Uri.base.queryParameters['document'] == 'true',
        languageCode: Uri.base.queryParameters['lang'] ?? 'ru',
      );
      html.document.body!.append(
        html.DivElement()
          ..id = 'result'
          ..text = file == null ? 'cancelled' : 'captured:${file.bytes.length}',
      );
      if (file != null) {
        html.document.body!.append(
          html.ImageElement()
            ..id = 'photo'
            ..src = 'data:image/jpeg;base64,${base64Encode(file.bytes)}',
        );
      }
    } catch (error) {
      html.document.body!.append(
        html.DivElement()
          ..id = 'result'
          ..text = 'error:$error',
      );
    }
  });
  html.document.body!.append(button);
}
