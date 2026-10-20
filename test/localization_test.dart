import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:reestr_ts_demo/l10n/app_language.dart';
import 'package:reestr_ts_demo/l10n/kk_catalog.dart';
import 'package:reestr_ts_demo/l10n/kk_messages.dart';
import 'package:reestr_ts_demo/main.dart';
import 'test_fonts.dart';

void main() {
  setUpAll(loadTestFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));
  void screen(WidgetTester tester) {
    tester.view.physicalSize = const Size(designWidth, designHeight);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  test(
    'catalog preserves runtime placeholders and includes complete workflow vocabulary',
    () {
      expect(kazakhMessages.length, greaterThan(850));
      final token = RegExp(r'\$\{[^}]+\}|\$[a-zA-Z_]\w*');
      for (final entry in kazakhMessages.entries) {
        expect(entry.value.trim(), isNotEmpty, reason: entry.key);
        expect(
          token.allMatches(entry.value).map((m) => m.group(0)).toSet(),
          token.allMatches(entry.key).map((m) => m.group(0)).toSet(),
          reason: entry.key,
        );
      }
      expect(translateKazakh('Найдено 17 записей', 'kk'), '17 жазба табылды');
      expect(
        translateKazakh('На проверке: Имишев Марат', 'kk'),
        'Тексеруде: Имишев Марат',
      );
      expect(
        translateKazakh('Заполните: тип газа, номер баллона', 'kk'),
        'Толтырыңыз: Газ түрі, Баллон нөмірі',
      );
      expect(
        translateKazakh('Неверный телефон или пароль', 'kk'),
        'Телефон немесе пароль дұрыс емес',
      );
      for (final data in [
        'Имишев Марат',
        'ТОО Baygazi Expert',
        '777AAA02',
        'Алматы, ул. Абая 48',
      ]) {
        expect(translateKazakh(data, 'kk'), data);
      }
      expect(translateKazakh('Данные владельца', 'ru'), 'Данные владельца');
    },
  );
  testWidgets(
    'first screen defaults to Russian, switches immediately and remembers Kazakh',
    (tester) async {
      screen(tester);
      await tester.pumpWidget(const ErsiGboApp());
      await tester.pump(const Duration(milliseconds: 300));
      expect(
        tester.widget<MaterialApp>(find.byType(MaterialApp)).locale,
        const Locale('ru'),
      );
      await tester.tap(find.widgetWithText(TextButton, 'Қазақша'));
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(
        tester.widget<MaterialApp>(find.byType(MaterialApp)).locale,
        const Locale('kk'),
      );
      expect(
        (await SharedPreferences.getInstance()).getString('app_language'),
        'kk',
      );
      expect(find.text('ҚЫЗМЕТ', findRichText: true), findsWidgets);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpWidget(const ErsiGboApp());
      await tester.pump(const Duration(milliseconds: 300));
      expect(
        tester.widget<MaterialApp>(find.byType(MaterialApp)).locale,
        const Locale('kk'),
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'profile updates the same persisted locale without resetting navigation',
    (tester) async {
      screen(tester);
      await tester.pumpWidget(
        LocalizedApp(
          home: const ErsiDemo(initialScreen: 39),
          theme: ThemeData(useMaterial3: true),
        ),
      );
      await tester.pump(const Duration(milliseconds: 300));
      final choice = find.text('Қазақша');
      await tester.ensureVisible(choice);
      await tester.tap(choice);
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(
        tester.widget<MaterialApp>(find.byType(MaterialApp)).locale,
        const Locale('kk'),
      );
      expect(
        (await SharedPreferences.getInstance()).getString('app_language'),
        'kk',
      );
      expect(find.text('ТІЛДІ АУЫСТЫРУ', findRichText: true), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'all screens render under Kazakh localization without layout errors',
    (tester) async {
      screen(tester);
      SharedPreferences.setMockInitialValues({'app_language': 'kk'});
      for (var index = 0; index < screenTitles.length; index++) {
        await tester.pumpWidget(
          LocalizedApp(
            key: ValueKey(index),
            home: ErsiDemo(initialScreen: index),
            theme: ThemeData(useMaterial3: true),
          ),
        );
        await tester.pump(const Duration(milliseconds: 100));
        expect(
          tester.widget<MaterialApp>(find.byType(MaterialApp)).locale,
          const Locale('kk'),
        );
        expect(tester.takeException(), isNull, reason: 'Kazakh screen $index');
      }
    },
  );
  testWidgets('Kazakh forms and language switch fit a compact phone', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({'app_language': 'kk'});
    for (final index in [0, 1, 2, 15, 17, 22, 39]) {
      await tester.pumpWidget(
        LocalizedApp(
          key: ValueKey(index),
          home: ErsiDemo(initialScreen: index),
          theme: ThemeData(useMaterial3: true),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      expect(
        tester.takeException(),
        isNull,
        reason: 'Compact Kazakh screen $index',
      );
    }
  });
}
