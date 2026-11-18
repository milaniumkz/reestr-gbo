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
  setUp(
    () => SharedPreferences.setMockInitialValues({
      'accessToken': 'test',
      'refreshToken': 'refresh',
      'lastRoleCode': 'inspection_org',
      'lastOrganizationBin': '123456789012',
      'diagnosticLocationAsked': true,
    }),
  );
  Future<void> open(
    WidgetTester t, {
    String role = 'quality_control',
    String status = 'submitted',
    bool failEdit = false,
  }) async {
    t.view.physicalSize = const Size(430, 1400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    var details = 0;
    final record = {
      'id': 'inspection',
      'status': status,
      'qualityReviewerId': 'employee',
      'certificateNumber': '777',
      'organization': {'id': 'org', 'name': 'Test IO'},
      'vehicle': {
        'id': 'vehicle',
        'plateNumber': '777TEST',
        'vin': 'VIN12345678901234',
        'owners': [
          {'fullName': 'TEST OWNER', 'address': 'TEST ADDRESS'},
        ],
      },
      'photos': [],
    };
    final repo = AppRepositories(
      api: ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient((r) async {
          Object result = {'items': []};
          if (r.url.path == '/auth/refresh') {
            result = {
              'accessToken': 'test',
              'refreshToken': 'refresh',
              'user': {
                'sub': 'employee',
                'phone': '+77000000000',
                'roles': ['inspection_org'],
              },
            };
          }
          if (r.url.path == '/auth/identity/status') {
            result = {'required': role == 'inspector', 'verified': true};
          }
          if (r.url.path == '/organizations') {
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
                      'userId': 'employee',
                      'role': role,
                      'user': {'id': 'employee'},
                    },
                  ],
                },
              ],
            };
          }
          if (r.url.path == '/inspections') {
            result = {
              'items': [record],
            };
          }
          if (r.url.path == '/inspections/inspection') {
            details++;
            if (failEdit && details == 2) {
              return http.Response(
                jsonEncode({'message': 'temporary failure'}),
                503,
                headers: {'content-type': 'application/json'},
              );
            }
            result = record;
          }
          return http.Response(
            jsonEncode(result),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      ),
    );
    await t.pumpWidget(MaterialApp(home: ErsiDemo(repositories: repo)));
    await t.pumpAndSettle();
    final card = find.text('777TEST').first;
    await t.ensureVisible(card);
    await t.tap(card);
    await t.pumpAndSettle();
  }

  Future<void> edit(WidgetTester t) async {
    final button = find.text('Редактировать данные');
    await t.ensureVisible(button);
    await t.tap(button);
    await t.pumpAndSettle();
  }

  testWidgets('quality editor opens loaded form and navigation is released', (
    t,
  ) async {
    await open(t);
    await edit(t);
    expect(find.text('Исправление инспекции'), findsOneWidget);
    expect(
      t
          .widgetList<TextField>(find.byType(TextField))
          .any((f) => f.controller?.text == 'TEST OWNER'),
      isTrue,
    );
    await t.tap(find.text('Главная').last);
    await t.pumpAndSettle();
    expect(find.text('Мои инспекции'), findsOneWidget);
    await t.pumpWidget(const SizedBox());
  });
  testWidgets('failed edit load releases navigation and permits retry', (
    t,
  ) async {
    await open(t, failEdit: true);
    await edit(t);
    expect(find.text('Ошибка открытия черновика'), findsOneWidget);
    await t.tap(find.text('Главная').last);
    await t.pumpAndSettle();
    final card = find.text('777TEST').first;
    await t.ensureVisible(card);
    await t.tap(card);
    await t.pumpAndSettle();
    await edit(t);
    expect(find.text('Исправление инспекции'), findsOneWidget);
    await t.pumpWidget(const SizedBox());
  });
  for (final status in ['rejected']) {
    testWidgets(
      'inspector can continue $status through the same loading path',
      (t) async {
        await open(t, role: 'inspector', status: status);
        if (status == 'rejected') {
          expect(
            t
                .widgetList<TextField>(find.byType(TextField))
                .any((f) => f.controller?.text == 'TEST OWNER'),
            isTrue,
          );
        } else {
          expect(find.text('Фото бирки баллона'), findsWidgets);
        }
        await t.tap(find.text('Главная').last);
        await t.pumpAndSettle();
        expect(find.text('Мои инспекции'), findsOneWidget);
        await t.pumpWidget(const SizedBox());
      },
    );
  }
}
