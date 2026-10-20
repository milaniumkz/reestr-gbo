import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/inspection_input.dart';
import 'package:reestr_ts_demo/main.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'test_fonts.dart';

void main() {
  setUpAll(loadTestFonts);
  const formatter = InspectionUppercaseFormatter();
  test(
    'uppercases Russian and Kazakh text preserving document punctuation',
    () {
      const value = TextEditingValue(
        text: 'Иванов ёлкин, қонаев — дом 12/А',
        selection: TextSelection.collapsed(offset: 6),
      );
      final result = formatter.formatEditUpdate(TextEditingValue.empty, value);
      expect(result.text, 'ИВАНОВ ЁЛКИН, ҚОНАЕВ — ДОМ 12/А');
      expect(result.selection.baseOffset, 6);
    },
  );
  test('retains IME composing until committed', () {
    const value = TextEditingValue(
      text: 'ив',
      composing: TextRange(start: 0, end: 2),
    );
    expect(formatter.formatEditUpdate(TextEditingValue.empty, value), value);
  });
  testWidgets(
    'inspection name field requests Russian and uppercase and normalizes pasted text',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize = const Size(designWidth, designHeight);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        const MaterialApp(home: ErsiDemo(initialScreen: 15)),
      );
      await tester.pump(const Duration(milliseconds: 300));
      final field = find.byWidgetPredicate(
        (w) =>
            w is TextField && w.decoration?.labelText == 'ФИО / НАИМЕНОВАНИЕ',
      );
      final widget = tester.widget<TextField>(field);
      expect(widget.hintLocales, const [Locale('ru', 'RU')]);
      expect(widget.textCapitalization, TextCapitalization.characters);
      await tester.enterText(field, 'иванов Иван — тоо');
      await tester.pump();
      expect(
        tester.widget<TextField>(field).controller!.text,
        'ИВАНОВ ИВАН — ТОО',
      );
    },
  );
  testWidgets('numeric inspection fields keep numeric keyboard', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(designWidth, designHeight);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      const MaterialApp(home: ErsiDemo(initialScreen: 17)),
    );
    await tester.pump(const Duration(milliseconds: 300));
    final fields = tester
        .widgetList<TextField>(find.byType(TextField))
        .where((f) => f.keyboardType == TextInputType.number)
        .toList();
    expect(fields, isNotEmpty);
    for (final field in fields) {
      expect(field.textCapitalization, TextCapitalization.none);
      expect(field.hintLocales, isNull);
    }
  });
  testWidgets('account password is not uppercased', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(designWidth, designHeight);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      const MaterialApp(home: ErsiDemo(initialScreen: 2)),
    );
    await tester.pump(const Duration(milliseconds: 300));
    final field = find.byWidgetPredicate(
      (w) => w is TextField && w.obscureText,
    );
    expect(
      tester.widget<TextField>(field).textCapitalization,
      TextCapitalization.none,
    );
    await tester.enterText(field, 'MiXeD-pass');
    await tester.pump();
    expect(tester.widget<TextField>(field).controller!.text, 'MiXeD-pass');
  });
}
