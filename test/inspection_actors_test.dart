import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/data/models.dart';

void main() {
  test(
    'resuming an inspection retains the existing vehicle instead of recreating it',
    () {
      expect(
        InspectionSummary.fromJson({'vehicleId': 'saved-vehicle'}).vehicleId,
        'saved-vehicle',
      );
      expect(
        InspectionSummary.fromJson({
          'vehicle': {'id': 'nested-vehicle'},
        }).vehicleId,
        'nested-vehicle',
      );
      expect(InspectionSummary.fromJson({}).vehicleId, isEmpty);
    },
  );

  test('inspection retains the full names of all workflow participants', () {
    final item = InspectionSummary.fromJson({
      'createdBy': {'fullName': 'Иванов Иван Иванович'},
      'submittedBy': {'fullName': 'Иванов Иван Иванович'},
      'qualityConfirmedBy': {'fullName': 'Петров Петр Петрович'},
      'approvedBy': {'fullName': 'Сидоров Сергей Сергеевич'},
      'qualityConfirmedAt': '2026-10-10T07:00:00.000Z',
    });
    expect(item.createdByName, 'Иванов Иван Иванович');
    expect(item.submittedByName, 'Иванов Иван Иванович');
    expect(item.qualityConfirmedByName, 'Петров Петр Петрович');
    expect(item.approvedByName, 'Сидоров Сергей Сергеевич');
    expect(item.qualityConfirmedAt, '2026-10-10T07:00:00.000Z');
    expect(InspectionSummary.fromJson({}).qualityConfirmedByName, isEmpty);
  });
}
