import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'kk_catalog.dart';

class AppLanguage extends InheritedWidget {
  const AppLanguage({
    super.key,
    required this.locale,
    required this.setLocale,
    required super.child,
  });
  final Locale locale;
  final Future<void> Function(Locale) setLocale;
  static AppLanguage? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppLanguage>();
  @override
  bool updateShouldNotify(AppLanguage oldWidget) => locale != oldWidget.locale;
}

class LocalizedApp extends StatefulWidget {
  const LocalizedApp({super.key, required this.home, required this.theme});
  final Widget home;
  final ThemeData theme;
  @override
  State<LocalizedApp> createState() => _LocalizedAppState();
}

class _LocalizedAppState extends State<LocalizedApp> {
  Locale _locale = const Locale('ru');
  int _revision = 0;
  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    final revision = _revision;
    final prefs = await SharedPreferences.getInstance();
    if (mounted && revision == _revision) {
      setState(
        () => _locale = Locale(
          prefs.getString('app_language') == 'kk' ? 'kk' : 'ru',
        ),
      );
    }
  }

  Future<void> _setLocale(Locale locale) async {
    if (!['ru', 'kk'].contains(locale.languageCode)) return;
    _revision++;
    setState(() => _locale = locale);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('app_language', locale.languageCode);
  }

  @override
  Widget build(BuildContext context) => AppLanguage(
    locale: _locale,
    setLocale: _setLocale,
    child: MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'ЕРСИ ГБО',
      theme: widget.theme,
      locale: _locale,
      supportedLocales: const [Locale('ru'), Locale('kk')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: widget.home,
    ),
  );
}

class LanguageSwitch extends StatelessWidget {
  const LanguageSwitch({super.key});
  @override
  Widget build(BuildContext context) {
    final state = AppLanguage.maybeOf(context);
    if (state == null) return const SizedBox.shrink();
    return Material(
      color: Colors.white,
      elevation: 1,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.all(3),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final entry in const {
              'ru': 'Русский',
              'kk': 'Қазақша',
            }.entries)
              TextButton(
                onPressed: () => state.setLocale(Locale(entry.key)),
                style: TextButton.styleFrom(
                  backgroundColor: state.locale.languageCode == entry.key
                      ? const Color(0xFFEAF7F0)
                      : null,
                ),
                child: Text(entry.value),
              ),
          ],
        ),
      ),
    );
  }
}

String tr(BuildContext context, String source) =>
    translateKazakh(source, Localizations.localeOf(context).languageCode);
