// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use

import 'dart:html' as html;

import 'package:geolocator/geolocator.dart';

Future<Position?> requestBrowserPosition() async {
  try {
    final geoPosition = await html.window.navigator.geolocation
        .getCurrentPosition(
          enableHighAccuracy: true,
          timeout: const Duration(seconds: 20),
          maximumAge: Duration.zero,
        );
    final coords = geoPosition.coords;
    final latitude = coords?.latitude?.toDouble();
    final longitude = coords?.longitude?.toDouble();
    if (latitude == null || longitude == null) return null;
    return Position(
      latitude: latitude,
      longitude: longitude,
      timestamp: DateTime.now(),
      accuracy: coords?.accuracy?.toDouble() ?? 0,
      altitude: coords?.altitude?.toDouble() ?? 0,
      altitudeAccuracy: coords?.altitudeAccuracy?.toDouble() ?? 0,
      heading: coords?.heading?.toDouble() ?? 0,
      headingAccuracy: 0,
      speed: coords?.speed?.toDouble() ?? 0,
      speedAccuracy: 0,
    );
  } catch (_) {
    return null;
  }
}
