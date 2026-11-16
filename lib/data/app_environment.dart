import 'package:flutter/foundation.dart';

class AppEnvironment {
  static const mode = String.fromEnvironment(
    'APP_MODE',
    defaultValue: 'production',
  );
  static const configuredApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '/api/v1',
  );

  static String get apiBaseUrl => resolveWebApiBaseUrl(
    configuredApiBaseUrl,
    page: kIsWeb ? Uri.base : null,
  );

  static bool get isDemo => mode == 'demo';
}

/// Production web requests follow the opened site; native/custom API overrides
/// keep their configured address. This also supports both existing public hosts.
String resolveWebApiBaseUrl(String configured, {Uri? page}) {
  if (page == null || !['http', 'https'].contains(page.scheme)) {
    return configured;
  }
  final api = Uri.tryParse(configured);
  if (api == null) return configured;
  if (!api.hasAuthority) return page.resolve(configured).toString();
  if (api.host == '89-207-255-42.sslip.io' && api.path == '/api/v1') {
    return '${page.origin}/api/v1';
  }
  return configured;
}
