import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/data/api_client.dart';
import 'package:reestr_ts_demo/data/repositories.dart';
import 'package:reestr_ts_demo/widgets/password_access_screen.dart';

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      'accessToken': 'old',
      'refreshToken': 'refresh',
    }),
  );
  testWidgets(
    'forgot password sends identity only, never a new password or automatic login',
    (tester) async {
      final calls = <Map<String, dynamic>>[];
      final auth = AuthRepository(
        ApiClient(
          baseUrl: 'https://example.test',
          httpClient: MockClient((req) async {
            expect(req.url.path, '/auth/recovery/request');
            calls.add(jsonDecode(req.body) as Map<String, dynamic>);
            return http.Response(
              jsonEncode({'message': 'Заявка отправлена'}),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }),
        ),
      );
      await tester.pumpWidget(
        MaterialApp(home: PasswordAccessScreen(auth: auth)),
      );
      final fields = find.byType(TextFormField);
      expect(fields, findsNWidgets(3));
      await tester.enterText(fields.at(0), '123456789012');
      await tester.enterText(fields.at(1), '+77001234567');
      await tester.enterText(fields.at(2), 'Иванов Иван Иванович');
      await tester.ensureVisible(find.byType(FilledButton));
      await tester.tap(find.byType(FilledButton));
      await tester.pumpAndSettle();
      expect(calls.single, {
        'bin': '123456789012',
        'phone': '+77001234567',
        'fullName': 'Иванов Иван Иванович',
      });
      expect(find.byType(TextFormField), findsNothing);
    },
  );
  testWidgets(
    'profile checks confirmation locally then submits old password and ends the old session',
    (tester) async {
      var count = 0;
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient((req) async {
          expect(req.url.path, '/auth/password/update');
          final body = jsonDecode(req.body);
          expect(body['oldPassword'], 'Previous123!');
          expect(body['newPassword'], 'Personal123!');
          expect(body['confirmation'], 'Personal123!');
          count++;
          return http.Response('{"message":"changed"}', 200);
        }),
      );
      final auth = AuthRepository(api);
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute<bool>(
                  builder: (_) => PasswordAccessScreen(
                    auth: auth,
                    change: true,
                    bin: '123456789012',
                    phone: '+77001234567',
                  ),
                ),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      final fields = find.byType(TextFormField);
      expect(fields, findsNWidgets(5));
      await tester.enterText(fields.at(2), 'Previous123!');
      await tester.enterText(fields.at(3), 'Personal123!');
      await tester.enterText(fields.at(4), 'Different123!');
      await tester.ensureVisible(find.byType(FilledButton));
      await tester.tap(find.byType(FilledButton));
      await tester.pumpAndSettle();
      expect(count, 0);
      await tester.enterText(fields.at(4), 'Personal123!');
      await tester.ensureVisible(find.byType(FilledButton));
      await tester.tap(find.byType(FilledButton));
      await tester.pumpAndSettle();
      expect(count, 1);
      expect(find.text('open'), findsOneWidget);
      expect(
        (await SharedPreferences.getInstance()).getString('refreshToken'),
        isNull,
      );
    },
  );
  test(
    'manager recovery endpoints refresh an expired session before retrying',
    () async {
      var refreshes = 0;
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient((req) async {
          if (req.url.path == '/auth/refresh') {
            refreshes++;
            return http.Response(
              jsonEncode({
                'accessToken': 'new',
                'refreshToken': 'next',
                'user': {
                  'sub': 'manager',
                  'phone': '+77001234567',
                  'roles': ['inspection_org'],
                },
              }),
              200,
            );
          }
          if (req.headers['Authorization'] == 'Bearer old') {
            return http.Response('{}', 401);
          }
          expect(req.headers['Authorization'], 'Bearer new');
          return http.Response('{"items":[]}', 200);
        }),
      )..setAccessToken('old');
      expect(await AuthRepository(api).recoveryRequests(), isEmpty);
      expect(refreshes, 1);
    },
  );
}
