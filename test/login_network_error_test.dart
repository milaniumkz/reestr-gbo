import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/data/api_client.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
    'network failure is distinct from a rejected password and retains the session',
    () async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('refreshToken', 'retained');
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient(
          (_) async => throw http.ClientException('network blocked'),
        ),
      );
      await expectLater(
        api.postJson('/auth/login', {
          'phone': 'synthetic',
          'password': 'synthetic',
        }),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'network status', 0)
              .having(
                (e) => e.message,
                'connection explanation',
                contains('связаться с сервером'),
              ),
        ),
      );
      expect(prefs.getString('refreshToken'), 'retained');
    },
  );
  test('a password refusal preserves the actual server response', () async {
    final api = ApiClient(
      baseUrl: 'https://example.test',
      httpClient: MockClient(
        (_) async => http.Response('{"message":"Invalid credentials"}', 401),
      ),
    );
    await expectLater(
      api.postJson('/auth/login', {}),
      throwsA(
        isA<ApiException>()
            .having((e) => e.statusCode, 'status', 401)
            .having((e) => e.message, 'reason', 'Invalid credentials'),
      ),
    );
  });
}
