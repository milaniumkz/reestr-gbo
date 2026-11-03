// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use
import 'dart:convert';
import 'dart:html' as html;
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

final _flags = <String, bool>{};
void setWebUpdateBusy(String source, bool busy) {
  if (_flags[source] == busy) return;
  _flags[source] = busy;
  final anyBusy = _flags.values.any((value) => value);
  (html.window as JSObject).setProperty('ersiUpdateBusy'.toJS, anyBusy.toJS);
  html.window.dispatchEvent(
    html.CustomEvent(
      'ersi-update-state',
      detail: jsonEncode({'busy': anyBusy}),
    ),
  );
}

void markWebChangesSaved() =>
    html.window.dispatchEvent(html.Event('ersi-update-saved'));
