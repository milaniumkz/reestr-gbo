import 'package:flutter/material.dart' hide Text;
import 'package:flutter/services.dart';
import '../data/repositories.dart';
import '../l10n/app_language.dart';
import 'uppercase_text.dart';

class PasswordAccessScreen extends StatefulWidget {
  const PasswordAccessScreen({
    super.key,
    required this.auth,
    this.change = false,
    this.manager = false,
    this.bin = '',
    this.phone = '',
  });
  final AuthRepository auth;
  final bool change;
  final bool manager;
  final String bin;
  final String phone;
  @override
  State<PasswordAccessScreen> createState() => _PasswordAccessScreenState();
}

class _PasswordAccessScreenState extends State<PasswordAccessScreen> {
  final form = GlobalKey<FormState>();
  late final bin = TextEditingController(text: widget.bin);
  late final phone = TextEditingController(text: widget.phone);
  final name = TextEditingController();
  final oldPassword = TextEditingController();
  final password = TextEditingController();
  final confirmation = TextEditingController();
  bool busy = false, done = false;
  String message = '', link = '';
  List<dynamic> requests = [];
  @override
  void initState() {
    super.initState();
    if (widget.manager) load();
  }

  @override
  void dispose() {
    for (final c in [bin, phone, name, oldPassword, password, confirmation]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      message = '';
    });
    try {
      final result = await widget.auth.recoveryRequests();
      if (mounted) setState(() => requests = result);
    } catch (e) {
      if (mounted) setState(() => message = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    setState(() {
      busy = true;
      message = '';
    });
    try {
      final result = widget.change
          ? await widget.auth.changePersonalPassword(
              bin.text.trim(),
              phone.text.trim(),
              oldPassword.text,
              password.text,
              confirmation.text,
            )
          : await widget.auth.requestRecovery(
              bin.text.trim(),
              phone.text.trim(),
              name.text.trim(),
            );
      if (!mounted) return;
      if (widget.change) {
        Navigator.pop(context, true);
        return;
      }
      setState(() {
        done = true;
        message = result;
      });
    } catch (e) {
      if (mounted) setState(() => message = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> approve(String id) async {
    final verified = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Подтверждение личности'),
        content: const Text(
          'Вы проверили личность сотрудника по известному вам каналу? Ссылку можно передать только этому сотруднику.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Отмена'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Личность проверена'),
          ),
        ],
      ),
    );
    if (verified != true || !mounted) return;
    setState(() {
      busy = true;
      message = '';
      link = '';
    });
    try {
      final token = await widget.auth.approveRecovery(id);
      if (mounted) {
        setState(() {
          link = 'https://tech.89-207-255-42.sslip.io/tech/recovery/#$token';
          requests.removeWhere((r) => r['id'] == id);
        });
      }
    } catch (e) {
      if (mounted) setState(() => message = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget field(
    String label,
    TextEditingController c, {
    bool secret = false,
    TextInputType? keyboard,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: TextFormField(
      controller: c,
      obscureText: secret,
      enableSuggestions: !secret,
      autocorrect: false,
      keyboardType: keyboard,
      textCapitalization: secret
          ? TextCapitalization.none
          : TextCapitalization.words,
      decoration: InputDecoration(
        label: Text(label),
        border: const OutlineInputBorder(),
      ),
      validator: (v) {
        if (v == null || v.trim().isEmpty) return tr(context, 'Заполните поле');
        if (c == bin && !RegExp(r'^\d{12}$').hasMatch(v.trim())) {
          return tr(context, 'Введите БИН из 12 цифр');
        }
        if (c == password && v.length < 8) {
          return tr(context, 'Минимум 8 символов');
        }
        if (c == confirmation && v != password.text) {
          return tr(context, 'Пароли не совпадают');
        }
        return null;
      },
    ),
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(
        widget.manager
            ? 'Заявки восстановления доступа'
            : widget.change
            ? 'Сменить пароль'
            : 'Забыли пароль',
      ),
    ),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (busy) const LinearProgressIndicator(),
            if (message.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text(message),
              ),
            if (widget.manager) ...[
              const Text(
                'Подтверждайте заявку только после проверки личности сотрудника. Ссылка действует 10 минут и используется один раз.',
              ),
              TextButton(
                onPressed: busy ? null : load,
                child: const Text('Обновить'),
              ),
              if (!busy && requests.isEmpty) const Text('Нет ожидающих заявок'),
              if (link.isNotEmpty)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        const Text(
                          'Передайте ссылку только подтверждённому сотруднику',
                        ),
                        SelectableText(link),
                        TextButton(
                          onPressed: () =>
                              Clipboard.setData(ClipboardData(text: link)),
                          child: const Text('Скопировать ссылку'),
                        ),
                      ],
                    ),
                  ),
                ),
              for (final r in requests)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${r['user']?['fullName'] ?? ''}\n${r['user']?['phone'] ?? ''}\n${r['organization']?['name'] ?? ''}\n${r['organization']?['bin'] ?? ''}\n${r['createdAt'] ?? ''}',
                        ),
                        FilledButton(
                          onPressed: busy
                              ? null
                              : () => approve(r['id'].toString()),
                          child: const Text('Подтвердить восстановление'),
                        ),
                      ],
                    ),
                  ),
                ),
            ] else if (!done)
              Form(
                key: form,
                child: Column(
                  children: [
                    if (!widget.change)
                      const Padding(
                        padding: EdgeInsets.only(bottom: 16),
                        child: Text(
                          'Введите данные сотрудника. Руководитель ИО или технический администратор проверит личность и передаст одноразовую ссылку.',
                        ),
                      ),
                    field(
                      'БИН организации',
                      bin,
                      keyboard: TextInputType.number,
                    ),
                    field(
                      'Номер телефона',
                      phone,
                      keyboard: TextInputType.phone,
                    ),
                    if (!widget.change) field('Фамилия, имя, отчество', name),
                    if (widget.change) ...[
                      field('Старый пароль', oldPassword, secret: true),
                      field('Новый пароль', password, secret: true),
                      field(
                        'Повторите новый пароль',
                        confirmation,
                        secret: true,
                      ),
                    ],
                    FilledButton(
                      onPressed: busy ? null : submit,
                      child: Text(
                        widget.change
                            ? 'Сохранить новый пароль'
                            : 'Отправить заявку',
                      ),
                    ),
                  ],
                ),
              ),
            if (done)
              FilledButton(
                onPressed: () => Navigator.pop(context, widget.change),
                child: Text(widget.change ? 'Войти заново' : 'Назад ко входу'),
              ),
          ],
        ),
      ),
    ),
  );
}
