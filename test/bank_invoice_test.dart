import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:file_picker/file_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/data/api_client.dart';
import 'package:reestr_ts_demo/data/repositories.dart';
import 'package:reestr_ts_demo/widgets/bank_invoice_screen.dart';

class SavingPicker extends FilePickerPlatform {
  int saves = 0;
  Uint8List? saved;
  @override
  Future<Uri?> saveFile({
    required String fileName,
    required Uint8List bytes,
    String? dialogTitle,
    String? initialDirectory,
    String mimeType = 'application/octet-stream',
    Function(FilePickerStatus)? onFileSaving,
    WindowsOptions windowsOptions = const WindowsOptions(),
    LinuxOptions linuxOptions = const LinuxOptions(),
    WebOptions webOptions = const WebOptions(),
  }) async {
    expect(fileName, 'ERSI-2026-000001.pdf');
    expect(mimeType, 'application/pdf');
    saved = bytes;
    saves++;
    return Uri.parse('file:///test/invoice.pdf');
  }
}

void main() {
  testWidgets(
    'manager enters amount, downloads PDF and can re-download the same invoice without creating another',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final picker = SavingPicker();
      final previous = FilePickerPlatform.instance;
      FilePickerPlatform.instance = picker;
      addTearDown(() => FilePickerPlatform.instance = previous);
      var creates = 0, downloads = 0;
      Map<String, dynamic>? body;
      final invoice = {
        'id': 'invoice1',
        'number': 'ERSI-2026-000001',
        'date': '24.10.2026',
        'amount': '12 345,67',
        'purpose':
            'Пополнение авансового баланса ЕРСИ ГБО. ИО: Тестовый ИО. ID: IO-000042. Счёт № ERSI-2026-000001 от 24.10.2026. Без НДС.',
      };
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient((req) async {
          expect(req.url.path == '/payments/invoice', false);
          if (req.method == 'POST') {
            expect(req.url.path, '/payments/bank-invoices');
            creates++;
            body = jsonDecode(req.body) as Map<String, dynamic>;
            return http.Response(
              jsonEncode(invoice),
              201,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }
          if (req.url.path.endsWith('/pdf')) {
            downloads++;
            return http.Response.bytes(
              utf8.encode('%PDF-test'),
              200,
              headers: {'content-type': 'application/pdf'},
            );
          }
          return http.Response(
            jsonEncode({
              'items': creates == 0 ? [] : [invoice],
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: BankInvoiceScreen(
            payments: PaymentRepository(api),
            organizationId: 'org1',
            organizationName: 'Тестовый ИО',
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), '0');
      await tester.tap(find.byType(FilledButton));
      await tester.pumpAndSettle();
      expect(creates, 0);
      await tester.enterText(find.byType(TextFormField), '12 345,67');
      await tester.tap(find.byType(FilledButton));
      await tester.pumpAndSettle();
      expect(creates, 1);
      expect(body!['organizationId'], 'org1');
      expect(body!['amount'], '12 345,67');
      expect(body!['requestKey'], matches(RegExp(r'^[a-f0-9]{32}$')));
      expect(body!.keys.toSet(), {'organizationId', 'amount', 'requestKey'});
      expect(downloads, 1);
      expect(picker.saves, 1);
      expect(utf8.decode(picker.saved!), '%PDF-test');
      expect(find.byType(SelectableText), findsOneWidget);
      await tester.ensureVisible(find.text('Скачать счёт PDF'));
      await tester.tap(find.text('Скачать счёт PDF'));
      await tester.pumpAndSettle();
      expect(downloads, 2);
      expect(picker.saves, 2);
      expect(creates, 1);
    },
  );
}
