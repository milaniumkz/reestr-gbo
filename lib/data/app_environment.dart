class AppEnvironment {
  static const mode = String.fromEnvironment('APP_MODE', defaultValue: 'production');
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '/api/v1',
  );

  static bool get isDemo => mode == 'demo';
}
