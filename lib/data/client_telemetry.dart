import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Opt-in diagnostics. Client coordinates are never proof of physical presence.
class ClientTelemetry {
  static Map<String, String> _location = {'X-Location-State': 'not_requested'};
  static DateTime? _checkedAt;
  static Future<void>? _refreshing;
  static Future<void> allowLocation() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('diagnosticLocationConsent', true);
    try { await Geolocator.requestPermission(); } catch (_) {}
    _checkedAt = null;
    await headers();
  }
  static Future<Map<String,String>> headers() async {
    if (_checkedAt == null || DateTime.now().difference(_checkedAt!).inMinutes >= 5) {
      _refreshing ??= _refresh();
      await _refreshing;
      _refreshing = null;
    }
    return {
      'X-App-Version': const String.fromEnvironment('APP_VERSION', defaultValue: '1.0.0-technical-diagnostics-3'),
      'X-Client-Platform': kIsWeb ? 'web' : defaultTargetPlatform.name,
      ..._location,
    };
  }
  static Future<void> _refresh() async {
    _checkedAt = DateTime.now();
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool('diagnosticLocationConsent') != true) {
        _location = {'X-Location-State':'not_requested'};
        return;
      }
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        _location = {'X-Location-State':'denied'};
        return;
      }
      final position = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium, timeLimit: Duration(seconds: 4)));
      _location = {'X-Location-State':'available','X-Location-Lat':'${position.latitude}','X-Location-Lng':'${position.longitude}','X-Location-Accuracy':'${position.accuracy}','X-Location-At':position.timestamp.toUtc().toIso8601String()};
    } catch (_) { _location = {'X-Location-State':'unavailable'}; }
  }
}
