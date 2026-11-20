import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/main.dart';
import 'package:reestr_ts_demo/data/api_client.dart';
import 'package:reestr_ts_demo/data/repositories.dart';
import 'package:reestr_ts_demo/data/inspection_recovery.dart';
import 'inspection_recovery_test.dart' show MemoryRecovery;
import 'test_fonts.dart';

class RetryLocation extends GeolocatorPlatform {
  @override
  Future<bool> isLocationServiceEnabled() async => true;
  @override
  Future<LocationPermission> checkPermission() async =>
      LocationPermission.whileInUse;
  @override
  Future<Position> getCurrentPosition({
    LocationSettings? locationSettings,
  }) async => Position(
    latitude: 43.2,
    longitude: 76.9,
    timestamp: DateTime.now(),
    accuracy: 5,
    altitude: 0,
    altitudeAccuracy: 0,
    heading: 0,
    headingAccuracy: 0,
    speed: 0,
    speedAccuracy: 0,
  );
}

void main() {
  setUpAll(loadTestFonts);
  for (final mode in ['retry', 'conflict', 'missingName']) {
    final conflict = mode == 'conflict';
    final missingName = mode == 'missingName';
    testWidgets(
      conflict
          ? 'real duplicate keeps the completed review and original photos'
          : missingName
          ? 'accepted bytes with lost filename metadata still upload with a safe PNG name'
          : 'server inspection ID is saved before failed photo upload and reused on retry',
      (t) async {
        final location = GeolocatorPlatform.instance;
        GeolocatorPlatform.instance = RetryLocation();
        addTearDown(() => GeolocatorPlatform.instance = location);
        SharedPreferences.setMockInitialValues({
          'accessToken': 'old',
          'refreshToken': 'refresh',
          'lastRoleCode': 'inspection_org',
          'lastOrganizationBin': '123456789012',
          'diagnosticLocationAsked': true,
        });
        final original = base64Decode(
          'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGP4z8AARww4OQD1MQv1NXv7ggAAAABJRU5ErkJggg==',
        );
        final store = MemoryRecovery()
          ..entries['inspector'] = InspectionRecoverySnapshot(
            fields: {
              'screen': 23,
              'organizationId': 'org',
              'inspectionCertificateNumber': '10801,10801.1',
              'ownerName': 'SYNTHETIC OWNER',
              'ownerAddress': 'Test address',
              'vehiclePlate': 'TEST',
              'vehicleVin': 'TESTVIN1234567890',
              'vehicleMakeModel': 'Test Car',
              'cylinderNumber': 'TEST-1',
              'cylinderMaker': 'Test Maker',
              'cylinderVolume': '50',
              'cylinderProductionDate': '2025-01-01',
              'cylinderFuel': 'СНГ',
              'cylinderShape': 'Цилиндрический',
              'reducerName': 'Test',
              'controlUnitName': 'Test',
              'cylinderPhotoName': missingName ? null : 'original.png',
              'vehiclePhotoUploaded': true,
              'techPassportPhotoUploaded': true,
              'packageDocumentUploaded': {
                for (final key in [
                  'applicant_application',
                  'gas_work_record',
                  'cylinder_work_record',
                  'gas_inspection_report',
                  'cylinder_inspection_report',
                ])
                  key: true,
              },
            },
            files: {'primary_cylinder': original},
          );
        var creates = 0, updates = 0, uploads = 0;
        final repos = AppRepositories(
          api: ApiClient(
            baseUrl: 'https://example.test',
            httpClient: MockClient((r) async {
              Object json = {'items': []};
              var status = 200;
              final p = r.url.path;
              if (p == '/auth/refresh') {
                json = {
                  'accessToken': 'token',
                  'refreshToken': 'refresh',
                  'user': {
                    'sub': 'inspector',
                    'phone': '+77000000000',
                    'roles': ['inspection_org'],
                  },
                };
              }
              if (p == '/auth/identity/status') {
                json = {'required': true, 'verified': true};
              }
              if (p == '/organizations') {
                json = {
                  'items': [
                    {
                      'id': 'org',
                      'bin': '123456789012',
                      'type': 'inspection_org',
                      'name': 'Test IO',
                      'status': 'active',
                      'members': [
                        {
                          'id': 'm',
                          'userId': 'inspector',
                          'role': 'inspector',
                          'user': {'id': 'inspector'},
                        },
                      ],
                    },
                  ],
                };
              }
              if (p.endsWith('/location/resolve')) {
                json = {'address': 'Test street 12', 'lat': 43.2, 'lng': 76.9};
              }
              if (p == '/vehicles' && r.method == 'POST') {
                json = {'id': 'vehicle'};
              }
              if (p == '/inspections' && r.method == 'POST') {
                creates++;
                json = {'id': 'created'};
                if (conflict) {
                  status = 409;
                  json = {
                    'message':
                        'Свидетельство с таким номером уже есть в этом инспекционном органе',
                  };
                }
              }
              if (p == '/inspections/created/data') {
                updates++;
                json = {'id': 'created', 'status': 'draft', 'vehicle': {}};
              }
              if (p == '/inspections/created/photos') {
                uploads++;
                if (missingName) {
                  expect(
                    utf8.decode(r.bodyBytes, allowMalformed: true),
                    contains('filename="cylinder.png"'),
                  );
                }
                expect(
                  store.entries['inspector']!.fields['draftInspectionId'],
                  'created',
                );
                expect(
                  store.entries['inspector']!.files['primary_cylinder'],
                  original,
                );
                status = 400;
                json = {'message': 'Ошибка загрузки фото'};
              }
              return http.Response(
                jsonEncode(json),
                status,
                headers: {'content-type': 'application/json; charset=utf-8'},
              );
            }),
          ),
        );
        await t.pumpWidget(
          MaterialApp(
            home: ErsiDemo(repositories: repos, recoveryStore: store),
          ),
        );
        await t.pumpAndSettle();
        Future<void> send() async {
          final button = find.text('Отправить в контроль качества');
          await t.ensureVisible(button);
          await t.tap(button);
          await t.pumpAndSettle();
          expect(find.text('Адрес места инспекции'), findsOneWidget);
          await t.tap(find.text('Продолжить'));
          await t.pumpAndSettle();
        }

        await send();
        expect(creates, 1);
        expect(find.text('Проверка данных'), findsOneWidget);
        expect(store.entries['inspector']!.files['primary_cylinder'], original);
        if (!conflict) {
          expect(uploads, 1);
          await send();
          expect(creates, 1);
          expect(updates, 1);
          expect(uploads, 2);
        }
        await t.pumpWidget(const SizedBox());
      },
    );
  }
}
