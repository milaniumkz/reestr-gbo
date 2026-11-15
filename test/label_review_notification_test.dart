import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/main.dart';
import 'package:reestr_ts_demo/data/api_client.dart';
import 'package:reestr_ts_demo/data/repositories.dart';
import 'test_fonts.dart';

void main() {
  setUpAll(loadTestFonts);
  testWidgets(
    'quality warning opens its exact draft inspection without claiming it',
    (tester) async {
      const id = '11111111-1111-4111-8111-111111111111';
      SharedPreferences.setMockInitialValues({
        'accessToken': 'old',
        'refreshToken': 'refresh',
        'lastRoleCode': 'inspection_org',
        'lastOrganizationBin': '123456789012',
        'diagnosticLocationAsked': true,
      });
      final requests = <String>[];
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient((request) async {
          final path = request.url.path;
          requests.add('${request.method} $path');
          Object result = {'items': []};
          if (path == '/auth/refresh') {
            result = {
              'accessToken': 'new',
              'refreshToken': 'next',
              'user': {
                'sub': 'qc-user',
                'phone': '+77000000000',
                'roles': ['inspection_org'],
              },
            };
          }
          if (path == '/auth/identity/status') {
            result = {'required': false, 'verified': true};
          }
          if (path == '/organizations') {
            result = {
              'items': [
                {
                  'id': 'org',
                  'bin': '123456789012',
                  'type': 'inspection_org',
                  'name': 'Test IO',
                  'status': 'active',
                  'members': [
                    {
                      'id': 'member',
                      'userId': 'qc-user',
                      'role': 'quality_control',
                    },
                  ],
                },
              ],
            };
          }
          if (path == '/notifications') {
            result = {
              'items': [
                {
                  'id': 'warning',
                  'title': 'Перепроверьте фотографии инспекции',
                  'body': 'Проверьте общий снимок бирки',
                  'entity': 'inspection',
                  'entityId': id,
                  'createdAt': '2026-11-15T10:00:00Z',
                },
              ],
            };
          }
          if (path == '/inspections/$id') {
            result = {
              'id': id,
              'organizationId': 'org',
              'status': 'draft',
              'certificateNumber': 'TEST-1',
              'photos': [],
            };
          }
          return http.Response(
            jsonEncode(result),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ErsiDemo(repositories: AppRepositories(api: api)),
        ),
      );
      await tester.pumpAndSettle();
      final dynamic state = tester.state(find.byType(ErsiDemo));
      state.go(38);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Перепроверьте фотографии инспекции'));
      await tester.pumpAndSettle();
      expect(requests, contains('GET /inspections/$id'));
      expect(requests.where((r) => r.contains('claim')), isEmpty);
      expect(state.screen, 40);
      expect(state.selectedInspection.id, id);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
