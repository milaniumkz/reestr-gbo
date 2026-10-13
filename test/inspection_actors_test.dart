import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/data/models.dart';

void main() {
  test('review ownership keeps the opened employee name and rejects empty or other employee IDs', () {
    final item = InspectionSummary.fromJson({'status':'submitted','qualityReviewerId':'qc_1','qualityReviewer':{'fullName':'Петров Петр Петрович'},'qualityReviewStartedAt':'2026-10-13T12:00:00Z'});
    expect(item.isReviewAssignedTo('qc_1'), isTrue);
    expect(item.isReviewAssignedTo('qc_2'), isFalse);
    expect(item.isReviewAssignedTo(''), isFalse);
    expect(item.qualityReviewerName, 'Петров Петр Петрович');
  });

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
