import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/data/api_client.dart';

http.Response pendingIdentity() => http.Response(
  jsonEncode({
    'message': 'Пройдите видеоидентификацию перед работой с инспекциями',
  }),
  403,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
    'parallel blocked requests share one video check and resume their original requests',
    () async {
      final check = Completer<bool>();
      var verified = false, checks = 0;
      final paths = <String>[];
      final api =
          ApiClient(
              baseUrl: 'https://example.test',
              httpClient: MockClient((r) async {
                paths.add(r.url.path);
                return verified
                    ? http.Response('{"available":true}', 200)
                    : pendingIdentity();
              }),
            )
            ..onIdentityRequired = () {
              checks++;
              return check.future;
            };
      final requests = Future.wait([
        api.getJson(
          '/inspections/certificate-number/10706/availability?organizationId=org',
        ),
        api.getJson('/organizations'),
      ]);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(checks, 1);
      verified = true;
      check.complete(true);
      final results = await requests;
      expect(results.every((r) => r['available'] == true), true);
      expect(paths.where((p) => p.contains('10706')).length, 2);
      expect(paths.where((p) => p == '/organizations').length, 2);
    },
  );
  test('a cancelled video check never resends the operation', () async {
    var requests = 0;
    final api = ApiClient(
      baseUrl: 'https://example.test',
      httpClient: MockClient((r) async {
        requests++;
        return pendingIdentity();
      }),
    )..onIdentityRequired = () async => false;
    await expectLater(
      api.getJson('/inspections'),
      throwsA(isA<ApiException>()),
    );
    expect(requests, 1);
  });
  test('a repeated identity refusal retries only once', () async {
    var requests = 0, checks = 0;
    final api =
        ApiClient(
            baseUrl: 'https://example.test',
            httpClient: MockClient((r) async {
              requests++;
              return pendingIdentity();
            }),
          )
          ..onIdentityRequired = () async {
            checks++;
            return true;
          };
    await expectLater(
      api.getJson('/inspections'),
      throwsA(isA<ApiException>()),
    );
    expect(requests, 2);
    expect(checks, 1);
  });
  test(
    'ordinary role restrictions and identity API failures never open another video dialog',
    () async {
      var checks = 0;
      final api =
          ApiClient(
              baseUrl: 'https://example.test',
              httpClient: MockClient(
                (r) async => r.url.path.startsWith('/auth/')
                    ? pendingIdentity()
                    : http.Response(
                        '{"message":"Недостаточно прав"}',
                        403,
                        headers: {
                          'content-type': 'application/json; charset=utf-8',
                        },
                      ),
              ),
            )
            ..onIdentityRequired = () async {
              checks++;
              return true;
            };
      await expectLater(
        api.getJson('/inspections'),
        throwsA(isA<ApiException>()),
      );
      await expectLater(
        api.getJson('/auth/identity/status'),
        throwsA(isA<ApiException>()),
      );
      expect(checks, 0);
    },
  );
  test(
    'a protected write preserves its payload when resumed after video verification',
    () async {
      var verified = false;
      final bodies = <String>[];
      final api =
          ApiClient(
              baseUrl: 'https://example.test',
              httpClient: MockClient((r) async {
                bodies.add(r.body);
                return verified
                    ? http.Response('{"ok":true}', 200)
                    : pendingIdentity();
              }),
            )
            ..onIdentityRequired = () async {
              verified = true;
              return true;
            };
      final payload = {'certificateNumber': '10706', 'ownerName': 'Test owner'};
      expect(await api.postJson('/inspections', payload), {'ok': true});
      expect(bodies, [jsonEncode(payload), jsonEncode(payload)]);
    },
  );
}
