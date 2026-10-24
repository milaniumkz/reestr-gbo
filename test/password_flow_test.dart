import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/data/api_client.dart';
import 'package:reestr_ts_demo/data/repositories.dart';
import 'package:reestr_ts_demo/main.dart';
import 'test_fonts.dart';

void main() {
  setUpAll(loadTestFonts);
  for (final role in ['inspection_org', 'government', 'nca']) {
    testWidgets(
      '$role: rejected old session leads to initial password change before entering',
      (tester) async {
        SharedPreferences.setMockInitialValues({
          'accessToken': 'old',
          'refreshToken': 'old-refresh',
          'lastRoleCode': role,
          'lastOrganizationBin': '123456789012',
          'diagnosticLocationAsked': role != 'inspection_org',
        });
        tester.view.physicalSize = const Size(430, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        var changed = 0;
        final api = ApiClient(
          baseUrl: 'https://example.test',
          httpClient: MockClient((req) async {
            if (req.url.path == '/auth/refresh') {
              return http.Response('{}', 401);
            }
            if (req.url.path == '/auth/login') {
              final body = jsonDecode(req.body) as Map<String, dynamic>;
              expect(body['role'], role);
              expect(body['password'], '123456');
              expect(body['offerVersion'], 'offer-ru-v1');
              return http.Response(
                jsonEncode({
                  'requiresPasswordChange': true,
                  'passwordChangeToken': 'restricted-proof',
                }),
                201,
              );
            }
            if (req.url.path == '/auth/password/change') {
              final body = jsonDecode(req.body) as Map<String, dynamic>;
              expect(body['passwordChangeToken'], 'restricted-proof');
              expect(body['newPassword'], 'Personal123!');
              changed++;
              return http.Response(
                jsonEncode({
                  'accessToken': 'new',
                  'refreshToken': 'new-refresh',
                  'user': {
                    'sub': 'user',
                    'phone': '+77000000000',
                    'roles': [role],
                  },
                }),
                201,
              );
            }
            return http.Response('{"items":[]}', 200);
          }),
        );
        await tester.pumpWidget(
          MaterialApp(
            home: ErsiDemo(repositories: AppRepositories(api: api)),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Требуется повторный вход'), findsOneWidget);
        expect(
          find.text('Нажимая «Войти», вы принимаете условия публичной оферты.'),
          findsOneWidget,
        );
        expect(find.text('Публичная оферта'), findsOneWidget);
        expect(find.byType(Checkbox), findsNothing);
        final fields = find.byType(TextField);
        final count = fields.evaluate().length;
        expect(count, role == 'inspection_org' ? 3 : 2);
        await tester.enterText(fields.at(count - 2), '+77000000000');
        await tester.enterText(fields.last, '123456');
        await tester.ensureVisible(find.text('Войти'));
        await tester.tap(find.text('Войти'));
        await tester.pumpAndSettle();
        expect(find.text('Обязательная смена пароля'), findsOneWidget);
        expect(changed, 0);
        expect(find.text('Геолокация для технической поддержки'), findsNothing);
        final dynamic state = tester.state(find.byType(ErsiDemo));
        state.go(14);
        await tester.pumpAndSettle();
        expect(find.text('Обязательная смена пароля'), findsOneWidget);
        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getString('accessToken'), isNull);
        await tester.enterText(find.byType(TextField).at(0), 'short');
        await tester.enterText(find.byType(TextField).at(1), 'short');
        await tester.ensureVisible(find.text('Сменить пароль и войти'));
        await tester.tap(find.text('Сменить пароль и войти'));
        await tester.pumpAndSettle();
        expect(changed, 0);
        await tester.enterText(find.byType(TextField).at(0), 'Personal123!');
        await tester.enterText(find.byType(TextField).at(1), 'Personal123!');
        await tester.ensureVisible(find.text('Сменить пароль и войти'));
        await tester.tap(find.text('Сменить пароль и войти'));
        await tester.pumpAndSettle();
        expect(changed, 1);
        if (role == 'inspection_org') {
          expect(
            find.text('Геолокация для технической поддержки'),
            findsOneWidget,
          );
          await tester.tap(find.text('Не сейчас'));
          await tester.pumpAndSettle();
        }
        expect(prefs.getString('accessToken'), 'new');
        expect(find.text('Обязательная смена пароля'), findsNothing);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      },
    );
  }
}
