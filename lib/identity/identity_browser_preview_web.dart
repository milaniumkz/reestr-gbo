import 'dart:convert';
import 'dart:js_interop';

@JS('ersiIdentityPreview.enabled')
external bool _enabled();
@JS('ersiIdentityPreview.show')
external void _show(JSString state, JSFunction onStart, JSFunction onCancel);
@JS('ersiIdentityPreview.needsGesture')
external bool get _needsGesture;
@JS('ersiIdentityPreview.hide')
external void _hide();

class IdentityBrowserPreview {
  IdentityBrowserPreview({
    required void Function() onStart,
    required void Function() onCancel,
  }) : _start = onStart.toJS,
       _cancel = onCancel.toJS;
  final JSFunction _start, _cancel;
  bool get enabled {
    try {
      return _enabled();
    } catch (_) {
      return false;
    }
  }

  bool get needsGesture {
    try {
      return enabled && _needsGesture;
    } catch (_) {
      return false;
    }
  }

  void show(Map<String, dynamic> state) {
    if (enabled) _show(jsonEncode(state).toJS, _start, _cancel);
  }

  void hide() {
    if (enabled) _hide();
  }
}
