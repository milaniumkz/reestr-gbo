import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/data/api_client.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
    'authorization identity status bypasses previously cached session URLs',
    () async {
      Uri? requested;
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient((r) async {
          requested = r.url;
          return http.Response('{"required":true,"verified":false}', 200);
        }),
      );
      final status = await api.getJson('/auth/identity/status');
      expect(status['verified'], false);
      expect(requested!.path, '/auth/identity/status');
      expect(requested!.queryParameters['_fresh'], isNotEmpty);
    },
  );
  test(
    'an identity refusal during form filling preserves the reason without launching or retrying verification',
    () async {
      final paths = <String>[];
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient((r) async {
          paths.add(r.url.path);
          return http.Response(
            jsonEncode({
              'message':
                  'Пройдите видеоидентификацию перед работой с инспекциями',
            }),
            403,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );
      await expectLater(
        api.getJson('/inspections/certificate-number/10706/availability'),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'reason',
            contains('видеоидентификацию'),
          ),
        ),
      );
      expect(paths, ['/inspections/certificate-number/10706/availability']);
    },
  );
}
