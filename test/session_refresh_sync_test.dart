import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/data/api_client.dart';

String token(String user, String sid, int expires) =>
    '${base64UrlEncode(utf8.encode('{}'))}.${base64UrlEncode(utf8.encode(jsonEncode({'sub': user, 'sid': sid, 'pv': 1, 'exp': expires})))}.synthetic';
void main() {
  test(
    'a stale tab reloads newer same-session credentials without another refresh or logout',
    () async {
      final old = token('user', 'session', 1),
          fresh = token(
            'user',
            'session',
            DateTime.now().millisecondsSinceEpoch ~/ 1000 + 900,
          );
      SharedPreferences.setMockInitialValues({
        'accessToken': old,
        'refreshToken': 'old-refresh',
      });
      await SharedPreferences.getInstance();
      var refreshed = 0, invalidated = 0;
      final api =
          ApiClient(
              baseUrl: 'https://example.test',
              httpClient: MockClient((r) async {
                if (r.url.path == '/auth/refresh') {
                  refreshed++;
                  return http.Response('{}', 401);
                }
                return r.headers['Authorization'] == 'Bearer $fresh'
                    ? http.Response('{"ok":true}', 200)
                    : http.Response('{}', 401);
              }),
            )
            ..setAccessToken(old)
            ..onSessionInvalidated = () => invalidated++;
      SharedPreferences.setMockInitialValues({
        'accessToken': fresh,
        'refreshToken': 'new-refresh',
      });
      expect(await api.getJson('/protected'), {'ok': true});
      expect(refreshed, 0);
      expect(invalidated, 0);
    },
  );
  test(
    'a stale refusal cannot delete credentials rotated by a different tab',
    () async {
      final old = token('user', 'session', 1),
          fresh = token(
            'user',
            'session',
            DateTime.now().millisecondsSinceEpoch ~/ 1000 + 900,
          );
      SharedPreferences.setMockInitialValues({
        'accessToken': old,
        'refreshToken': 'old-refresh',
      });
      var invalidated = 0;
      final api =
          ApiClient(
              baseUrl: 'https://example.test',
              httpClient: MockClient((r) async {
                if (r.url.path == '/auth/refresh') {
                  SharedPreferences.setMockInitialValues({
                    'accessToken': fresh,
                    'refreshToken': 'new-refresh',
                  });
                  return http.Response('{}', 401);
                }
                return r.headers['Authorization'] == 'Bearer $fresh'
                    ? http.Response('{"ok":true}', 200)
                    : http.Response('{}', 401);
              }),
            )
            ..setAccessToken(old)
            ..onSessionInvalidated = () => invalidated++;
      expect(await api.getJson('/protected'), {'ok': true});
      expect(invalidated, 0);
      expect(
        (await SharedPreferences.getInstance()).getString('refreshToken'),
        'new-refresh',
      );
    },
  );
  test(
    'another user or login session is never silently adopted for an open inspection',
    () async {
      for (final fresh in [
        token('other', 'session', 2000000000),
        token('user', 'different-session', 2000000000),
      ]) {
        final old = token('user', 'session', 1);
        SharedPreferences.setMockInitialValues({
          'accessToken': old,
          'refreshToken': 'old',
        });
        await SharedPreferences.getInstance();
        final sent = <String?>[];
        final api = ApiClient(
          baseUrl: 'https://example.test',
          httpClient: MockClient((r) async {
            sent.add(r.headers['Authorization']);
            return http.Response('{}', 401);
          }),
        )..setAccessToken(old);
        SharedPreferences.setMockInitialValues({
          'accessToken': fresh,
          'refreshToken': 'different',
        });
        await expectLater(
          api.getJson('/protected'),
          throwsA(isA<ApiException>()),
        );
        expect(sent, ['Bearer $old']);
        expect(
          (await SharedPreferences.getInstance()).getString('accessToken'),
          fresh,
        );
      }
    },
  );
}
