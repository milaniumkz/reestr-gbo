import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/data/api_client.dart';
import 'package:reestr_ts_demo/data/models.dart';
import 'package:reestr_ts_demo/data/repositories.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
    'availability checks send the selected IO, including when editing a draft',
    () async {
      final requests = <Uri>[];
      final repo = InspectionRepository(
        ApiClient(
          baseUrl: 'https://example.test',
          httpClient: MockClient((request) async {
            requests.add(request.url);
            final own = request.url.queryParameters['organizationId'];
            return http.Response(
              jsonEncode({'available': own == 'io-b'}),
              200,
              headers: {'content-type': 'application/json'},
            );
          }),
        ),
      );
      expect(
        await repo.isCertificateNumberAvailable('3', organizationId: 'io-a'),
        isFalse,
      );
      expect(
        await repo.isCertificateNumberAvailable(
          '3',
          organizationId: 'io-b',
          inspectionId: 'draft-b',
        ),
        isTrue,
      );
      expect(requests.last.queryParameters['inspectionId'], 'draft-b');
      expect(requests.map((uri) => uri.queryParameters['organizationId']), [
        'io-a',
        'io-b',
      ]);
    },
  );
  test(
    'equal display numbers retain distinct stable IDs in both model formats',
    () {
      final a = RegistryVehicle.fromJson({
        'certificates': [
          {'id': 'cert-a', 'number': '3'},
        ],
      });
      final b = RegistryVehicle.fromCertificateJson({
        'id': 'cert-b',
        'number': '3',
      });
      expect(a.certificateNumber, b.certificateNumber);
      expect(a.certificateId, 'cert-a');
      expect(b.certificateId, 'cert-b');
    },
  );
}
