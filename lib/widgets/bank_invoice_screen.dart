import 'dart:math';
import 'package:flutter/material.dart' hide Text;
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import '../data/repositories.dart';
import '../l10n/app_language.dart';
import 'uppercase_text.dart';

class BankInvoiceScreen extends StatefulWidget {
  const BankInvoiceScreen({
    super.key,
    required this.payments,
    required this.organizationId,
    required this.organizationName,
  });
  final PaymentRepository payments;
  final String organizationId, organizationName;
  @override
  State<BankInvoiceScreen> createState() => _BankInvoiceScreenState();
}

class _BankInvoiceScreenState extends State<BankInvoiceScreen> {
  final amount = TextEditingController();
  final form = GlobalKey<FormState>();
  String? requestKey;
  bool busy = false;
  String error = '';
  Map<String, dynamic>? invoice;
  List<dynamic> history = [];
  @override
  void initState() {
    super.initState();
    loadHistory();
  }

  @override
  void dispose() {
    amount.dispose();
    super.dispose();
  }

  Future<void> loadHistory() async {
    try {
      final value = await widget.payments.bankInvoices(widget.organizationId);
      if (mounted) setState(() => history = value);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> download(Map<String, dynamic> value) async {
    final bytes = await widget.payments.bankInvoicePdf(value['id'].toString());
    await FilePicker.saveFile(
      fileName: '${value['number']}.pdf',
      bytes: bytes,
      mimeType: 'application/pdf',
      dialogTitle: mounted ? tr(context, 'Сохранить счёт PDF') : null,
    );
  }

  Future<void> create() async {
    if (busy) return;
    if (!form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = '';
    });
    requestKey ??= List.generate(
      16,
      (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    try {
      final value = await widget.payments.createBankInvoice(
        widget.organizationId,
        amount.text.trim(),
        requestKey!,
      );
      if (!mounted) return;
      setState(() => invoice = value);
      await download(value);
      await loadHistory();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> save(Map<String, dynamic> value) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await download(value);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Пополнить баланс')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              widget.organizationName,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            const Text(
              'Введите сумму — система подготовит счёт на аванс. Создание и скачивание счёта не подтверждают оплату и не меняют баланс.',
            ),
            const SizedBox(height: 20),
            if (error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(error, style: const TextStyle(color: Colors.red)),
              ),
            if (busy) const LinearProgressIndicator(),
            if (invoice == null)
              Form(
                key: form,
                child: Column(
                  children: [
                    TextFormField(
                      controller: amount,
                      enabled: !busy,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: InputDecoration(
                        label: const Text('Сумма пополнения, ₸'),
                        border: const OutlineInputBorder(),
                      ),
                      onChanged: (_) => requestKey = null,
                      validator: (v) {
                        final text = (v ?? '').replaceAll(RegExp(r'\s'), '');
                        if (!RegExp(r'^\d+([.,]\d{1,2})?$').hasMatch(text)) {
                          return tr(
                            context,
                            'Введите сумму, не более двух знаков после запятой',
                          );
                        }
                        final n = double.tryParse(text.replaceAll(',', '.'));
                        if (n == null || n <= 0 || n > 100000000) {
                          return tr(
                            context,
                            'Сумма должна быть от 0,01 до 100 000 000 тенге',
                          );
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: busy ? null : create,
                      child: const Text('Сформировать и скачать счёт PDF'),
                    ),
                  ],
                ),
              ),
            if (invoice != null) ...[
              Text(
                '${invoice!['number']} · ${invoice!['date']} · ${invoice!['amount']} KZT',
              ),
              const SizedBox(height: 14),
              const Text('Назначение платежа'),
              const SizedBox(height: 8),
              SelectableText(invoice!['purpose'].toString()),
              TextButton.icon(
                onPressed: () => Clipboard.setData(
                  ClipboardData(text: invoice!['purpose'].toString()),
                ),
                icon: const Icon(Icons.copy),
                label: const Text('Скопировать назначение платежа'),
              ),
              FilledButton(
                onPressed: busy ? null : () => save(invoice!),
                child: const Text('Скачать счёт PDF'),
              ),
              TextButton(
                onPressed: busy
                    ? null
                    : () => setState(() {
                        invoice = null;
                        requestKey = null;
                        error = '';
                      }),
                child: const Text('Создать другой счёт'),
              ),
            ],
            const SizedBox(height: 24),
            if (history.isNotEmpty)
              ExpansionTile(
                title: const Text('Ранее выставленные счета'),
                children: [
                  for (final value in history)
                    ListTile(
                      title: Text(
                        '${value['number']} · ${value['amount']} KZT',
                      ),
                      subtitle: Text(value['date'].toString()),
                      trailing: IconButton(
                        onPressed: busy
                            ? null
                            : () =>
                                  save(Map<String, dynamic>.from(value as Map)),
                        tooltip: tr(context, 'Скачать счёт PDF'),
                        icon: const Icon(Icons.download),
                      ),
                    ),
                ],
              ),
          ],
        ),
      ),
    ),
  );
}
