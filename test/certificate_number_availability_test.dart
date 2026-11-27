import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/widgets/certificate_number_availability.dart';

Future<void> form(
  WidgetTester tester,
  TextEditingController number,
  Future<bool> Function(String) check, {
  ValueNotifier<String>? scope,
}) async {
  final currentScope = scope ?? ValueNotifier('account:org:draft');
  if (scope == null) addTearDown(currentScope.dispose);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: ValueListenableBuilder<TextEditingValue>(
          valueListenable: number,
          builder: (context, value, _) => ValueListenableBuilder<String>(
            valueListenable: currentScope,
            builder: (context, scopeKey, _) => Column(
              children: [
                CertificateNumberAvailability(
                  value: value.text,
                  scopeKey: scopeKey,
                  check: check,
                  child: TextField(
                    key: const Key('number'),
                    controller: number,
                    decoration: const InputDecoration(labelText: 'Number'),
                  ),
                ),
                const TextField(
                  key: Key('owner'),
                  decoration: InputDecoration(labelText: 'Owner'),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

Future<void> leaveNumber(WidgetTester tester, String value) async {
  await tester.tap(find.byKey(const Key('number')));
  await tester.enterText(find.byKey(const Key('number')), value);
  await tester.pump();
  await tester.tap(find.byKey(const Key('owner')));
  await tester.pump();
}

void main() {
  const duplicate =
      'Свидетельство с таким номером уже есть в этом инспекционном органе';
  testWidgets('checks on leaving number and preserves the next field', (
    t,
  ) async {
    final number = TextEditingController();
    addTearDown(number.dispose);
    final result = Completer<bool>();
    final requested = <String>[];
    await form(t, number, (value) {
      requested.add(value);
      return result.future;
    });
    await t.tap(find.byKey(const Key('number')));
    await t.enterText(find.byKey(const Key('number')), '.10966');
    await t.pump();
    expect(requested, isEmpty);
    await t.tap(find.byKey(const Key('owner')));
    await t.pump();
    expect(requested, ['.10966']);
    expect(find.text('Проверка номера свидетельства'), findsOneWidget);
    await t.enterText(find.byKey(const Key('owner')), 'PARTIAL OWNER');
    result.complete(false);
    await t.pumpAndSettle();
    expect(find.text(duplicate), findsOneWidget);
    expect(number.text, '.10966');
    expect(find.text('PARTIAL OWNER'), findsOneWidget);
  });
  testWidgets('a free number is shown as available on blur', (t) async {
    final number = TextEditingController();
    addTearDown(number.dispose);
    await form(t, number, (_) async => true);
    await leaveNumber(t, '10967');
    await t.pumpAndSettle();
    expect(find.text('Номер свидетельства доступен'), findsOneWidget);
    expect(find.text(duplicate), findsNothing);
  });
  testWidgets('late duplicate response cannot overwrite a newer free number', (
    t,
  ) async {
    final number = TextEditingController();
    addTearDown(number.dispose);
    final old = Completer<bool>(), latest = Completer<bool>();
    await form(
      t,
      number,
      (value) => value == '10966' ? old.future : latest.future,
    );
    await leaveNumber(t, '10966');
    await leaveNumber(t, '10967');
    latest.complete(true);
    await t.pumpAndSettle();
    old.complete(false);
    await t.pumpAndSettle();
    expect(find.text('Номер свидетельства доступен'), findsOneWidget);
    expect(find.text(duplicate), findsNothing);
    expect(number.text, '10967');
  });
  testWidgets('scope changes invalidate a pending result for the same number', (
    t,
  ) async {
    final number = TextEditingController(), scope = ValueNotifier('first-org');
    addTearDown(number.dispose);
    addTearDown(scope.dispose);
    final result = Completer<bool>();
    await form(t, number, (_) => result.future, scope: scope);
    await leaveNumber(t, '10966');
    scope.value = 'second-org';
    await t.pump();
    result.complete(false);
    await t.pumpAndSettle();
    expect(find.text(duplicate), findsNothing);
    expect(find.text('Номер свидетельства доступен'), findsNothing);
  });
  testWidgets('a network error preserves input and permits checking again', (
    t,
  ) async {
    final number = TextEditingController();
    addTearDown(number.dispose);
    var calls = 0;
    await form(t, number, (_) async {
      if (++calls == 1) throw StateError('offline');
      return true;
    });
    await leaveNumber(t, '10966');
    await t.pumpAndSettle();
    expect(
      find.text('Не удалось проверить номер. Повторите проверку.'),
      findsOneWidget,
    );
    expect(number.text, '10966');
    await leaveNumber(t, '10966');
    await t.pumpAndSettle();
    expect(calls, 2);
    expect(find.text('Номер свидетельства доступен'), findsOneWidget);
  });
  testWidgets('leaving an empty number does not query the server', (t) async {
    final number = TextEditingController();
    addTearDown(number.dispose);
    var calls = 0;
    await form(t, number, (_) async {
      calls++;
      return true;
    });
    await leaveNumber(t, '');
    await t.pumpAndSettle();
    expect(calls, 0);
  });
}
