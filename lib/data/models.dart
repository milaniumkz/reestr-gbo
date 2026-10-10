String accreditationPeriodLabel(String from, String until) {
  if (from.isEmpty && until.isEmpty) {
    return "Аттестат аккредитации: срок не указан";
  }
  String date(String value) => value.isEmpty
      ? "не указан"
      : value.split("T").first.split("-").reversed.join(".");
  return "Аттестат аккредитации от ${date(from)} до ${date(until)}";
}

class AppUser {
  const AppUser({required this.id, required this.phone, required this.roles});

  final String id;
  final String phone;
  final List<String> roles;

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['sub']?.toString() ?? json['id']?.toString() ?? '',
      phone: json['phone']?.toString() ?? '',
      roles: (json['roles'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {'id': id, 'phone': phone, 'roles': roles};
}

class AppBanner {
  const AppBanner({
    required this.id,
    required this.title,
    required this.imageUrl,
    this.linkUrl = '',
    this.durationSeconds = 5,
  });

  final String id;
  final String title;
  final String imageUrl;
  final String linkUrl;
  final int durationSeconds;

  factory AppBanner.fromJson(Map<String, dynamic> json) {
    return AppBanner(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Баннер',
      imageUrl: json['imageUrl']?.toString() ?? '',
      linkUrl: json['linkUrl']?.toString() ?? '',
      durationSeconds:
          int.tryParse(json['durationSeconds']?.toString() ?? '') ?? 5,
    );
  }
}

class RegistryVehicle {
  const RegistryVehicle({
    required this.vin,
    required this.plateNumber,
    required this.make,
    required this.model,
    required this.certificateNumber,
    required this.validUntil,
    this.accreditationValidFrom = '',
    this.accreditationValidUntil = '',
    this.ownerName = '',
    this.ownerIin = '',
    this.ownerPhone = '',
    this.ownerAddress = '',
    this.vehicleYear = '',
    this.cylinderSerial = '',
    this.cylinderManufacturer = '',
    this.cylinderVolume = '',
    this.reducerName = '',
    this.controlUnitName = '',
    this.cylinderProducedAt = '',
    this.cylinderValidUntil = '',
    this.organizationName = '',
    this.organizationBin = '',
    this.organizationAddress = '',
    this.organizationRegion = '',
    this.inspectionStatus = '',
    this.inspectionAddress = '',
    this.inspectionCreatedAt = '',
    this.inspectionLat,
    this.inspectionLng,
    this.organizationLat,
    this.organizationLng,
    this.certificateStatus = '',
    this.certificateIssuedAt = '',
    this.documents = const [],
  });

  final String accreditationValidFrom;
  final String accreditationValidUntil;
  String get accreditationLabel =>
      accreditationPeriodLabel(accreditationValidFrom, accreditationValidUntil);

  final String vin;
  final String plateNumber;
  final String make;
  final String model;
  final String certificateNumber;
  final String validUntil;
  final String ownerName;
  final String ownerIin;
  final String ownerPhone;
  final String ownerAddress;
  final String vehicleYear;
  final String cylinderSerial;
  final String cylinderManufacturer;
  final String cylinderVolume;
  final String reducerName;
  final String controlUnitName;
  final String cylinderProducedAt;
  final String cylinderValidUntil;
  final String organizationName;
  final String organizationBin;
  final String organizationAddress;
  final String organizationRegion;
  final String inspectionStatus;
  final String inspectionAddress;
  final String inspectionCreatedAt;
  final double? inspectionLat;
  final double? inspectionLng;
  final double? organizationLat;
  final double? organizationLng;
  final String certificateStatus;
  final String certificateIssuedAt;
  final List<InspectionDocumentInfo> documents;

  factory RegistryVehicle.fromJson(Map<String, dynamic> json) {
    final certificates = json['certificates'] as List<dynamic>? ?? const [];
    final certificate = certificates.isEmpty
        ? const <String, dynamic>{}
        : certificates.first as Map<String, dynamic>;
    final owners = json['owners'] as List<dynamic>? ?? const [];
    final owner = owners.isEmpty
        ? const <String, dynamic>{}
        : owners.first as Map<String, dynamic>;
    final cylinders = json['cylinders'] as List<dynamic>? ?? const [];
    final cylinder = cylinders.isEmpty
        ? const <String, dynamic>{}
        : cylinders.first as Map<String, dynamic>;
    final inspection = certificate['inspection'] is Map<String, dynamic>
        ? certificate['inspection'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final organization = inspection['organization'] is Map<String, dynamic>
        ? inspection['organization'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final photos = inspection['photos'] as List<dynamic>? ?? const [];
    return RegistryVehicle(
      vin: json['vin']?.toString() ?? '',
      plateNumber: json['plateNumber']?.toString() ?? '',
      make: json['make']?.toString() ?? '',
      model: json['model']?.toString() ?? '',
      certificateNumber: certificate['number']?.toString() ?? '',
      validUntil: certificate['validUntil']?.toString().split('T').first ?? '',
      ownerName: owner['fullName']?.toString() ?? '',
      ownerIin: owner['iin']?.toString() ?? '',
      ownerPhone:
          owner['phone']?.toString() ??
          owner['user']?['phone']?.toString() ??
          '',
      ownerAddress: owner['address']?.toString() ?? '',
      vehicleYear: json['year']?.toString() ?? '',
      cylinderSerial: cylinder['serialNumber']?.toString() ?? '',
      cylinderManufacturer: cylinder['manufacturer']?.toString() ?? '',
      cylinderVolume: cylinder['volumeLiters']?.toString() ?? '',
      reducerName: cylinder['reducerName']?.toString() ?? '',
      controlUnitName: cylinder['controlUnitName']?.toString() ?? '',
      cylinderProducedAt:
          cylinder['producedAt']?.toString().split('T').first ?? '',
      cylinderValidUntil:
          cylinder['validUntil']?.toString().split('T').first ?? '',
      organizationName: organization['name']?.toString() ?? '',
      accreditationValidFrom:
          organization['accreditationValidFrom']?.toString() ?? '',
      accreditationValidUntil:
          organization['accreditationValidUntil']?.toString() ?? '',
      organizationBin: organization['bin']?.toString() ?? '',
      organizationAddress: organization['address']?.toString() ?? '',
      organizationRegion: organization['region']?.toString() ?? '',
      inspectionStatus: inspection['status']?.toString() ?? '',
      inspectionAddress: inspection['address']?.toString() ?? '',
      inspectionCreatedAt:
          inspection['createdAt']?.toString().split('T').first ?? '',
      inspectionLat: double.tryParse(inspection['lat']?.toString() ?? ''),
      inspectionLng: double.tryParse(inspection['lng']?.toString() ?? ''),
      organizationLat: double.tryParse(organization['lat']?.toString() ?? ''),
      organizationLng: double.tryParse(organization['lng']?.toString() ?? ''),
      certificateStatus: certificate['status']?.toString() ?? '',
      certificateIssuedAt:
          certificate['issuedAt']?.toString().split('T').first ?? '',
      documents: photos
          .whereType<Map<String, dynamic>>()
          .map(InspectionDocumentInfo.fromJson)
          .toList(),
    );
  }

  factory RegistryVehicle.fromCertificateJson(Map<String, dynamic> json) {
    final vehicle = json['vehicle'] is Map<String, dynamic>
        ? json['vehicle'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final inspection = json['inspection'] is Map<String, dynamic>
        ? json['inspection'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final organization = inspection['organization'] is Map<String, dynamic>
        ? inspection['organization'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final owners = vehicle['owners'] as List<dynamic>? ?? const [];
    final owner = owners.isEmpty
        ? const <String, dynamic>{}
        : owners.first as Map<String, dynamic>;
    final cylinders = vehicle['cylinders'] as List<dynamic>? ?? const [];
    final cylinder = cylinders.isEmpty
        ? const <String, dynamic>{}
        : cylinders.first as Map<String, dynamic>;
    final photos = inspection['photos'] as List<dynamic>? ?? const [];
    return RegistryVehicle(
      vin: vehicle['vin']?.toString() ?? '',
      plateNumber: vehicle['plateNumber']?.toString() ?? '',
      make: vehicle['make']?.toString() ?? '',
      model: vehicle['model']?.toString() ?? '',
      certificateNumber: json['number']?.toString() ?? '',
      validUntil: json['validUntil']?.toString().split('T').first ?? '',
      ownerName: owner['fullName']?.toString() ?? '',
      ownerIin: owner['iin']?.toString() ?? '',
      ownerPhone:
          owner['phone']?.toString() ??
          owner['user']?['phone']?.toString() ??
          '',
      ownerAddress: owner['address']?.toString() ?? '',
      vehicleYear: vehicle['year']?.toString() ?? '',
      cylinderSerial: cylinder['serialNumber']?.toString() ?? '',
      cylinderManufacturer: cylinder['manufacturer']?.toString() ?? '',
      cylinderVolume: cylinder['volumeLiters']?.toString() ?? '',
      reducerName: cylinder['reducerName']?.toString() ?? '',
      controlUnitName: cylinder['controlUnitName']?.toString() ?? '',
      cylinderProducedAt:
          cylinder['producedAt']?.toString().split('T').first ?? '',
      cylinderValidUntil:
          cylinder['validUntil']?.toString().split('T').first ?? '',
      organizationName: organization['name']?.toString() ?? '',
      accreditationValidFrom:
          organization['accreditationValidFrom']?.toString() ?? '',
      accreditationValidUntil:
          organization['accreditationValidUntil']?.toString() ?? '',
      organizationBin: organization['bin']?.toString() ?? '',
      organizationAddress: organization['address']?.toString() ?? '',
      organizationRegion: organization['region']?.toString() ?? '',
      inspectionStatus: inspection['status']?.toString() ?? '',
      inspectionAddress: inspection['address']?.toString() ?? '',
      inspectionCreatedAt:
          inspection['createdAt']?.toString().split('T').first ?? '',
      inspectionLat: double.tryParse(inspection['lat']?.toString() ?? ''),
      inspectionLng: double.tryParse(inspection['lng']?.toString() ?? ''),
      organizationLat: double.tryParse(organization['lat']?.toString() ?? ''),
      organizationLng: double.tryParse(organization['lng']?.toString() ?? ''),
      certificateStatus: json['status']?.toString() ?? '',
      certificateIssuedAt: json['issuedAt']?.toString().split('T').first ?? '',
      documents: photos
          .whereType<Map<String, dynamic>>()
          .map(InspectionDocumentInfo.fromJson)
          .toList(),
    );
  }
}

class InspectionDocumentInfo {
  const InspectionDocumentInfo({
    required this.id,
    required this.type,
    this.viewUrl = '',
    this.objectKey = '',
  });

  final String id;
  final String type;
  final String viewUrl;
  final String objectKey;

  factory InspectionDocumentInfo.fromJson(Map<String, dynamic> json) {
    return InspectionDocumentInfo(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? '',
      viewUrl: json['viewUrl']?.toString() ?? '',
      objectKey: json['objectKey']?.toString() ?? '',
    );
  }
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.createdAt,
    this.entity = '',
    this.entityId = '',
    this.read = false,
  });

  final String id;
  final String title;
  final String body;
  final String createdAt;
  final String entity;
  final String entityId;
  final bool read;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      body: json['body']?.toString() ?? '',
      createdAt: json['createdAt']?.toString().split('T').first ?? '',
      entity: json['entity']?.toString() ?? '',
      entityId: json['entityId']?.toString() ?? '',
      read: json['readAt'] != null,
    );
  }
}

class ViewHistoryItem {
  const ViewHistoryItem({
    required this.id,
    required this.action,
    required this.entity,
    required this.entityId,
    required this.createdAt,
    this.title = '',
  });

  final String id;
  final String action;
  final String entity;
  final String entityId;
  final String createdAt;
  final String title;

  factory ViewHistoryItem.fromJson(Map<String, dynamic> json) {
    final metadata = json['metadata'] is Map<String, dynamic>
        ? json['metadata'] as Map<String, dynamic>
        : const <String, dynamic>{};
    return ViewHistoryItem(
      id: json['id']?.toString() ?? '',
      action: json['action']?.toString() ?? '',
      entity: json['entity']?.toString() ?? '',
      entityId: json['entityId']?.toString() ?? '',
      createdAt: json['createdAt']?.toString().split('T').first ?? '',
      title: metadata['title']?.toString() ?? '',
    );
  }
}

class OrganizationSummary {
  const OrganizationSummary({
    required this.id,
    required this.name,
    required this.bin,
    required this.status,
    required this.region,
    this.accreditationValidFrom = '',
    this.accreditationValidUntil = '',
    this.type = '',
    this.address = '',
    this.phone = '',
    this.lat,
    this.lng,
    this.members = const [],
  });

  final String accreditationValidFrom;
  final String accreditationValidUntil;
  String get accreditationLabel =>
      accreditationPeriodLabel(accreditationValidFrom, accreditationValidUntil);

  final String id;
  final String name;
  final String bin;
  final String status;
  final String region;
  final String type;
  final String address;
  final String phone;
  final double? lat;
  final double? lng;
  final List<OrganizationMemberSummary> members;

  factory OrganizationSummary.fromJson(Map<String, dynamic> json) {
    final members = json['members'] as List<dynamic>? ?? const [];
    final firstMember = members.isEmpty
        ? const <String, dynamic>{}
        : members.first as Map<String, dynamic>;
    final firstUser = firstMember['user'] is Map<String, dynamic>
        ? firstMember['user'] as Map<String, dynamic>
        : const <String, dynamic>{};
    return OrganizationSummary(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      accreditationValidFrom: json['accreditationValidFrom']?.toString() ?? '',
      accreditationValidUntil:
          json['accreditationValidUntil']?.toString() ?? '',
      bin: json['bin']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      region: json['region']?.toString() ?? '',
      type: json['type']?.toString() ?? '',
      address: json['address']?.toString() ?? '',
      phone:
          json['phone']?.toString() ??
          json['contactPhone']?.toString() ??
          firstUser['phone']?.toString() ??
          '',
      lat: double.tryParse(json['lat']?.toString() ?? ''),
      lng: double.tryParse(json['lng']?.toString() ?? ''),
      members: members
          .whereType<Map<String, dynamic>>()
          .map(OrganizationMemberSummary.fromJson)
          .toList(),
    );
  }
}

class OrganizationMemberSummary {
  const OrganizationMemberSummary({
    required this.id,
    required this.role,
    required this.userId,
    required this.fullName,
    required this.phone,
    required this.lastLoginAt,
  });

  final String id;
  final String role;
  final String userId;
  final String fullName;
  final String phone;
  final String lastLoginAt;

  bool get isManager => role == 'admin' || role == 'manager';

  factory OrganizationMemberSummary.fromJson(Map<String, dynamic> json) {
    final user = json['user'] is Map<String, dynamic>
        ? json['user'] as Map<String, dynamic>
        : const <String, dynamic>{};
    return OrganizationMemberSummary(
      id: json['id']?.toString() ?? '',
      role: json['role']?.toString() ?? '',
      userId: user['id']?.toString() ?? json['userId']?.toString() ?? '',
      fullName: user['fullName']?.toString() ?? '',
      phone: user['phone']?.toString() ?? '',
      lastLoginAt: user['lastLoginAt']?.toString() ?? '',
    );
  }
}

class InspectionSummary {
  const InspectionSummary({
    required this.id,
    required this.status,
    required this.createdAt,
    required this.vehiclePlate,
    required this.vehicleVin,
    required this.vehicleName,
    required this.organizationName,
    required this.photoCount,
    required this.certificateNumber,
    this.accreditationValidFrom = '',
    this.accreditationValidUntil = '',
    this.certificateIssuedAt = '',
    this.certificateValidUntil = '',
    this.ownerName = '',
    this.ownerIin = '',
    this.ownerPhone = '',
    this.ownerAddress = '',
    this.vehicleId = '',
    this.vehicleYear = '',
    this.cylinderSerial = '',
    this.cylinderManufacturer = '',
    this.cylinderVolume = '',
    this.reducerName = '',
    this.controlUnitName = '',
    this.cylinderProducedAt = '',
    this.cylinderValidUntil = '',
    this.inspectionAddress = '',
    this.inspectionLat,
    this.inspectionLng,
    this.createdByName = '',
    this.createdByPhone = '',
    this.submittedByName = '',
    this.submittedByPhone = '',
    this.approvedByName = '',
    this.approvedByPhone = '',
    this.submittedAt = '',
    this.qualityDocumentUploaded = false,
    this.qualityConfirmedAt = '',
    this.qualityConfirmedByName = '',
    this.approvedAt = '',
    this.files = const [],
  });

  final String accreditationValidFrom;
  final String accreditationValidUntil;
  String get accreditationLabel =>
      accreditationPeriodLabel(accreditationValidFrom, accreditationValidUntil);

  final String id;
  final String status;
  final String createdAt;
  final String vehicleId;
  final String vehiclePlate;
  final String vehicleVin;
  final String vehicleName;
  final String organizationName;
  final int photoCount;
  final String certificateNumber;
  final String certificateIssuedAt;
  final String certificateValidUntil;
  final String ownerName;
  final String ownerIin;
  final String ownerPhone;
  final String ownerAddress;
  final String vehicleYear;
  final String cylinderSerial;
  final String cylinderManufacturer;
  final String cylinderVolume;
  final String reducerName;
  final String controlUnitName;
  final String cylinderProducedAt;
  final String cylinderValidUntil;
  final String inspectionAddress;
  final double? inspectionLat;
  final double? inspectionLng;
  final String createdByName;
  final String createdByPhone;
  final String submittedByName;
  final String submittedByPhone;
  final String approvedByName;
  final String approvedByPhone;
  final String submittedAt;
  final bool qualityDocumentUploaded;
  final String qualityConfirmedAt;
  final String qualityConfirmedByName;
  final String approvedAt;
  final List<InspectionFileInfo> files;

  factory InspectionSummary.fromJson(Map<String, dynamic> json) {
    final vehicle = json['vehicle'] is Map<String, dynamic>
        ? json['vehicle'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final organization = json['organization'] is Map<String, dynamic>
        ? json['organization'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final certificate = json['certificate'] is Map<String, dynamic>
        ? json['certificate'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final createdBy = json['createdBy'] is Map<String, dynamic>
        ? json['createdBy'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final submittedBy = json['submittedBy'] is Map<String, dynamic>
        ? json['submittedBy'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final approvedBy = json['approvedBy'] is Map<String, dynamic>
        ? json['approvedBy'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final qualityConfirmedBy =
        json['qualityConfirmedBy'] is Map<String, dynamic>
        ? json['qualityConfirmedBy'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final photos = json['photos'] as List<dynamic>? ?? const [];
    final owners = vehicle['owners'] as List<dynamic>? ?? const [];
    final owner = owners.isEmpty
        ? const <String, dynamic>{}
        : owners.first as Map<String, dynamic>;
    final cylinders = vehicle['cylinders'] as List<dynamic>? ?? const [];
    final cylinder = cylinders.isEmpty
        ? const <String, dynamic>{}
        : cylinders.first as Map<String, dynamic>;
    final make = vehicle['make']?.toString() ?? '';
    final model = vehicle['model']?.toString() ?? '';
    return InspectionSummary(
      id: json['id']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      createdAt: json['createdAt']?.toString().split('T').first ?? '',
      vehicleId:
          json['vehicleId']?.toString() ?? vehicle['id']?.toString() ?? '',
      vehiclePlate: vehicle['plateNumber']?.toString() ?? '',
      vehicleVin: vehicle['vin']?.toString() ?? '',
      vehicleName: [make, model].where((item) => item.isNotEmpty).join(' '),
      organizationName: organization['name']?.toString() ?? '',
      accreditationValidFrom:
          organization['accreditationValidFrom']?.toString() ?? '',
      accreditationValidUntil:
          organization['accreditationValidUntil']?.toString() ?? '',
      photoCount: photos.length,
      certificateNumber:
          certificate['number']?.toString() ??
          json['certificateNumber']?.toString() ??
          '',
      certificateIssuedAt:
          certificate['issuedAt']?.toString().split('T').first ?? '',
      certificateValidUntil:
          certificate['validUntil']?.toString().split('T').first ?? '',
      ownerName: owner['fullName']?.toString() ?? '',
      ownerIin: owner['iin']?.toString() ?? '',
      ownerPhone: owner['phone']?.toString() ?? '',
      ownerAddress: owner['address']?.toString() ?? '',
      vehicleYear: vehicle['year']?.toString() ?? '',
      cylinderSerial: cylinder['serialNumber']?.toString() ?? '',
      cylinderManufacturer: cylinder['manufacturer']?.toString() ?? '',
      cylinderVolume: cylinder['volumeLiters']?.toString() ?? '',
      reducerName: cylinder['reducerName']?.toString() ?? '',
      controlUnitName: cylinder['controlUnitName']?.toString() ?? '',
      cylinderProducedAt:
          cylinder['producedAt']?.toString().split('T').first ?? '',
      cylinderValidUntil:
          cylinder['validUntil']?.toString().split('T').first ?? '',
      inspectionAddress: json['address']?.toString() ?? '',
      inspectionLat: double.tryParse(json['lat']?.toString() ?? ''),
      inspectionLng: double.tryParse(json['lng']?.toString() ?? ''),
      createdByName: createdBy['fullName']?.toString() ?? '',
      createdByPhone: createdBy['phone']?.toString() ?? '',
      submittedByName: submittedBy['fullName']?.toString() ?? '',
      submittedByPhone: submittedBy['phone']?.toString() ?? '',
      approvedByName: approvedBy['fullName']?.toString() ?? '',
      approvedByPhone: approvedBy['phone']?.toString() ?? '',
      submittedAt: json['submittedAt']?.toString() ?? '',
      qualityDocumentUploaded: json['qualityDocumentUploadedAt'] != null,
      qualityConfirmedAt: json['qualityConfirmedAt']?.toString() ?? '',
      qualityConfirmedByName: qualityConfirmedBy['fullName']?.toString() ?? '',
      approvedAt: json['approvedAt']?.toString() ?? '',
      files: photos
          .whereType<Map<String, dynamic>>()
          .map(InspectionFileInfo.fromJson)
          .toList(),
    );
  }
}

class InspectionFileInfo {
  const InspectionFileInfo({
    required this.id,
    required this.type,
    required this.objectKey,
    required this.viewUrl,
    required this.createdAt,
  });

  final String id;
  final String type;
  final String objectKey;
  final String viewUrl;
  final String createdAt;

  bool get isImage {
    final lower = objectKey.toLowerCase();
    return lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.webp');
  }

  factory InspectionFileInfo.fromJson(Map<String, dynamic> json) {
    return InspectionFileInfo(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? '',
      objectKey: json['objectKey']?.toString() ?? '',
      viewUrl: json['viewUrl']?.toString() ?? '',
      createdAt: json['createdAt']?.toString().split('T').first ?? '',
    );
  }
}

class CertificateVerification {
  const CertificateVerification({
    required this.valid,
    required this.status,
    required this.number,
    required this.validUntil,
  });

  final bool valid;
  final String status;
  final String number;
  final String validUntil;

  factory CertificateVerification.fromJson(Map<String, dynamic> json) {
    return CertificateVerification(
      valid: json['valid'] == true,
      status: json['status']?.toString() ?? 'unknown',
      number: json['number']?.toString() ?? '',
      validUntil: json['validUntil']?.toString().split('T').first ?? '',
    );
  }
}

class CertificateImportResult {
  const CertificateImportResult({
    required this.ok,
    required this.status,
    required this.certificateNumber,
    required this.createdCount,
    required this.updatedCount,
    required this.errorCount,
    this.inspectionId = '',
    this.missing = const [],
    this.partial = const {},
  });

  final bool ok;
  final String status;
  final String certificateNumber;
  final int createdCount;
  final int updatedCount;
  final int errorCount;
  final String inspectionId;
  final List<String> missing;
  final Map<String, String> partial;

  factory CertificateImportResult.fromJson(Map<String, dynamic> json) {
    final job = json['job'] as Map<String, dynamic>? ?? const {};
    final certificate =
        json['certificate'] as Map<String, dynamic>? ?? const {};
    final inspection = json['inspection'] as Map<String, dynamic>? ?? const {};
    final certificateInspection =
        certificate['inspection'] as Map<String, dynamic>? ?? const {};
    final rawPartial = json['partial'] as Map<String, dynamic>? ?? const {};
    return CertificateImportResult(
      ok: json['ok'] == true,
      status: json['status']?.toString() ?? job['status']?.toString() ?? '',
      certificateNumber: certificate['number']?.toString() ?? '',
      createdCount: int.tryParse(job['createdCount']?.toString() ?? '') ?? 0,
      updatedCount: int.tryParse(job['updatedCount']?.toString() ?? '') ?? 0,
      errorCount: int.tryParse(job['errorCount']?.toString() ?? '') ?? 0,
      inspectionId:
          inspection['id']?.toString() ??
          certificateInspection['id']?.toString() ??
          certificate['inspectionId']?.toString() ??
          '',
      missing: (json['missing'] as List? ?? const [])
          .map((item) => item.toString())
          .toList(),
      partial: {
        for (final entry in rawPartial.entries)
          entry.key: entry.value?.toString() ?? '',
      },
    );
  }
}
