import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/data/client_telemetry.dart';

class HeldLocation extends GeolocatorPlatform {
  final result = Completer<Position>();
  int calls = 0;
  @override
  Future<LocationPermission> checkPermission() async =>
      LocationPermission.whileInUse;
  @override
  Future<Position> getCurrentPosition({LocationSettings? locationSettings}) {
    calls++;
    return result.future;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'optional GPS diagnostics never delay API headers and reuse one background refresh',
    () async {
      SharedPreferences.setMockInitialValues({
        'diagnosticLocationConsent': true,
      });
      final original = GeolocatorPlatform.instance, fake = HeldLocation();
      GeolocatorPlatform.instance = fake;
      try {
        final first = await ClientTelemetry.headers().timeout(
          const Duration(milliseconds: 500),
        );
        expect(first['X-Location-State'], 'not_requested');
        await pumpEventQueue();
        await ClientTelemetry.headers();
        expect(fake.calls, 1);
        fake.result.complete(
          Position(
            latitude: 43.2,
            longitude: 76.9,
            timestamp: DateTime.now(),
            accuracy: 5,
            altitude: 0,
            altitudeAccuracy: 0,
            heading: 0,
            headingAccuracy: 0,
            speed: 0,
            speedAccuracy: 0,
          ),
        );
        await pumpEventQueue();
        final next = await ClientTelemetry.headers();
        expect(next['X-Location-State'], 'available');
        expect(next['X-Location-Lat'], '43.2');
        expect(fake.calls, 1);
      } finally {
        GeolocatorPlatform.instance = original;
      }
    },
  );
}
