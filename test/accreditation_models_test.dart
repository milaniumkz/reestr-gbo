import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/data/models.dart';

void main() {
  final organization = <String, dynamic>{
    'name': 'ТОО ИО',
    'accreditationValidFrom': '2026-10-07T00:00:00.000Z',
    'accreditationValidUntil': '2028-10-07T00:00:00.000Z',
  };
  const expected = 'Аттестат аккредитации от 07.10.2026 до 07.10.2028';

  test(
    'public registry and control certificate details retain accreditation dates',
    () {
      final certificate = <String, dynamic>{
        'number': 'ERSI-1',
        'inspection': {'organization': organization},
        'vehicle': <String, dynamic>{},
      };
      final registry = RegistryVehicle.fromJson({
        'certificates': [certificate],
      });
      final detail = RegistryVehicle.fromCertificateJson(certificate);
      expect(registry.accreditationLabel, expected);
      expect(detail.accreditationLabel, expected);
    },
  );

  test('organization and inspection models expose the same period', () {
    expect(
      OrganizationSummary.fromJson(organization).accreditationLabel,
      expected,
    );
    expect(
      InspectionSummary.fromJson({
        'organization': organization,
      }).accreditationLabel,
      expected,
    );
  });

  test('legacy records display an unspecified period', () {
    expect(
      RegistryVehicle.fromJson({}).accreditationLabel,
      'Аттестат аккредитации: срок не указан',
    );
  });
}
