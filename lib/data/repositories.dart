import 'dart:convert';

import 'api_client.dart';
import 'app_environment.dart';
import 'models.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AuthRepository {
  AuthRepository(this._api);

  final ApiClient _api;

  Future<String?> sendOtp(String phone, {String role = 'vehicle_owner'}) async {
    if (AppEnvironment.isDemo) return '1111';
    final response = await _api.postJson('/auth/otp/send', {
      'phone': phone,
      'role': role,
    });
    return response['code']?.toString();
  }

  Future<AppUser> verifyOtp(
    String phone,
    String code,
    String role, {
    String? bin,
  }) async {
    if (AppEnvironment.isDemo) {
      return const AppUser(id: 'demo', phone: '', roles: ['vehicle_owner']);
    }
    final response = await _api.postJson('/auth/otp/verify', {
      'phone': phone,
      'code': code,
      'role': role,
      if (bin != null && bin.isNotEmpty) 'bin': bin,
      'deviceName': 'ЕРСИ ГБО Flutter Web',
    });
    final user = await _storeAuthResponse(response);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('lastRoleCode', role);
    if (bin != null && bin.isNotEmpty) {
      await prefs.setString('lastOrganizationBin', bin);
    } else {
      await prefs.remove('lastOrganizationBin');
    }
    return user;
  }

  Future<AppUser?> restoreSession() async {
    if (AppEnvironment.isDemo) return null;
    final prefs = await SharedPreferences.getInstance();
    final sessionExpiresAt = prefs.getString('sessionExpiresAt');
    if (sessionExpiresAt != null) {
      final expiresAt = DateTime.tryParse(sessionExpiresAt);
      if (expiresAt != null && !DateTime.now().isBefore(expiresAt)) {
        await clearLocalSession();
        return null;
      }
    }
    final accessToken = prefs.getString('accessToken');
    final refreshToken = prefs.getString('refreshToken');
    if (accessToken != null) _api.setAccessToken(accessToken);
    if (refreshToken == null) return null;
    try {
      final response = await _api.postJson('/auth/refresh', {
        'refreshToken': refreshToken,
      });
      return _storeAuthResponse(response);
    } catch (_) {
      await clearLocalSession();
      return null;
    }
  }

  Future<String?> restoreLastRoleCode() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('lastRoleCode');
  }

  Future<String?> restoreLastOrganizationBin() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('lastOrganizationBin');
  }

  Future<void> logout() async {
    await clearLocalSession();
  }

  Future<void> clearLocalSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('accessToken');
    await prefs.remove('refreshToken');
    await prefs.remove('sessionUser');
    await prefs.remove('lastRoleCode');
    await prefs.remove('lastOrganizationBin');
    await prefs.remove('sessionExpiresAt');
    _api.setAccessToken(null);
  }

  Future<AppUser> _storeAuthResponse(Map<String, dynamic> response) async {
    final accessToken = response['accessToken']?.toString();
    final refreshToken = response['refreshToken']?.toString();
    _api.setAccessToken(accessToken);
    final prefs = await SharedPreferences.getInstance();
    if (accessToken != null) await prefs.setString('accessToken', accessToken);
    if (refreshToken != null) {
      await prefs.setString('refreshToken', refreshToken);
    }
    final sessionExpiresAt = response['sessionExpiresAt']?.toString();
    if (sessionExpiresAt != null && sessionExpiresAt.isNotEmpty) {
      await prefs.setString('sessionExpiresAt', sessionExpiresAt);
    }
    final user = AppUser.fromJson(response['user'] as Map<String, dynamic>);
    await prefs.setString('sessionUser', jsonEncode(user.toJson()));
    return user;
  }
}

class RegistryRepository {
  RegistryRepository(this._api);

  final ApiClient _api;

  Future<List<RegistryVehicle>> search(String query) async {
    if (AppEnvironment.isDemo) {
      return const [
        RegistryVehicle(
          vin: 'XTA210990Y1234567',
          plateNumber: '777 AAA 02',
          make: 'Lada',
          model: 'Vesta',
          certificateNumber: 'ERSI-2026-000001',
          validUntil: '2027-08-15',
        ),
      ];
    }
    final response = await _api.getJson(
      '/registry/search?q=${Uri.encodeQueryComponent(query)}',
    );
    final items = response['items'] as List<dynamic>? ?? const [];
    return items
        .map((item) => RegistryVehicle.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<RegistryVehicle?> publicCertificateCheck({
    required String plateNumber,
    required String vinLast3,
    double? lat,
    double? lng,
  }) async {
    final location = lat == null || lng == null
        ? ''
        : '&lat=${Uri.encodeQueryComponent(lat.toStringAsFixed(6))}&lng=${Uri.encodeQueryComponent(lng.toStringAsFixed(6))}';
    final response = await _api.getJson(
      '/registry/public-check?plateNumber=${Uri.encodeQueryComponent(plateNumber)}&vinLast3=${Uri.encodeQueryComponent(vinLast3)}$location',
    );
    if (response['found'] != true ||
        response['item'] is! Map<String, dynamic>) {
      return null;
    }
    return RegistryVehicle.fromJson(response['item'] as Map<String, dynamic>);
  }
}

class OrganizationRepository {
  OrganizationRepository(this._api);

  final ApiClient _api;

  Future<List<OrganizationSummary>> list({String? type}) async {
    if (AppEnvironment.isDemo) {
      return const [
        OrganizationSummary(
          id: 'demo-installer',
          name: 'EcoGas Service',
          bin: '123456789012',
          status: 'active',
          region: 'Алматы',
          type: 'installer',
          address: 'Алматы, ул. Абая 48',
          lat: 43.238949,
          lng: 76.889709,
        ),
        OrganizationSummary(
          id: 'demo-inspection-org',
          name: 'Инспекция №3',
          bin: '240101300003',
          status: 'active',
          region: 'Алматы',
          type: 'inspection_org',
          address: 'Алматы, пр. Достык 132',
          lat: 43.237156,
          lng: 76.945618,
        ),
      ];
    }
    final suffix = type == null
        ? ''
        : '?type=${Uri.encodeQueryComponent(type)}';
    final response = await _api.getJson('/organizations$suffix');
    final items = response['items'] as List<dynamic>? ?? const [];
    return items
        .map(
          (item) => OrganizationSummary.fromJson(item as Map<String, dynamic>),
        )
        .toList();
  }
}

class CertificateRepository {
  CertificateRepository(this._api);
  final ApiClient _api;

  Future<List<RegistryVehicle>> list({
    String q = '',
    int limit = 100,
    String plateNumber = '',
    String vinLast3 = '',
    String dateFrom = '',
    String dateTo = '',
  }) async {
    if (AppEnvironment.isDemo) {
      return const [
        RegistryVehicle(
          vin: 'XTA210990Y1234567',
          plateNumber: '777AAA02',
          make: 'Lada',
          model: 'Vesta',
          certificateNumber: 'ERSI-2026-000001',
          validUntil: '2027-08-15',
        ),
      ];
    }
    final params = <String, String>{
      'limit': '$limit',
      if (q.trim().isNotEmpty) 'q': q.trim(),
      if (plateNumber.trim().isNotEmpty) 'plateNumber': plateNumber.trim(),
      if (vinLast3.trim().isNotEmpty) 'vinLast3': vinLast3.trim(),
      if (dateFrom.trim().isNotEmpty) 'dateFrom': dateFrom.trim(),
      if (dateTo.trim().isNotEmpty) 'dateTo': dateTo.trim(),
    };
    final response = await _api.getJson(
      Uri(path: '/certificates', queryParameters: params).toString(),
    );
    final items = response['items'] is List<dynamic>
        ? response['items'] as List<dynamic>
        : response['data'] is List<dynamic>
        ? response['data'] as List<dynamic>
        : response['results'] is List<dynamic>
        ? response['results'] as List<dynamic>
        : response['certificates'] is List<dynamic>
        ? response['certificates'] as List<dynamic>
        : const <dynamic>[];
    return items
        .whereType<Map<String, dynamic>>()
        .map(RegistryVehicle.fromCertificateJson)
        .toList();
  }

  Future<RegistryVehicle> detail(String number) async {
    if (AppEnvironment.isDemo) {
      return const RegistryVehicle(
        vin: 'XTA210990Y1234567',
        plateNumber: '777AAA02',
        make: 'Lada',
        model: 'Vesta',
        certificateNumber: 'ERSI-2026-000001',
        validUntil: '2027-08-15',
      );
    }
    final response = await _api.getJson(
      '/certificates/${Uri.encodeComponent(number)}',
    );
    return RegistryVehicle.fromCertificateJson(response);
  }

  Future<CertificateVerification> verify(String number) async {
    if (AppEnvironment.isDemo) {
      return const CertificateVerification(
        valid: true,
        status: 'active',
        number: 'ERSI-2026-000001',
        validUntil: '2027-08-15',
      );
    }
    final response = await _api.getJson(
      '/certificates/${Uri.encodeComponent(number)}/verify',
    );
    return CertificateVerification.fromJson(response);
  }

  Future<CertificateImportResult> importXlsx({
    required String filename,
    required List<int> bytes,
    bool asInspectionDraft = false,
  }) async {
    if (AppEnvironment.isDemo) {
      return const CertificateImportResult(
        ok: true,
        status: 'completed',
        certificateNumber: 'ERSI-2026-000001',
        createdCount: 1,
        updatedCount: 0,
        errorCount: 0,
      );
    }
    final response = await _api.postMultipart(
      '/certificates/import-xlsx',
      fieldName: 'file',
      filename: filename,
      bytes: bytes,
      contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fields: {if (asInspectionDraft) 'mode': 'inspectionDraft'},
    );
    return CertificateImportResult.fromJson(response);
  }
}

class BannerRepository {
  BannerRepository(this._api);

  final ApiClient _api;

  Future<List<AppBanner>> listPublic() async {
    if (AppEnvironment.isDemo) return const [];
    final response = await _api.getJson('/banners/public');
    final items = response['items'] as List<dynamic>? ?? const [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(AppBanner.fromJson)
        .where((item) => item.imageUrl.isNotEmpty)
        .toList();
  }
}

class EquipmentRepository {
  EquipmentRepository(this._api);

  final ApiClient _api;

  Future<
    ({
      List<String> reducers,
      List<String> controlUnits,
      List<String> cylinderMakers,
    })
  >
  listPublic() async {
    if (AppEnvironment.isDemo) {
      return (
        reducers: const <String>[],
        controlUnits: const <String>[],
        cylinderMakers: const <String>[],
      );
    }
    final response = await _api.getJson('/equipment/public');
    final items = response['items'] as List<dynamic>? ?? const [];
    final reducers = <String>[];
    final controlUnits = <String>[];
    final cylinderMakers = <String>[];
    for (final item in items.whereType<Map<String, dynamic>>()) {
      final name = item['name']?.toString().trim() ?? '';
      if (name.isEmpty) continue;
      if (item['type'] == 'reducer') reducers.add(name);
      if (item['type'] == 'control_unit') controlUnits.add(name);
      if (item['type'] == 'cylinder_manufacturer') cylinderMakers.add(name);
    }
    return (
      reducers: reducers,
      controlUnits: controlUnits,
      cylinderMakers: cylinderMakers,
    );
  }
}

class LegalRepository {
  LegalRepository(this._api);

  final ApiClient _api;

  Future<({String title, String excerpt, String body})?> active() async {
    if (AppEnvironment.isDemo) return null;
    final response = await _api.getJson('/legal/public/active');
    final item = response['item'];
    if (item is! Map<String, dynamic>) return null;
    final title = item['title']?.toString().trim() ?? '';
    final body = item['body']?.toString().trim() ?? '';
    if (title.isEmpty || body.isEmpty) return null;
    return (
      title: title,
      excerpt: item['excerpt']?.toString().trim() ?? '',
      body: body,
    );
  }
}

class InspectionRepository {
  InspectionRepository(this._api);
  final ApiClient _api;

  Future<String> createVehicle({
    required String vin,
    required String plateNumber,
    required String make,
    required String model,
    required int? year,
    required String ownerPhone,
    required String ownerName,
    required String ownerIin,
    required String ownerAddress,
    required String cylinderSerial,
    required String cylinderManufacturer,
    required int volumeLiters,
    required String producedYear,
    required String reducerName,
    required String controlUnitName,
  }) async {
    if (AppEnvironment.isDemo) return 'demo-vehicle';
    final nowYear = DateTime.now().year;
    final produced = int.tryParse(producedYear);
    final validUntilYear = (produced ?? nowYear) + 3;
    final response = await _api.postJson('/vehicles', {
      'vin': vin,
      'plateNumber': plateNumber,
      'make': make,
      'model': model,
      ...year == null ? const <String, dynamic>{} : {'year': year},
      'owner': {
        'phone': ownerPhone,
        'fullName': ownerName,
        if (ownerIin.isNotEmpty) 'iin': ownerIin,
        if (ownerAddress.isNotEmpty) 'address': ownerAddress,
      },
      'cylinder': {
        'serialNumber': cylinderSerial,
        'manufacturer': cylinderManufacturer,
        'volumeLiters': volumeLiters,
        'reducerName': reducerName,
        'controlUnitName': controlUnitName,
        if (produced != null) 'producedAt': '$produced-01-01',
        'validUntil': '$validUntilYear-12-31',
      },
    });
    return response['id']?.toString() ?? '';
  }

  Future<String> create(
    String organizationId,
    String vehicleId, {
    required String certificateNumber,
    double? lat,
    double? lng,
  }) async {
    if (AppEnvironment.isDemo) return 'demo-inspection';
    final response = await _api.postJson('/inspections', {
      'organizationId': organizationId,
      'vehicleId': vehicleId,
      'certificateNumber': certificateNumber,
      ...lat == null ? const <String, dynamic>{} : {'lat': lat},
      ...lng == null ? const <String, dynamic>{} : {'lng': lng},
    });
    return response['id']?.toString() ?? '';
  }

  Future<bool> isCertificateNumberAvailable(String number) async {
    if (AppEnvironment.isDemo) return true;
    final response = await _api.getJson(
      '/inspections/certificate-number/${Uri.encodeComponent(number)}/availability',
    );
    return response['available'] == true;
  }

  Future<List<InspectionSummary>> list({int limit = 20}) async {
    if (AppEnvironment.isDemo) return const [];
    final response = await _api.getJson('/inspections?limit=$limit');
    return (response['items'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(InspectionSummary.fromJson)
        .toList();
  }

  Future<InspectionSummary> detail(String inspectionId) async {
    final response = await _api.getJson('/inspections/$inspectionId');
    return InspectionSummary.fromJson(response);
  }

  Future<InspectionSummary> setStatus(
    String inspectionId,
    String status, {
    bool? confirmed,
  }) async {
    final response = await _api.patchJson('/inspections/$inspectionId/status', {
      'status': status,
      'confirmed': ?confirmed,
    });
    return InspectionSummary.fromJson(response);
  }

  Future<InspectionSummary> updateData({
    required String inspectionId,
    required String vehicleId,
    required String certificateNumber,
  }) async {
    final response = await _api.patchJson('/inspections/$inspectionId/data', {
      'vehicleId': vehicleId,
      'certificateNumber': certificateNumber,
    });
    return InspectionSummary.fromJson(response);
  }

  Future<({bool ready, List<String> missing})> readiness(
    String inspectionId,
  ) async {
    final response = await _api.getJson('/inspections/$inspectionId/readiness');
    return (
      ready: response['ready'] == true,
      missing: (response['missing'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
    );
  }

  Future<void> uploadPhoto({
    required String inspectionId,
    required String type,
    required String filename,
    required List<int> bytes,
    double? lat,
    double? lng,
  }) async {
    if (AppEnvironment.isDemo) return;
    await _api.postMultipart(
      '/inspections/$inspectionId/photos',
      fieldName: 'file',
      filename: filename,
      bytes: bytes,
      contentType: _contentTypeFor(filename),
      fields: {
        'type': type,
        if (lat != null) 'lat': lat.toString(),
        if (lng != null) 'lng': lng.toString(),
      },
    );
  }
}

String _contentTypeFor(String filename) {
  final lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}

class PaymentRepository {
  PaymentRepository(this._api);
  final ApiClient _api;

  Future<String> createInvoice(int amount, String purpose) async {
    if (AppEnvironment.isDemo) return 'demo-payment-url';
    final response = await _api.postJson('/payments/invoice', {
      'amount': amount,
      'purpose': purpose,
    });
    return response['payUrl']?.toString() ?? '';
  }
}

class CameraRepository {
  CameraRepository(this._api);
  final ApiClient _api;

  Future<List<Map<String, dynamic>>> list() async {
    if (AppEnvironment.isDemo) return const [];
    final response = await _api.getJson('/cameras');
    return (response['items'] as List<dynamic>? ?? const [])
        .cast<Map<String, dynamic>>();
  }
}

class ProfileRepository {
  ProfileRepository(this._api);
  final ApiClient _api;

  Future<AppUser?> me() async {
    if (AppEnvironment.isDemo) return null;
    final response = await _api.getJson('/auth/me');
    return AppUser.fromJson(response);
  }
}

class NotificationRepository {
  NotificationRepository(this._api);
  final ApiClient _api;

  Future<List<AppNotification>> list() async {
    if (AppEnvironment.isDemo) return const [];
    final response = await _api.getJson('/notifications');
    final items = response['items'] as List<dynamic>? ?? const [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(AppNotification.fromJson)
        .toList();
  }
}

class AuditRepository {
  AuditRepository(this._api);
  final ApiClient _api;

  Future<List<ViewHistoryItem>> myViews() async {
    if (AppEnvironment.isDemo) return const [];
    final response = await _api.getJson('/audit/my-views');
    final items = response['items'] as List<dynamic>? ?? const [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(ViewHistoryItem.fromJson)
        .toList();
  }

  Future<void> trackView({
    required String entity,
    required String entityId,
    String title = '',
  }) async {
    if (AppEnvironment.isDemo || entityId.trim().isEmpty) return;
    await _api.postJson('/audit/view', {
      'entity': entity,
      'entityId': entityId,
      if (title.trim().isNotEmpty) 'title': title,
    });
  }
}

class AppRepositories {
  AppRepositories({required ApiClient api})
    : auth = AuthRepository(api),
      registry = RegistryRepository(api),
      organizations = OrganizationRepository(api),
      banners = BannerRepository(api),
      equipment = EquipmentRepository(api),
      legal = LegalRepository(api),
      certificates = CertificateRepository(api),
      inspections = InspectionRepository(api),
      payments = PaymentRepository(api),
      cameras = CameraRepository(api),
      profile = ProfileRepository(api),
      notifications = NotificationRepository(api),
      audit = AuditRepository(api);

  factory AppRepositories.current() {
    return AppRepositories(api: ApiClient(baseUrl: AppEnvironment.apiBaseUrl));
  }

  final AuthRepository auth;
  final RegistryRepository registry;
  final OrganizationRepository organizations;
  final BannerRepository banners;
  final EquipmentRepository equipment;
  final LegalRepository legal;
  final CertificateRepository certificates;
  final InspectionRepository inspections;
  final PaymentRepository payments;
  final CameraRepository cameras;
  final ProfileRepository profile;
  final NotificationRepository notifications;
  final AuditRepository audit;
}
