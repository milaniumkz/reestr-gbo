import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/main.dart';
import 'package:reestr_ts_demo/data/api_client.dart';
import 'package:reestr_ts_demo/data/models.dart';
import 'package:reestr_ts_demo/data/repositories.dart';
import 'test_fonts.dart';

void main() {
  setUpAll(loadTestFonts);
  test('organizations without a balance row display zero KZT', () {
    final organization = OrganizationSummary.fromJson({
      'id': 'org',
      'balances': [],
    });
    expect(organization.balanceAmount, 0);
    expect(organization.balanceCurrency, 'KZT');
  });
  for (final role in ['admin', 'inspector', 'quality_control']) {
    testWidgets(
      '$role: balance is read-only and visible only to the organization manager',
      (tester) async {
        SharedPreferences.setMockInitialValues({
          'accessToken': 'old',
          'refreshToken': 'refresh',
          'lastRoleCode': 'inspection_org',
          'lastOrganizationBin': '123456789012',
          'diagnosticLocationAsked': true,
        });
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        var reads = 0;
        final api = ApiClient(
          baseUrl: 'https://example.test',
          httpClient: MockClient((req) async {
            expect(req.url.path.startsWith('/payments'), false);
            if (req.url.path == '/auth/refresh') {
              return http.Response(
                jsonEncode({
                  'accessToken': 'new',
                  'refreshToken': 'next',
                  'user': {
                    'sub': 'u1',
                    'phone': '+77001234567',
                    'roles': ['inspection_org'],
                  },
                }),
                200,
                headers: {'content-type': 'application/json; charset=utf-8'},
              );
            }
            expect(req.method, 'GET');
            if (req.url.path == '/organizations') {
              reads++;
              return http.Response(
                jsonEncode({
                  'items': [
                    {
                      'id': 'org',
                      'type': 'inspection_org',
                      'name': 'Тестовый ИО',
                      'bin': '123456789012',
                      'status': 'active',
                      'balances': [
                        {
                          'amount': reads == 1 ? 123450 : 98750,
                          'currency': 'KZT',
                        },
                      ],
                      'members': [
                        {
                          'id': 'm1',
                          'userId': 'u1',
                          'role': role,
                          'user': {
                            'id': 'u1',
                            'fullName': 'Тестовый сотрудник',
                          },
                        },
                      ],
                    },
                  ],
                }),
                200,
                headers: {'content-type': 'application/json; charset=utf-8'},
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
        expect(
          find.text('Ваш баланс'),
          role == 'admin' ? findsOneWidget : findsNothing,
        );
        if (role == 'admin') {
          expect(find.text('123 450 ₸'), findsOneWidget);
          await tester.tap(find.byIcon(Icons.refresh_rounded).first);
          await tester.pumpAndSettle();
          expect(find.text('98 750 ₸'), findsOneWidget);
          expect(reads, 2);
        }
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      },
    );
  }
}
