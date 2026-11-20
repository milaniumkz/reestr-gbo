import 'dart:async';
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

StreamSubscription<html.Event>? _requests;
bool? _pushAvailable;
void configureWebUpdates(
  Future<Map<String, dynamic>> Function(
    String action,
    Map<String, dynamic> payload,
  )?
  handler,
) {
  unawaited(_requests?.cancel());
  _requests = null;
  (html.window as JSObject).setProperty(
    'ersiUpdateBridgeReady'.toJS,
    (handler != null).toJS,
  );
  if (handler == null) return;
  _requests = html.window.on['ersi-update-request'].listen((event) async {
    String? id;
    Map<String, dynamic> result;
    try {
      final request =
          jsonDecode((event as html.CustomEvent).detail as String) as Map;
      id = request['id'] as String;
      if (id.length > 100) return;
      result = await handler(
        request['action'] as String,
        Map<String, dynamic>.from(request['payload'] as Map? ?? {}),
      );
    } catch (_) {
      result = {'ok': false};
    }
    if (id != null) {
      html.window.dispatchEvent(
        html.CustomEvent(
          'ersi-update-response',
          detail: jsonEncode({'id': id, ...result}),
        ),
      );
    }
  });
}

void setWebPushAvailable(bool available) {
  if (_pushAvailable == available) return;
  _pushAvailable = available;
  (html.window as JSObject).setProperty(
    'ersiWebPushAvailable'.toJS,
    available.toJS,
  );
  html.window.dispatchEvent(html.Event('ersi-push-state'));
}

void checkWebRelease() => html.window.dispatchEvent(
  html.CustomEvent('ersi-update-check', detail: 'announce'),
);
