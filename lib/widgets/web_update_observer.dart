import 'package:flutter/widgets.dart';
import '../platform/web_updates.dart';

class WebUpdateObserver extends NavigatorObserver {
  final _routes = <Route<dynamic>>{};
  void _notify() => setWebUpdateBusy('navigation', _routes.length > 1);
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _routes.add(route);
    _notify();
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _routes.remove(route);
    _notify();
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _routes.remove(route);
    _notify();
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    _routes.remove(oldRoute);
    if (newRoute != null) _routes.add(newRoute);
    _notify();
  }
}
