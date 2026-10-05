import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart' hide Path;
import 'package:url_launcher/url_launcher.dart';

import 'data/app_environment.dart';
import 'data/api_client.dart';
import 'data/models.dart';
import 'data/repositories.dart';
import 'platform/browser_geolocation.dart';
import 'platform/local_file_picker.dart';

void main() => runApp(const ErsiGboApp());

const darkGreen = Color(0xFF003C2B);
const green = Color(0xFF007A4D);
const softGreen = Color(0xFFEAF7F0);
const mint = Color(0xFFF1F8F4);
const mintDeep = Color(0xFFD9F2E5);
const ink = Color(0xFF173A30);
const muted = Color(0xFF7F918A);
const line = Color(0xFFDDEBE5);
const warn = Color(0xFFF0A11A);
const danger = Color(0xFFD64545);
const blue = Color(0xFF2E7AAE);
const designWidth = 430.0;
const designHeight = 932.0;
const pagePadding = 22.0;
const cardRadius = 18.0;
const inspectionPackageDocuments = <String, String>{
  'gas_work_record': 'Рабочая запись ГБО (подписи)',
  'cylinder_work_record': 'Рабочая запись баллона (подписи)',
  'gas_inspection_report': 'Отчет инспекции ГБО (подпись и печать)',
  'cylinder_inspection_report': 'Отчет инспекции баллона (подпись и печать)',
  'certificate_document': 'Свидетельство (рус./каз.)',
};
const inspectionRequiredLabels = <String, String>{
  'cylinder_label': 'фото бирки баллона',
  'vehicle_photo': 'фото автомобиля',
  'tech_passport': 'фото техпаспорта',
  ...inspectionPackageDocuments,
  'gas_cylinder': 'данные баллона',
  'vehicle_owner': 'данные владельца',
};
const lawExtractTitle = 'Приказ №600 от 18 ноября 2021 года';
const lawExtractText =
    'Приказ № 600 Министра индустрии и инфраструктурного развития РК от 18 ноября 2021 года внес изменения в Правила организации и проведения обязательного технического осмотра механических транспортных средств.\n\n'
    'Данный приказ напрямую регулирует требования к автомобилям с газобаллонным оборудованием (ГБО) при прохождении техосмотра.\n\n'
    'Основные требования приказа № 600 для ГБО:\n\n'
    'Проверка герметичности: На техосмотре в обязательном порядке контролируется отсутствие утечек газа из элементов ГБО и в местах их соединений, а также целостность всей конструкции.\n\n'
    'Маркировка баллонов: Проверяется наличие четкого серийного номера и нестираемых обозначений «Сжиженный нефтяной газ» (СНГ) или «Компримированный природный газ» (КПГ) на каждом баллоне.\n\n'
    'Периодические испытания (освидетельствование): Установлено, что ГБО должно проходить периодические испытания в специализированных аккредитованных организациях. Периодичность этих испытаний должна строго совпадать со сроками освидетельствования баллонов, указанными заводом-изготовителем в паспорте (как правило, раз в 2 года для пропана).\n\n'
    'Приказ N°600 вступил в действие с 01 января 2025 г.';

void _showLawExtract(
  BuildContext context, {
  String title = lawExtractTitle,
  String text = lawExtractText,
}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (context) => SafeArea(
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.78,
        minChildSize: 0.42,
        maxChildSize: 0.92,
        builder: (context, controller) => Padding(
          padding: const EdgeInsets.fromLTRB(22, 0, 22, 22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  color: ink,
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: SingleChildScrollView(
                  controller: controller,
                  child: Text(
                    text,
                    style: const TextStyle(
                      color: ink,
                      height: 1.45,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              _PrimaryButton(
                text: 'Закрыть',
                icon: Icons.check_rounded,
                onTap: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

void _showInfoDialog(
  BuildContext context, {
  required String title,
  required String text,
}) {
  showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(text),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Закрыть'),
        ),
      ],
    ),
  );
}

String _normalizeKzPhone(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return '';
  final digits = trimmed.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return '+7';
  if (digits.startsWith('7')) return '+$digits';
  if (digits.startsWith('8')) return '+7${digits.substring(1)}';
  return '+7$digits';
}

String _normalizeCertificateNumber(String value) {
  return value.replaceAll(RegExp(r'\s+'), '').trim().toUpperCase();
}

String _dateOnly(String value) {
  if (value.trim().isEmpty) return '';
  return value.split('T').first;
}

String _todayIsoDate() {
  final now = DateTime.now();
  String two(int value) => value.toString().padLeft(2, '0');
  return '${now.year}-${two(now.month)}-${two(now.day)}';
}

String _displayDate(String isoDate) {
  final value = _dateOnly(isoDate);
  final parts = value.split('-');
  if (parts.length == 3) return '${parts[2]}.${parts[1]}.${parts[0]}';
  return value;
}

String _plusYearsIso(String isoDate, int years) {
  final date = DateTime.tryParse(_dateOnly(isoDate));
  if (date == null) return '';
  final next = DateTime(date.year + years, date.month, date.day);
  String two(int value) => value.toString().padLeft(2, '0');
  return '${next.year}-${two(next.month)}-${two(next.day)}';
}

String _normalizeFuelType(String value) {
  final normalized = value.trim().toUpperCase();
  if (normalized == 'LPG' ||
      normalized == 'СНГ' ||
      normalized.contains('СЖИЖ')) {
    return 'СНГ';
  }
  if (normalized == 'CNG' ||
      normalized == 'КПГ' ||
      normalized.contains('КОМПРИМ')) {
    return 'КПГ';
  }
  return '';
}

class _KzPhoneFormatter extends TextInputFormatter {
  const _KzPhoneFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final normalized = _normalizeKzPhone(newValue.text);
    return TextEditingValue(
      text: normalized,
      selection: TextSelection.collapsed(offset: normalized.length),
    );
  }
}

class _PlateNumberFormatter extends TextInputFormatter {
  const _PlateNumberFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final normalized = newValue.text
        .replaceAll(RegExp(r'[^0-9a-zA-Zа-яА-Я]'), '')
        .toUpperCase();
    return TextEditingValue(
      text: normalized,
      selection: TextSelection.collapsed(offset: normalized.length),
    );
  }
}

class _CertificateNumberFormatter extends TextInputFormatter {
  const _CertificateNumberFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final normalized = _normalizeCertificateNumber(newValue.text);
    return TextEditingValue(
      text: normalized,
      selection: TextSelection.collapsed(offset: normalized.length),
    );
  }
}

class ResponsiveMetrics {
  const ResponsiveMetrics({
    required this.screenWidth,
    required this.screenHeight,
    required this.safeTop,
    required this.safeBottom,
  });

  factory ResponsiveMetrics.of(BuildContext context) {
    final media = MediaQuery.of(context);
    return ResponsiveMetrics(
      screenWidth: media.size.width,
      screenHeight: media.size.height,
      safeTop: media.padding.top,
      safeBottom: media.padding.bottom,
    );
  }

  final double screenWidth;
  final double screenHeight;
  final double safeTop;
  final double safeBottom;

  bool get isDesktop => screenWidth >= 900;
  bool get isCompact => screenWidth < 380;
  bool get isShort => screenHeight < 760;
  bool get isLargePhone => screenWidth >= 414;
  double get pagePadding => isDesktop
      ? 32
      : isCompact
      ? 16
      : (isLargePhone ? 22 : 20);
  double get gapS => isDesktop ? 14 : (isCompact ? 8 : 10);
  double get gapM => isDesktop ? 22 : (isCompact ? 12 : 16);
  double get gapL => isDesktop ? 32 : (isShort ? 20 : 26);
  double get headerPaddingY => isDesktop ? 20 : (isCompact ? 14 : 18);
  double get bottomNavHeight => isDesktop ? 76 : (isCompact ? 74 : 84);
  double get bottomNavMargin => isDesktop ? 16 : (isCompact ? 8 : 12);
}

const screenTitles = [
  '01. Заставка',
  '02. Выбор роли',
  '03. Вход в компанию',
  '04. SMS-подтверждение',
  '05. Главная пользователя',
  '06. Поиск по VIN',
  '07. Поиск по БИН/ИИН',
  '08. Результаты поиска',
  '09. Карточка свидетельства',
  '10. Просмотр документа',
  '11. Информация по закону',
  '12. Карта организаций',
  '13. Карточка инспекционного органа',
  '14. Карточка установщика',
  '15. Главная инспекционного органа',
  '16. Инспекция: БИН/ИИН',
  '17. Инспекция: данные автомобиля',
  '18. Инспекция: данные баллона',
  '19. Инспекция: фото бирки',
  '20. Инспекция: фото с камеры',
  '21. Инспекция: фото техпаспорта',
  '22. Инспекция: срок 2 года',
  '23. Инспекция: скан свидетельства',
  '24. Инспекция: проверка данных',
  '25. Тарифы',
  '26. Способ оплаты',
  '27. Успешная оплата',
  '28. Баланс инспекционного органа',
  '29. Главная оператора',
  '30. Центр видеоконтроля НЦА',
  '31. Прямая трансляция камеры',
  '32. API интеграция камер',
  '33. Аудит видеосессии',
  '34. Управление инспекционными органами',
  '35. Блокировка инспекционного органа',
  '36. Реклама и продвижение',
  '37. Кабинет госучреждения',
  '38. Государственный просмотр реестра',
  '39. Уведомления',
  '40. Профиль и безопасность',
  '41. Детали инспекции',
];

String _absoluteFileUrl(String viewUrl) {
  if (viewUrl.isEmpty) return '';
  final uri = Uri.tryParse(viewUrl);
  if (uri != null && uri.hasScheme) return viewUrl;
  final origin = AppEnvironment.apiBaseUrl.replaceFirst(
    RegExp(r'/api/v1/?$'),
    '',
  );
  return '$origin${viewUrl.startsWith('/') ? '' : '/'}$viewUrl';
}

bool _looksLikeImageUrl(String value) {
  final lower = value.toLowerCase();
  return lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.png') ||
      lower.endsWith('.webp') ||
      lower.contains('image');
}

String _roleLabelFromCode(String roleCode) {
  return switch (roleCode) {
    'inspection_org' => 'Инспекционный орган',
    'government' => 'Контрольный орган',
    'nca' => 'Контрольный орган',
    _ => 'Проверка свидетельства',
  };
}

Future<Position?> _tryCurrentPosition() async {
  try {
    if (kIsWeb) {
      return requestBrowserPosition();
    }
    if (!kIsWeb) {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) return null;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return null;
    }
    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 15),
      ),
    );
  } catch (_) {
    return null;
  }
}

Position _positionFromLatLng(double lat, double lng) {
  return Position(
    latitude: lat,
    longitude: lng,
    timestamp: DateTime.now(),
    accuracy: 0,
    altitude: 0,
    altitudeAccuracy: 0,
    heading: 0,
    headingAccuracy: 0,
    speed: 0,
    speedAccuracy: 0,
  );
}

int _homeScreenForRoleCode(String roleCode) {
  return switch (roleCode) {
    'inspection_org' => 14,
    'operator' => 28,
    'government' => 36,
    'nca' => 36,
    _ => 4,
  };
}

class ErsiGboApp extends StatelessWidget {
  const ErsiGboApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'ЕРСИ ГБО',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: green),
        scaffoldBackgroundColor: mint,
        fontFamily: 'Roboto',
      ),
      home: const ErsiDemo(),
    );
  }
}

class ErsiDemo extends StatefulWidget {
  const ErsiDemo({super.key, this.initialScreen = 0, this.showStepper = false});

  final int initialScreen;
  final bool showStepper;

  @override
  State<ErsiDemo> createState() => _ErsiDemoState();
}

class _ErsiDemoState extends State<ErsiDemo> {
  late int screen = widget.initialScreen.clamp(0, 40);
  final AppRepositories repositories = AppRepositories.current();
  String vinQuery = '';
  String authPhone = '';
  String authBin = '';
  String smsCode = '';
  String lastSearchQuery = '';
  String inspectionCertificateNumber = '';
  String ownerId = '';
  String ownerName = '';
  String ownerPhone = '';
  String ownerAddress = '';
  String ownerKind = 'Физлицо';
  String inspectionIssuedAt = _todayIsoDate();
  String vehiclePlate = '';
  String vehicleVin = '';
  String vehicleMakeModel = '';
  String vehicleYear = '';
  String vehicleColor = '';
  String cylinderNumber = '';
  String cylinderMaker = '';
  String cylinderVolume = '';
  String cylinderYear = '';
  String cylinderFuel = '';
  String reducerName = '';
  String controlUnitName = '';
  String cylinderShape = 'Тороидальный';
  String publicPlateNumber = '';
  String publicVinLast3 = '';
  String? draftVehicleId;
  String? draftInspectionId;
  String? visibleOtpCode;
  RegistryVehicle? publicCertificateResult;
  RegistryVehicle? selectedRegistryVehicle;
  bool publicCertificateSearched = false;
  bool publicCertificateChecking = false;
  String? cylinderPhotoName;
  List<int>? cylinderPhotoBytes;
  Position? cylinderPhotoPosition;
  bool cylinderPhotoUploaded = false;
  String? vehiclePhotoName;
  List<int>? vehiclePhotoBytes;
  Position? vehiclePhotoPosition;
  bool vehiclePhotoUploaded = false;
  String? techPassportPhotoName;
  List<int>? techPassportPhotoBytes;
  Position? techPassportPhotoPosition;
  bool techPassportPhotoUploaded = false;
  Position? lastKnownInspectionPosition;
  String? documentFileName;
  Map<String, String> packageDocumentNames = const {};
  Map<String, List<int>> packageDocumentBytes = const {};
  Map<String, Position> packageDocumentPositions = const {};
  Map<String, bool> packageDocumentUploaded = const {};
  bool protectedInspectionPhotosLocked = false;
  AppUser? currentUser;
  String role = 'Проверка свидетельства';
  String apiState = AppEnvironment.isDemo ? 'Demo data' : 'API connecting';
  List<RegistryVehicle> registryResults = const [];
  List<RegistryVehicle> controlCertificates = const [];
  String controlPlateNumber = '';
  String controlVinLast3 = '';
  String controlDateFrom = '';
  String controlDateTo = '';
  List<AppNotification> notifications = const [];
  List<ViewHistoryItem> viewHistory = const [];
  List<OrganizationSummary> organizations = const [];
  List<AppBanner> banners = const [];
  List<String> reducerOptions = const [];
  List<String> controlUnitOptions = const [];
  List<String> cylinderMakerOptions = const [];
  String legalTitle = lawExtractTitle;
  String legalExcerpt =
      'Приказ Министра индустрии и инфраструктурного развития РК внес изменения в правила обязательного технического осмотра механических транспортных средств.';
  String legalBody = lawExtractText;
  List<InspectionSummary> myInspections = const [];
  InspectionSummary? selectedInspection;
  OrganizationMemberSummary? selectedEmployee;
  String employeeActivityDateFrom = '';
  String employeeActivityDateTo = '';
  final List<int> _history = [];
  bool promoted = true;
  bool sendingOtp = false;
  bool bootstrapping = true;
  String language = 'Русский';

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    try {
      try {
        banners = await repositories.banners.listPublic();
      } catch (_) {
        banners = const [];
      }
      try {
        final equipment = await repositories.equipment.listPublic();
        reducerOptions = equipment.reducers;
        controlUnitOptions = equipment.controlUnits;
        cylinderMakerOptions = equipment.cylinderMakers;
      } catch (_) {
        reducerOptions = const [];
        controlUnitOptions = const [];
        cylinderMakerOptions = const [];
      }
      try {
        final legal = await repositories.legal.active();
        if (legal != null) {
          legalTitle = legal.title;
          legalExcerpt = legal.excerpt.isEmpty ? legal.body : legal.excerpt;
          legalBody = legal.body;
        }
      } catch (_) {}
      currentUser = await repositories.auth.restoreSession();
      if (currentUser != null) {
        final restoredRoleCode =
            await repositories.auth.restoreLastRoleCode() ?? 'public_check';
        authBin = await repositories.auth.restoreLastOrganizationBin() ?? '';
        role = _roleLabelFromCode(restoredRoleCode);
        organizations = await repositories.organizations.list();
        if (restoredRoleCode == 'inspection_org') {
          myInspections = await repositories.inspections.list();
        }
        if (restoredRoleCode == 'nca' || restoredRoleCode == 'government') {
          controlCertificates = await repositories.certificates.list();
        }
        if (restoredRoleCode == 'inspection_org' ||
            restoredRoleCode == 'nca' ||
            restoredRoleCode == 'government') {
          notifications = await repositories.notifications.list();
          viewHistory = await repositories.audit.myViews();
        }
      }
      if (mounted) {
        setState(() {
          bootstrapping = false;
          apiState = currentUser == null
              ? AppEnvironment.isDemo
                    ? 'Demo data'
                    : 'API online'
              : 'Session restored';
          if (currentUser != null && widget.initialScreen == 0) {
            screen = _homeScreenForRoleCode(_roleCode);
          }
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          bootstrapping = false;
          apiState = 'API offline';
        });
      }
    }
  }

  Future<void> _loadOrganizations() async {
    try {
      final items = await repositories.organizations.list();
      if (mounted) {
        setState(() {
          organizations = items;
          apiState = 'Organizations loaded';
        });
      }
    } catch (_) {
      if (mounted) setState(() => apiState = 'Organizations API error');
    }
  }

  Future<void> _loadMyInspections({bool silent = false}) async {
    try {
      final items = await repositories.inspections.list();
      if (mounted) {
        setState(() {
          myInspections = items;
          if (!silent) apiState = 'Инспекции загружены';
        });
      }
    } catch (_) {
      if (mounted && !silent) {
        setState(() => apiState = 'Ошибка загрузки инспекций');
      }
    }
  }

  OrganizationSummary? get _currentInspectionOrganization {
    if (_roleCode != 'inspection_org') return null;
    final bin = authBin.trim();
    for (final org in organizations) {
      if (org.type == 'inspection_org' && org.bin == bin) return org;
    }
    final userId = currentUser?.id ?? '';
    if (userId.isNotEmpty) {
      for (final org in organizations) {
        if (org.type == 'inspection_org' &&
            org.members.any((member) => member.userId == userId)) {
          return org;
        }
      }
    }
    for (final org in organizations) {
      if (org.type == 'inspection_org') return org;
    }
    return null;
  }

  Future<Position> _bestInspectionPosition() async {
    final live = await _tryCurrentPosition();
    if (live != null) {
      lastKnownInspectionPosition = live;
      return live;
    }
    final saved =
        lastKnownInspectionPosition ??
        cylinderPhotoPosition ??
        vehiclePhotoPosition ??
        techPassportPhotoPosition ??
        (packageDocumentPositions.isEmpty
            ? null
            : packageDocumentPositions.values.first);
    if (saved != null) return saved;

    final org = _currentInspectionOrganization;
    if (org?.lat != null && org?.lng != null) {
      final fallback = _positionFromLatLng(org!.lat!, org.lng!);
      lastKnownInspectionPosition = fallback;
      return fallback;
    }

    throw StateError(
      kIsWeb
          ? 'Не удалось получить координаты. Нажмите значок слева от адреса сайта и проверьте доступ к местоположению.'
          : 'Не удалось определить местоположение. Включите геолокацию и разрешите доступ приложению.',
    );
  }

  bool get _isInspectionManager {
    final userId = currentUser?.id ?? '';
    if (userId.isEmpty) return false;
    return _currentInspectionOrganization?.members.any(
          (member) => member.userId == userId && member.isManager,
        ) ??
        false;
  }

  Future<void> _loadControlCertificates({String q = ''}) async {
    try {
      final items = await repositories.certificates.list(q: q, limit: 200);
      if (!mounted) return;
      setState(() {
        controlCertificates = items;
        apiState = 'Реестр загружен';
      });
    } catch (_) {
      if (mounted) setState(() => apiState = 'Ошибка загрузки реестра');
    }
  }

  Future<void> _searchControlCertificates() async {
    final plate = controlPlateNumber.trim();
    final vin3 = controlVinLast3.trim();
    if ((plate.isEmpty && vin3.isNotEmpty) ||
        (plate.isNotEmpty && vin3.length != 3)) {
      setState(() => apiState = 'Введите госномер и последние 3 VIN');
      return;
    }
    try {
      final items = await repositories.certificates.list(
        plateNumber: plate,
        vinLast3: vin3,
        dateFrom: controlDateFrom,
        dateTo: controlDateTo,
        limit: 200,
      );
      if (!mounted) return;
      setState(() {
        controlCertificates = items;
        apiState = items.isEmpty
            ? 'Свидетельства не найдены'
            : 'Найдено свидетельств: ${items.length}';
      });
    } catch (_) {
      if (mounted) setState(() => apiState = 'Ошибка поиска свидетельств');
    }
  }

  Future<void> _clearControlCertificateFilters() async {
    setState(() {
      controlPlateNumber = '';
      controlVinLast3 = '';
      controlDateFrom = '';
      controlDateTo = '';
    });
    await _loadControlCertificates();
  }

  Future<void> _loadNotifications() async {
    try {
      final items = await repositories.notifications.list();
      if (!mounted) return;
      setState(() {
        notifications = items;
        apiState = 'Уведомления загружены';
      });
    } catch (_) {
      if (mounted) setState(() => apiState = 'Ошибка загрузки уведомлений');
    }
  }

  Future<void> _loadViewHistory() async {
    try {
      final items = await repositories.audit.myViews();
      if (!mounted) return;
      setState(() {
        viewHistory = items;
        apiState = 'История загружена';
      });
    } catch (_) {
      if (mounted) setState(() => apiState = 'Ошибка загрузки истории');
    }
  }

  Future<void> _openNotification(AppNotification notification) async {
    if (notification.entity == 'certificate' &&
        notification.entityId.isNotEmpty) {
      await _openControlCertificate(
        RegistryVehicle(
          vin: '',
          plateNumber: '',
          make: '',
          model: '',
          certificateNumber: notification.entityId,
          validUntil: '',
        ),
      );
      return;
    }
    if (notification.entity == 'inspection') {
      go(_roleCode == 'inspection_org' ? 14 : 37);
      return;
    }
    go(_roleCode == 'inspection_org' ? 14 : 37);
  }

  Future<void> _openControlCertificate(RegistryVehicle vehicle) async {
    final number = vehicle.certificateNumber.trim();
    if (number.isEmpty) {
      setState(() => apiState = 'Номер свидетельства не указан');
      return;
    }
    setState(() => apiState = 'Загрузка свидетельства');
    try {
      final detail = await repositories.certificates.detail(number);
      await repositories.audit.trackView(
        entity: 'certificate',
        entityId: number,
        title: detail.certificateNumber,
      );
      if (!mounted) return;
      setState(() {
        selectedRegistryVehicle = detail;
        apiState = 'Свидетельство открыто';
      });
      go(8);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        selectedRegistryVehicle = vehicle;
        apiState = 'Ошибка открытия свидетельства';
      });
      go(8);
    }
  }

  Future<void> _trackOrganizationView(String id, String title) async {
    try {
      await repositories.audit.trackView(
        entity: 'organization',
        entityId: id,
        title: title,
      );
      await _loadViewHistory();
    } catch (_) {
      // History tracking must not block map usage.
    }
  }

  Future<void> _sendOtp() async {
    if (sendingOtp) return;
    final phone = _normalizeKzPhone(authPhone);
    final bin = authBin.trim();
    if (phone.isEmpty) {
      setState(() => apiState = 'Введите телефон');
      return;
    }
    if (['inspection_org', 'operator'].contains(_roleCode) && bin.isEmpty) {
      setState(() => apiState = 'Введите БИН');
      return;
    }
    setState(() => sendingOtp = true);
    try {
      final code = await repositories.auth.sendOtp(phone, role: _roleCode);
      if (mounted) {
        setState(() {
          visibleOtpCode = code;
          smsCode = '';
          apiState = code == null ? 'SMS sent' : 'SMS code: $code';
        });
        go(3);
      }
    } catch (error) {
      if (!mounted) return;
      final message = error.toString();
      if (message.contains('cooldown')) {
        setState(() {
          visibleOtpCode = null;
          smsCode = '';
          apiState = 'SMS уже отправлен';
        });
        go(3);
      } else {
        setState(() => apiState = _apiErrorText(message));
      }
    } finally {
      if (mounted) setState(() => sendingOtp = false);
    }
  }

  String _apiErrorText(String message) {
    if (message.contains('контрольных органов')) {
      return 'Данного номера нет в списке контрольных органов';
    }
    if (message.contains('инспекционных органов')) {
      return 'Данного номера нет в списке инспекционных органов';
    }
    if (message.contains('Role cannot')) return 'Нет доступа к выбранной роли';
    if (message.contains('Phone')) return 'Проверьте номер телефона';
    return 'SMS API error';
  }

  Future<void> _confirmOtp() async {
    final phone = _normalizeKzPhone(authPhone);
    final code = smsCode.trim();
    if (code.isEmpty) {
      setState(() => apiState = 'Введите SMS-код');
      return;
    }
    try {
      final user = await repositories.auth.verifyOtp(
        phone,
        code,
        _roleCode,
        bin: authBin.trim(),
      );
      if (mounted) {
        setState(() {
          currentUser = user;
          apiState = 'Authorized';
        });
        if (_roleCode == 'inspection_org') await _loadOrganizations();
        if (_roleCode == 'inspection_org') await _loadMyInspections();
        if (_roleCode == 'nca' || _roleCode == 'government') {
          await _loadControlCertificates();
        }
        if (_roleCode == 'inspection_org' ||
            _roleCode == 'nca' ||
            _roleCode == 'government') {
          await _loadNotifications();
          await _loadViewHistory();
        }
        go(_homeScreenForRoleCode(_roleCode));
      }
    } catch (_) {
      if (mounted) setState(() => apiState = 'Login API error');
    }
  }

  Future<void> _searchRegistry(String query) async {
    final normalizedQuery = query.trim();
    if (normalizedQuery.isEmpty) {
      if (mounted) setState(() => apiState = 'Введите запрос');
      return;
    }
    try {
      final results = await repositories.registry.search(normalizedQuery);
      if (mounted) {
        setState(() {
          lastSearchQuery = normalizedQuery;
          registryResults = results;
          selectedRegistryVehicle = null;
          apiState = 'Registry loaded';
        });
        go(7);
      }
    } catch (_) {
      if (mounted) setState(() => apiState = 'Registry API error');
    }
  }

  Future<void> _publicCertificateCheck() async {
    if (publicCertificateChecking) return;
    final plate = publicPlateNumber.trim();
    final vin3 = publicVinLast3.trim();
    if (plate.isEmpty || vin3.length != 3) {
      setState(() => apiState = 'Введите госномер и последние 3 VIN');
      return;
    }
    try {
      setState(() {
        publicCertificateChecking = true;
        apiState = 'Поиск свидетельства...';
      });
      final position = await _tryCurrentPosition();
      final result = await repositories.registry.publicCertificateCheck(
        plateNumber: plate,
        vinLast3: vin3,
        lat: position?.latitude,
        lng: position?.longitude,
      );
      if (!mounted) return;
      setState(() {
        publicCertificateSearched = true;
        publicCertificateResult = result;
        publicCertificateChecking = false;
        apiState = result == null
            ? 'Свидетельство не найдено'
            : 'Свидетельство найдено';
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          publicCertificateChecking = false;
          apiState = 'Сервер недоступен, попробуйте ещё раз';
        });
      }
    }
  }

  Future<void> _pickImportXlsx() async {
    try {
      final file = kIsWeb
          ? await pickLocalFile(const ['xlsx'])
          : await _pickPluginFile(const ['xlsx']);
      final bytes = file?.bytes;
      if (file == null || bytes == null || bytes.isEmpty) {
        if (mounted) setState(() => apiState = 'Файл не выбран');
        return;
      }
      if (mounted) setState(() => apiState = 'Загрузка XLSX...');
      final importResult = await repositories.certificates.importXlsx(
        filename: file.name,
        bytes: bytes,
        asInspectionDraft: true,
      );
      if (!importResult.ok && importResult.status == 'needs_input') {
        _applyPartialXlsxImport(importResult);
        return;
      }
      if (importResult.ok && importResult.inspectionId.isNotEmpty) {
        await _loadMyInspections(silent: true);
        if (!mounted) return;
        setState(() => apiState = 'Инспекция заполнена из XLSX');
        try {
          final inspection = await repositories.inspections.detail(
            importResult.inspectionId,
          );
          await _continueInspectionDraft(inspection);
        } catch (_) {
          if (!mounted) return;
          setState(
            () =>
                apiState = 'Инспекция заполнена из XLSX, откройте ее в списке',
          );
        }
        return;
      }
      if (importResult.ok) {
        await _loadMyInspections(silent: true);
        if (!mounted) return;
        setState(() => apiState = 'Инспекция заполнена из XLSX');
        return;
      }
      if (mounted) {
        setState(() {
          apiState = importResult.missing.isEmpty
              ? 'Ошибка импорта XLSX'
              : 'Заполните поля из XLSX: ${_missingXlsxLabels(importResult.missing).join(', ')}';
        });
      }
    } catch (error) {
      if (mounted) setState(() => apiState = _xlsxImportErrorText(error));
    }
  }

  void _applyPartialXlsxImport(CertificateImportResult result) {
    final data = result.partial;
    setState(() {
      inspectionCertificateNumber = _nonEmpty(
        data['certificateNumber'],
        inspectionCertificateNumber,
      );
      ownerName = _nonEmpty(data['ownerName'], ownerName);
      ownerPhone = _nonEmpty(data['ownerPhone'], ownerPhone);
      ownerAddress = _nonEmpty(data['ownerAddress'], ownerAddress);
      inspectionIssuedAt = _dateOnly(
        _nonEmpty(data['issuedAt'], inspectionIssuedAt),
      );
      vehiclePlate = _nonEmpty(data['plateNumber'], vehiclePlate);
      vehicleVin = _nonEmpty(data['vin'], vehicleVin);
      final parsedMakeModel = [
        data['make'] ?? '',
        data['model'] ?? '',
      ].where((item) => item.trim().isNotEmpty).join(' ').trim();
      if (parsedMakeModel.isNotEmpty) vehicleMakeModel = parsedMakeModel;
      cylinderNumber = _nonEmpty(data['cylinderSerial'], cylinderNumber);
      cylinderMaker = _nonEmpty(data['cylinderManufacturer'], cylinderMaker);
      cylinderVolume = _nonEmpty(data['volumeLiters'], cylinderVolume);
      cylinderFuel = _normalizeFuelType(
        _nonEmpty(data['fuelType'], cylinderFuel),
      );
      reducerName = _nonEmpty(data['reducerName'], reducerName);
      controlUnitName = _nonEmpty(data['controlUnitName'], controlUnitName);
      final producedAt = data['producedAt'] ?? '';
      if (producedAt.length >= 4) cylinderYear = producedAt.substring(0, 4);
      draftInspectionId = null;
      draftVehicleId = null;
      protectedInspectionPhotosLocked = false;
      final labels = _missingXlsxLabels(result.missing);
      apiState = 'Заполните недостающие поля: ${labels.join(', ')}';
    });
    if (result.missing.any(
      (item) => [
        'ownerName',
        'ownerAddress',
        'certificateNumber',
        'reportNumber',
      ].contains(item),
    )) {
      go(15);
    } else if (result.missing.any(
      (item) => ['vin', 'plateNumber', 'make', 'model'].contains(item),
    )) {
      go(16);
    } else {
      go(17);
    }
  }

  String _nonEmpty(String? value, String fallback) {
    final clean = value?.trim() ?? '';
    return clean.isEmpty || clean == '0' ? fallback : clean;
  }

  List<String> _missingXlsxLabels(List<String> fields) {
    const labels = {
      'reportNumber': 'номер отчета',
      'certificateNumber': 'номер свидетельства',
      'ownerName': 'ФИО / наименование владельца',
      'ownerAddress': 'адрес проживания владельца',
      'vin': 'VIN',
      'plateNumber': 'госномер',
      'make': 'марка',
      'model': 'модель',
      'cylinderSerial': 'номер баллона',
      'cylinderManufacturer': 'производитель баллона',
      'volumeLiters': 'объем баллона',
      'reducerName': 'название редуктора',
      'controlUnitName': 'название ЭБУ',
    };
    return fields.map((field) => labels[field] ?? field).toList();
  }

  Future<PickedLocalFile?> _pickPluginFile(List<String> extensions) async {
    final files = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: extensions,
    );
    if (files.isEmpty) return null;
    final file = files.single;
    final bytes = await file.readAsBytes();
    return PickedLocalFile(name: file.name, bytes: bytes);
  }

  String _xlsxImportErrorText(Object error) {
    if (error is ApiException) {
      if (error.statusCode == 401) {
        return 'Сессия истекла. Выйдите и войдите заново по SMS.';
      }
      if (error.statusCode == 403) {
        return 'Нет доступа к импорту XLSX. Войдите как инспекционный орган или руководитель ИО.';
      }
      return _xlsxImportMessage(error.message);
    }
    final message = error.toString();
    return _xlsxImportMessage(message);
  }

  String _xlsxImportMessage(String message) {
    if (message.contains('Required fields not found')) {
      return 'В XLSX не найдены обязательные поля';
    }
    if (message.contains('Cylinder volume')) {
      return 'В XLSX не найден объем баллона';
    }
    if (message.contains('Only .xlsx')) {
      return 'Загрузите файл XLSX';
    }
    if (message.contains('already') || message.contains('уже есть')) {
      return 'Свидетельство с таким номером уже есть в реестре';
    }
    if (message.contains('organization') || message.contains('организац')) {
      return 'Не найден инспекционный орган для этого XLSX';
    }
    final clean = message
        .replaceFirst(RegExp(r'^ApiException\\(\\d+\\):\\s*'), '')
        .replaceFirst('Exception: ', '')
        .trim();
    if (clean.isEmpty) return 'Ошибка импорта XLSX';
    return 'Ошибка импорта XLSX: $clean';
  }

  Future<void> _captureInspectionPhoto(String kind) async {
    try {
      final initialPosition = await _tryCurrentPosition();
      final String filename;
      final List<int> bytes;
      if (kIsWeb) {
        final file = await pickLocalFile(const [
          'jpg',
          'jpeg',
          'png',
          'heic',
          'webp',
        ]);
        final pickedBytes = file?.bytes;
        if (file == null || pickedBytes == null || pickedBytes.isEmpty) {
          if (mounted) setState(() => apiState = 'Фото не выбрано');
          return;
        }
        filename = file.name;
        bytes = pickedBytes;
      } else {
        final photo = await ImagePicker().pickImage(
          source: ImageSource.camera,
          imageQuality: 82,
          maxWidth: 1800,
        );
        if (photo == null) {
          if (mounted) setState(() => apiState = 'Фото не выбрано');
          return;
        }
        filename = photo.name;
        bytes = await photo.readAsBytes();
      }
      if (!mounted) return;
      final position = initialPosition ?? await _tryCurrentPosition();
      if (!mounted) return;
      setState(() {
        if (kind == 'cylinder') {
          cylinderPhotoName = filename;
          cylinderPhotoBytes = bytes;
          cylinderPhotoPosition = position;
          cylinderPhotoUploaded = false;
        }
        if (kind == 'vehicle') {
          vehiclePhotoName = filename;
          vehiclePhotoBytes = bytes;
          vehiclePhotoPosition = position;
          vehiclePhotoUploaded = false;
        }
        if (kind == 'tech_passport') {
          techPassportPhotoName = filename;
          techPassportPhotoBytes = bytes;
          techPassportPhotoPosition = position;
          techPassportPhotoUploaded = false;
        }
        if (position != null) lastKnownInspectionPosition = position;
        apiState = position == null
            ? 'Фото выбрано. Координаты будут взяты из данных ИО, если браузер их не отдаст.'
            : 'Фото выбрано';
      });
    } catch (error) {
      final message = error is StateError
          ? error.message
          : _uploadErrorText(error);
      if (mounted) setState(() => apiState = message);
    }
  }

  String _uploadErrorText(Object error) {
    final text = error.toString();
    if (text.contains('401')) return 'Сессия истекла, войдите заново';
    if (text.contains('403')) return 'Нет доступа к инспекционному органу';
    if (text.contains('400')) return 'Проверьте данные инспекции';
    if (text.contains('413')) return 'Файл слишком большой';
    return 'Ошибка загрузки фото';
  }

  Future<void> _pickInspectionDocument(String type, String label) async {
    try {
      final file = kIsWeb
          ? await pickLocalFile(const ['pdf', 'jpg', 'jpeg', 'png'])
          : await _pickPluginFile(const ['pdf', 'jpg', 'jpeg', 'png']);
      if (file == null) {
        if (mounted) setState(() => apiState = 'Документ не выбран');
        return;
      }
      final bytes = file.bytes;
      if (bytes.isEmpty) {
        if (mounted) setState(() => apiState = 'Файл пустой');
        return;
      }
      if (mounted) {
        final position = await _tryCurrentPosition();
        if (!mounted) return;
        final nextDocumentPositions = {...packageDocumentPositions};
        if (position != null) nextDocumentPositions[type] = position;
        setState(() {
          if (position != null) lastKnownInspectionPosition = position;
          packageDocumentNames = {...packageDocumentNames, type: file.name};
          packageDocumentBytes = {...packageDocumentBytes, type: bytes};
          packageDocumentPositions = nextDocumentPositions;
          packageDocumentUploaded = {...packageDocumentUploaded, type: false};
          documentFileName = file.name;
          apiState = position == null
              ? 'Документ выбран. Координаты будут взяты из данных ИО, если браузер их не отдаст.'
              : 'Документ выбран: $label';
        });
      }
    } catch (error) {
      final message = error is StateError
          ? error.message
          : 'Document upload error';
      if (mounted) setState(() => apiState = message);
    }
  }

  Future<String> _ensureInspectionDraft() async {
    final missing = <String>[
      if (ownerName.trim().isEmpty) 'ФИО владельца',
      if (inspectionCertificateNumber.trim().isEmpty) 'номер свидетельства',
      if (ownerAddress.trim().isEmpty) 'адрес проживания клиента',
      if (vehiclePlate.trim().isEmpty) 'госномер',
      if (vehicleVin.trim().isEmpty) 'VIN',
      if (cylinderNumber.trim().isEmpty) 'номер баллона',
      if (cylinderVolume.trim().isEmpty) 'объем баллона',
      if (!const ['СНГ', 'КПГ'].contains(cylinderFuel.trim())) 'вид топлива',
      if (reducerName.trim().isEmpty) 'название редуктора',
      if (controlUnitName.trim().isEmpty)
        'название электронного блока управления',
    ];
    if (missing.isNotEmpty) {
      throw StateError('Заполните: ${missing.join(', ')}');
    }
    final organizationId = await _inspectionOrganizationId();
    final position = await _bestInspectionPosition();
    final certificateNumber = _normalizeCertificateNumber(
      inspectionCertificateNumber,
    );
    if (draftInspectionId != null && draftVehicleId != null) {
      final detail = await repositories.inspections.updateData(
        inspectionId: draftInspectionId!,
        vehicleId: draftVehicleId!,
        certificateNumber: certificateNumber,
      );
      selectedInspection = detail;
      await _loadMyInspections();
      return draftInspectionId!;
    }
    final makeModelParts = vehicleMakeModel.trim().split(RegExp(r'\s+'));
    final make = makeModelParts.isEmpty || makeModelParts.first.isEmpty
        ? 'Не указано'
        : makeModelParts.first;
    final model = makeModelParts.length <= 1
        ? 'Не указано'
        : makeModelParts.sublist(1).join(' ');
    final vehicleId = await repositories.inspections.createVehicle(
      vin: vehicleVin.trim().toUpperCase(),
      plateNumber: vehiclePlate.trim().toUpperCase(),
      make: make,
      model: model,
      year: null,
      ownerPhone:
          '+7000${vehicleVin.trim().hashCode.abs().toString().padLeft(9, '0').substring(0, 9)}',
      ownerName: ownerName.trim().isEmpty ? 'Владелец ТС' : ownerName.trim(),
      ownerIin: '',
      ownerAddress: ownerAddress.trim(),
      cylinderSerial: cylinderNumber.trim(),
      cylinderManufacturer: cylinderMaker.trim().isEmpty
          ? 'Не указано'
          : cylinderMaker.trim(),
      volumeLiters: int.tryParse(cylinderVolume.trim()) ?? 0,
      producedYear: cylinderYear.trim(),
      reducerName: reducerName.trim(),
      controlUnitName: controlUnitName.trim(),
    );
    if (draftInspectionId != null) {
      final detail = await repositories.inspections.updateData(
        inspectionId: draftInspectionId!,
        vehicleId: vehicleId,
        certificateNumber: certificateNumber,
      );
      draftVehicleId = vehicleId;
      selectedInspection = detail;
      await _loadMyInspections();
      return draftInspectionId!;
    }
    final inspectionId = await repositories.inspections.create(
      organizationId,
      vehicleId,
      certificateNumber: certificateNumber,
      lat: position.latitude,
      lng: position.longitude,
    );
    draftVehicleId = vehicleId;
    draftInspectionId = inspectionId;
    await _loadMyInspections();
    return inspectionId;
  }

  Future<void> _submitInspection() async {
    try {
      final missingLocal = <String>[
        if (!cylinderPhotoUploaded && cylinderPhotoBytes == null)
          'фото бирки баллона',
        if (!vehiclePhotoUploaded && vehiclePhotoBytes == null)
          'фото автомобиля',
        if (!techPassportPhotoUploaded && techPassportPhotoBytes == null)
          'фото техпаспорта',
        for (final entry in inspectionPackageDocuments.entries)
          if (packageDocumentUploaded[entry.key] != true &&
              !packageDocumentBytes.containsKey(entry.key))
            entry.value,
      ];
      if (missingLocal.isNotEmpty) {
        setState(() => apiState = 'Не хватает: ${missingLocal.join(', ')}');
        return;
      }
      final inspectionId = await _ensureInspectionDraft();
      setState(() => apiState = 'Загрузка фото и документов');
      await _uploadPendingInspectionFiles(inspectionId);
      final readiness = await repositories.inspections.readiness(inspectionId);
      if (!readiness.ready) {
        final missing = readiness.missing
            .map((item) => inspectionRequiredLabels[item] ?? item)
            .join(', ');
        setState(() => apiState = 'Не хватает: $missing');
        return;
      }
      await repositories.inspections.setStatus(inspectionId, 'submitted');
      await _loadMyInspections();
      if (!mounted) return;
      setState(() {
        apiState = 'Инспекция отправлена';
        draftVehicleId = null;
        draftInspectionId = null;
        protectedInspectionPhotosLocked = false;
      });
      go(14);
    } catch (error) {
      final message = error is StateError
          ? error.message
          : error is ApiException
          ? _inspectionSubmitErrorText(error)
          : 'Ошибка отправки инспекции: ${error.toString()}';
      if (mounted) {
        setState(() => apiState = message);
        _goToMissingInspectionStep(message);
      }
    }
  }

  String _inspectionSubmitErrorText(ApiException error) {
    if (error.statusCode == 401) {
      return 'Сессия истекла. Войдите заново по SMS.';
    }
    if (error.statusCode == 403) {
      if (error.message.contains('leader') ||
          error.message.contains('руковод')) {
        return 'Только руководитель ИО может отправить свидетельство в реестр';
      }
      return 'Нет доступа к этой инспекции';
    }
    final clean = error.message
        .replaceFirst(RegExp(r'^ApiException\(\d+\):\s*'), '')
        .replaceFirst('Exception: ', '')
        .trim();
    if (clean.isEmpty) return 'Ошибка отправки инспекции';
    return clean;
  }

  void _goToMissingInspectionStep(String message) {
    if (message.contains('владель') ||
        message.contains('свидетель') ||
        message.contains('телефон') ||
        message.contains('адрес проживания')) {
      go(15);
      return;
    }
    if (message.contains('госномер') || message.contains('VIN')) {
      go(16);
      return;
    }
    if (message.contains('баллон') ||
        message.contains('редуктор') ||
        message.contains('электронного блока')) {
      go(17);
      return;
    }
    if (message.contains('фото бирки')) go(18);
    if (message.contains('фото автомобиля')) go(19);
    if (message.contains('техпаспорта')) go(20);
  }

  Future<void> _uploadPendingInspectionFiles(String inspectionId) async {
    Future<void> uploadPhotoIfNeeded({
      required String kind,
      required String? filename,
      required List<int>? bytes,
      required Position? position,
      required bool uploaded,
    }) async {
      if (uploaded || filename == null || bytes == null) return;
      await repositories.inspections.uploadPhoto(
        inspectionId: inspectionId,
        type: _inspectionPhotoType(kind),
        filename: filename,
        bytes: bytes,
        lat: position?.latitude,
        lng: position?.longitude,
      );
      if (!mounted) return;
      setState(() {
        if (kind == 'cylinder') cylinderPhotoUploaded = true;
        if (kind == 'vehicle') vehiclePhotoUploaded = true;
        if (kind == 'tech_passport') techPassportPhotoUploaded = true;
      });
    }

    await uploadPhotoIfNeeded(
      kind: 'cylinder',
      filename: cylinderPhotoName,
      bytes: cylinderPhotoBytes,
      position: cylinderPhotoPosition,
      uploaded: cylinderPhotoUploaded,
    );
    await uploadPhotoIfNeeded(
      kind: 'vehicle',
      filename: vehiclePhotoName,
      bytes: vehiclePhotoBytes,
      position: vehiclePhotoPosition,
      uploaded: vehiclePhotoUploaded,
    );
    await uploadPhotoIfNeeded(
      kind: 'tech_passport',
      filename: techPassportPhotoName,
      bytes: techPassportPhotoBytes,
      position: techPassportPhotoPosition,
      uploaded: techPassportPhotoUploaded,
    );

    for (final entry in packageDocumentBytes.entries) {
      if (packageDocumentUploaded[entry.key] == true) continue;
      await repositories.inspections.uploadPhoto(
        inspectionId: inspectionId,
        type: entry.key,
        filename: packageDocumentNames[entry.key] ?? entry.key,
        bytes: entry.value,
        lat: packageDocumentPositions[entry.key]?.latitude,
        lng: packageDocumentPositions[entry.key]?.longitude,
      );
      if (!mounted) return;
      setState(() {
        packageDocumentUploaded = {...packageDocumentUploaded, entry.key: true};
      });
    }
  }

  Future<void> _approveInspectionToRegistry(
    InspectionSummary inspection,
  ) async {
    if (!_isInspectionManager) {
      setState(() => apiState = 'Только руководитель ИО отправляет в реестр');
      return;
    }
    try {
      await repositories.inspections.setStatus(inspection.id, 'approved');
      await _loadMyInspections();
      if (!mounted) return;
      setState(() => apiState = 'Свидетельство отправлено в реестр');
    } catch (error) {
      if (!mounted) return;
      setState(() => apiState = _apiErrorText(error.toString()));
    }
  }

  Future<void> _returnInspectionForCorrection(
    InspectionSummary inspection,
  ) async {
    if (!_isInspectionManager) {
      setState(
        () => apiState = 'Только руководитель ИО возвращает на исправление',
      );
      return;
    }
    try {
      await repositories.inspections.setStatus(inspection.id, 'rejected');
      await _loadMyInspections();
      if (!mounted) return;
      setState(
        () => apiState = 'Инспекция отправлена инспектору на исправление',
      );
      go(14);
    } catch (error) {
      if (mounted) setState(() => apiState = _apiErrorText(error.toString()));
    }
  }

  Future<String> _inspectionOrganizationId() async {
    if (organizations.isEmpty) {
      organizations = await repositories.organizations.list(type: _roleCode);
    }
    final bin = authBin.trim();
    final exact = organizations.where((item) => item.bin == bin);
    final own = exact.isNotEmpty
        ? exact.first
        : organizations.firstWhere(
            (item) => item.type == _roleCode && item.id.isNotEmpty,
            orElse: () => organizations.first,
          );
    if (own.id.isEmpty) throw StateError('Organization not found');
    return own.id;
  }

  String _inspectionPhotoType(String kind) {
    return switch (kind) {
      'cylinder' => 'cylinder_label',
      'vehicle' => 'vehicle_photo',
      'tech_passport' => 'tech_passport',
      _ => 'photo',
    };
  }

  Future<void> _goOwnerNext() async {
    final missing = <String>[
      if (ownerName.trim().isEmpty) 'ФИО владельца',
      if (inspectionCertificateNumber.trim().isEmpty) 'номер свидетельства',
    ];
    if (missing.isNotEmpty) {
      setState(() => apiState = 'Заполните: ${missing.join(', ')}');
      return;
    }
    final number = _normalizeCertificateNumber(inspectionCertificateNumber);
    setState(() => apiState = 'Проверка номера свидетельства');
    try {
      final available = await repositories.inspections
          .isCertificateNumberAvailable(number);
      if (!available) {
        if (mounted) {
          setState(
            () => apiState = 'Свидетельство с таким номером уже есть в системе',
          );
        }
        return;
      }
      if (!mounted) return;
      setState(() => apiState = '');
      go(16);
    } catch (_) {
      if (mounted) setState(() => apiState = 'Ошибка проверки номера');
    }
  }

  void _goVehicleNext() {
    final missing = <String>[
      if (vehiclePlate.trim().isEmpty) 'госномер',
      if (vehicleVin.trim().isEmpty) 'VIN',
    ];
    if (missing.isNotEmpty) {
      setState(() => apiState = 'Заполните: ${missing.join(', ')}');
      return;
    }
    go(17);
  }

  Future<void> _goCylinderNext() async {
    final missing = <String>[
      if (cylinderNumber.trim().isEmpty) 'номер баллона',
      if (cylinderVolume.trim().isEmpty) 'объем баллона',
      if (reducerName.trim().isEmpty) 'название редуктора',
      if (controlUnitName.trim().isEmpty)
        'название электронного блока управления',
    ];
    if (missing.isNotEmpty) {
      setState(() => apiState = 'Заполните: ${missing.join(', ')}');
      return;
    }
    setState(() => apiState = '');
    go(18);
  }

  void _startNewInspection() {
    setState(() {
      draftVehicleId = null;
      draftInspectionId = null;
      inspectionCertificateNumber = '';
      ownerId = '';
      ownerName = '';
      ownerPhone = '';
      ownerAddress = '';
      ownerKind = 'Физлицо';
      inspectionIssuedAt = _todayIsoDate();
      vehiclePlate = '';
      vehicleVin = '';
      vehicleMakeModel = '';
      vehicleYear = '';
      vehicleColor = '';
      cylinderNumber = '';
      cylinderMaker = '';
      cylinderVolume = '';
      cylinderYear = '';
      cylinderFuel = '';
      reducerName = '';
      controlUnitName = '';
      cylinderShape = 'Тороидальный';
      cylinderPhotoName = null;
      cylinderPhotoBytes = null;
      cylinderPhotoPosition = null;
      cylinderPhotoUploaded = false;
      vehiclePhotoName = null;
      vehiclePhotoBytes = null;
      vehiclePhotoPosition = null;
      vehiclePhotoUploaded = false;
      techPassportPhotoName = null;
      techPassportPhotoBytes = null;
      techPassportPhotoPosition = null;
      techPassportPhotoUploaded = false;
      documentFileName = null;
      packageDocumentNames = const {};
      packageDocumentBytes = const {};
      packageDocumentPositions = const {};
      packageDocumentUploaded = const {};
      protectedInspectionPhotosLocked = false;
    });
    go(15);
  }

  String get _roleCode {
    if (role.startsWith('Проверка')) return 'public_check';
    if (role.startsWith('Инсп')) return 'inspection_org';
    if (role.startsWith('Оператор')) return 'operator';
    if (role.startsWith('НЦА')) return 'nca';
    if (role.startsWith('Контроль')) return 'nca';
    if (role.startsWith('Гос')) return 'government';
    return 'public_check';
  }

  void go(int index) {
    final target = index.clamp(0, 40);
    if (target == screen) return;
    setState(() {
      _history.add(screen);
      screen = target;
    });
  }

  bool _isAuthScreen(int index) => index >= 0 && index <= 3;

  bool get _hasEnteredMainFlow =>
      screen >= 4 || currentUser != null || _history.any((item) => item >= 4);

  bool _canReturnTo(int index) {
    if (_hasEnteredMainFlow && _isAuthScreen(index)) return false;
    return true;
  }

  bool get _canGoBackNow {
    final home = _homeScreenForRoleCode(_roleCode);
    return _history.any(_canReturnTo) ||
        (_hasEnteredMainFlow && screen != home && !_isAuthScreen(screen));
  }

  void back() {
    final home = _homeScreenForRoleCode(_roleCode);
    while (_history.isNotEmpty) {
      final previous = _history.removeLast();
      if (!_canReturnTo(previous)) continue;
      setState(() => screen = previous);
      return;
    }
    if (_hasEnteredMainFlow && screen != home && !_isAuthScreen(screen)) {
      setState(() => screen = home);
    }
  }

  void next() => go(screen + 1);

  Future<void> _openInspectionDetail(InspectionSummary inspection) async {
    if (inspection.status == 'draft' || inspection.status == 'rejected') {
      await _continueInspectionDraft(inspection);
      return;
    }
    setState(() => apiState = 'Загрузка инспекции');
    try {
      final detail = await repositories.inspections.detail(inspection.id);
      if (!mounted) return;
      setState(() {
        selectedInspection = detail;
        apiState = 'Инспекция загружена';
      });
      go(40);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        selectedInspection = inspection;
        apiState = 'Inspection API error';
      });
      go(40);
    }
  }

  Future<void> _continueInspectionDraft(
    InspectionSummary inspection, {
    bool forceDataStep = false,
    bool lockProtectedPhotos = false,
  }) async {
    setState(() => apiState = 'Загрузка черновика');
    try {
      final detail = await repositories.inspections.detail(inspection.id);
      if (!mounted) return;
      final fileTypes = detail.files.map((file) => file.type).toSet();
      final packageUploaded = <String, bool>{
        for (final type in inspectionPackageDocuments.keys)
          type: fileTypes.contains(type),
      };
      final packageNames = <String, String>{
        for (final file in detail.files)
          if (inspectionPackageDocuments.containsKey(file.type))
            file.type: inspectionRequiredLabels[file.type] ?? file.type,
      };
      setState(() {
        selectedInspection = detail;
        draftInspectionId = detail.id;
        draftVehicleId = null;
        inspectionCertificateNumber = detail.certificateNumber;
        ownerId = detail.ownerIin;
        ownerName = detail.ownerName;
        ownerPhone = detail.ownerPhone;
        ownerAddress = detail.ownerAddress;
        inspectionIssuedAt = detail.certificateIssuedAt.isNotEmpty
            ? detail.certificateIssuedAt
            : detail.createdAt.isNotEmpty
            ? detail.createdAt
            : _todayIsoDate();
        vehiclePlate = detail.vehiclePlate;
        vehicleVin = detail.vehicleVin;
        vehicleMakeModel = detail.vehicleName;
        vehicleYear = detail.vehicleYear;
        cylinderNumber = detail.cylinderSerial;
        cylinderMaker = detail.cylinderManufacturer;
        cylinderVolume = detail.cylinderVolume;
        reducerName = detail.reducerName;
        controlUnitName = detail.controlUnitName;
        cylinderYear = detail.cylinderProducedAt.split('-').first;
        cylinderPhotoUploaded = fileTypes.contains('cylinder_label');
        vehiclePhotoUploaded = fileTypes.contains('vehicle_photo');
        techPassportPhotoUploaded = fileTypes.contains('tech_passport');
        packageDocumentUploaded = packageUploaded;
        packageDocumentNames = packageNames;
        protectedInspectionPhotosLocked = lockProtectedPhotos;
        apiState = 'Черновик открыт';
      });
      if (forceDataStep) {
        go(15);
      } else if (!cylinderPhotoUploaded) {
        go(18);
      } else if (!vehiclePhotoUploaded) {
        go(19);
      } else if (!techPassportPhotoUploaded) {
        go(20);
      } else if (!inspectionPackageDocuments.keys.every(fileTypes.contains)) {
        go(22);
      } else {
        go(23);
      }
    } catch (_) {
      if (mounted) setState(() => apiState = 'Ошибка открытия черновика');
    }
  }

  Future<void> _logout() async {
    await repositories.auth.logout();
    if (!mounted) return;
    setState(() {
      currentUser = null;
      role = 'Проверка свидетельства';
      authPhone = '+7';
      authBin = '';
      smsCode = '';
      visibleOtpCode = null;
      myInspections = const [];
      selectedEmployee = null;
      employeeActivityDateFrom = '';
      employeeActivityDateTo = '';
      _history.clear();
      screen = 0;
      apiState = 'Вы вышли из аккаунта';
    });
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) back();
      },
      child: Scaffold(
        resizeToAvoidBottomInset: true,
        backgroundColor: const Color(0xFFEFF7F3),
        body: Center(
          child: DesignFrame(
            child: _NavScope(
              go: go,
              back: back,
              canGoBack: _canGoBackNow,
              publicMode: _roleCode == 'public_check',
              homeScreen: _homeScreenForRoleCode(_roleCode),
              child: Stack(
                children: [
                  Positioned.fill(
                    child: KeyedSubtree(
                      key: ValueKey('ersi-screen-$screen'),
                      child: _buildScreen(),
                    ),
                  ),
                  if (widget.showStepper)
                    Positioned(
                      right: 12,
                      top: 6,
                      child: _ScreenStepper(
                        index: screen,
                        onPrev: () => go(screen - 1),
                        onNext: () => go(screen + 1),
                      ),
                    ),
                  if (!AppEnvironment.isDemo &&
                      _AppAlertBanner.shouldShow(apiState))
                    Positioned(
                      left: 18,
                      right: 18,
                      top: 16,
                      child: _AppAlertBanner(
                        text: apiState,
                        onClose: () => setState(() => apiState = ''),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildScreen() {
    if (bootstrapping && widget.initialScreen == 0) {
      return const _SessionLoading();
    }
    return switch (screen) {
      0 => _Splash(
        legalTitle: legalTitle,
        legalExcerpt: legalExcerpt,
        legalBody: legalBody,
        onObserver: () {
          setState(() => role = 'Проверка свидетельства');
          go(4);
        },
        onActivity: () => go(1),
      ),
      1 => _RoleSelect(
        selected: role,
        onRole: (value) {
          setState(() => role = value);
          if (value == 'Проверка свидетельства') go(4);
        },
        onNext: () => go(2),
      ),
      2 => _Login(
        role: role,
        phone: authPhone,
        bin: authBin,
        onPhone: (value) => setState(() => authPhone = value),
        onBin: (value) => setState(() => authBin = value),
        onLogin: _sendOtp,
        isLoading: sendingOtp,
      ),
      3 => _SmsScreen(
        phone: authPhone,
        visibleCode: visibleOtpCode,
        onCode: (value) => setState(() => smsCode = value),
        onConfirm: _confirmOtp,
        onChangePhone: () => go(2),
      ),
      4 => _UserHome(
        go: go,
        banners: banners,
        plateNumber: publicPlateNumber,
        vinLast3: publicVinLast3,
        result: publicCertificateResult,
        searched: publicCertificateSearched,
        checking: publicCertificateChecking,
        onPlateNumber: (value) => setState(() {
          publicPlateNumber = value;
          publicCertificateSearched = false;
          publicCertificateChecking = false;
          publicCertificateResult = null;
        }),
        onVinLast3: (value) => setState(() {
          publicVinLast3 = value;
          publicCertificateSearched = false;
          publicCertificateChecking = false;
          publicCertificateResult = null;
        }),
        onSearch: _publicCertificateCheck,
      ),
      5 => _SearchVin(
        value: vinQuery,
        onChanged: (value) => setState(() => vinQuery = value),
        onSearch: () => _searchRegistry(vinQuery),
      ),
      6 => _SearchBin(
        value: vinQuery,
        onChanged: (value) => setState(() => vinQuery = value),
        onSearch: () => _searchRegistry(vinQuery),
      ),
      7 => _Results(
        query: lastSearchQuery,
        results: registryResults,
        onOpen: (vehicle) {
          setState(() => selectedRegistryVehicle = vehicle);
          go(8);
        },
      ),
      8 => _Certificate(
        go: go,
        vehicle:
            publicCertificateResult ??
            selectedRegistryVehicle ??
            (registryResults.isEmpty ? null : registryResults.first),
      ),
      9 => _DocumentView(
        vehicle:
            publicCertificateResult ??
            selectedRegistryVehicle ??
            (registryResults.isEmpty ? null : registryResults.first),
      ),
      10 => _LawInfo(title: legalTitle, excerpt: legalExcerpt, body: legalBody),
      11 => _OrgMap(
        go: go,
        organizations: organizations,
        certificates: controlCertificates,
        onReload: _loadOrganizations,
        onOpenCertificate: _openControlCertificate,
        onOpenOrganization: _trackOrganizationView,
      ),
      12 => _InspectionOrgCard(go: go),
      13 => _InstallerCard(go: go),
      14 => _InspectorHome(
        go: go,
        inspections: myInspections,
        organization: _currentInspectionOrganization,
        isManager: _isInspectionManager,
        onReload: _loadMyInspections,
        onNewInspection: _startNewInspection,
        onImportXlsx: _pickImportXlsx,
        onOpenInspection: _openInspectionDetail,
      ),
      15 => _OwnerStep(
        certificateNumber: inspectionCertificateNumber,
        ownerName: ownerName,
        ownerAddress: ownerAddress,
        ownerKind: ownerKind,
        onCertificateNumber: (value) => setState(
          () =>
              inspectionCertificateNumber = _normalizeCertificateNumber(value),
        ),
        onOwnerKind: (value) => setState(() => ownerKind = value),
        onOwnerName: (value) => setState(() => ownerName = value),
        onOwnerAddress: (value) => setState(() => ownerAddress = value),
        onNext: _goOwnerNext,
      ),
      16 => _VehicleStep(
        plate: vehiclePlate,
        vin: vehicleVin,
        makeModel: vehicleMakeModel,
        onPlate: (value) => setState(() => vehiclePlate = value.toUpperCase()),
        onVin: (value) => setState(() => vehicleVin = value.toUpperCase()),
        onMakeModel: (value) => setState(() => vehicleMakeModel = value),
        onNext: _goVehicleNext,
      ),
      17 => _CylinderStep(
        number: cylinderNumber,
        maker: cylinderMaker,
        volume: cylinderVolume,
        year: cylinderYear,
        fuel: cylinderFuel,
        reducerName: reducerName,
        controlUnitName: controlUnitName,
        reducerOptions: reducerOptions,
        controlUnitOptions: controlUnitOptions,
        makerOptions: cylinderMakerOptions,
        shape: cylinderShape,
        onNumber: (value) => setState(() => cylinderNumber = value),
        onMaker: (value) => setState(() => cylinderMaker = value),
        onVolume: (value) => setState(() => cylinderVolume = value),
        onYear: (value) => setState(() => cylinderYear = value),
        onFuel: (value) => setState(() => cylinderFuel = value),
        onReducerName: (value) => setState(() => reducerName = value),
        onControlUnitName: (value) => setState(() => controlUnitName = value),
        onShape: (value) => setState(() => cylinderShape = value),
        onNext: _goCylinderNext,
      ),
      18 => _PhotoStep(
        step: 4,
        title: 'Фото бирки баллона',
        caption: 'Поместите бирку в рамку',
        photoName: cylinderPhotoName,
        photoBytes: cylinderPhotoBytes,
        uploaded: cylinderPhotoUploaded,
        locked: protectedInspectionPhotosLocked && cylinderPhotoUploaded,
        onCamera: () => _captureInspectionPhoto('cylinder'),
        onNext: () => go(19),
      ),
      19 => _PhotoStep(
        step: 5,
        title: 'Фото автомобиля',
        caption: 'Сфотографируйте автомобиль целиком',
        photoName: vehiclePhotoName,
        photoBytes: vehiclePhotoBytes,
        uploaded: vehiclePhotoUploaded,
        locked: protectedInspectionPhotosLocked && vehiclePhotoUploaded,
        onCamera: () => _captureInspectionPhoto('vehicle'),
        onNext: () => go(20),
      ),
      20 => _PhotoStep(
        step: 6,
        title: 'Фото техпаспорта',
        caption: 'Лицевая сторона',
        photoName: techPassportPhotoName,
        photoBytes: techPassportPhotoBytes,
        uploaded: techPassportPhotoUploaded,
        locked: protectedInspectionPhotosLocked && techPassportPhotoUploaded,
        onCamera: () => _captureInspectionPhoto('tech_passport'),
        onNext: () => go(21),
      ),
      21 => _ValidityStep(
        issuedAt: inspectionIssuedAt,
        validUntil: _plusYearsIso(inspectionIssuedAt, 2),
        onNext: () => go(22),
      ),
      22 => _DocumentScanStep(
        names: packageDocumentNames,
        uploaded: packageDocumentUploaded,
        onUpload: _pickInspectionDocument,
        onNext: () => go(23),
      ),
      23 => _ReviewStep(onSubmit: _submitInspection),
      24 => _InspectorHome(
        go: go,
        inspections: myInspections,
        organization: _currentInspectionOrganization,
        isManager: _isInspectionManager,
        onReload: _loadMyInspections,
        onNewInspection: _startNewInspection,
        onImportXlsx: _pickImportXlsx,
        onOpenInspection: _openInspectionDetail,
      ),
      25 => _InspectorHome(
        go: go,
        inspections: myInspections,
        organization: _currentInspectionOrganization,
        isManager: _isInspectionManager,
        onReload: _loadMyInspections,
        onNewInspection: _startNewInspection,
        onImportXlsx: _pickImportXlsx,
        onOpenInspection: _openInspectionDetail,
      ),
      26 => _InspectorHome(
        go: go,
        inspections: myInspections,
        organization: _currentInspectionOrganization,
        isManager: _isInspectionManager,
        onReload: _loadMyInspections,
        onNewInspection: _startNewInspection,
        onImportXlsx: _pickImportXlsx,
        onOpenInspection: _openInspectionDetail,
      ),
      27 => _InspectorHome(
        go: go,
        inspections: myInspections,
        organization: _currentInspectionOrganization,
        isManager: _isInspectionManager,
        onReload: _loadMyInspections,
        onNewInspection: _startNewInspection,
        onImportXlsx: _pickImportXlsx,
        onOpenInspection: _openInspectionDetail,
      ),
      28 => _OperatorHome(go: go),
      29 => _VideoCenter(go: go),
      30 => _LiveCamera(),
      31 => _CameraApi(),
      32 => _VideoAudit(),
      33 => _ManageInspectors(go: go),
      34 => _BlockInspector(),
      35 => _Promotion(
        promoted: promoted,
        onChanged: (value) => setState(() => promoted = value),
      ),
      36 => _GovHome(
        go: go,
        certificates: controlCertificates,
        onReload: _loadControlCertificates,
      ),
      37 => _GovRegistry(
        go: go,
        certificates: controlCertificates,
        plateNumber: controlPlateNumber,
        vinLast3: controlVinLast3,
        dateFrom: controlDateFrom,
        dateTo: controlDateTo,
        onPlateNumber: (value) => setState(() => controlPlateNumber = value),
        onVinLast3: (value) => setState(() => controlVinLast3 = value),
        onDateFrom: (value) => setState(() => controlDateFrom = value),
        onDateTo: (value) => setState(() => controlDateTo = value),
        onSearch: _searchControlCertificates,
        onClear: _clearControlCertificateFilters,
        onReload: _loadControlCertificates,
        onOpen: _openControlCertificate,
      ),
      38 => _Notifications(
        go: go,
        notifications: notifications,
        onReload: _loadNotifications,
        onOpen: _openNotification,
      ),
      39 => _ProfileSecurity(
        go: go,
        onLogout: _logout,
        user: currentUser,
        roleLabel: role,
        history: viewHistory,
        inspectionOrganization: _currentInspectionOrganization,
        inspections: myInspections,
        isInspectionManager: _isInspectionManager,
        selectedEmployee: selectedEmployee,
        employeeActivityDateFrom: employeeActivityDateFrom,
        employeeActivityDateTo: employeeActivityDateTo,
        onSelectEmployee: (employee) =>
            setState(() => selectedEmployee = employee),
        onCloseEmployee: () => setState(() => selectedEmployee = null),
        onEmployeeDateFrom: (value) =>
            setState(() => employeeActivityDateFrom = value),
        onEmployeeDateTo: (value) =>
            setState(() => employeeActivityDateTo = value),
        onReloadHistory: _loadViewHistory,
        language: language,
        onLanguage: (value) => setState(() => language = value),
      ),
      _ => _InspectionDetailScreen(
        inspection: selectedInspection,
        canApprove:
            _isInspectionManager && selectedInspection?.status == 'submitted',
        canEdit:
            _isInspectionManager && selectedInspection?.status == 'submitted',
        onApprove: selectedInspection == null
            ? null
            : () => _approveInspectionToRegistry(selectedInspection!),
        onEdit: selectedInspection == null
            ? null
            : () => _continueInspectionDraft(
                selectedInspection!,
                forceDataStep: true,
                lockProtectedPhotos: true,
              ),
        onReturnForCorrection: selectedInspection == null
            ? null
            : () => _returnInspectionForCorrection(selectedInspection!),
      ),
    };
  }
}

class _NavScope extends InheritedWidget {
  const _NavScope({
    required this.go,
    required this.back,
    required this.canGoBack,
    required this.publicMode,
    required this.homeScreen,
    required super.child,
  });

  final void Function(int) go;
  final VoidCallback back;
  final bool canGoBack;
  final bool publicMode;
  final int homeScreen;

  static void Function(int)? maybeOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<_NavScope>()?.go;
  }

  static VoidCallback? backOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<_NavScope>()?.back;
  }

  static bool canGoBackOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<_NavScope>()?.canGoBack ??
        false;
  }

  static bool publicModeOf(BuildContext context) {
    return context
            .dependOnInheritedWidgetOfExactType<_NavScope>()
            ?.publicMode ??
        false;
  }

  static int homeScreenOf(BuildContext context) {
    return context
            .dependOnInheritedWidgetOfExactType<_NavScope>()
            ?.homeScreen ??
        4;
  }

  @override
  bool updateShouldNotify(_NavScope oldWidget) =>
      go != oldWidget.go ||
      back != oldWidget.back ||
      canGoBack != oldWidget.canGoBack ||
      publicMode != oldWidget.publicMode ||
      homeScreen != oldWidget.homeScreen;
}

class DesignFrame extends StatelessWidget {
  const DesignFrame({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isDesktop = constraints.maxWidth >= 900;
        final app = SizedBox(
          width: constraints.maxWidth,
          height: constraints.maxHeight,
          child: DecoratedBox(
            decoration: const BoxDecoration(color: mint),
            child: child,
          ),
        );

        if (isDesktop) {
          return DecoratedBox(
            decoration: const BoxDecoration(color: Color(0xFFEFF7F3)),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1180),
                child: app,
              ),
            ),
          );
        }

        return SizedBox(
          width: constraints.maxWidth,
          height: constraints.maxHeight,
          child: app,
        );
      },
    );
  }
}

class _ScreenStepper extends StatelessWidget {
  const _ScreenStepper({
    required this.index,
    required this.onPrev,
    required this.onNext,
  });

  final int index;
  final VoidCallback onPrev;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.88),
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [BoxShadow(color: Color(0x1A00351F), blurRadius: 12)],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: index == 0 ? null : onPrev,
            icon: const Icon(Icons.chevron_left, size: 18),
          ),
          Text(
            '${index + 1}/${screenTitles.length}',
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: index == screenTitles.length - 1 ? null : onNext,
            icon: const Icon(Icons.chevron_right, size: 18),
          ),
        ],
      ),
    );
  }
}

enum _AlertTone { success, warning, error, loading }

class _AppAlertBanner extends StatelessWidget {
  const _AppAlertBanner({required this.text, required this.onClose});

  final String text;
  final VoidCallback onClose;

  static bool shouldShow(String text) {
    final value = text.trim();
    if (value.isEmpty) return false;
    final normalized = value.toLowerCase();
    const routine = {
      'api connecting',
      'organizations loaded',
      'инспекции загружены',
      'реестр загружен',
      'уведомления загружены',
      'история загружена',
      'registry loaded',
      'session restored',
      'demo data',
    };
    return !routine.contains(normalized);
  }

  @override
  Widget build(BuildContext context) {
    final tone = _toneFor(text);
    final color = _colorFor(tone);
    final icon = _iconFor(tone);
    final title = _titleFor(tone, text);
    final body = _messageFor(text);
    return Material(
      color: Colors.transparent,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 460),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.98),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: color.withValues(alpha: 0.22)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x22002F22),
              blurRadius: 24,
              offset: Offset(0, 12),
            ),
          ],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: color,
                      fontSize: 13,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    body,
                    maxLines: 4,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: ink,
                      fontSize: 12,
                      height: 1.25,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: onClose,
              child: const Padding(
                padding: EdgeInsets.all(4),
                child: Icon(Icons.close_rounded, color: muted, size: 18),
              ),
            ),
          ],
        ),
      ),
    );
  }

  _AlertTone _toneFor(String value) {
    final lower = value.toLowerCase();
    if (lower.contains('загрузка') ||
        lower.contains('поиск') ||
        lower.contains('проверка') ||
        lower.contains('loading')) {
      return _AlertTone.loading;
    }
    if (lower.contains('ошибка') ||
        lower.contains('error') ||
        lower.contains('offline') ||
        lower.contains('недоступ') ||
        lower.contains('не удалось')) {
      return _AlertTone.error;
    }
    if (lower.contains('введите') ||
        lower.contains('заполните') ||
        lower.contains('не хватает') ||
        lower.contains('не найден') ||
        lower.contains('уже есть') ||
        lower.contains('только') ||
        lower.contains('разрешите') ||
        lower.contains('включите')) {
      return _AlertTone.warning;
    }
    return _AlertTone.success;
  }

  Color _colorFor(_AlertTone tone) => switch (tone) {
    _AlertTone.error => danger,
    _AlertTone.warning => warn,
    _AlertTone.loading => green,
    _AlertTone.success => green,
  };

  IconData _iconFor(_AlertTone tone) => switch (tone) {
    _AlertTone.error => Icons.error_outline_rounded,
    _AlertTone.warning => Icons.info_outline_rounded,
    _AlertTone.loading => Icons.sync_rounded,
    _AlertTone.success => Icons.check_circle_outline_rounded,
  };

  String _titleFor(_AlertTone tone, String value) {
    final lower = value.toLowerCase();
    if (lower.contains('sms') || lower.contains('код')) return 'SMS';
    return switch (tone) {
      _AlertTone.error => 'Не удалось выполнить действие',
      _AlertTone.warning => 'Проверьте данные',
      _AlertTone.loading => 'Выполняется действие',
      _AlertTone.success => 'Готово',
    };
  }

  String _messageFor(String value) {
    return switch (value.trim()) {
      'SMS sent' => 'SMS-код отправлен. Введите код для входа.',
      'Authorized' => 'Вход выполнен.',
      'API offline' =>
        'Сервер сейчас недоступен. Проверьте подключение и попробуйте ещё раз.',
      'SMS API error' =>
        'Не удалось отправить SMS. Проверьте номер и попробуйте ещё раз.',
      'Login API error' =>
        'Не удалось выполнить вход. Проверьте SMS-код и данные организации.',
      'Registry API error' =>
        'Не удалось загрузить реестр. Попробуйте ещё раз.',
      'Inspection API error' =>
        'Не удалось открыть инспекцию. Попробуйте ещё раз.',
      _ => value,
    };
  }
}

class _AppScreen extends StatelessWidget {
  const _AppScreen({
    required this.title,
    required this.subtitle,
    required this.child,
    this.showNav = true,
    this.activeNav = 0,
    this.go,
    this.action,
    this.leadingBack = false,
    this.paymentNav = false,
    this.videoNav = false,
  });

  final String title;
  final String subtitle;
  final Widget child;
  final bool showNav;
  final int activeNav;
  final void Function(int)? go;
  final Widget? action;
  final bool leadingBack;
  final bool paymentNav;
  final bool videoNav;

  @override
  Widget build(BuildContext context) {
    final metrics = ResponsiveMetrics.of(context);
    final body = Column(
      children: [
        _Header(
          title: title,
          subtitle: subtitle,
          action: action,
          leadingBack: leadingBack,
        ),
        Expanded(
          child: SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: EdgeInsets.fromLTRB(
              metrics.pagePadding,
              metrics.gapS,
              metrics.pagePadding,
              metrics.gapL,
            ),
            child: child,
          ),
        ),
        if (showNav)
          _BottomNav(
            active: activeNav,
            go: go,
            paymentMode: paymentNav,
            videoMode: videoNav,
          ),
      ],
    );
    return Stack(
      children: [
        const Positioned.fill(child: _EcoBackground()),
        SafeArea(child: body),
      ],
    );
  }
}

class _EcoBackground extends StatelessWidget {
  const _EcoBackground();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: mint,
      child: Stack(
        children: [
          Positioned(right: -56, top: -52, child: _Circle(162, mintDeep)),
          Positioned(
            left: -170,
            top: 188,
            child: _Circle(360, Color(0x0D007A4D)),
          ),
          Positioned(
            right: -140,
            bottom: 210,
            child: _Circle(320, Color(0x10007A4D)),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.title,
    required this.subtitle,
    this.action,
    this.leadingBack = false,
  });
  final String title;
  final String subtitle;
  final Widget? action;
  final bool leadingBack;

  @override
  Widget build(BuildContext context) {
    final metrics = ResponsiveMetrics.of(context);
    final canGoBack = leadingBack || _NavScope.canGoBackOf(context);
    final back = _NavScope.backOf(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        metrics.pagePadding,
        metrics.isCompact ? 8 : 12,
        metrics.pagePadding,
        metrics.isCompact ? 8 : 10,
      ),
      child: _Card(
        elevated: true,
        color: Colors.white,
        padding: EdgeInsets.symmetric(
          horizontal: metrics.isCompact ? 14 : 18,
          vertical: metrics.headerPaddingY,
        ),
        child: Row(
          children: [
            if (canGoBack)
              InkWell(
                onTap: back,
                borderRadius: BorderRadius.circular(21),
                child: Container(
                  width: 42,
                  height: 42,
                  decoration: const BoxDecoration(
                    color: softGreen,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.chevron_left_rounded,
                    color: green,
                    size: 30,
                  ),
                ),
              )
            else
              const _MiniLogo(size: 42),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: metrics.isCompact ? 2 : 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: ink,
                      fontSize: metrics.isCompact
                          ? (title.length > 24 ? 16 : 19)
                          : (title.length > 26 ? 17 : 21),
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: muted,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            ?action,
          ],
        ),
      ),
    );
  }
}

class _HeaderIconAction extends StatelessWidget {
  const _HeaderIconAction({required this.icon, required this.onPressed});
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(21),
      child: Container(
        width: 42,
        height: 42,
        decoration: const BoxDecoration(
          color: softGreen,
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: green, size: 22),
      ),
    );
  }
}

class _BottomNav extends StatelessWidget {
  const _BottomNav({
    required this.active,
    this.go,
    this.paymentMode = false,
    this.videoMode = false,
  });
  final int active;
  final void Function(int)? go;
  final bool paymentMode;
  final bool videoMode;

  @override
  Widget build(BuildContext context) {
    final metrics = ResponsiveMetrics.of(context);
    final navigate = go ?? _NavScope.maybeOf(context);
    final homeScreen = _NavScope.homeScreenOf(context);
    final publicMode = _NavScope.publicModeOf(context);
    final iconBox = metrics.isCompact ? 38.0 : 44.0;
    final navIconSize = metrics.isCompact ? 20.0 : 22.0;
    final items = publicMode
        ? [
            (Icons.home_rounded, 'Главная', homeScreen),
            (Icons.map_rounded, 'Карта', 11),
            (Icons.gavel_rounded, 'Закон', 10),
          ]
        : paymentMode
        ? [
            (Icons.home_rounded, 'Главная', homeScreen),
            (Icons.receipt_long_rounded, 'Новая', 15),
            (Icons.camera_alt_rounded, 'Камеры', 29),
            (Icons.person_rounded, 'Профиль', 39),
          ]
        : videoMode
        ? [
            (Icons.home_rounded, 'Обзор', 28),
            (Icons.videocam_rounded, 'Видео', 29),
            (Icons.person_rounded, 'Агенты', 33),
            (Icons.share_rounded, 'API', 31),
            (Icons.person_rounded, 'Профиль', 39),
          ]
        : [
            (Icons.home_rounded, 'Главная', homeScreen),
            (Icons.search_rounded, 'Поиск', 5),
            (Icons.map_rounded, 'Карта', 11),
            (Icons.notifications_rounded, 'Увед.', 38),
            (Icons.person_rounded, 'Профиль', 39),
          ];
    return Container(
      height: metrics.bottomNavHeight,
      margin: EdgeInsets.fromLTRB(
        metrics.isCompact ? 10 : 16,
        0,
        metrics.isCompact ? 10 : 16,
        metrics.bottomNavMargin,
      ),
      padding: EdgeInsets.symmetric(
        horizontal: metrics.isCompact ? 8 : 16,
        vertical: metrics.isCompact ? 4 : 7,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A00351F),
            blurRadius: 22,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          for (var i = 0; i < items.length; i++)
            Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(18),
                onTap: () => navigate?.call(items[i].$3),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Center(
                      child: Container(
                        width: iconBox,
                        height: iconBox,
                        decoration: BoxDecoration(
                          color: active == i ? green : Colors.transparent,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Icon(
                          items[i].$1,
                          color: active == i ? Colors.white : muted,
                          size: navIconSize,
                        ),
                      ),
                    ),
                    SizedBox(height: metrics.isCompact ? 1 : 2),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        items[i].$2,
                        maxLines: 1,
                        style: TextStyle(
                          color: active == i ? green : muted,
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash({
    required this.legalTitle,
    required this.legalExcerpt,
    required this.legalBody,
    required this.onObserver,
    required this.onActivity,
  });
  final String legalTitle;
  final String legalExcerpt;
  final String legalBody;
  final VoidCallback onObserver;
  final VoidCallback onActivity;

  @override
  Widget build(BuildContext context) {
    final metrics = ResponsiveMetrics.of(context);
    return ColoredBox(
      color: darkGreen,
      child: Stack(
        children: [
          Positioned(
            right: -42,
            top: -42,
            child: _Circle(150, green.withValues(alpha: 0.38)),
          ),
          Positioned(
            left: 86,
            top: 150,
            child: _Circle(250, green.withValues(alpha: 0.72)),
          ),
          Positioned(
            left: -120,
            bottom: -90,
            child: _Circle(260, Colors.black.withValues(alpha: 0.12)),
          ),
          SafeArea(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                metrics.pagePadding,
                0,
                metrics.pagePadding,
                metrics.gapL,
              ),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight:
                      metrics.screenHeight -
                      metrics.safeTop -
                      metrics.safeBottom -
                      metrics.gapL,
                ),
                child: Column(
                  children: [
                    SizedBox(height: metrics.isShort ? 38 : 118),
                    const _LogoBig(),
                    SizedBox(height: metrics.isShort ? 46 : 92),
                    const Text(
                      'ЕРСИ ГБО',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 30,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Единый реестр свидетельств\nинспекций ГБО',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white70,
                        height: 1.35,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    SizedBox(height: metrics.isShort ? 22 : 44),
                    Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 180),
                        child: Container(
                          height: 31,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(18),
                          ),
                          alignment: Alignment.center,
                          child: const FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Text(
                              'ЭКО-СИСТЕМА БЕЗОПАСНОСТИ',
                              style: TextStyle(
                                color: Color(0xFFC7D6D0),
                                fontSize: 9,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    SizedBox(height: metrics.isShort ? 24 : 44),
                    _SplashLawCard(
                      title: legalTitle,
                      excerpt: legalExcerpt,
                      body: legalBody,
                    ),
                    SizedBox(height: metrics.isShort ? 18 : 26),
                    _PrimaryButton(
                      text:
                          'Наблюдатель (владелец авто с ГБО, оператор ЦТО, инспектор УДП)',
                      icon: Icons.visibility_rounded,
                      onTap: onObserver,
                    ),
                    const SizedBox(height: 10),
                    _PrimaryButton(
                      text: 'Деятельность',
                      icon: Icons.business_center_rounded,
                      onTap: onActivity,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SessionLoading extends StatelessWidget {
  const _SessionLoading();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: mint,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _MiniLogo(size: 72),
            SizedBox(height: 18),
            CircularProgressIndicator(color: green),
            SizedBox(height: 14),
            Text(
              'Восстанавливаем сессию',
              style: TextStyle(
                color: ink,
                fontSize: 16,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoleSelect extends StatelessWidget {
  const _RoleSelect({
    required this.selected,
    required this.onRole,
    required this.onNext,
  });
  final String selected;
  final ValueChanged<String> onRole;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final roles = [
      (
        'Инспекционный орган',
        'Периодическое освидетельствование ГБО (фотофиксация и оформление свидетельства)',
        Icons.business_rounded,
      ),
      ('Контрольный орган', '', Icons.account_balance_rounded),
    ];
    return _AppScreen(
      title: 'Способ доступа',
      subtitle: 'Выберите роль в системе',
      showNav: false,
      leadingBack: true,
      child: Column(
        children: [
          for (final item in roles)
            _RoleCard(
              icon: item.$3,
              title: item.$1,
              subtitle: item.$2,
              badge: item.$1 == 'Инспекционный орган' ? 'SMS + БИН' : 'SMS',
              selected: selected == item.$1,
              onTap: () {
                onRole(item.$1);
                onNext();
              },
            ),
        ],
      ),
    );
  }
}

class _Login extends StatelessWidget {
  const _Login({
    required this.role,
    required this.phone,
    required this.bin,
    required this.onPhone,
    required this.onBin,
    required this.onLogin,
    this.isLoading = false,
  });

  final String role;
  final String phone;
  final String bin;
  final ValueChanged<String> onPhone;
  final ValueChanged<String> onBin;
  final VoidCallback onLogin;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Вход в компанию',
      subtitle: 'Доступ по номеру организации',
      showNav: false,
      leadingBack: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _HintPill(text: 'ЗАЩИЩЕННЫЙ ДОСТУП'),
          const SizedBox(height: 26),
          _Input(
            label: role.startsWith('Владелец')
                ? 'ИИН / БИН'
                : 'БИН ОРГАНИЗАЦИИ',
            value: bin,
            hint: role.startsWith('Владелец') ? 'Необязательно' : 'Введите БИН',
            keyboardType: TextInputType.number,
            onChanged: onBin,
          ),
          const SizedBox(height: 20),
          _Input(
            label: 'ТЕЛЕФОН СОТРУДНИКА',
            value: phone,
            hint: '+7 ...',
            suffix: 'SMS',
            keyboardType: TextInputType.phone,
            inputFormatters: const [_KzPhoneFormatter()],
            onChanged: onPhone,
          ),
          const SizedBox(height: 26),
          const _SecurityPanel(),
          const SizedBox(height: 34),
          _PrimaryButton(
            text: isLoading ? 'Отправляем...' : 'Получить SMS-код',
            icon: Icons.sms_rounded,
            onTap: isLoading ? null : onLogin,
          ),
          const SizedBox(height: 34),
          const Center(
            child: Text(
              'Продолжая, вы подтверждаете согласие\nс политикой обработки данных',
              textAlign: TextAlign.center,
              style: _muted,
            ),
          ),
        ],
      ),
    );
  }
}

class _SmsScreen extends StatelessWidget {
  const _SmsScreen({
    required this.phone,
    required this.onCode,
    required this.onConfirm,
    required this.onChangePhone,
    this.visibleCode,
  });

  final String phone;
  final String? visibleCode;
  final ValueChanged<String> onCode;
  final VoidCallback onConfirm;
  final VoidCallback onChangePhone;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Подтверждение',
      subtitle: 'Код отправлен на ${phone.isEmpty ? 'указанный номер' : phone}',
      showNav: false,
      leadingBack: true,
      child: Column(
        children: [
          const SizedBox(height: 42),
          Text(
            visibleCode == null
                ? 'Введите SMS-код'
                : 'Тестовый SMS-код: $visibleCode',
            style: TextStyle(
              color: ink,
              fontSize: 19,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 26),
          TextField(
            keyboardType: TextInputType.number,
            onChanged: onCode,
            decoration: InputDecoration(
              labelText: 'SMS-код',
              hintText: 'Введите код из SMS',
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: line),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: line),
              ),
            ),
            style: const TextStyle(
              color: ink,
              fontSize: 20,
              fontWeight: FontWeight.w900,
              letterSpacing: 2,
            ),
          ),
          const SizedBox(height: 40),
          const Text(
            'Повторная отправка через 00:38',
            style: TextStyle(color: muted, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 52),
          _PrimaryButton(text: 'Подтвердить вход', onTap: onConfirm),
          const SizedBox(height: 54),
          _WarningCard(
            text:
                'Никому не сообщайте код\nСотрудники ЕРСИ ГБО никогда не запрашивают SMS-код.',
          ),
          const SizedBox(height: 42),
          SizedBox(
            width: double.infinity,
            height: 54,
            child: FilledButton.tonal(
              onPressed: onChangePhone,
              child: const Text(
                'Изменить номер',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _UserHome extends StatelessWidget {
  const _UserHome({
    required this.go,
    required this.banners,
    required this.plateNumber,
    required this.vinLast3,
    required this.result,
    required this.searched,
    required this.checking,
    required this.onPlateNumber,
    required this.onVinLast3,
    required this.onSearch,
  });
  final void Function(int) go;
  final List<AppBanner> banners;
  final String plateNumber;
  final String vinLast3;
  final RegistryVehicle? result;
  final bool searched;
  final bool checking;
  final ValueChanged<String> onPlateNumber;
  final ValueChanged<String> onVinLast3;
  final VoidCallback onSearch;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'ЕРСИ ГБО',
      subtitle: 'Проверка свидетельства',
      activeNav: 0,
      go: go,
      action: _HeaderIconAction(
        icon: Icons.manage_accounts_rounded,
        onPressed: () => go(1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _InfoBox(
            title: 'Публичная проверка',
            text:
                'Введите полный госномер и последние 3 символа VIN-кода. Авторизация не требуется.',
          ),
          const SizedBox(height: 14),
          _AdBanner(banners: banners),
          const SizedBox(height: 14),
          _Input(
            label: 'Госномер',
            value: plateNumber,
            hint: 'Например 777AAA02',
            inputFormatters: const [_PlateNumberFormatter()],
            onChanged: onPlateNumber,
          ),
          _Input(
            label: 'Последние 3 VIN',
            value: vinLast3,
            hint: 'Например 567',
            onChanged: (value) => onVinLast3(value.toUpperCase()),
          ),
          _PrimaryButton(
            text: checking ? 'Поиск...' : 'Найти свидетельство',
            icon: Icons.search_rounded,
            onTap: checking ? null : onSearch,
          ),
          const SizedBox(height: 18),
          if (result != null) ...[
            _CertificatePreview(vehicle: result!, onTap: () => go(8)),
          ] else if (searched) ...[
            const _EmptyState(
              icon: Icons.search_off_rounded,
              title: 'Свидетельство не найдено',
              subtitle: 'Проверьте госномер и последние 3 символа VIN-кода',
            ),
          ] else
            const _EmptyState(
              icon: Icons.fact_check_rounded,
              title: 'Введите данные для проверки',
              subtitle: 'Если свидетельство есть в реестре, оно появится здесь',
            ),
          const SizedBox(height: 18),
          _QuickAction(
            Icons.gavel_rounded,
            'Информация по закону',
            () => go(10),
          ),
        ],
      ),
    );
  }
}

class _CertificatePreview extends StatelessWidget {
  const _CertificatePreview({required this.vehicle, required this.onTap});
  final RegistryVehicle vehicle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _Card(
      onTap: onTap,
      elevated: true,
      padding: const EdgeInsets.all(18),
      child: Column(
        children: [
          const _MiniLogo(size: 68),
          const SizedBox(height: 14),
          const Text(
            'СВИДЕТЕЛЬСТВО ГБО',
            style: TextStyle(
              color: ink,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            vehicle.certificateNumber.isEmpty
                ? 'Номер свидетельства'
                : vehicle.certificateNumber,
            style: const TextStyle(color: green, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 14),
          Text(
            '${vehicle.plateNumber}\n${vehicle.vin}\n${vehicle.make} ${vehicle.model}',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: ink,
              height: 1.45,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          _Chip(
            vehicle.validUntil.isEmpty ? 'Найдено' : 'до ${vehicle.validUntil}',
          ),
        ],
      ),
    );
  }
}

class _SearchVin extends StatelessWidget {
  const _SearchVin({
    required this.value,
    required this.onChanged,
    required this.onSearch,
  });
  final String value;
  final ValueChanged<String> onChanged;
  final VoidCallback onSearch;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Поиск по VIN',
      subtitle: 'Введите VIN автомобиля',
      activeNav: 1,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _Chip('БЕСПЛАТНО'),
          const SizedBox(height: 18),
          const Text(
            'VIN КОД',
            style: TextStyle(
              color: muted,
              fontSize: 10,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          _Input(
            label: 'VIN',
            value: value,
            hint: 'Введите VIN, госномер, ИИН или БИН',
            onChanged: onChanged,
          ),
          _PrimaryButton(
            text: 'Найти автомобиль',
            icon: Icons.search_rounded,
            onTap: onSearch,
          ),
          const SizedBox(height: 20),
          _EmptyState(
            icon: Icons.directions_car_rounded,
            title: 'VIN указан в техпаспорте',
            subtitle: 'или на кузове автомобиля',
          ),
          const SizedBox(height: 18),
          const Text('Подсказка', style: _section),
          const SizedBox(height: 10),
          const _ListTileCard(
            icon: Icons.info_outline_rounded,
            title: 'Введите реальные данные',
            subtitle: 'VIN, госномер, номер свидетельства, ИИН или БИН',
            status: 'API',
          ),
        ],
      ),
    );
  }
}

class _SearchBin extends StatelessWidget {
  const _SearchBin({
    required this.value,
    required this.onChanged,
    required this.onSearch,
  });
  final String value;
  final ValueChanged<String> onChanged;
  final VoidCallback onSearch;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Поиск по БИН/ИИН',
      subtitle: 'Проверка владельца',
      activeNav: 1,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Pills(
            values: const ['Предприятие', 'Физ. лицо'],
            selected: 'Предприятие',
          ),
          const SizedBox(height: 12),
          const Text(
            'БИН / ИИН',
            style: TextStyle(
              color: muted,
              fontSize: 10,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          _Input(
            label: 'БИН / ИИН',
            value: value,
            hint: 'Введите БИН или ИИН',
            keyboardType: TextInputType.number,
            onChanged: onChanged,
          ),
          _PrimaryButton(
            text: 'Найти',
            icon: Icons.search_rounded,
            onTap: onSearch,
          ),
          const SizedBox(height: 16),
          const _InfoBox(
            title: 'Защита персональных данных',
            text: 'Доступ к подробным данным ограничен ролью и регионом.',
          ),
          const SizedBox(height: 18),
          const Text('Подсказка', style: _section),
          const SizedBox(height: 10),
          const _ListTileCard(
            icon: Icons.info_outline_rounded,
            title: 'Поиск идет по реестру',
            subtitle:
                'Введите реальные БИН, ИИН, VIN, госномер или номер свидетельства',
            status: 'API',
          ),
        ],
      ),
    );
  }
}

class _Results extends StatelessWidget {
  const _Results({
    required this.query,
    required this.results,
    required this.onOpen,
  });
  final String query;
  final List<RegistryVehicle> results;
  final ValueChanged<RegistryVehicle> onOpen;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Результаты поиска',
      subtitle: 'Найдено ${results.length} записей',
      activeNav: 1,
      child: Column(
        children: [
          _SearchBarCard(hint: query.isEmpty ? 'Запрос не задан' : query),
          const SizedBox(height: 10),
          if (results.isEmpty)
            const _EmptyState(
              icon: Icons.search_off_rounded,
              title: 'Ничего не найдено',
              subtitle:
                  'Проверьте VIN, госномер, ИИН, БИН или номер свидетельства',
            )
          else
            for (final item in results)
              _ListTileCard(
                icon: Icons.description_rounded,
                title: item.certificateNumber.isEmpty
                    ? item.vin
                    : item.certificateNumber,
                subtitle:
                    '${item.make} ${item.model} · ${item.plateNumber.isEmpty ? item.vin : item.plateNumber}',
                status: item.validUntil.isEmpty
                    ? 'Реестр'
                    : 'до ${item.validUntil}',
                onTap: () => onOpen(item),
              ),
        ],
      ),
    );
  }
}

class _Certificate extends StatelessWidget {
  const _Certificate({required this.go, required this.vehicle});
  final void Function(int) go;
  final RegistryVehicle? vehicle;

  @override
  Widget build(BuildContext context) {
    final item = vehicle;
    if (item == null) {
      return const _AppScreen(
        title: 'Свидетельство',
        subtitle: 'Запись не выбрана',
        activeNav: 1,
        leadingBack: true,
        child: _EmptyState(
          icon: Icons.search_off_rounded,
          title: 'Свидетельство не найдено',
          subtitle: 'Вернитесь к поиску и выберите запись из реестра',
        ),
      );
    }
    final vehicleTitle = [
      item.make,
      item.model,
    ].where((value) => value.trim().isNotEmpty).join(' ');
    final documents = item.documents;
    return _Watermark(
      child: _AppScreen(
        title: 'Свидетельство',
        subtitle: item.certificateNumber.isEmpty
            ? 'Действительно и доступно для проверки'
            : '№ ${item.certificateNumber}',
        activeNav: 1,
        leadingBack: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _CertificateHero(validUntil: item.validUntil, onTap: () => go(9)),
            const SizedBox(height: 16),
            const Text('Основные сведения', style: _section),
            const SizedBox(height: 10),
            _CertificateDetailsCard(
              rows: [
                (
                  Icons.directions_car_rounded,
                  'АВТОМОБИЛЬ',
                  [
                    vehicleTitle.isEmpty ? 'ТС' : vehicleTitle,
                    item.plateNumber,
                  ].where((value) => value.trim().isNotEmpty).join(' · '),
                ),
                (Icons.badge_rounded, 'VIN', item.vin.isEmpty ? '-' : item.vin),
                (
                  Icons.person_rounded,
                  'ВЛАДЕЛЕЦ',
                  [
                    item.ownerName.isEmpty ? 'Не указан' : item.ownerName,
                  ].where((value) => value.trim().isNotEmpty).join(' · '),
                ),
                (
                  Icons.home_rounded,
                  'МЕСТО ЖИТЕЛЬСТВА',
                  item.ownerAddress.isEmpty ? 'Не указано' : item.ownerAddress,
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text('Инспекция и выдача', style: _section),
            const SizedBox(height: 10),
            _CertificateDetailsCard(
              rows: [
                (
                  Icons.verified_rounded,
                  'СТАТУС СВИДЕТЕЛЬСТВА',
                  [
                    item.certificateNumber.isEmpty
                        ? ''
                        : '№ ${item.certificateNumber}',
                    item.certificateStatus.isEmpty
                        ? 'active'
                        : item.certificateStatus,
                    item.certificateIssuedAt.isEmpty
                        ? ''
                        : 'выдано ${item.certificateIssuedAt}',
                  ].where((value) => value.trim().isNotEmpty).join(' · '),
                ),
                (
                  Icons.assignment_turned_in_rounded,
                  'ИНСПЕКЦИЯ',
                  [
                    item.inspectionStatus.isEmpty
                        ? 'статус не указан'
                        : _inspectionStatusLabel(item.inspectionStatus),
                    item.inspectionCreatedAt.isEmpty
                        ? ''
                        : 'создана ${item.inspectionCreatedAt}',
                  ].where((value) => value.trim().isNotEmpty).join(' · '),
                ),
                (
                  Icons.apartment_rounded,
                  'ИНСПЕКЦИОННЫЙ ОРГАН',
                  [
                    item.organizationName.isEmpty
                        ? 'Не указан'
                        : item.organizationName,
                    item.organizationBin.isEmpty
                        ? ''
                        : 'БИН ${item.organizationBin}',
                  ].where((value) => value.trim().isNotEmpty).join(' · '),
                ),
                (
                  Icons.location_on_rounded,
                  'АДРЕС ОРГАНИЗАЦИИ',
                  [
                    item.organizationAddress,
                    item.organizationRegion,
                  ].where((value) => value.trim().isNotEmpty).join(' · '),
                ),
                if (item.inspectionAddress.isNotEmpty)
                  (
                    Icons.my_location_rounded,
                    'МЕСТО ИНСПЕКЦИИ',
                    item.inspectionAddress,
                  ),
                (
                  Icons.pin_drop_rounded,
                  'КООРДИНАТЫ ИНСПЕКЦИИ',
                  item.inspectionLat == null || item.inspectionLng == null
                      ? 'Не сохранены'
                      : '${item.inspectionLat!.toStringAsFixed(6)}, ${item.inspectionLng!.toStringAsFixed(6)}',
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text('Газобаллонное оборудование', style: _section),
            const SizedBox(height: 10),
            _CertificateDetailsCard(
              rows: [
                (
                  Icons.horizontal_rule_rounded,
                  'БАЛЛОН',
                  [
                    item.cylinderSerial.isEmpty
                        ? '№ не указан'
                        : '№ ${item.cylinderSerial}',
                    item.cylinderManufacturer.isEmpty
                        ? 'производитель не указан'
                        : item.cylinderManufacturer,
                    item.cylinderVolume.isEmpty
                        ? ''
                        : '${item.cylinderVolume} л',
                  ].where((value) => value.trim().isNotEmpty).join(' · '),
                ),
                (
                  Icons.event_rounded,
                  'ГОД / ДАТА ВЫПУСКА',
                  item.cylinderProducedAt.isEmpty
                      ? 'Не указано'
                      : item.cylinderProducedAt,
                ),
                (
                  Icons.settings_input_component_rounded,
                  'РЕДУКТОР',
                  item.reducerName.isEmpty ? 'Не указан' : item.reducerName,
                ),
                (
                  Icons.memory_rounded,
                  'ЭБУ',
                  item.controlUnitName.isEmpty
                      ? 'Не указан'
                      : item.controlUnitName,
                ),
                (
                  Icons.event_available_rounded,
                  'ОСВИДЕТЕЛЬСТВОВАНИЕ',
                  item.cylinderValidUntil.isEmpty
                      ? 'Срок не указан'
                      : 'до ${item.cylinderValidUntil}',
                ),
                if (item.organizationName.isNotEmpty)
                  (
                    Icons.apartment_rounded,
                    'ИНСПЕКЦИОННЫЙ ОРГАН',
                    item.organizationName,
                  ),
              ],
            ),
            const SizedBox(height: 16),
            const Text('Пакет документов', style: _section),
            const SizedBox(height: 10),
            if (documents.isEmpty)
              const _EmptyState(
                icon: Icons.folder_open_rounded,
                title: 'Документы не прикреплены',
                subtitle: 'В реестре пока нет загруженных файлов по инспекции',
              )
            else
              for (final document in documents)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _CertificateDocumentCard(document: document),
                ),
            const SizedBox(height: 6),
            _PrimaryButton(
              text: 'Открыть просмотр',
              icon: Icons.visibility_rounded,
              onTap: () => go(9),
            ),
          ],
        ),
      ),
    );
  }
}

class _CertificateHero extends StatelessWidget {
  const _CertificateHero({required this.validUntil, required this.onTap});
  final String validUntil;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final metrics = ResponsiveMetrics.of(context);
    return Container(
      width: double.infinity,
      constraints: BoxConstraints(minHeight: metrics.isCompact ? 132 : 120),
      padding: EdgeInsets.fromLTRB(
        metrics.isCompact ? 18 : 22,
        metrics.isCompact ? 16 : 18,
        metrics.isCompact ? 18 : 22,
        metrics.isCompact ? 16 : 18,
      ),
      decoration: BoxDecoration(
        color: const Color(0xFF006D45),
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            color: Color(0x33007A4D),
            blurRadius: 22,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const _LightStatusPill(),
                const SizedBox(height: 20),
                Text(
                  validUntil.isEmpty
                      ? 'Срок действия указан в реестре'
                      : 'До $validUntil',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
          InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(18),
            child: const Padding(
              padding: EdgeInsets.all(10),
              child: Text(
                'QR',
                style: TextStyle(
                  color: Colors.white70,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LightStatusPill extends StatelessWidget {
  const _LightStatusPill();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: const [
          Icon(Icons.check_circle_rounded, color: Color(0xFFBFD5CC), size: 14),
          SizedBox(width: 6),
          Text(
            'ДЕЙСТВУЕТ',
            style: TextStyle(
              color: Color(0xFFBFD5CC),
              fontSize: 10,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _CertificateDetailsCard extends StatelessWidget {
  const _CertificateDetailsCard({required this.rows});
  final List<(IconData, String, String)> rows;

  @override
  Widget build(BuildContext context) {
    return _Card(
      elevated: true,
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            Row(
              children: [
                CircleAvatar(
                  radius: 17,
                  backgroundColor: softGreen,
                  child: Icon(rows[i].$1, color: green, size: 20),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        rows[i].$2,
                        style: const TextStyle(
                          color: muted,
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        rows[i].$3,
                        style: const TextStyle(
                          color: ink,
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (i != rows.length - 1) const SizedBox(height: 16),
          ],
        ],
      ),
    );
  }
}

class _InspectionDetailScreen extends StatelessWidget {
  const _InspectionDetailScreen({
    required this.inspection,
    required this.canApprove,
    required this.canEdit,
    required this.onApprove,
    required this.onEdit,
    required this.onReturnForCorrection,
  });
  final InspectionSummary? inspection;
  final bool canApprove;
  final bool canEdit;
  final VoidCallback? onApprove;
  final VoidCallback? onEdit;
  final VoidCallback? onReturnForCorrection;

  @override
  Widget build(BuildContext context) {
    final item = inspection;
    if (item == null) {
      return const _AppScreen(
        title: 'Инспекция',
        subtitle: 'Запись не выбрана',
        activeNav: 0,
        leadingBack: true,
        child: _EmptyState(
          icon: Icons.description_rounded,
          title: 'Инспекция не открыта',
          subtitle: 'Вернитесь в список и выберите нужное свидетельство',
        ),
      );
    }
    final files = item.files;
    return _Watermark(
      child: _AppScreen(
        title: item.certificateNumber.isEmpty
            ? 'Инспекция ${item.createdAt}'
            : 'Свидетельство ${item.certificateNumber}',
        subtitle: _inspectionStatusLabel(item.status),
        activeNav: 0,
        leadingBack: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _GreenHero(
              title: item.vehiclePlate.isEmpty
                  ? 'Госномер не указан'
                  : item.vehiclePlate,
              subtitle: item.vehicleVin.isEmpty
                  ? 'VIN не указан'
                  : 'VIN ${item.vehicleVin}',
              button: item.certificateNumber.isEmpty
                  ? 'Инспекция'
                  : 'Свидетельство',
              onTap: null,
            ),
            if (canApprove && onApprove != null) ...[
              const SizedBox(height: 12),
              _PrimaryButton(
                text: 'Отправить в реестр',
                icon: Icons.verified_rounded,
                onTap: onApprove!,
              ),
            ],
            if (canEdit && onEdit != null) ...[
              const SizedBox(height: 12),
              _PrimaryButton(
                text: 'Редактировать данные',
                icon: Icons.edit_rounded,
                onTap: onEdit!,
              ),
            ],
            if (canEdit && onReturnForCorrection != null) ...[
              const SizedBox(height: 12),
              _PrimaryButton(
                text: 'Отправить на исправление',
                icon: Icons.assignment_return_rounded,
                onTap: onReturnForCorrection!,
              ),
            ],
            const SizedBox(height: 16),
            const Text('Данные свидетельства', style: _section),
            const SizedBox(height: 10),
            _CertificateDetailsCard(
              rows: [
                (
                  Icons.description_rounded,
                  'НОМЕР',
                  item.certificateNumber.isEmpty
                      ? 'Не выдано'
                      : item.certificateNumber,
                ),
                (
                  Icons.event_available_rounded,
                  'СРОК ДЕЙСТВИЯ',
                  item.certificateValidUntil.isEmpty
                      ? 'Не указан'
                      : 'до ${item.certificateValidUntil}',
                ),
                (
                  Icons.apartment_rounded,
                  'ИНСПЕКЦИОННЫЙ ОРГАН',
                  item.organizationName.isEmpty
                      ? 'Не указан'
                      : item.organizationName,
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text('Автомобиль и владелец', style: _section),
            const SizedBox(height: 10),
            _CertificateDetailsCard(
              rows: [
                (
                  Icons.directions_car_rounded,
                  'ТС',
                  [
                    item.vehicleName.isEmpty
                        ? 'Модель не указана'
                        : item.vehicleName,
                    item.vehiclePlate,
                  ].where((value) => value.trim().isNotEmpty).join(' · '),
                ),
                (
                  Icons.badge_rounded,
                  'VIN',
                  item.vehicleVin.isEmpty ? '-' : item.vehicleVin,
                ),
                (
                  Icons.person_rounded,
                  'ВЛАДЕЛЕЦ',
                  [
                    item.ownerName.isEmpty ? 'Не указан' : item.ownerName,
                  ].where((value) => value.trim().isNotEmpty).join(' · '),
                ),
                (
                  Icons.home_rounded,
                  'МЕСТО ЖИТЕЛЬСТВА',
                  item.ownerAddress.isEmpty ? 'Не указано' : item.ownerAddress,
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text('Место проведения инспекции', style: _section),
            const SizedBox(height: 10),
            _CertificateDetailsCard(
              rows: [
                (
                  Icons.location_on_rounded,
                  'АДРЕС',
                  item.inspectionAddress.isEmpty
                      ? 'Местоположение не определено'
                      : item.inspectionAddress,
                ),
                (
                  Icons.my_location_rounded,
                  'КООРДИНАТЫ',
                  item.inspectionLat == null || item.inspectionLng == null
                      ? 'Не сохранены'
                      : '${item.inspectionLat!.toStringAsFixed(6)}, ${item.inspectionLng!.toStringAsFixed(6)}',
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text('ГБО и баллон', style: _section),
            const SizedBox(height: 10),
            _CertificateDetailsCard(
              rows: [
                (
                  Icons.horizontal_rule_rounded,
                  'БАЛЛОН',
                  [
                    item.cylinderSerial.isEmpty
                        ? '№ не указан'
                        : '№ ${item.cylinderSerial}',
                    item.cylinderManufacturer.isEmpty
                        ? 'производитель не указан'
                        : item.cylinderManufacturer,
                    item.cylinderVolume.isEmpty
                        ? ''
                        : '${item.cylinderVolume} л',
                  ].where((value) => value.trim().isNotEmpty).join(' · '),
                ),
                (
                  Icons.event_rounded,
                  'СРОК БАЛЛОНА',
                  item.cylinderValidUntil.isEmpty
                      ? 'Не указан'
                      : 'до ${item.cylinderValidUntil}',
                ),
                (
                  Icons.settings_input_component_rounded,
                  'РЕДУКТОР',
                  item.reducerName.isEmpty ? 'Не указан' : item.reducerName,
                ),
                (
                  Icons.memory_rounded,
                  'ЭБУ',
                  item.controlUnitName.isEmpty
                      ? 'Не указан'
                      : item.controlUnitName,
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text('Фото и документы', style: _section),
            const SizedBox(height: 10),
            if (files.isEmpty)
              const _InfoBox(
                title: 'Файлы не загружены',
                text: 'После загрузки фото и документов они появятся здесь.',
              )
            else
              for (final file in files)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _InspectionFileCard(file: file),
                ),
          ],
        ),
      ),
    );
  }
}

class _InspectionFileCard extends StatelessWidget {
  const _InspectionFileCard({required this.file});
  final InspectionFileInfo file;

  @override
  Widget build(BuildContext context) {
    final title = inspectionRequiredLabels[file.type] ?? file.type;
    final url = _absoluteFileUrl(file.viewUrl);
    return _Card(
      elevated: true,
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: softGreen,
                child: Icon(
                  file.isImage
                      ? Icons.image_rounded
                      : Icons.picture_as_pdf_rounded,
                  color: green,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: ink,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      file.createdAt.isEmpty
                          ? 'Файл инспекции'
                          : 'Загружено ${file.createdAt}',
                      style: const TextStyle(
                        color: muted,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const _Chip('Просмотр'),
            ],
          ),
          if (file.isImage && url.isNotEmpty) ...[
            const SizedBox(height: 12),
            InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => _openFullScreenImage(context, url, title),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: AspectRatio(
                  aspectRatio: 1.55,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.network(
                        url,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) => Container(
                          color: mint,
                          alignment: Alignment.center,
                          child: const Text(
                            'Не удалось открыть изображение',
                            style: TextStyle(
                              color: muted,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                      const Positioned(
                        right: 10,
                        bottom: 10,
                        child: _Chip('Открыть'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ] else if (url.isNotEmpty) ...[
            const SizedBox(height: 12),
            _PrimaryButton(
              text: 'Открыть просмотр',
              icon: Icons.visibility_rounded,
              onTap: () =>
                  launchUrl(Uri.parse(url), mode: LaunchMode.inAppBrowserView),
            ),
          ],
        ],
      ),
    );
  }
}

class _CertificateDocumentCard extends StatelessWidget {
  const _CertificateDocumentCard({required this.document});
  final InspectionDocumentInfo document;

  @override
  Widget build(BuildContext context) {
    final title = inspectionRequiredLabels[document.type] ?? document.type;
    final url = _absoluteFileUrl(document.viewUrl);
    final isImage =
        _looksLikeImageUrl(document.viewUrl) ||
        _looksLikeImageUrl(document.objectKey);
    return _Card(
      elevated: true,
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: softGreen,
                child: Icon(
                  isImage ? Icons.image_rounded : Icons.description_rounded,
                  color: green,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: ink,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const _Chip('без скачивания'),
            ],
          ),
          if (isImage && url.isNotEmpty) ...[
            const SizedBox(height: 12),
            InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => _openFullScreenImage(context, url, title),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: AspectRatio(
                  aspectRatio: 1.45,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.network(
                        url,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) => Container(
                          color: mint,
                          alignment: Alignment.center,
                          child: const Text(
                            'Файл недоступен для просмотра',
                            style: TextStyle(
                              color: muted,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                      const _WatermarkOverlay(),
                      const Positioned(
                        right: 10,
                        bottom: 10,
                        child: _Chip('Открыть'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ] else if (url.isNotEmpty) ...[
            const SizedBox(height: 12),
            _PrimaryButton(
              text: 'Открыть просмотр',
              icon: Icons.visibility_rounded,
              onTap: () =>
                  launchUrl(Uri.parse(url), mode: LaunchMode.inAppBrowserView),
            ),
            const SizedBox(height: 8),
            const Text(
              'Документ доступен только для просмотра.',
              style: TextStyle(color: muted, fontWeight: FontWeight.w700),
            ),
          ] else ...[
            const SizedBox(height: 10),
            const Text(
              'Документ прикреплен к реестру. Скачивание и печать отключены.',
              style: TextStyle(color: muted, fontWeight: FontWeight.w700),
            ),
          ],
        ],
      ),
    );
  }
}

void _openFullScreenImage(BuildContext context, String url, String title) {
  showDialog<void>(
    context: context,
    barrierColor: Colors.black,
    builder: (context) => Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(
              child: InteractiveViewer(
                minScale: 0.7,
                maxScale: 5,
                child: Center(
                  child: Image.network(
                    url,
                    fit: BoxFit.contain,
                    errorBuilder: (context, error, stackTrace) => const Text(
                      'Файл недоступен для просмотра',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              left: 12,
              top: 12,
              right: 12,
              child: Row(
                children: [
                  IconButton.filled(
                    style: IconButton.styleFrom(backgroundColor: Colors.white),
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded, color: ink),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const Positioned.fill(
              child: IgnorePointer(child: _WatermarkOverlay()),
            ),
          ],
        ),
      ),
    ),
  );
}

class _DocumentView extends StatelessWidget {
  const _DocumentView({required this.vehicle});
  final RegistryVehicle? vehicle;

  @override
  Widget build(BuildContext context) {
    final item = vehicle;
    final docLines = item == null
        ? const <String>[]
        : [
            if (item.certificateNumber.isNotEmpty)
              '№ ${item.certificateNumber}',
            if (item.vin.isNotEmpty) 'VIN ${item.vin}',
            if (item.plateNumber.isNotEmpty) item.plateNumber,
            if (item.validUntil.isNotEmpty) 'Действует до ${item.validUntil}',
          ];
    return _Watermark(
      child: _AppScreen(
        title: 'Просмотр свидетельства',
        subtitle: 'Без скачивания и печати',
        activeNav: 1,
        leadingBack: true,
        child: Column(
          children: [
            Container(
              constraints: const BoxConstraints(minHeight: 420),
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(22, 26, 22, 26),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(22),
                boxShadow: const [
                  BoxShadow(color: Color(0x1200351F), blurRadius: 18),
                ],
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const _MiniLogo(size: 82),
                  const SizedBox(height: 22),
                  const Text(
                    'СВИДЕТЕЛЬСТВО ГБО',
                    style: TextStyle(
                      color: ink,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    item?.certificateNumber.isEmpty ?? true
                        ? 'Номер не указан'
                        : '№ ${item!.certificateNumber}',
                    style: const TextStyle(
                      color: muted,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 36),
                  Text(
                    docLines.isEmpty
                        ? 'Данные не выбраны'
                        : docLines.join('\n'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: ink,
                      height: 1.8,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 26),
                  const Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _QrButton(),
                      CircleAvatar(
                        backgroundColor: green,
                        child: Icon(Icons.check_rounded, color: Colors.white),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  const Text(
                    'Скачивание и печать недоступны',
                    style: TextStyle(
                      color: danger,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            _Card(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Данные пакета документов', style: _section),
                  const SizedBox(height: 10),
                  if (item == null || item.documents.isEmpty)
                    const Text(
                      'Файлы инспекции не прикреплены к найденной записи.',
                      style: TextStyle(
                        color: muted,
                        fontWeight: FontWeight.w700,
                      ),
                    )
                  else
                    for (final document in item.documents)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _CertificateDocumentCard(document: document),
                      ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QrButton extends StatelessWidget {
  const _QrButton();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 70,
      height: 62,
      decoration: BoxDecoration(
        color: green,
        borderRadius: BorderRadius.circular(14),
      ),
      child: const Center(
        child: Text(
          'QR',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
        ),
      ),
    );
  }
}

class _LawInfo extends StatelessWidget {
  const _LawInfo({
    required this.title,
    required this.excerpt,
    required this.body,
  });

  final String title;
  final String excerpt;
  final String body;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Информация по закону',
      subtitle: 'Правила и условия проверки',
      activeNav: _NavScope.publicModeOf(context) ? 2 : 3,
      child: Column(
        children: [
          _ListTileCard(
            icon: Icons.policy_rounded,
            title: title,
            subtitle: excerpt,
            status: 'Подробнее',
            onTap: () => _showLawExtract(context, title: title, text: body),
          ),
        ],
      ),
    );
  }
}

class _OrgMap extends StatelessWidget {
  const _OrgMap({
    required this.go,
    required this.organizations,
    required this.certificates,
    required this.onReload,
    required this.onOpenCertificate,
    required this.onOpenOrganization,
  });
  final void Function(int) go;
  final List<OrganizationSummary> organizations;
  final List<RegistryVehicle> certificates;
  final Future<void> Function() onReload;
  final ValueChanged<RegistryVehicle> onOpenCertificate;
  final Future<void> Function(String id, String title) onOpenOrganization;

  @override
  Widget build(BuildContext context) {
    final mapItems = _mapOrganizations(organizations);
    final canGoBack = _NavScope.canGoBackOf(context);
    final back = _NavScope.backOf(context);
    final publicMode = _NavScope.publicModeOf(context);
    return Stack(
      children: [
        Positioned.fill(
          child: _OsmOrganizationsMap(
            organizations: mapItems,
            certificates: certificates,
            onOpenCertificate: onOpenCertificate,
            onOpenOrganization: onOpenOrganization,
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: _Card(
              elevated: true,
              color: Colors.white.withValues(alpha: 0.94),
              padding: const EdgeInsets.fromLTRB(16, 12, 10, 12),
              child: Row(
                children: [
                  if (canGoBack)
                    InkWell(
                      onTap: back,
                      borderRadius: BorderRadius.circular(19),
                      child: Container(
                        width: 38,
                        height: 38,
                        decoration: const BoxDecoration(
                          color: softGreen,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.chevron_left_rounded,
                          color: green,
                          size: 28,
                        ),
                      ),
                    )
                  else
                    const _MiniLogo(size: 38),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          'Карта организаций',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: ink,
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          [
                            'организации ${mapItems.length}',
                            if (certificates.isNotEmpty)
                              'инспекции ${certificates.where((item) => item.inspectionLat != null && item.inspectionLng != null).length}',
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: muted,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton.filledTonal(
                    onPressed: onReload,
                    icon: const Icon(Icons.refresh_rounded),
                  ),
                ],
              ),
            ),
          ),
        ),
        Positioned(
          left: 16,
          right: 16,
          bottom: 0,
          child: SafeArea(
            top: false,
            child: _BottomNav(active: publicMode ? 1 : 2, go: go),
          ),
        ),
      ],
    );
  }
}

class _InspectionOrgCard extends StatelessWidget {
  const _InspectionOrgCard({required this.go});
  final void Function(int) go;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Инспекционный орган',
      subtitle: 'Карточка организации',
      activeNav: 2,
      leadingBack: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _GreenPanel(
            title: 'Инспекция №3',
            subtitle: 'Алматы · активна',
            trailing: const _WhiteMiniPill('На карте'),
          ),
          const SizedBox(height: 14),
          const Text('Услуги', style: _section),
          const SizedBox(height: 10),
          const _InfoBox(
            title: 'Оформление свидетельств ГБО',
            text: 'Выдача справок\nВидео сопровождение\nГрафик: 09:00-18:00',
          ),
          const _ListTileCard(
            icon: Icons.location_on_rounded,
            title: 'Адрес инспекции',
            subtitle: 'Алматы, ул. Абая 48',
            status: 'Открыть',
          ),
          _DualButtons(
            left: 'Позвонить',
            right: 'Маршрут',
            onLeft: () => launchUrl(Uri(scheme: 'tel', path: '+77001112233')),
            onRight: () => launchUrl(
              Uri.parse(
                'https://www.openstreetmap.org/?mlat=43.238949&mlon=76.889709#map=17/43.238949/76.889709',
              ),
              mode: LaunchMode.externalApplication,
            ),
          ),
          const SizedBox(height: 12),
          _OsmOrganizationsMap(
            height: 138,
            organizations: _mapOrganizations(const [
              OrganizationSummary(
                id: 'local-inspection-3',
                name: 'Инспекция №3',
                bin: '240101300003',
                status: 'active',
                region: 'Алматы',
                type: 'inspection_org',
                address: 'ул. Абая 48',
                lat: 43.237156,
                lng: 76.945618,
              ),
            ]),
          ),
        ],
      ),
    );
  }
}

class _InstallerCard extends StatelessWidget {
  const _InstallerCard({required this.go});
  final void Function(int) go;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Установщик ГБО',
      subtitle: 'Карточка установщика',
      activeNav: 2,
      leadingBack: true,
      child: Column(
        children: [
          _GreenHero(
            title: 'EcoGas Install',
            subtitle: 'Продвинутый установщик',
            button: 'Акция',
            onTap: () => _showInfoDialog(
              context,
              title: 'Акция установщика',
              text: 'Информация о платном размещении и условиях продвижения.',
            ),
          ),
          const _InfoBox(
            title: 'Профиль компании',
            text: 'Установка ГБО\nРемонт\nДокументы\nЕжедневно: 09:00-19:00',
          ),
          const _InfoBox(
            title: 'Специализация установщика',
            text: 'Метан · пропан\nГарантия 12 месяцев\nВыездная диагностика',
          ),
          const _GreenHero(
            title: 'Сертифицированная установка',
            subtitle: 'Разрешение действует до 2028',
            button: 'PDF',
            onTap: null,
          ),
          _DualButtons(
            left: 'Позвонить',
            right: 'Построить маршрут',
            onLeft: () => launchUrl(Uri(scheme: 'tel', path: '+77005259736')),
            onRight: () => launchUrl(
              Uri.parse(
                'https://www.openstreetmap.org/?mlat=43.2500&mlon=76.9300#map=17/43.2500/76.9300',
              ),
              mode: LaunchMode.externalApplication,
            ),
          ),
        ],
      ),
    );
  }
}

class _InspectorHome extends StatelessWidget {
  const _InspectorHome({
    required this.go,
    required this.inspections,
    required this.organization,
    required this.isManager,
    required this.onReload,
    required this.onNewInspection,
    required this.onImportXlsx,
    required this.onOpenInspection,
  });
  final void Function(int) go;
  final List<InspectionSummary> inspections;
  final OrganizationSummary? organization;
  final bool isManager;
  final VoidCallback onReload;
  final VoidCallback onNewInspection;
  final VoidCallback onImportXlsx;
  final ValueChanged<InspectionSummary> onOpenInspection;

  @override
  Widget build(BuildContext context) {
    final active = inspections.where((item) => item.status != 'draft').toList();
    final pending = inspections
        .where((item) => item.status == 'submitted')
        .toList();
    return _AppScreen(
      title: 'Инспекционный орган',
      subtitle: organization?.name.isNotEmpty == true
          ? '${organization!.name} · ${isManager ? 'руководитель' : 'сотрудник'}'
          : isManager
          ? 'Руководитель'
          : 'Сотрудник',
      activeNav: 0,
      go: go,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _GreenHero(
            title: 'Инспекции ГБО',
            subtitle: 'создание и фотофиксация свидетельств',
            button: 'Новая',
            onTap: onNewInspection,
          ),
          Row(
            children: [
              Expanded(
                child: _StatCard(active.length.toString(), 'создано', green),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatCard(
                  pending.length.toString(),
                  'на проверке',
                  warn,
                ),
              ),
            ],
          ),
          if (isManager && pending.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Padding(
              padding: EdgeInsets.only(left: 4, bottom: 8),
              child: Text('Ожидают отправки в реестр', style: _section),
            ),
            for (final item in pending.take(5))
              _ListTileCard(
                icon: Icons.verified_rounded,
                title: item.certificateNumber.isEmpty
                    ? item.vehiclePlate
                    : 'Свидетельство ${item.certificateNumber}',
                subtitle: [
                  item.vehiclePlate,
                  item.createdByName.isEmpty
                      ? item.createdByPhone
                      : item.createdByName,
                  _shortDateTime(item.submittedAt),
                ].where((value) => value.trim().isNotEmpty).join(' · '),
                status: 'Проверить',
                onTap: () => onOpenInspection(item),
              ),
          ],
          const SizedBox(height: 12),
          _PrimaryButton(
            text: 'Новая инспекция',
            icon: Icons.add_rounded,
            onTap: onNewInspection,
          ),
          const SizedBox(height: 10),
          _PrimaryButton(
            text: 'Загрузить XLSX свидетельство',
            icon: Icons.upload_file_rounded,
            onTap: onImportXlsx,
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Row(
              children: [
                const Expanded(child: Text('Мои инспекции', style: _section)),
                IconButton(
                  tooltip: 'Обновить',
                  onPressed: onReload,
                  icon: const Icon(Icons.refresh_rounded, color: green),
                ),
              ],
            ),
          ),
          if (active.isEmpty)
            const _InfoBox(
              title: 'Инспекций пока нет',
              text:
                  'Созданные инспекции появятся здесь после сохранения на сервере.',
            )
          else
            for (final item in active)
              _ListTileCard(
                icon: Icons.description_rounded,
                title: item.vehiclePlate.isEmpty
                    ? 'Инспекция ${item.createdAt}'
                    : item.vehiclePlate,
                subtitle: [
                  item.vehicleName.isEmpty ? 'ТС' : item.vehicleName,
                  'VIN ${item.vehicleVin.isEmpty ? '-' : item.vehicleVin}',
                  'фото ${item.photoCount}',
                  item.createdByName.isEmpty
                      ? item.createdByPhone
                      : item.createdByName,
                ].where((value) => value.trim().isNotEmpty).join(' · '),
                status: _inspectionStatusLabel(item.status),
                onTap: () => onOpenInspection(item),
              ),
        ],
      ),
    );
  }
}

String _inspectionStatusLabel(String status) {
  return switch (status) {
    'draft' => 'Черновик',
    'submitted' => 'На проверке',
    'approved' => 'В реестре',
    'rejected' => 'На исправлении',
    'blocked' => 'Заблокировано',
    _ => status.isEmpty ? 'Новый' : status,
  };
}

String _shortDateTime(String value) {
  if (value.trim().isEmpty) return '';
  final date = DateTime.tryParse(value);
  if (date == null) return value.split('T').first;
  final local = date.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(local.day)}.${two(local.month)}.${local.year} ${two(local.hour)}:${two(local.minute)}';
}

class _OwnerStep extends StatelessWidget {
  const _OwnerStep({
    required this.certificateNumber,
    required this.ownerName,
    required this.ownerAddress,
    required this.ownerKind,
    required this.onCertificateNumber,
    required this.onOwnerKind,
    required this.onOwnerName,
    required this.onOwnerAddress,
    required this.onNext,
  });
  final String certificateNumber;
  final String ownerName;
  final String ownerAddress;
  final String ownerKind;
  final ValueChanged<String> onCertificateNumber;
  final ValueChanged<String> onOwnerKind;
  final ValueChanged<String> onOwnerName;
  final ValueChanged<String> onOwnerAddress;
  final Future<void> Function() onNext;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Новая инспекция',
      subtitle: 'Данные владельца',
      activeNav: 1,
      leadingBack: true,
      paymentNav: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ProgressDots(step: 1),
          const SizedBox(height: 12),
          _Pills(
            values: const ['Физлицо', 'Компания'],
            selected: ownerKind,
            onSelected: onOwnerKind,
          ),
          const SizedBox(height: 26),
          _Input(
            label: 'Номер свидетельства',
            value: certificateNumber,
            hint: 'Введите номер свидетельства',
            inputFormatters: const [_CertificateNumberFormatter()],
            onChanged: onCertificateNumber,
          ),
          _Input(
            label: 'ФИО / наименование',
            value: ownerName,
            hint: 'Введите владельца',
            onChanged: onOwnerName,
          ),
          _Input(
            label: 'Адрес проживания клиента',
            value: ownerAddress,
            hint: 'Введите адрес проживания',
            onChanged: onOwnerAddress,
          ),
          const SizedBox(height: 120),
          _PrimaryButton(text: 'Продолжить', onTap: () => unawaited(onNext())),
        ],
      ),
    );
  }
}

class _CylinderStep extends StatelessWidget {
  const _CylinderStep({
    required this.number,
    required this.maker,
    required this.volume,
    required this.year,
    required this.fuel,
    required this.reducerName,
    required this.controlUnitName,
    required this.reducerOptions,
    required this.controlUnitOptions,
    required this.makerOptions,
    required this.shape,
    required this.onNumber,
    required this.onMaker,
    required this.onVolume,
    required this.onYear,
    required this.onFuel,
    required this.onReducerName,
    required this.onControlUnitName,
    required this.onShape,
    required this.onNext,
  });
  final String number;
  final String maker;
  final String volume;
  final String year;
  final String fuel;
  final String reducerName;
  final String controlUnitName;
  final List<String> reducerOptions;
  final List<String> controlUnitOptions;
  final List<String> makerOptions;
  final String shape;
  final ValueChanged<String> onNumber;
  final ValueChanged<String> onMaker;
  final ValueChanged<String> onVolume;
  final ValueChanged<String> onYear;
  final ValueChanged<String> onFuel;
  final ValueChanged<String> onReducerName;
  final ValueChanged<String> onControlUnitName;
  final ValueChanged<String> onShape;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Новая инспекция',
      subtitle: 'Данные газового баллона',
      activeNav: 1,
      leadingBack: true,
      paymentNav: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ProgressDots(step: 3),
          const SizedBox(height: 12),
          _Pills(
            values: const ['Тороидальный', 'Цилиндрический'],
            selected: shape,
            onSelected: onShape,
          ),
          const SizedBox(height: 14),
          _Input(
            label: 'Номер баллона',
            value: number,
            hint: 'Введите номер баллона',
            onChanged: onNumber,
          ),
          _EquipmentPicker(
            label: 'Производитель',
            value: maker,
            options: makerOptions,
            otherHint: 'Введите производителя',
            onChanged: onMaker,
          ),
          _Input(
            label: 'Объем',
            value: volume,
            hint: 'Например 54 л',
            keyboardType: TextInputType.number,
            onChanged: onVolume,
          ),
          _Input(
            label: 'Год выпуска',
            value: year,
            hint: 'Введите год',
            keyboardType: TextInputType.number,
            onChanged: onYear,
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.only(left: 4, bottom: 8),
                  child: Text(
                    'Вид топлива',
                    style: TextStyle(
                      color: muted,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                _Pills(
                  values: const ['СНГ', 'КПГ'],
                  selected: _normalizeFuelType(fuel),
                  onSelected: onFuel,
                ),
              ],
            ),
          ),
          _EquipmentPicker(
            label: 'Название редуктора',
            value: reducerName,
            options: reducerOptions,
            otherHint: 'Введите название редуктора',
            onChanged: onReducerName,
          ),
          _EquipmentPicker(
            label: 'Электронный блок управления',
            value: controlUnitName,
            options: controlUnitOptions,
            otherHint: 'Введите название ЭБУ',
            onChanged: onControlUnitName,
          ),
          const SizedBox(height: 62),
          _PrimaryButton(text: 'Продолжить', onTap: onNext),
        ],
      ),
    );
  }
}

class _VehicleStep extends StatelessWidget {
  const _VehicleStep({
    required this.plate,
    required this.vin,
    required this.makeModel,
    required this.onPlate,
    required this.onVin,
    required this.onMakeModel,
    required this.onNext,
  });
  final String plate;
  final String vin;
  final String makeModel;
  final ValueChanged<String> onPlate;
  final ValueChanged<String> onVin;
  final ValueChanged<String> onMakeModel;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Новая инспекция',
      subtitle: 'Данные транспортного средства',
      activeNav: 1,
      leadingBack: true,
      paymentNav: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ProgressDots(step: 2),
          const SizedBox(height: 26),
          _Input(
            label: 'Государственный номер',
            value: plate,
            hint: 'Введите госномер',
            inputFormatters: const [_PlateNumberFormatter()],
            onChanged: onPlate,
          ),
          _Input(
            label: 'VIN',
            value: vin,
            hint: 'Введите VIN',
            onChanged: onVin,
          ),
          _Input(
            label: 'Марка и модель',
            value: makeModel,
            hint: 'Введите марку и модель',
            onChanged: onMakeModel,
          ),
          const SizedBox(height: 84),
          _PrimaryButton(text: 'Продолжить', onTap: onNext),
        ],
      ),
    );
  }
}

class _PhotoStep extends StatelessWidget {
  const _PhotoStep({
    required this.step,
    required this.title,
    required this.caption,
    required this.photoName,
    required this.photoBytes,
    required this.uploaded,
    this.locked = false,
    required this.onCamera,
    required this.onNext,
  });
  final int step;
  final String title;
  final String caption;
  final String? photoName;
  final List<int>? photoBytes;
  final bool uploaded;
  final bool locked;
  final VoidCallback onCamera;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: title,
      subtitle: 'Автоматическое распознавание',
      activeNav: 1,
      leadingBack: true,
      paymentNav: true,
      child: Column(
        children: [
          _ProgressDots(step: step),
          const SizedBox(height: 14),
          _PhotoBox(
            caption: locked
                ? 'Фото уже загружено и зафиксировано'
                : photoName == null
                ? caption
                : 'Фото выбрано: $photoName',
            imageBytes: photoBytes,
            onTap: locked ? null : onCamera,
            tall: true,
          ),
          const _InfoBox(
            title: 'Контроль качества',
            text: '• без бликов\n• номер читается\n• год выпуска виден',
          ),
          _PrimaryButton(
            text: locked
                ? 'Фото зафиксировано'
                : photoName == null
                ? 'Сделать фото'
                : 'Выбрать другое фото',
            icon: locked ? Icons.lock_rounded : Icons.camera_alt_rounded,
            onTap: locked ? null : onCamera,
          ),
          if (photoName != null || uploaded) ...[
            const SizedBox(height: 12),
            _PrimaryButton(
              text: 'Далее',
              icon: Icons.check_rounded,
              onTap: onNext,
            ),
          ],
        ],
      ),
    );
  }
}

class _DocumentScanStep extends StatelessWidget {
  const _DocumentScanStep({
    required this.names,
    required this.uploaded,
    required this.onUpload,
    required this.onNext,
  });
  final Map<String, String> names;
  final Map<String, bool> uploaded;
  final void Function(String type, String label) onUpload;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final allSelected = inspectionPackageDocuments.keys.every(
      names.containsKey,
    );
    return _AppScreen(
      title: 'Пакет документов',
      subtitle: '5 обязательных файлов',
      activeNav: 1,
      leadingBack: true,
      paymentNav: true,
      child: Column(
        children: [
          _ProgressDots(step: 7),
          const SizedBox(height: 14),
          const _InfoBox(
            title: 'Загрузите полный комплект',
            text:
                'Публичная проверка покажет только свидетельство. Контрольный орган увидит весь пакет без функции печати.',
          ),
          const SizedBox(height: 10),
          for (final entry in inspectionPackageDocuments.entries)
            _ListTileCard(
              icon: names.containsKey(entry.key)
                  ? Icons.check_circle_rounded
                  : Icons.upload_file_rounded,
              title: entry.value,
              subtitle: names[entry.key] ?? 'PDF, JPG, PNG',
              status: names.containsKey(entry.key) ? 'Выбрано' : 'Выбрать',
              onTap: () => onUpload(entry.key, entry.value),
            ),
          if (allSelected) ...[
            const SizedBox(height: 12),
            _PrimaryButton(
              text: 'Далее',
              icon: Icons.check_rounded,
              onTap: onNext,
            ),
          ],
        ],
      ),
    );
  }
}

class _ValidityStep extends StatelessWidget {
  const _ValidityStep({
    required this.issuedAt,
    required this.validUntil,
    required this.onNext,
  });

  final String issuedAt;
  final String validUntil;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final issueDate = issuedAt.isEmpty ? _todayIsoDate() : issuedAt;
    final expiryDate = validUntil.isEmpty
        ? _plusYearsIso(issueDate, 2)
        : validUntil;
    return _AppScreen(
      title: 'Срок действия',
      subtitle: '2 года',
      activeNav: 1,
      child: Column(
        children: [
          _ProgressDots(step: 6),
          const SizedBox(height: 12),
          _Input(label: 'Дата выдачи', value: _displayDate(issueDate)),
          _Input(label: 'Дата окончания', value: _displayDate(expiryDate)),
          _GreenPanel(
            title: '730 дней',
            subtitle: 'Срок действия свидетельства',
            trailing: const Icon(
              Icons.calendar_month_rounded,
              color: Colors.white70,
              size: 34,
            ),
          ),
          const _ToggleRow('НЦА контроль', true),
          const _ToggleRow('QR подпись', true),
          const _ToggleRow('В реестр', true),
          const _ToggleRow('Без штрафов', true),
          _PrimaryButton(text: 'Продолжить', onTap: onNext),
        ],
      ),
    );
  }
}

class _ReviewStep extends StatelessWidget {
  const _ReviewStep({required this.onSubmit});
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final checks = [
      'Владелец',
      'Автомобиль',
      'Баллон',
      'Фото',
      'Пакет документов',
      'Подтверждение данных',
    ];
    return _AppScreen(
      title: 'Проверка данных',
      subtitle: 'Перед отправкой оператору',
      activeNav: 1,
      child: Column(
        children: [
          _ProgressDots(step: 8),
          const SizedBox(height: 12),
          for (final c in checks)
            _ListTileCard(
              icon: Icons.check_circle_rounded,
              title: c,
              subtitle: 'Данные заполнены',
              status: 'Готово',
            ),
          _PrimaryButton(
            text: 'Отправить оператору',
            icon: Icons.send_rounded,
            onTap: onSubmit,
          ),
        ],
      ),
    );
  }
}

class _OperatorHome extends StatelessWidget {
  const _OperatorHome({required this.go});
  final void Function(int) go;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Панель оператора',
      subtitle: 'АЦТО · региональный контроль',
      activeNav: 0,
      child: Column(
        children: [
          Row(
            children: const [
              Expanded(child: _StatCard('12', 'на проверке', green)),
              SizedBox(width: 10),
              Expanded(child: _StatCard('4', 'риски', warn)),
            ],
          ),
          const SizedBox(height: 12),
          _PrimaryButton(
            text: 'Открыть очередь',
            icon: Icons.playlist_add_check_rounded,
            onTap: () => go(23),
          ),
          _ListTileCard(
            icon: Icons.description_rounded,
            title: 'ИИН 8601******',
            subtitle: 'Toyota Camry · Алматы',
            status: 'Новая',
            onTap: () => go(23),
          ),
          _ListTileCard(
            icon: Icons.description_rounded,
            title: 'ИИН 9002******',
            subtitle: 'Kia Sportage · Турксиб',
            status: 'Проверка',
          ),
        ],
      ),
    );
  }
}

class _VideoCenter extends StatelessWidget {
  const _VideoCenter({required this.go});
  final void Function(int) go;

  @override
  Widget build(BuildContext context) {
    const cameras = [
      ('CAM-08 · Алматы', 'LIVE'),
      ('CAM-03 · Астана', 'LIVE'),
      ('CAM-12 · Шымкент', 'REC'),
      ('CAM-21 · Караганда', 'LIVE'),
    ];
    return _AppScreen(
      title: 'Видеоцентр НЦА',
      subtitle: 'Онлайн-контроль инспекций',
      activeNav: 1,
      videoNav: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _VideoStatsRow(),
          const SizedBox(height: 18),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 1.28,
            children: [
              for (final camera in cameras)
                _CameraCard(
                  title: camera.$1,
                  status: camera.$2,
                  onTap: () => go(30),
                ),
            ],
          ),
          const SizedBox(height: 28),
          const Align(
            alignment: Alignment.centerLeft,
            child: Text('Карта событий', style: _section),
          ),
          const SizedBox(height: 12),
          _OsmOrganizationsMap(
            height: 240,
            organizations: _mapOrganizations(const [
              OrganizationSummary(
                id: 'local-inspection-3',
                name: 'Инспекция №3',
                bin: '240101300003',
                status: 'active',
                region: 'Алматы',
                type: 'inspection_org',
                address: 'пр. Достык 132',
                lat: 43.237156,
                lng: 76.945618,
              ),
              OrganizationSummary(
                id: 'local-installer',
                name: 'EcoGas Install',
                bin: '123456789012',
                status: 'active',
                region: 'Алматы',
                type: 'installer',
                address: 'ул. Абая 48',
                lat: 43.238949,
                lng: 76.889709,
              ),
            ]),
          ),
        ],
      ),
    );
  }
}

class _VideoStatsRow extends StatelessWidget {
  const _VideoStatsRow();

  @override
  Widget build(BuildContext context) {
    const items = [
      (Icons.videocam_rounded, '6 LIVE', danger),
      (Icons.camera_alt_rounded, '24 камеры', green),
      (Icons.warning_rounded, '2 события', warn),
    ];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final item in items)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: item.$3.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(item.$1, color: item.$3, size: 14),
                const SizedBox(width: 6),
                Text(
                  item.$2,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: item.$3,
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _LiveCamera extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: darkGreen,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              children: [
                const CircleAvatar(radius: 18, backgroundColor: Colors.white),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'CAM-08 · LIVE',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      SizedBox(height: 5),
                      Text(
                        'Алматы · EcoGas Service',
                        style: TextStyle(color: Colors.white70, fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.black,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: Colors.white24),
                ),
                child: Stack(
                  children: const [
                    Positioned(left: 18, top: 18, child: _LiveBadge()),
                    Positioned(
                      right: 18,
                      top: 18,
                      child: _WhiteMiniPill('НЦА ONLINE'),
                    ),
                    Center(
                      child: SizedBox(
                        width: 320,
                        height: 260,
                        child: _LargeCarOutline(),
                      ),
                    ),
                    Positioned(
                      left: 18,
                      bottom: 46,
                      child: Text(
                        'INSP-2026-04122 · 777 AAA 02',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    Positioned(
                      left: 18,
                      bottom: 22,
                      child: Text(
                        '12:42:08 · запись защищена',
                        style: TextStyle(color: Colors.white54, fontSize: 11),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'CAM-08 · LIVE · 19.09.2026 11:48',
              style: TextStyle(color: Colors.white70, fontSize: 11),
            ),
            const SizedBox(height: 4),
            const LinearProgressIndicator(
              value: .72,
              minHeight: 4,
              color: green,
              backgroundColor: Colors.white24,
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: const [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: Colors.white,
                  child: Icon(Icons.camera_alt_rounded, color: green),
                ),
                CircleAvatar(
                  radius: 28,
                  backgroundColor: Colors.white,
                  child: Icon(Icons.check_rounded, color: green),
                ),
                CircleAvatar(
                  radius: 28,
                  backgroundColor: Color(0xFFFFF2D8),
                  child: Icon(Icons.warning_rounded, color: warn),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _LiveBadge extends StatelessWidget {
  const _LiveBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: danger,
        borderRadius: BorderRadius.circular(13),
      ),
      child: const Text(
        '• LIVE',
        style: TextStyle(
          color: Colors.white,
          fontSize: 10,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _LargeCarOutline extends StatelessWidget {
  const _LargeCarOutline();

  @override
  Widget build(BuildContext context) {
    return CustomPaint(painter: _LargeCarOutlinePainter());
  }
}

class _LargeCarOutlinePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white70
      ..strokeWidth = 2.4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final path = Path()
      ..moveTo(size.width * .10, size.height * .62)
      ..lineTo(size.width * .20, size.height * .28)
      ..lineTo(size.width * .38, size.height * .10)
      ..lineTo(size.width * .74, size.height * .10)
      ..lineTo(size.width * .88, size.height * .32)
      ..lineTo(size.width * .96, size.height * .62)
      ..moveTo(size.width * .10, size.height * .62)
      ..quadraticBezierTo(
        size.width * .04,
        size.height * .64,
        size.width * .04,
        size.height * .76,
      )
      ..lineTo(size.width * .04, size.height * .90)
      ..quadraticBezierTo(
        size.width * .04,
        size.height * .98,
        size.width * .13,
        size.height * .98,
      )
      ..lineTo(size.width * .92, size.height * .98)
      ..quadraticBezierTo(
        size.width * .98,
        size.height * .98,
        size.width * .98,
        size.height * .88,
      )
      ..lineTo(size.width * .98, size.height * .72)
      ..quadraticBezierTo(
        size.width * .98,
        size.height * .62,
        size.width * .90,
        size.height * .62,
      )
      ..lineTo(size.width * .10, size.height * .62);
    canvas.drawPath(path, paint);
    canvas.drawCircle(Offset(size.width * .23, size.height * .99), 18, paint);
    canvas.drawCircle(Offset(size.width * .79, size.height * .99), 18, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _CameraApi extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final cams = ['CAM-08', 'CAM-05', 'CAM-12', 'CAM-03'];
    return _AppScreen(
      title: 'API интеграция камер',
      subtitle: 'Подключение IP/API камер',
      activeNav: 3,
      leadingBack: true,
      action: _HeaderIconAction(
        onPressed: () => _showInfoDialog(
          context,
          title: 'API камер',
          text: 'Ссылка на API-интеграцию подготовлена для администратора.',
        ),
        icon: Icons.share_rounded,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _ApiCompactPanel(),
          const SizedBox(height: 24),
          const Padding(
            padding: EdgeInsets.only(left: 4, right: 4, bottom: 14),
            child: Row(
              children: [
                Expanded(child: Text('Камеры', style: _section)),
                Text(
                  'Добавить',
                  style: TextStyle(
                    color: green,
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
          for (final cam in cams) _ApiCameraCard(cam: cam),
          const SizedBox(height: 28),
          _PrimaryButton(
            text: 'Создать API-токен',
            icon: Icons.lock_rounded,
            onTap: () => _showInfoDialog(
              context,
              title: 'API-токен',
              text: 'Токен создается и привязывается к инспекционному органу.',
            ),
          ),
          const SizedBox(height: 10),
          const _ApiSyncStamp(),
        ],
      ),
    );
  }
}

class _ApiCompactPanel extends StatelessWidget {
  const _ApiCompactPanel();

  @override
  Widget build(BuildContext context) {
    final metrics = ResponsiveMetrics.of(context);
    return Container(
      constraints: BoxConstraints(minHeight: metrics.isCompact ? 76 : 68),
      padding: EdgeInsets.fromLTRB(
        metrics.isCompact ? 16 : 20,
        metrics.isCompact ? 12 : 13,
        metrics.isCompact ? 16 : 20,
        metrics.isCompact ? 12 : 13,
      ),
      decoration: BoxDecoration(
        color: green,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Color(0x22007A4D),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          const Icon(Icons.share_rounded, color: Colors.white, size: 24),
          SizedBox(width: metrics.isCompact ? 12 : 18),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'REST / Webhook / RTSP',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Версия API v1.6 · защищенный токен',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Color(0xBFFFFFFF),
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: 64,
            height: 34,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(17),
            ),
            alignment: Alignment.center,
            child: const Text(
              'Online',
              style: TextStyle(
                color: Color(0x6600351F),
                fontSize: 10,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ApiCameraCard extends StatelessWidget {
  const _ApiCameraCard({required this.cam});
  final String cam;

  @override
  Widget build(BuildContext context) {
    final details = {
      'CAM-08': 'EcoGas Service · RTSP',
      'CAM-05': 'Инспекция № 3 · Webhook',
      'CAM-12': 'City GBO Center · RTSP',
      'CAM-03': 'Gas Control KZ · API',
    };
    final failed = cam == 'CAM-12';
    return _Card(
      elevated: true,
      padding: const EdgeInsets.fromLTRB(15, 11, 10, 11),
      child: Row(
        children: [
          const CircleAvatar(
            radius: 18,
            backgroundColor: softGreen,
            child: Icon(Icons.camera_alt_rounded, color: green, size: 18),
          ),
          const SizedBox(width: 18),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  cam,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: _bold,
                ),
                const SizedBox(height: 4),
                Text(
                  details[cam]!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: _muted,
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              _Chip(failed ? 'Ошибка' : 'Online'),
              const SizedBox(height: 6),
              const Text(
                'Настроить',
                style: TextStyle(
                  color: green,
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ApiSyncStamp extends StatelessWidget {
  const _ApiSyncStamp();

  @override
  Widget build(BuildContext context) {
    return _Card(
      color: const Color(0xFFF0FAF5),
      padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Последняя синхронизация',
            style: TextStyle(
              color: muted,
              fontSize: 10,
              fontWeight: FontWeight.w800,
            ),
          ),
          SizedBox(height: 12),
          Text(
            '19.06.2026 · 12:42:18',
            style: TextStyle(
              color: green,
              fontSize: 12,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _VideoAudit extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Аудит видеосессии',
      subtitle: '1238-12-147',
      activeNav: 1,
      leadingBack: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _VideoAuditPanel(),
          const SizedBox(height: 28),
          const Padding(
            padding: EdgeInsets.only(left: 4, bottom: 18),
            child: Text('Хронология', style: _section),
          ),
          const _VideoAuditTimeline(),
          const SizedBox(height: 34),
          _PrimaryButton(
            text: 'Открыть полное видео',
            icon: Icons.videocam_rounded,
            onTap: () => _showInfoDialog(
              context,
              title: 'Полное видео',
              text: 'Видеоархив доступен после подключения HLS-сессии камеры.',
            ),
          ),
        ],
      ),
    );
  }
}

class _VideoAuditPanel extends StatelessWidget {
  const _VideoAuditPanel();

  @override
  Widget build(BuildContext context) {
    final metrics = ResponsiveMetrics.of(context);
    return Container(
      constraints: BoxConstraints(minHeight: metrics.isCompact ? 96 : 86),
      padding: EdgeInsets.fromLTRB(
        metrics.isCompact ? 14 : 18,
        metrics.isCompact ? 14 : 16,
        metrics.isCompact ? 14 : 18,
        metrics.isCompact ? 14 : 16,
      ),
      decoration: BoxDecoration(
        color: green,
        borderRadius: BorderRadius.circular(17),
        boxShadow: const [
          BoxShadow(
            color: Color(0x22007A4D),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '12:38-12:47',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  '9 минут · запись сохранена',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Color(0xBFFFFFFF),
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: metrics.isCompact ? 74 : 82,
            height: 34,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
            ),
            alignment: Alignment.center,
            child: const Text(
              'Проверено',
              style: TextStyle(
                color: Color(0x6600351F),
                fontSize: 10,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _VideoAuditTimeline extends StatelessWidget {
  const _VideoAuditTimeline();

  @override
  Widget build(BuildContext context) {
    const rows = [
      ('12:38:02', 'Сессия начата', Icons.videocam_rounded, green),
      ('12:39:14', 'VIN распознан', Icons.directions_car_rounded, green),
      ('12:41:08', 'Фото бирки сохранено', Icons.camera_alt_rounded, green),
      (
        '12:44:40',
        'Нарушений не обнаружено',
        Icons.check_circle_rounded,
        green,
      ),
      ('12:47:03', 'Сессия завершена', Icons.lock_open_rounded, blue),
    ];
    return Padding(
      padding: const EdgeInsets.only(left: 18, right: 14),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++)
            SizedBox(
              height: i == rows.length - 1 ? 68 : 78,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Column(
                    children: [
                      CircleAvatar(radius: 8, backgroundColor: rows[i].$4),
                      if (i != rows.length - 1)
                        Container(width: 1, height: 54, color: line),
                    ],
                  ),
                  const SizedBox(width: 18),
                  SizedBox(
                    width: 70,
                    child: Text(
                      rows[i].$1,
                      style: const TextStyle(
                        color: muted,
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      rows[i].$2,
                      style: const TextStyle(
                        color: darkGreen,
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  Icon(rows[i].$3, color: rows[i].$4, size: 18),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _ManageInspectors extends StatelessWidget {
  const _ManageInspectors({required this.go});
  final void Function(int) go;

  @override
  Widget build(BuildContext context) {
    final rows = [
      'EcoGas Service',
      'Auto Service',
      'Kobe Agent',
      'Gas Control KZ',
      'Sky Auto Center',
    ];
    return _AppScreen(
      title: 'Инспекционные органы',
      subtitle: 'Управление и блокировки',
      activeNav: 3,
      child: Column(
        children: [
          const _SearchBarCard(hint: 'ИИН, название или регион'),
          _Pills(
            values: const ['Все', 'Активные', 'Заблокированные'],
            selected: 'Все',
          ),
          const SizedBox(height: 12),
          for (final row in rows)
            _ListTileCard(
              icon: Icons.business_rounded,
              title: row,
              subtitle: 'Алматы · 18 заявок',
              status: row == 'Gas Control KZ' ? 'Блок' : 'Активен',
              onTap: () => go(34),
            ),
          _PrimaryButton(
            text: 'Добавить инспекционный орган',
            onTap: () => _showInfoDialog(
              context,
              title: 'Добавление инспекционного органа',
              text: 'Создание организации выполняется через админку.',
            ),
          ),
        ],
      ),
    );
  }
}

class _BlockInspector extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Блокировка инспекционного органа',
      subtitle: 'Gas Control KZ',
      activeNav: 3,
      child: Column(
        children: [
          const _ListTileCard(
            icon: Icons.business_rounded,
            title: 'Gas Control KZ',
            subtitle: 'Алматы · активный профиль',
            status: 'Активен',
          ),
          const _Input(
            label: 'Причина блокировки',
            value: 'Нарушение технических требований',
          ),
          const _Input(
            label: 'Комментарий',
            value: 'Опишите детали блокировки',
          ),
          const _WarningCard(
            text:
                'После блокировки организация не сможет создавать свидетельства.',
          ),
          _DangerButton(
            text: 'Заблокировать доступ',
            onTap: () => _showInfoDialog(
              context,
              title: 'Блокировка доступа',
              text:
                  'Доступ инспекционного органа будет заблокирован после подтверждения администратором.',
            ),
          ),
        ],
      ),
    );
  }
}

class _Promotion extends StatelessWidget {
  const _Promotion({required this.promoted, required this.onChanged});
  final bool promoted;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Реклама и продвижение',
      subtitle: 'Установщики на карте',
      activeNav: 3,
      child: Column(
        children: [
          Row(
            children: const [
              Expanded(child: _StatCard('6', 'баннеров', green)),
              SizedBox(width: 10),
              Expanded(child: _StatCard('12', 'точек', warn)),
            ],
          ),
          const SizedBox(height: 12),
          SwitchListTile(
            value: promoted,
            onChanged: onChanged,
            title: const Text('Платное продвижение', style: _bold),
            subtitle: const Text('Показывать выше на карте'),
            activeThumbColor: green,
          ),
          const _ListTileCard(
            icon: Icons.campaign_rounded,
            title: 'Баннер на главной',
            subtitle: 'активен до 30.09.2026',
            status: 'Активен',
          ),
          const _ListTileCard(
            icon: Icons.place_rounded,
            title: 'EcoGas Install · карта',
            subtitle: 'продвинутый показ',
            status: 'Продвижение',
          ),
        ],
      ),
    );
  }
}

class _GovHome extends StatelessWidget {
  const _GovHome({
    required this.go,
    required this.certificates,
    required this.onReload,
  });
  final void Function(int) go;
  final List<RegistryVehicle> certificates;
  final Future<void> Function({String q}) onReload;

  @override
  Widget build(BuildContext context) {
    final filesCount = certificates.fold<int>(
      0,
      (sum, item) => sum + item.documents.length,
    );
    return _AppScreen(
      title: 'Контрольный орган',
      subtitle: 'Доступ для просмотра',
      activeNav: 0,
      go: go,
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  certificates.length.toString(),
                  'опубликовано',
                  green,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(child: _StatCard(filesCount.toString(), 'файлов', warn)),
            ],
          ),
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 1.65,
            children: [
              _QuickAction(Icons.search_rounded, 'Реестр', () => go(37)),
              _QuickAction(Icons.map_rounded, 'Карта', () => go(11)),
            ],
          ),
          const SizedBox(height: 12),
          _PrimaryButton(
            text: 'Обновить реестр',
            icon: Icons.refresh_rounded,
            onTap: () => onReload(),
          ),
        ],
      ),
    );
  }
}

class _GovRegistry extends StatelessWidget {
  const _GovRegistry({
    required this.go,
    required this.certificates,
    required this.plateNumber,
    required this.vinLast3,
    required this.dateFrom,
    required this.dateTo,
    required this.onPlateNumber,
    required this.onVinLast3,
    required this.onDateFrom,
    required this.onDateTo,
    required this.onSearch,
    required this.onClear,
    required this.onReload,
    required this.onOpen,
  });
  final void Function(int) go;
  final List<RegistryVehicle> certificates;
  final String plateNumber;
  final String vinLast3;
  final String dateFrom;
  final String dateTo;
  final ValueChanged<String> onPlateNumber;
  final ValueChanged<String> onVinLast3;
  final ValueChanged<String> onDateFrom;
  final ValueChanged<String> onDateTo;
  final Future<void> Function() onSearch;
  final Future<void> Function() onClear;
  final Future<void> Function({String q}) onReload;
  final ValueChanged<RegistryVehicle> onOpen;

  @override
  Widget build(BuildContext context) {
    return _Watermark(
      child: _AppScreen(
        title: 'Реестр свидетельств',
        subtitle: 'Государственный просмотр',
        activeNav: 1,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Card(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Поиск свидетельства',
                    style: TextStyle(
                      color: ink,
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 10),
                  _Input(
                    label: 'Госномер',
                    hint: 'Например 123ABC02',
                    value: plateNumber,
                    inputFormatters: const [_PlateNumberFormatter()],
                    onChanged: onPlateNumber,
                  ),
                  _Input(
                    label: 'Последние 3 VIN',
                    hint: '123',
                    value: vinLast3,
                    inputFormatters: [
                      LengthLimitingTextInputFormatter(3),
                      const _UppercaseFormatter(),
                    ],
                    onChanged: onVinLast3,
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: _DateFilterInput(
                          label: 'Дата от',
                          value: dateFrom,
                          onChanged: onDateFrom,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _DateFilterInput(
                          label: 'Дата до',
                          value: dateTo,
                          onChanged: onDateTo,
                        ),
                      ),
                    ],
                  ),
                  _PrimaryButton(
                    text: 'Найти свидетельства',
                    icon: Icons.search_rounded,
                    onTap: onSearch,
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: onClear,
                    icon: const Icon(Icons.close_rounded),
                    label: const Text('Сбросить фильтры'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            _PrimaryButton(
              text: 'Обновить опубликованные свидетельства',
              icon: Icons.refresh_rounded,
              onTap: () => onReload(),
            ),
            const SizedBox(height: 12),
            if (certificates.isEmpty)
              const _EmptyState(
                icon: Icons.description_rounded,
                title: 'Опубликованных свидетельств нет',
                subtitle: 'Нажмите обновить или проверьте публикацию инспекций',
              )
            else
              for (final item in certificates)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _ListTileCard(
                    icon: Icons.description_rounded,
                    title: item.certificateNumber.isEmpty
                        ? 'Свидетельство'
                        : item.certificateNumber,
                    subtitle: [
                      item.plateNumber,
                      item.vin.isEmpty ? '' : 'VIN ${item.vin}',
                      item.ownerName.isEmpty
                          ? 'владелец не указан'
                          : item.ownerName,
                      item.organizationName.isEmpty
                          ? ''
                          : 'ИО: ${item.organizationName}',
                    ].where((value) => value.trim().isNotEmpty).join(' · '),
                    status: item.validUntil.isEmpty
                        ? 'Действует'
                        : 'до ${item.validUntil}',
                    onTap: () => onOpen(item),
                  ),
                ),
            const _WarningCard(
              text:
                  'Просмотр журналируется. Скачивание и печать документов отключены.',
            ),
          ],
        ),
      ),
    );
  }
}

class _UppercaseFormatter extends TextInputFormatter {
  const _UppercaseFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final normalized = newValue.text
        .replaceAll(RegExp(r'[^0-9a-zA-Zа-яА-Я]'), '')
        .toUpperCase();
    return TextEditingValue(
      text: normalized,
      selection: TextSelection.collapsed(offset: normalized.length),
    );
  }
}

class _DateFilterInput extends StatelessWidget {
  const _DateFilterInput({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final String value;
  final ValueChanged<String> onChanged;

  Future<void> _pick(BuildContext context) async {
    final initial = DateTime.tryParse(value) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
    );
    if (picked == null) return;
    onChanged(_formatDate(picked));
  }

  static String _formatDate(DateTime date) {
    String two(int value) => value.toString().padLeft(2, '0');
    return '${date.year}-${two(date.month)}-${two(date.day)}';
  }

  @override
  Widget build(BuildContext context) {
    return _Input(
      label: label,
      hint: 'ГГГГ-ММ-ДД',
      value: value,
      suffix: 'Дата',
      readOnly: true,
      onTap: () => _pick(context),
    );
  }
}

class _Notifications extends StatelessWidget {
  const _Notifications({
    required this.go,
    required this.notifications,
    required this.onReload,
    required this.onOpen,
  });
  final void Function(int) go;
  final List<AppNotification> notifications;
  final Future<void> Function() onReload;
  final ValueChanged<AppNotification> onOpen;

  @override
  Widget build(BuildContext context) {
    return _AppScreen(
      title: 'Уведомления',
      subtitle: 'События реестра',
      activeNav: 3,
      go: go,
      child: Column(
        children: [
          _PrimaryButton(
            text: 'Обновить уведомления',
            icon: Icons.refresh_rounded,
            onTap: onReload,
          ),
          const SizedBox(height: 12),
          if (notifications.isEmpty)
            const _EmptyState(
              icon: Icons.notifications_none_rounded,
              title: 'Событий нет',
              subtitle: 'После реальных действий в системе они появятся здесь',
            )
          else
            for (final item in notifications)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _ListTileCard(
                  icon: item.entity == 'inspection'
                      ? Icons.assignment_rounded
                      : Icons.verified_rounded,
                  title: item.title.isEmpty ? 'Событие системы' : item.title,
                  subtitle: [
                    item.body,
                    item.createdAt.isEmpty ? '' : item.createdAt,
                  ].where((value) => value.trim().isNotEmpty).join(' · '),
                  status: item.read ? 'Прочитано' : 'Новое',
                  onTap: () => onOpen(item),
                ),
              ),
        ],
      ),
    );
  }
}

class _ProfileSecurity extends StatelessWidget {
  const _ProfileSecurity({
    required this.go,
    required this.onLogout,
    required this.user,
    required this.roleLabel,
    required this.history,
    required this.inspectionOrganization,
    required this.inspections,
    required this.isInspectionManager,
    required this.selectedEmployee,
    required this.employeeActivityDateFrom,
    required this.employeeActivityDateTo,
    required this.onSelectEmployee,
    required this.onCloseEmployee,
    required this.onEmployeeDateFrom,
    required this.onEmployeeDateTo,
    required this.onReloadHistory,
    required this.language,
    required this.onLanguage,
  });
  final void Function(int) go;
  final VoidCallback onLogout;
  final AppUser? user;
  final String roleLabel;
  final List<ViewHistoryItem> history;
  final OrganizationSummary? inspectionOrganization;
  final List<InspectionSummary> inspections;
  final bool isInspectionManager;
  final OrganizationMemberSummary? selectedEmployee;
  final String employeeActivityDateFrom;
  final String employeeActivityDateTo;
  final ValueChanged<OrganizationMemberSummary> onSelectEmployee;
  final VoidCallback onCloseEmployee;
  final ValueChanged<String> onEmployeeDateFrom;
  final ValueChanged<String> onEmployeeDateTo;
  final Future<void> Function() onReloadHistory;
  final String language;
  final ValueChanged<String> onLanguage;

  @override
  Widget build(BuildContext context) {
    final roles = user?.roles.join(', ') ?? 'сессия не восстановлена';
    final phone = user?.phone.trim().isEmpty ?? true
        ? 'Телефон не указан'
        : user!.phone;
    final employees =
        inspectionOrganization?.members
            .where((member) => !member.isManager)
            .toList() ??
        const <OrganizationMemberSummary>[];
    return _AppScreen(
      title: 'Профиль',
      subtitle: 'Данные пользователя',
      activeNav: 4,
      go: go,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Card(
            elevated: true,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Информация о пользователе', style: _section),
                const SizedBox(height: 14),
                _InfoLine(icon: Icons.phone_rounded, text: phone),
                _InfoLine(icon: Icons.badge_rounded, text: roleLabel),
                _InfoLine(icon: Icons.verified_user_rounded, text: roles),
              ],
            ),
          ),
          if (isInspectionManager) ...[
            const SizedBox(height: 16),
            _Card(
              elevated: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Сотрудники ИО', style: _section),
                  const SizedBox(height: 12),
                  if (employees.isEmpty)
                    const Text(
                      'Сотрудники еще не добавлены',
                      style: TextStyle(
                        color: muted,
                        fontWeight: FontWeight.w700,
                      ),
                    )
                  else
                    for (final employee in employees)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _EmployeeActivityCard(
                          employee: employee,
                          inspections: inspections,
                          selected: selectedEmployee?.userId == employee.userId,
                          onTap: () => onSelectEmployee(employee),
                        ),
                      ),
                  if (selectedEmployee != null) ...[
                    const SizedBox(height: 6),
                    _EmployeeDetailPanel(
                      employee: selectedEmployee!,
                      inspections: inspections,
                      dateFrom: employeeActivityDateFrom,
                      dateTo: employeeActivityDateTo,
                      onDateFrom: onEmployeeDateFrom,
                      onDateTo: onEmployeeDateTo,
                      onClose: onCloseEmployee,
                    ),
                  ],
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          Row(
            children: [
              const Expanded(
                child: Text('История просмотров', style: _section),
              ),
              IconButton.filledTonal(
                onPressed: onReloadHistory,
                icon: const Icon(Icons.refresh_rounded),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (history.isEmpty)
            const _EmptyState(
              icon: Icons.history_rounded,
              title: 'История пустая',
              subtitle:
                  'Просмотренные свидетельства и организации появятся здесь',
            )
          else
            for (final item in history.take(30))
              _ListTileCard(
                icon: item.entity == 'organization'
                    ? Icons.apartment_rounded
                    : Icons.description_rounded,
                title: item.title.isEmpty
                    ? (item.entity == 'organization'
                          ? 'Инспекционный орган'
                          : 'Свидетельство')
                    : item.title,
                subtitle: [
                  item.entityId,
                  item.createdAt,
                ].where((value) => value.trim().isNotEmpty).join(' · '),
                status: item.entity == 'organization'
                    ? 'Организация'
                    : 'Свидетельство',
              ),
          const SizedBox(height: 16),
          _Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Смена языка', style: _section),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _LanguageChoice(
                      label: 'Русский',
                      selected: language == 'Русский',
                      onTap: () => onLanguage('Русский'),
                    ),
                    _LanguageChoice(
                      label: 'Қазақша',
                      selected: language == 'Қазақша',
                      onTap: () => onLanguage('Қазақша'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          _PlainLogoutButton(text: 'Выйти из аккаунта', onTap: onLogout),
        ],
      ),
    );
  }
}

class _EmployeeActivityCard extends StatelessWidget {
  const _EmployeeActivityCard({
    required this.employee,
    required this.inspections,
    required this.selected,
    required this.onTap,
  });

  final OrganizationMemberSummary employee;
  final List<InspectionSummary> inspections;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final employeeInspections = inspections.where((inspection) {
      return inspection.createdByPhone == employee.phone ||
          inspection.submittedByPhone == employee.phone ||
          inspection.createdByName == employee.fullName ||
          inspection.submittedByName == employee.fullName;
    }).toList();
    final submitted = employeeInspections
        .where((inspection) => inspection.status == 'submitted')
        .length;
    final approved = employeeInspections
        .where((inspection) => inspection.status == 'approved')
        .length;
    final lastIssued = employeeInspections.isEmpty
        ? ''
        : employeeInspections
              .map(
                (inspection) => inspection.submittedAt.isEmpty
                    ? inspection.createdAt
                    : inspection.submittedAt,
              )
              .where((value) => value.trim().isNotEmpty)
              .fold<String>(
                '',
                (prev, value) => prev.compareTo(value) > 0 ? prev : value,
              );
    return _Card(
      onTap: onTap,
      color: selected ? softGreen : Colors.white,
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const CircleAvatar(
                radius: 18,
                backgroundColor: softGreen,
                child: Icon(Icons.person_rounded, color: green, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      employee.fullName.isEmpty
                          ? 'Сотрудник ИО'
                          : employee.fullName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: ink,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      employee.phone.isEmpty
                          ? 'Телефон не указан'
                          : employee.phone,
                      style: const TextStyle(
                        color: muted,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              _Chip('${employeeInspections.length} шт.'),
            ],
          ),
          const SizedBox(height: 10),
          _InfoLine(
            icon: Icons.login_rounded,
            text: employee.lastLoginAt.isEmpty
                ? 'В систему еще не входил'
                : 'Последний вход: ${_shortDateTime(employee.lastLoginAt)}',
          ),
          _InfoLine(
            icon: Icons.assignment_turned_in_rounded,
            text: 'На проверке: $submitted · в реестре: $approved',
          ),
          if (lastIssued.isNotEmpty)
            _InfoLine(
              icon: Icons.schedule_rounded,
              text: 'Последнее оформление: ${_shortDateTime(lastIssued)}',
            ),
        ],
      ),
    );
  }
}

class _EmployeeDetailPanel extends StatelessWidget {
  const _EmployeeDetailPanel({
    required this.employee,
    required this.inspections,
    required this.dateFrom,
    required this.dateTo,
    required this.onDateFrom,
    required this.onDateTo,
    required this.onClose,
  });

  final OrganizationMemberSummary employee;
  final List<InspectionSummary> inspections;
  final String dateFrom;
  final String dateTo;
  final ValueChanged<String> onDateFrom;
  final ValueChanged<String> onDateTo;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final related = _employeeInspections(employee, inspections)
        .where((item) => _employeeInspectionInRange(item, dateFrom, dateTo))
        .toList();
    final events = _employeeActivityEvents(employee, related, dateFrom, dateTo);
    final issued = related
        .where(
          (item) => item.status == 'approved' || item.approvedAt.isNotEmpty,
        )
        .length;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(cardRadius),
        border: Border.all(color: green.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Карточка сотрудника', style: _section),
              ),
              IconButton.filledTonal(
                onPressed: onClose,
                icon: const Icon(Icons.close_rounded),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _InfoLine(
            icon: Icons.person_rounded,
            text: employee.fullName.isEmpty
                ? 'ФИО не указано'
                : employee.fullName,
          ),
          _InfoLine(
            icon: Icons.phone_rounded,
            text: employee.phone.isEmpty ? 'Телефон не указан' : employee.phone,
          ),
          _InfoLine(
            icon: Icons.login_rounded,
            text: employee.lastLoginAt.isEmpty
                ? 'В систему еще не входил'
                : 'Последний вход: ${_shortDateTime(employee.lastLoginAt)}',
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _DateFilterInput(
                  label: 'Дата от',
                  value: dateFrom,
                  onChanged: onDateFrom,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _DateFilterInput(
                  label: 'Дата до',
                  value: dateTo,
                  onChanged: onDateTo,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text('Журнал действий (${events.length})', style: _section),
          const SizedBox(height: 8),
          if (events.isEmpty)
            const Text(
              'За выбранный период действий нет',
              style: TextStyle(color: muted, fontWeight: FontWeight.w700),
            )
          else
            for (final event in events.take(20))
              _InfoLine(icon: event.icon, text: event.text),
          const SizedBox(height: 12),
          Text(
            'Свидетельства: выбрано ${related.length}, выдано $issued',
            style: _section,
          ),
          const SizedBox(height: 8),
          if (related.isEmpty)
            const Text(
              'Свидетельств по сотруднику нет',
              style: TextStyle(color: muted, fontWeight: FontWeight.w700),
            )
          else
            for (final item in related.take(20))
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _ListTileCard(
                  icon: Icons.description_rounded,
                  title: item.certificateNumber.isEmpty
                      ? 'Свидетельство без номера'
                      : 'Свидетельство ${item.certificateNumber}',
                  subtitle: [
                    item.vehiclePlate,
                    item.vehicleVin,
                    item.ownerName,
                    _shortDateTime(
                      item.submittedAt.isEmpty
                          ? item.createdAt
                          : item.submittedAt,
                    ),
                  ].where((value) => value.trim().isNotEmpty).join(' · '),
                  status: _inspectionStatusLabel(item.status),
                ),
              ),
        ],
      ),
    );
  }
}

class _EmployeeActivityEvent {
  const _EmployeeActivityEvent(this.date, this.icon, this.text);
  final DateTime date;
  final IconData icon;
  final String text;
}

List<InspectionSummary> _employeeInspections(
  OrganizationMemberSummary employee,
  List<InspectionSummary> inspections,
) {
  return inspections.where((inspection) {
    return _sameEmployee(
          employee,
          inspection.createdByPhone,
          inspection.createdByName,
        ) ||
        _sameEmployee(
          employee,
          inspection.submittedByPhone,
          inspection.submittedByName,
        ) ||
        _sameEmployee(
          employee,
          inspection.approvedByPhone,
          inspection.approvedByName,
        );
  }).toList();
}

bool _sameEmployee(
  OrganizationMemberSummary employee,
  String phone,
  String name,
) {
  final employeePhone = employee.phone.trim();
  final employeeName = employee.fullName.trim();
  return (employeePhone.isNotEmpty && phone.trim() == employeePhone) ||
      (employeeName.isNotEmpty && name.trim() == employeeName);
}

bool _employeeInspectionInRange(
  InspectionSummary item,
  String dateFrom,
  String dateTo,
) {
  return [
    item.createdAt,
    item.submittedAt,
    item.approvedAt,
  ].any((value) => _dateInRange(value, dateFrom, dateTo));
}

List<_EmployeeActivityEvent> _employeeActivityEvents(
  OrganizationMemberSummary employee,
  List<InspectionSummary> inspections,
  String dateFrom,
  String dateTo,
) {
  final events = <_EmployeeActivityEvent>[];
  void add(String date, IconData icon, String text) {
    final parsed = _parseDateAny(date);
    if (parsed != null && _dateInRange(date, dateFrom, dateTo)) {
      events.add(_EmployeeActivityEvent(parsed, icon, text));
    }
  }

  add(
    employee.lastLoginAt,
    Icons.login_rounded,
    'Вход в систему: ${_shortDateTime(employee.lastLoginAt)}',
  );
  for (final item in inspections) {
    final title = item.certificateNumber.isEmpty
        ? item.vehiclePlate
        : item.certificateNumber;
    if (_sameEmployee(employee, item.createdByPhone, item.createdByName)) {
      add(item.createdAt, Icons.add_circle_rounded, 'Создал инспекцию: $title');
    }
    if (_sameEmployee(employee, item.submittedByPhone, item.submittedByName)) {
      add(item.submittedAt, Icons.send_rounded, 'Отправил на проверку: $title');
    }
    if (_sameEmployee(employee, item.approvedByPhone, item.approvedByName)) {
      add(
        item.approvedAt,
        Icons.verified_rounded,
        'Подтвердил в реестр: $title',
      );
    }
  }
  events.sort((a, b) => b.date.compareTo(a.date));
  return events;
}

bool _dateInRange(String value, String from, String to) {
  final date = _parseDateAny(value);
  if (date == null) return from.trim().isEmpty && to.trim().isEmpty;
  final fromDate = _parseDateAny(from);
  final toDate = _parseDateAny(to);
  if (fromDate != null) {
    final start = DateTime(fromDate.year, fromDate.month, fromDate.day);
    if (date.isBefore(start)) return false;
  }
  if (toDate != null) {
    final end = DateTime(toDate.year, toDate.month, toDate.day, 23, 59, 59);
    if (date.isAfter(end)) return false;
  }
  return true;
}

DateTime? _parseDateAny(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return null;
  return DateTime.tryParse(trimmed);
}

class _LanguageChoice extends StatelessWidget {
  const _LanguageChoice({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      selectedColor: softGreen,
      backgroundColor: Colors.white,
      side: BorderSide(color: selected ? green : line),
      labelStyle: TextStyle(
        color: selected ? green : ink,
        fontWeight: FontWeight.w900,
      ),
    );
  }
}

class _PlainLogoutButton extends StatelessWidget {
  const _PlainLogoutButton({required this.text, required this.onTap});
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          backgroundColor: Colors.white,
          foregroundColor: ink,
          side: const BorderSide(color: line),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w900)),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({
    required this.child,
    this.color = Colors.white,
    this.elevated = false,
    this.onTap,
    this.padding = const EdgeInsets.all(14),
  });
  final Widget child;
  final Color color;
  final bool elevated;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: color,
        borderRadius: BorderRadius.circular(cardRadius),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(cardRadius),
          child: Container(
            width: double.infinity,
            padding: padding,
            decoration: BoxDecoration(
              border: Border.all(
                color: color == Colors.white ? line : Colors.transparent,
              ),
              borderRadius: BorderRadius.circular(cardRadius),
              boxShadow: elevated
                  ? const [
                      BoxShadow(
                        color: Color(0x1A00351F),
                        blurRadius: 22,
                        offset: Offset(0, 10),
                      ),
                    ]
                  : null,
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

class _ListTileCard extends StatelessWidget {
  const _ListTileCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.status,
    this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final String? status;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return _Card(
      onTap: onTap,
      elevated: true,
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: softGreen,
            child: Icon(icon, color: green, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: _bold,
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: _muted,
                ),
              ],
            ),
          ),
          if (status != null) ...[
            const SizedBox(width: 8),
            Flexible(
              child: Align(
                alignment: Alignment.centerRight,
                child: _Chip(status!),
              ),
            ),
          ],
          if (status == null)
            const Icon(Icons.chevron_right_rounded, color: muted),
        ],
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.badge,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String badge;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final metrics = ResponsiveMetrics.of(context);
    return _Card(
      onTap: onTap,
      elevated: true,
      padding: EdgeInsets.fromLTRB(
        metrics.isCompact ? 12 : 16,
        metrics.isCompact ? 12 : 14,
        metrics.isCompact ? 12 : 16,
        metrics.isCompact ? 12 : 14,
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(minHeight: metrics.isCompact ? 92 : 84),
        child: Row(
          children: [
            Container(
              width: metrics.isCompact ? 48 : 54,
              height: metrics.isCompact ? 48 : 54,
              decoration: BoxDecoration(
                color: selected ? const Color(0xFFDDF3E9) : softGreen,
                shape: BoxShape.circle,
                border: Border.all(color: line),
              ),
              child: Icon(icon, color: green, size: 28),
            ),
            SizedBox(width: metrics.isCompact ? 10 : 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    maxLines: metrics.isCompact ? 2 : 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: green,
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  if (subtitle.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: _muted,
                    ),
                  ],
                  const SizedBox(height: 6),
                  Align(alignment: Alignment.centerLeft, child: _Chip(badge)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: darkGreen, size: 34),
          ],
        ),
      ),
    );
  }
}

class _Input extends StatefulWidget {
  const _Input({
    required this.label,
    required this.value,
    this.hint,
    this.suffix,
    this.keyboardType,
    this.inputFormatters,
    this.readOnly = false,
    this.onTap,
    this.onChanged,
  });

  final String label;
  final String value;
  final String? hint;
  final String? suffix;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final bool readOnly;
  final VoidCallback? onTap;
  final ValueChanged<String>? onChanged;

  @override
  State<_Input> createState() => _InputState();
}

class _InputState extends State<_Input> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.value);
  }

  @override
  void didUpdateWidget(covariant _Input oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != _controller.text) {
      _controller.value = TextEditingValue(
        text: widget.value,
        selection: TextSelection.collapsed(offset: widget.value.length),
      );
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: _controller,
        autofillHints: const [],
        enableSuggestions: false,
        readOnly: widget.readOnly,
        onTap: widget.onTap,
        keyboardType: widget.keyboardType,
        inputFormatters: widget.inputFormatters,
        onChanged: widget.onChanged,
        style: const TextStyle(color: ink, fontWeight: FontWeight.w800),
        decoration: InputDecoration(
          labelText: widget.label,
          hintText: widget.hint,
          suffixText: widget.suffix,
          prefixIcon: const Icon(Icons.lock_outline_rounded, size: 18),
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: line),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: line),
          ),
        ),
      ),
    );
  }
}

class _EquipmentPicker extends StatefulWidget {
  const _EquipmentPicker({
    required this.label,
    required this.value,
    required this.options,
    required this.otherHint,
    required this.onChanged,
  });

  final String label;
  final String value;
  final List<String> options;
  final String otherHint;
  final ValueChanged<String> onChanged;

  @override
  State<_EquipmentPicker> createState() => _EquipmentPickerState();
}

class _EquipmentPickerState extends State<_EquipmentPicker> {
  bool _otherMode = false;

  @override
  Widget build(BuildContext context) {
    final cleanOptions =
        widget.options
            .map((item) => item.trim())
            .where((item) => item.isNotEmpty)
            .toSet()
            .toList()
          ..sort();
    if (cleanOptions.isEmpty) {
      return _Input(
        label: widget.label,
        value: widget.value,
        hint: widget.otherHint,
        onChanged: widget.onChanged,
      );
    }
    final isKnown =
        widget.value.trim().isNotEmpty && cleanOptions.contains(widget.value);
    final dropdownValue = _otherMode
        ? 'Иное'
        : widget.value.trim().isEmpty
        ? ''
        : isKnown
        ? widget.value
        : 'Иное';
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: DropdownButtonFormField<String>(
            initialValue: dropdownValue,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: widget.label,
              prefixIcon: const Icon(Icons.tune_rounded, size: 18),
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: line),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: line),
              ),
            ),
            items: [
              const DropdownMenuItem(
                value: '',
                child: Text('Выберите из списка'),
              ),
              for (final option in cleanOptions)
                DropdownMenuItem(value: option, child: Text(option)),
              const DropdownMenuItem(value: 'Иное', child: Text('Иное')),
            ],
            onChanged: (next) {
              setState(() => _otherMode = next == 'Иное');
              widget.onChanged(next == 'Иное' ? '' : next ?? '');
            },
          ),
        ),
        if (dropdownValue == 'Иное')
          _Input(
            label: '${widget.label} - иное',
            value: widget.value,
            hint: widget.otherHint,
            onChanged: widget.onChanged,
          ),
      ],
    );
  }
}

class _SearchBarCard extends StatelessWidget {
  const _SearchBarCard({required this.hint});
  final String hint;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 70,
      child: TextField(
        style: const TextStyle(fontWeight: FontWeight.w800),
        decoration: InputDecoration(
          prefixIcon: const Padding(
            padding: EdgeInsets.only(left: 12, right: 8),
            child: Icon(Icons.search_rounded, color: green, size: 28),
          ),
          prefixIconConstraints: const BoxConstraints(minWidth: 56),
          hintText: hint,
          hintStyle: const TextStyle(
            color: muted,
            fontSize: 13,
            fontWeight: FontWeight.w800,
          ),
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 18,
            vertical: 22,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: line),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: line),
          ),
        ),
      ),
    );
  }
}

class _AdBanner extends StatefulWidget {
  const _AdBanner({required this.banners});

  final List<AppBanner> banners;

  @override
  State<_AdBanner> createState() => _AdBannerState();
}

class _AdBannerState extends State<_AdBanner> {
  Timer? _timer;
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _syncTimer();
  }

  @override
  void didUpdateWidget(covariant _AdBanner oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.banners.length != widget.banners.length) {
      _index = 0;
      _syncTimer();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _syncTimer() {
    _timer?.cancel();
    if (widget.banners.length < 2) return;
    _timer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted || widget.banners.isEmpty) return;
      setState(() => _index = (_index + 1) % widget.banners.length);
    });
  }

  Future<void> _openLink(String linkUrl) async {
    if (linkUrl.trim().isEmpty) return;
    final uri = Uri.tryParse(linkUrl.trim());
    if (uri == null || !uri.hasScheme) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final metrics = ResponsiveMetrics.of(context);
    final banner = widget.banners.isEmpty
        ? null
        : widget.banners[_index % widget.banners.length];
    return InkWell(
      borderRadius: BorderRadius.circular(22),
      onTap: banner == null ? null : () => _openLink(banner.linkUrl),
      child: Container(
        width: double.infinity,
        constraints: BoxConstraints(minHeight: metrics.isCompact ? 124 : 116),
        padding: EdgeInsets.fromLTRB(
          metrics.isCompact ? 16 : 20,
          metrics.isCompact ? 14 : 18,
          metrics.isCompact ? 16 : 22,
          metrics.isCompact ? 14 : 18,
        ),
        decoration: BoxDecoration(
          color: green,
          borderRadius: BorderRadius.circular(22),
          boxShadow: const [
            BoxShadow(
              color: Color(0x33007A4D),
              blurRadius: 22,
              offset: Offset(0, 12),
            ),
          ],
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'ПЛАТНОЕ РАЗМЕЩЕНИЕ',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 9,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  SizedBox(height: 10),
                  Text(
                    banner?.title.isNotEmpty == true
                        ? banner!.title
                        : 'Премиальный рекламный баннер',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  SizedBox(height: 6),
                  Text(
                    banner?.linkUrl.isNotEmpty == true
                        ? 'Нажмите, чтобы открыть'
                        : 'Любая разрешенная тематика · по договору',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            Container(
              width: metrics.isCompact ? 64 : 84,
              height: metrics.isCompact ? 58 : 70,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
              ),
              clipBehavior: Clip.antiAlias,
              child: banner == null
                  ? const Icon(
                      Icons.image_outlined,
                      color: Color(0xFF9ADDBD),
                      size: 32,
                    )
                  : Image.network(
                      _absoluteFileUrl(banner.imageUrl),
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stackTrace) => const Icon(
                        Icons.image_outlined,
                        color: Color(0xFF9ADDBD),
                        size: 32,
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GreenHero extends StatelessWidget {
  const _GreenHero({
    required this.title,
    required this.subtitle,
    required this.button,
    required this.onTap,
  });
  final String title;
  final String subtitle;
  final String button;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(minHeight: 116),
      padding: const EdgeInsets.fromLTRB(22, 18, 22, 18),
      decoration: BoxDecoration(
        color: green,
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            color: Color(0x33007A4D),
            blurRadius: 22,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          if (onTap != null)
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 120),
              child: FilledButton.tonal(
                onPressed: onTap,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    button,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _GreenPanel extends StatelessWidget {
  const _GreenPanel({
    required this.title,
    required this.subtitle,
    this.trailing,
  });

  final String title;
  final String subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: 108,
      padding: const EdgeInsets.fromLTRB(22, 18, 22, 18),
      decoration: BoxDecoration(
        color: const Color(0xFF006D45),
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: Color(0x28007A4D),
            blurRadius: 18,
            offset: Offset(0, 9),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 21,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 14), trailing!],
        ],
      ),
    );
  }
}

class _WhiteMiniPill extends StatelessWidget {
  const _WhiteMiniPill(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Text(
        text,
        style: const TextStyle(
          color: green,
          fontSize: 11,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction(this.icon, this.text, this.onTap);
  final IconData icon;
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _Card(
      onTap: onTap,
      elevated: true,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: softGreen,
              shape: BoxShape.circle,
              border: Border.all(color: line),
            ),
            child: Icon(icon, color: green, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              text,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: green,
                fontSize: 13,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoBox extends StatelessWidget {
  const _InfoBox({required this.title, required this.text});
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) => _Card(
    elevated: true,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: _bold),
        const SizedBox(height: 8),
        Text(text, style: _muted),
      ],
    ),
  );
}

class _SecurityPanel extends StatelessWidget {
  const _SecurityPanel();

  @override
  Widget build(BuildContext context) => const _InfoBox(
    title: 'Корпоративное подтверждение',
    text: 'Вход разрешён только по SMS и активному статусу организации.',
  );
}

class _WarningCard extends StatelessWidget {
  const _WarningCard({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => _Card(
    color: const Color(0xFFFFF8E8),
    child: Row(
      children: [
        const Icon(Icons.warning_amber_rounded, color: warn),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              color: Color(0xFF8A5A00),
              fontWeight: FontWeight.w800,
              fontSize: 12,
            ),
          ),
        ),
      ],
    ),
  );
}

class _Chip extends StatelessWidget {
  const _Chip(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    final c =
        text.contains('Блок') ||
            text.contains('Ошибка') ||
            text.contains('Риск')
        ? danger
        : text.contains('Провер') ||
              text.contains('Архив') ||
              text.contains('Огран') ||
              text.contains('Черн')
        ? warn
        : green;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(color: c, fontSize: 10, fontWeight: FontWeight.w900),
      ),
    );
  }
}

class _Pills extends StatelessWidget {
  const _Pills({required this.values, required this.selected, this.onSelected});
  final List<String> values;
  final String selected;
  final ValueChanged<String>? onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemBuilder: (context, i) {
          final active = values[i] == selected;
          final chip = Chip(
            label: Text(
              values[i],
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            backgroundColor: active ? green : Colors.white,
            labelStyle: TextStyle(
              color: active ? Colors.white : muted,
              fontWeight: FontWeight.w900,
              fontSize: 12,
            ),
            side: const BorderSide(color: line),
          );
          if (onSelected == null) return chip;
          return InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: () => onSelected!(values[i]),
            child: chip,
          );
        },
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemCount: values.length,
      ),
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({required this.text, required this.onTap, this.icon});
  final String text;
  final VoidCallback? onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final isLong = text.length > 34;
    return SizedBox(
      width: double.infinity,
      height: isLong ? 64 : 52,
      child: FilledButton.icon(
        onPressed: onTap,
        icon: Icon(icon ?? Icons.check_circle_rounded),
        label: Text(
          text,
          maxLines: isLong ? 2 : 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontWeight: FontWeight.w900,
            fontSize: isLong ? 12 : 14,
            height: 1.15,
          ),
        ),
        style: FilledButton.styleFrom(
          backgroundColor: green,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
    );
  }
}

class _DangerButton extends StatelessWidget {
  const _DangerButton({required this.text, required this.onTap});
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: double.infinity,
    height: 52,
    child: FilledButton(
      onPressed: onTap,
      style: FilledButton.styleFrom(backgroundColor: danger),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w900)),
      ),
    ),
  );
}

class _DualButtons extends StatelessWidget {
  const _DualButtons({
    required this.left,
    required this.right,
    this.onLeft,
    this.onRight,
  });
  final String left;
  final String right;
  final VoidCallback? onLeft;
  final VoidCallback? onRight;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: OutlinedButton(
          onPressed:
              onLeft ??
              () => _showInfoDialog(
                context,
                title: left,
                text: 'Действие открыто для просмотра.',
              ),
          child: FittedBox(fit: BoxFit.scaleDown, child: Text(left)),
        ),
      ),
      const SizedBox(width: 10),
      Expanded(
        child: FilledButton(
          onPressed:
              onRight ??
              () => _showInfoDialog(
                context,
                title: right,
                text: 'Действие открыто для просмотра.',
              ),
          style: FilledButton.styleFrom(backgroundColor: green),
          child: FittedBox(fit: BoxFit.scaleDown, child: Text(right)),
        ),
      ),
    ],
  );
}

class _LogoBig extends StatelessWidget {
  const _LogoBig();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 146,
      height: 146,
      decoration: BoxDecoration(
        color: const Color(0xFF073D66),
        borderRadius: BorderRadius.circular(34),
        boxShadow: const [
          BoxShadow(
            color: Color(0x4000112C),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned(
            right: 16,
            top: 18,
            child: Container(
              width: 34,
              height: 50,
              decoration: BoxDecoration(
                color: const Color(0xFF8AD12B),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
          Container(
            width: 76,
            height: 88,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(
              Icons.description_rounded,
              color: Color(0xFF0A4774),
              size: 50,
            ),
          ),
          const Positioned(
            left: 21,
            bottom: 31,
            child: Icon(
              Icons.directions_car_rounded,
              color: Colors.white,
              size: 74,
            ),
          ),
          Positioned(
            right: 24,
            top: 51,
            child: Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFF0A4774), width: 4),
              ),
              child: const Icon(
                Icons.check_rounded,
                color: Color(0xFF7AC943),
                size: 34,
              ),
            ),
          ),
          const Positioned(
            left: 31,
            bottom: 13,
            child: Icon(
              Icons.propane_tank_rounded,
              color: Colors.white,
              size: 35,
            ),
          ),
          const Positioned(
            right: 22,
            bottom: 13,
            child: Icon(
              Icons.propane_tank_rounded,
              color: Color(0xFF7AC943),
              size: 40,
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniLogo extends StatelessWidget {
  const _MiniLogo({this.size = 42});
  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: green,
      borderRadius: BorderRadius.circular(size / 3),
    ),
    child: Icon(
      Icons.fact_check_rounded,
      color: Colors.white,
      size: size * 0.62,
    ),
  );
}

class _Circle extends StatelessWidget {
  const _Circle(this.size, this.color);
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(color: color, shape: BoxShape.circle),
  );
}

class _SplashLawCard extends StatelessWidget {
  const _SplashLawCard({
    required this.title,
    required this.excerpt,
    required this.body,
  });

  final String title;
  final String excerpt;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => _showLawExtract(context, title: title, text: body),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.white24),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  Icon(
                    Icons.open_in_new_rounded,
                    color: Colors.white70,
                    size: 18,
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                excerpt,
                maxLines: 4,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 12,
                  height: 1.35,
                  fontWeight: FontWeight.w700,
                ),
              ),
              SizedBox(height: 8),
              Text(
                'Для автомобилей с ГБО контролируются герметичность системы, '
                'маркировка баллонов и наличие периодического освидетельствования '
                'в аккредитованных организациях. Нажмите, чтобы открыть полную выписку.',
                style: TextStyle(
                  color: Colors.white54,
                  fontSize: 11,
                  height: 1.35,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HintPill extends StatelessWidget {
  const _HintPill({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: softGreen,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Text(
        text,
        style: const TextStyle(
          color: green,
          fontSize: 12,
          fontWeight: FontWeight.w900,
        ),
      ),
    ),
  );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.subtitle,
  });
  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) => _Card(
    elevated: true,
    child: Column(
      children: [
        Icon(icon, color: green, size: 44),
        const SizedBox(height: 10),
        Text(title, style: _bold),
        Text(subtitle, style: _muted),
      ],
    ),
  );
}

class _PhotoBox extends StatelessWidget {
  const _PhotoBox({
    required this.caption,
    required this.onTap,
    this.tall = false,
    this.imageBytes,
  });
  final String caption;
  final VoidCallback? onTap;
  final bool tall;
  final List<int>? imageBytes;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      height: tall ? 400 : 300,
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: softGreen,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: line),
      ),
      child: imageBytes == null
          ? Column(
              mainAxisAlignment: tall
                  ? MainAxisAlignment.end
                  : MainAxisAlignment.center,
              children: [
                CircleAvatar(
                  radius: tall ? 34 : 20,
                  backgroundColor: Colors.white,
                  child: Icon(
                    Icons.camera_alt_rounded,
                    color: green,
                    size: tall ? 30 : 24,
                  ),
                ),
                SizedBox(height: tall ? 128 : 16),
                Text(caption, style: _bold),
                Text(
                  tall
                      ? 'Текст должен быть резким и полностью видимым'
                      : 'Нажмите для открытия камеры',
                  style: _muted,
                ),
                if (tall) const SizedBox(height: 32),
              ],
            )
          : ClipRRect(
              borderRadius: BorderRadius.circular(22),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.memory(
                    Uint8List.fromList(imageBytes!),
                    fit: BoxFit.cover,
                    gaplessPlayback: true,
                  ),
                  Positioned(
                    left: 12,
                    right: 12,
                    bottom: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.92),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Text(
                        caption,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: _bold,
                      ),
                    ),
                  ),
                ],
              ),
            ),
    ),
  );
}

class _ProgressDots extends StatelessWidget {
  const _ProgressDots({required this.step});
  final int step;

  @override
  Widget build(BuildContext context) => Row(
    children: List.generate(
      8,
      (i) => Expanded(
        child: Container(
          height: 5,
          margin: const EdgeInsets.symmetric(horizontal: 3),
          decoration: BoxDecoration(
            color: i < step ? green : line,
            borderRadius: BorderRadius.circular(5),
          ),
        ),
      ),
    ),
  );
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow(this.title, this.value);
  final String title;
  final bool value;

  @override
  Widget build(BuildContext context) => _Card(
    child: Row(
      children: [
        Expanded(child: Text(title, style: _bold)),
        Switch(value: value, onChanged: (_) {}, activeThumbColor: green),
      ],
    ),
  );
}

class _StatCard extends StatelessWidget {
  const _StatCard(this.value, this.label, this.color);
  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => _Card(
    elevated: true,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: TextStyle(
            color: color,
            fontSize: 24,
            fontWeight: FontWeight.w900,
          ),
        ),
        Text(label, style: _muted),
      ],
    ),
  );
}

class _MapOrganization {
  const _MapOrganization({
    required this.id,
    required this.name,
    required this.region,
    required this.address,
    required this.bin,
    required this.status,
    required this.phone,
    required this.point,
    required this.isInspection,
  });

  final String id;
  final String name;
  final String region;
  final String address;
  final String bin;
  final String status;
  final String phone;
  final LatLng point;
  final bool isInspection;
}

List<_MapOrganization> _mapOrganizations(List<OrganizationSummary> items) {
  return [
    for (var index = 0; index < items.length; index++)
      if (items[index].lat != null ||
          items[index].lng != null ||
          items[index].type == 'inspection_org')
        _MapOrganization(
          id: items[index].id,
          name: items[index].name.isEmpty
              ? 'Организация ${index + 1}'
              : items[index].name,
          region: items[index].region,
          address: items[index].address,
          bin: items[index].bin,
          status: items[index].status,
          phone: items[index].phone,
          point: LatLng(
            items[index].lat ?? (43.237156 + index * 0.004),
            items[index].lng ?? (76.945618 + index * 0.004),
          ),
          isInspection:
              items[index].type == 'inspection_org' ||
              items[index].name.toLowerCase().contains('инсп'),
        ),
  ];
}

class _OsmOrganizationsMap extends StatefulWidget {
  const _OsmOrganizationsMap({
    required this.organizations,
    this.certificates = const [],
    this.onOpenCertificate,
    this.onOpenOrganization,
    this.height,
  });

  final List<_MapOrganization> organizations;
  final List<RegistryVehicle> certificates;
  final ValueChanged<RegistryVehicle>? onOpenCertificate;
  final Future<void> Function(String id, String title)? onOpenOrganization;
  final double? height;

  @override
  State<_OsmOrganizationsMap> createState() => _OsmOrganizationsMapState();
}

class _OsmOrganizationsMapState extends State<_OsmOrganizationsMap> {
  final MapController _mapController = MapController();
  LatLng? userPoint;
  double zoom = 13;

  @override
  void initState() {
    super.initState();
    _loadUserLocation();
  }

  Future<void> _loadUserLocation() async {
    try {
      if (kIsWeb) {
        final position = await requestBrowserPosition();
        if (!mounted || position == null) return;
        final point = LatLng(position.latitude, position.longitude);
        setState(() {
          userPoint = point;
        });
        _mapController.move(point, 14);
        return;
      }
      if (!kIsWeb) {
        final enabled = await Geolocator.isLocationServiceEnabled();
        if (!enabled) return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return;
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 8),
        ),
      );
      if (!mounted) return;
      final point = LatLng(position.latitude, position.longitude);
      setState(() {
        userPoint = point;
      });
      _mapController.move(point, 14);
    } catch (_) {
      // Location is optional: if browser/device denies it, map falls back to organizations.
    }
  }

  void _showOrganization(_MapOrganization item) {
    if (item.isInspection && widget.onOpenOrganization != null) {
      unawaited(widget.onOpenOrganization!(item.id, item.name));
    }
    final issuedCertificates = widget.certificates
        .where(
          (certificate) =>
              (item.bin.isNotEmpty &&
                  certificate.organizationBin == item.bin) ||
              (item.name.isNotEmpty &&
                  certificate.organizationName == item.name),
        )
        .toList();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        final phone = item.phone.trim();
        return SafeArea(
          child: FractionallySizedBox(
            heightFactor: 0.86,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(22, 0, 22, 22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: item.isInspection
                            ? softGreen
                            : const Color(0xFFE8F3FA),
                        child: Icon(
                          item.isInspection
                              ? Icons.verified_rounded
                              : Icons.business_rounded,
                          color: item.isInspection ? green : blue,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.name,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: ink,
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            Text(
                              item.isInspection
                                  ? 'Инспекционный орган'
                                  : 'Установщик',
                              style: const TextStyle(
                                color: muted,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  if (item.bin.isNotEmpty)
                    _InfoLine(
                      icon: Icons.badge_rounded,
                      text: 'БИН ${item.bin}',
                    ),
                  if (item.region.isNotEmpty)
                    _InfoLine(icon: Icons.map_rounded, text: item.region),
                  if (item.address.isNotEmpty)
                    _InfoLine(icon: Icons.place_rounded, text: item.address),
                  if (phone.isNotEmpty)
                    _InfoLine(icon: Icons.phone_rounded, text: phone),
                  const SizedBox(height: 18),
                  if (item.isInspection)
                    Expanded(
                      child: SingleChildScrollView(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Выданные свидетельства: ${issuedCertificates.length}',
                              style: _bold,
                            ),
                            const SizedBox(height: 10),
                            if (issuedCertificates.isEmpty)
                              const Text(
                                'По этому инспекционному органу опубликованных свидетельств нет.',
                                style: TextStyle(
                                  color: muted,
                                  fontWeight: FontWeight.w700,
                                ),
                              )
                            else
                              for (final certificate in issuedCertificates)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: _ListTileCard(
                                    icon: Icons.description_rounded,
                                    title: certificate.certificateNumber.isEmpty
                                        ? 'Свидетельство'
                                        : certificate.certificateNumber,
                                    subtitle:
                                        [
                                              certificate.plateNumber,
                                              certificate.ownerName,
                                            ]
                                            .where(
                                              (value) =>
                                                  value.trim().isNotEmpty,
                                            )
                                            .join(' · '),
                                    status: certificate.validUntil.isEmpty
                                        ? 'Активно'
                                        : 'до ${certificate.validUntil}',
                                    onTap: widget.onOpenCertificate == null
                                        ? null
                                        : () {
                                            Navigator.of(context).pop();
                                            widget.onOpenCertificate!(
                                              certificate,
                                            );
                                          },
                                  ),
                                ),
                            const SizedBox(height: 10),
                          ],
                        ),
                      ),
                    )
                  else
                    const Spacer(),
                  _PrimaryButton(
                    text: phone.isEmpty ? 'Телефон не указан' : 'Позвонить',
                    icon: Icons.call_rounded,
                    onTap: phone.isEmpty
                        ? null
                        : () => launchUrl(Uri(scheme: 'tel', path: phone)),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final organizations = widget.organizations;
    final inspectionCertificates = widget.certificates
        .where(
          (item) => item.inspectionLat != null && item.inspectionLng != null,
        )
        .toList();
    final center =
        userPoint ??
        (inspectionCertificates.isNotEmpty
            ? LatLng(
                inspectionCertificates.first.inspectionLat!,
                inspectionCertificates.first.inspectionLng!,
              )
            : organizations.isEmpty
            ? const LatLng(43.238949, 76.889709)
            : organizations.first.point);
    final isFullScreen = widget.height == null;
    return ClipRRect(
      borderRadius: BorderRadius.circular(isFullScreen ? 0 : 22),
      child: LayoutBuilder(
        builder: (context, constraints) => Container(
          height: widget.height ?? constraints.maxHeight,
          width: double.infinity,
          decoration: BoxDecoration(
            color: const Color(0xFFE5F1EC),
            borderRadius: BorderRadius.circular(isFullScreen ? 0 : 22),
            border: isFullScreen ? null : Border.all(color: line),
          ),
          child: Stack(
            children: [
              FlutterMap(
                mapController: _mapController,
                options: MapOptions(
                  initialCenter: center,
                  initialZoom: userPoint != null
                      ? 13
                      : organizations.length > 2
                      ? 10.5
                      : 12.2,
                  interactionOptions: const InteractionOptions(
                    flags: InteractiveFlag.all,
                  ),
                ),
                children: [
                  TileLayer(
                    urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'kz.ersi.gbo',
                  ),
                  MarkerLayer(
                    markers: [
                      if (userPoint != null)
                        Marker(
                          point: userPoint!,
                          width: 46,
                          height: 46,
                          child: const CircleAvatar(
                            backgroundColor: Color(0xFF007A4D),
                            child: Icon(
                              Icons.my_location_rounded,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      for (final item in organizations)
                        Marker(
                          point: item.point,
                          width: 48,
                          height: 58,
                          child: GestureDetector(
                            onTap: () => _showOrganization(item),
                            child: Icon(
                              Icons.location_on_rounded,
                              color: item.isInspection ? green : blue,
                              size: 44,
                              shadows: const [
                                Shadow(
                                  color: Color(0x55000000),
                                  blurRadius: 8,
                                  offset: Offset(0, 3),
                                ),
                              ],
                            ),
                          ),
                        ),
                      for (final certificate in inspectionCertificates)
                        Marker(
                          point: LatLng(
                            certificate.inspectionLat!,
                            certificate.inspectionLng!,
                          ),
                          width: 52,
                          height: 62,
                          child: GestureDetector(
                            onTap: widget.onOpenCertificate == null
                                ? null
                                : () => widget.onOpenCertificate!(certificate),
                            child: const Icon(
                              Icons.assignment_turned_in_rounded,
                              color: warn,
                              size: 42,
                              shadows: [
                                Shadow(
                                  color: Color(0x55000000),
                                  blurRadius: 8,
                                  offset: Offset(0, 3),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
              Positioned(
                left: 12,
                top: isFullScreen ? 104 : 12,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.92),
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: const [
                      BoxShadow(color: Color(0x18003C2B), blurRadius: 10),
                    ],
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 8,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.location_on_rounded,
                          color: green,
                          size: 18,
                        ),
                        const SizedBox(width: 4),
                        const Text('ИО', style: TextStyle(fontSize: 11)),
                        const SizedBox(width: 10),
                        const Icon(
                          Icons.assignment_turned_in_rounded,
                          color: warn,
                          size: 18,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          'Инспекции ${inspectionCertificates.length}',
                          style: const TextStyle(fontSize: 11),
                        ),
                        const SizedBox(width: 10),
                        const Icon(
                          Icons.location_on_rounded,
                          color: blue,
                          size: 18,
                        ),
                        const SizedBox(width: 4),
                        const Text(
                          'Установщики',
                          style: TextStyle(fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                right: 16,
                bottom: isFullScreen ? 112 : 16,
                child: Column(
                  children: [
                    _MapButton(
                      icon: Icons.add_rounded,
                      onTap: () {
                        zoom = (zoom + 1).clamp(3, 18);
                        _mapController.move(_mapController.camera.center, zoom);
                      },
                    ),
                    const SizedBox(height: 8),
                    _MapButton(
                      icon: Icons.remove_rounded,
                      onTap: () {
                        zoom = (zoom - 1).clamp(3, 18);
                        _mapController.move(_mapController.camera.center, zoom);
                      },
                    ),
                    const SizedBox(height: 8),
                    _MapButton(
                      icon: Icons.my_location_rounded,
                      onTap: () {
                        final point = userPoint;
                        if (point != null) _mapController.move(point, 14);
                      },
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: green, size: 19),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              color: ink,
              fontWeight: FontWeight.w700,
              height: 1.25,
            ),
          ),
        ),
      ],
    ),
  );
}

class _MapButton extends StatelessWidget {
  const _MapButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    borderRadius: BorderRadius.circular(16),
    elevation: 4,
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(width: 46, height: 46, child: Icon(icon, color: green)),
    ),
  );
}

class _CameraCard extends StatelessWidget {
  const _CameraCard({
    required this.title,
    required this.status,
    required this.onTap,
  });
  final String title;
  final String status;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxHeight < 150;
        return Container(
          decoration: BoxDecoration(
            color: darkGreen,
            borderRadius: BorderRadius.circular(18),
          ),
          padding: EdgeInsets.all(compact ? 8 : 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Align(alignment: Alignment.topLeft, child: _Chip(status)),
              _CarOutline(height: compact ? 20 : 38),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: compact ? 11 : 14,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Text(
                    status == 'REC' ? 'запись · событие' : 'онлайн · инспекция',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Colors.white54,
                      fontSize: compact ? 9 : 11,
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    ),
  );
}

class _CarOutline extends StatelessWidget {
  const _CarOutline({this.height = 38});
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: height,
      child: CustomPaint(painter: _CarOutlinePainter()),
    );
  }
}

class _CarOutlinePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white70
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final path = Path()
      ..moveTo(size.width * .12, size.height * .72)
      ..lineTo(size.width * .26, size.height * .40)
      ..lineTo(size.width * .62, size.height * .40)
      ..lineTo(size.width * .80, size.height * .72)
      ..lineTo(size.width * .92, size.height * .72);
    canvas.drawPath(path, paint);
    canvas.drawCircle(Offset(size.width * .28, size.height * .78), 4, paint);
    canvas.drawCircle(Offset(size.width * .74, size.height * .78), 4, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _Watermark extends StatelessWidget {
  const _Watermark({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      child,
      const Positioned.fill(
        child: IgnorePointer(
          child: Opacity(
            opacity: 0.06,
            child: Center(
              child: RotatedBox(
                quarterTurns: 1,
                child: Text(
                  'ВСЕ КОПИИ НЕ ДЕЙСТВИТЕЛЬНЫ · ЕРСИ ГБО',
                  style: TextStyle(
                    fontSize: 18,
                    color: darkGreen,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ],
  );
}

class _WatermarkOverlay extends StatelessWidget {
  const _WatermarkOverlay();

  @override
  Widget build(BuildContext context) => const IgnorePointer(
    child: Center(
      child: Opacity(
        opacity: 0.14,
        child: RotatedBox(
          quarterTurns: 1,
          child: Text(
            'ТОЛЬКО ПРОСМОТР · ЕРСИ ГБО',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w900,
              fontSize: 18,
              shadows: [Shadow(color: darkGreen, blurRadius: 8)],
            ),
          ),
        ),
      ),
    ),
  );
}

const _section = TextStyle(
  color: ink,
  fontSize: 18,
  fontWeight: FontWeight.w900,
);
const _bold = TextStyle(
  color: ink,
  fontSize: 14,
  fontWeight: FontWeight.w900,
  height: 1.25,
);
const _muted = TextStyle(
  color: muted,
  fontSize: 12,
  fontWeight: FontWeight.w700,
  height: 1.35,
);
