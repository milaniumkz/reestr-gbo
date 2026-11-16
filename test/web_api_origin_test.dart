import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/data/app_environment.dart';

void main() {
  test(
    'web APIs use the opened domain without depending on the legacy hostname',
    () {
      for (final host in ['ersigbo.kz', '89-207-255-42.sslip.io']) {
        final page = Uri.parse('https://$host/?recover=1');
        expect(
          resolveWebApiBaseUrl('/api/v1', page: page),
          'https://$host/api/v1',
        );
        expect(
          resolveWebApiBaseUrl(
            'https://89-207-255-42.sslip.io/api/v1',
            page: page,
          ),
          'https://$host/api/v1',
        );
      }
    },
  );
  test('native and explicit custom API addresses remain configured', () {
    const configured = 'https://89-207-255-42.sslip.io/api/v1';
    expect(resolveWebApiBaseUrl(configured), configured);
    expect(
      resolveWebApiBaseUrl(
        'https://custom.example/api',
        page: Uri.parse('https://ersigbo.kz/'),
      ),
      'https://custom.example/api',
    );
    expect(
      resolveWebApiBaseUrl('/api/v1', page: Uri.parse('file:///app/')),
      '/api/v1',
    );
  });
}
