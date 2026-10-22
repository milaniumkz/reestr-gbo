import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/data/api_client.dart';
import 'package:reestr_ts_demo/data/repositories.dart';

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      'accessToken': 'old',
      'refreshToken': 'refresh',
      'lastRoleCode': 'inspection_org',
      'lastOrganizationBin': '123456789012',
    }),
  );
  test(
    'rejected refresh invalidates the screen session exactly once for parallel requests',
    () async {
      var refreshes = 0, invalidations = 0;
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient((req) async {
          if (req.url.path == '/auth/refresh') {
            refreshes++;
            await Future<void>.delayed(const Duration(milliseconds: 5));
          }
          return http.Response(
            '{"message":"Войдите заново по паролю"}',
            401,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      )..onSessionInvalidated = () => invalidations++;
      api.setAccessToken('old');
      final results = await Future.wait([
        api
            .getJson('/inspections')
            .then<Object>((v) => v, onError: (Object e) => e),
        api
            .getJson('/organizations')
            .then<Object>((v) => v, onError: (Object e) => e),
      ]);
      expect(results.every((x) => x is ApiException), true);
      expect(refreshes, 1);
      expect(invalidations, 1);
      expect(
        (await SharedPreferences.getInstance()).getString('accessToken'),
        isNull,
      );
    },
  );
  test(
    'network failure preserves credentials and does not force a logout',
    () async {
      var invalidations = 0;
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient((req) async {
          if (req.url.path == '/auth/refresh') {
            throw http.ClientException('offline');
          }
          return http.Response('{}', 401);
        }),
      )..onSessionInvalidated = () => invalidations++;
      api.setAccessToken('old');
      await expectLater(
        api.getJson('/inspections'),
        throwsA(isA<ApiException>()),
      );
      expect(invalidations, 0);
      expect(
        (await SharedPreferences.getInstance()).getString('refreshToken'),
        'refresh',
      );
    },
  );
  test(
    'wrong login password never refreshes an unrelated previous session',
    () async {
      var requests = 0, invalidations = 0;
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient((req) async {
          requests++;
          return http.Response('{}', 401);
        }),
      )..onSessionInvalidated = () => invalidations++;
      api.setAccessToken('old');
      await expectLater(
        api.postJson('/auth/login', {'password': 'incorrect'}),
        throwsA(isA<ApiException>()),
      );
      expect(requests, 1);
      expect(invalidations, 0);
    },
  );
  test('old rejected refresh cannot remove a newly completed login', () async {
    final started = Completer<void>(), response = Completer<http.Response>();
    var invalidations = 0;
    final api = ApiClient(
      baseUrl: 'https://example.test',
      httpClient: MockClient((req) async {
        if (req.url.path == '/auth/refresh') {
          started.complete();
          return response.future;
        }
        return http.Response('{}', 401);
      }),
    )..onSessionInvalidated = () => invalidations++;
    api.setAccessToken('old');
    final pending = api
        .getJson('/inspections')
        .then<Object>((v) => v, onError: (Object e) => e);
    await started.future;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('refreshToken', 'new-refresh');
    await prefs.setString('accessToken', 'new-access');
    api.setAccessToken('new-access');
    response.complete(http.Response('{}', 401));
    await pending;
    expect(invalidations, 0);
    expect(prefs.getString('accessToken'), 'new-access');
  });
  test(
    'cold restore rejection notifies the app and initial login returns only a restricted challenge',
    () async {
      var invalidations = 0;
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient((req) async {
          if (req.url.path == '/auth/refresh') return http.Response('{}', 401);
          return http.Response(
            jsonEncode({
              'requiresPasswordChange': true,
              'passwordChangeToken': 'restricted-proof',
            }),
            201,
          );
        }),
      )..onSessionInvalidated = () => invalidations++;
      final auth = AuthRepository(api);
      expect(await auth.restoreSession(), isNull);
      expect(invalidations, 1);
      final result = await auth.login(
        '+77000000000',
        '123456',
        'inspection_org',
        bin: '123456789012',
      );
      expect(result.passwordChangeToken, 'restricted-proof');
      expect(result.user, isNull);
      expect(
        (await SharedPreferences.getInstance()).getString('accessToken'),
        isNull,
      );
    },
  );
  test(
    'locally expired saved session opens reauthentication without a network request',
    () async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('sessionExpiresAt', '2020-01-01T00:00:00Z');
      var invalidations = 0;
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient(
          (req) async => throw StateError('No request expected'),
        ),
      )..onSessionInvalidated = () => invalidations++;
      expect(await AuthRepository(api).restoreSession(), isNull);
      expect(invalidations, 1);
      expect(prefs.getString('accessToken'), isNull);
    },
  );
  for (final status in [200, 401]) {
    test(
      'late restore response $status does not replace or clear a newer login',
      () async {
        final started = Completer<void>();
        final response = Completer<http.Response>();
        var invalidations = 0;
        final api = ApiClient(
          baseUrl: 'https://example.test',
          httpClient: MockClient((req) {
            started.complete();
            return response.future;
          }),
        )..onSessionInvalidated = () => invalidations++;
        final pending = AuthRepository(api).restoreSession();
        await started.future;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('accessToken', 'new-access');
        await prefs.setString('refreshToken', 'new-refresh');
        api.setAccessToken('new-access');
        response.complete(
          http.Response(
            jsonEncode({
              'accessToken': 'stale-access',
              'refreshToken': 'stale-refresh',
              'user': {'sub': 'old-user', 'roles': []},
            }),
            status,
          ),
        );
        expect(await pending, isNull);
        expect(invalidations, 0);
        expect(prefs.getString('accessToken'), 'new-access');
      },
    );
  }
}
