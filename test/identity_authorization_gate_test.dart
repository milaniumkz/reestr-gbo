import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/main.dart';
import 'package:reestr_ts_demo/data/api_client.dart';
import 'package:reestr_ts_demo/data/repositories.dart';

void main() {
  testWidgets(
    'an incomplete identity status never opens the protected workspace',
    (tester) async {
      SharedPreferences.setMockInitialValues({
        'accessToken': 'old',
        'refreshToken': 'refresh',
        'lastRoleCode': 'inspection_org',
        'lastOrganizationBin': '123456789012',
        'diagnosticLocationAsked': true,
      });
      final protected = <String>[];
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient((request) async {
          if (request.url.path == '/auth/refresh') {
            return http.Response(
              jsonEncode({
                'accessToken': 'new',
                'refreshToken': 'next',
                'user': {
                  'sub': 'test-user',
                  'phone': '+77000000000',
                  'roles': ['inspection_org'],
                },
              }),
              200,
            );
          }
          if (request.url.path == '/auth/identity/status') {
            return http.Response('{}', 200);
          }
          if (request.url.path == '/organizations' ||
              request.url.path == '/inspections') {
            protected.add(request.url.path);
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
      expect(protected, isEmpty);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('accessToken'), isNull);
      expect(find.text('Мои инспекции'), findsNothing);
    },
  );
}
