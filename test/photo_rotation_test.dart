import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/data/models.dart';
import 'package:reestr_ts_demo/widgets/photo_rotation_scope.dart';

const file = InspectionFileInfo(
  id: 'p',
  type: 'tech_passport',
  objectKey: 'p.jpg',
  viewUrl: '/p.jpg',
  createdAt: '',
);
Widget app({
  bool busy = false,
  Future<void> Function(InspectionFileInfo, int)? rotate,
  InspectionFileInfo photo = file,
  String lang = 'ru',
}) => MaterialApp(
  locale: Locale(lang),
  supportedLocales: const [Locale('ru'), Locale('kk')],
  localizationsDelegates: GlobalMaterialLocalizations.delegates,
  home: Scaffold(
    body: PhotoRotationScope(
      busy: busy,
      onRotate: rotate,
      child: PhotoRotationButtons(file: photo),
    ),
  ),
);
void main() {
  testWidgets(
    'both arrows save their visible direction and respect the review lock',
    (tester) async {
      final turns = <int>[];
      Future<void> rotate(InspectionFileInfo selected, int direction) async {
        expect(selected.id, 'p');
        turns.add(direction);
      }

      await tester.pumpWidget(app(rotate: rotate));
      await tester.tap(find.byTooltip('Повернуть влево и сохранить'));
      await tester.tap(find.byTooltip('Повернуть вправо и сохранить'));
      expect(turns, [-1, 1]);
      await tester.pumpWidget(app(rotate: rotate, busy: true));
      expect(
        tester
            .widgetList<IconButton>(find.byType(IconButton))
            .every((button) => button.onPressed == null),
        true,
      );
      await tester.pumpWidget(app());
      expect(find.byType(IconButton), findsNothing);
    },
  );
  testWidgets('PDF has no rotation and Kazakh controls are localized', (
    tester,
  ) async {
    await tester.pumpWidget(
      app(
        rotate: (_, _) async {},
        photo: const InspectionFileInfo(
          id: 'p',
          type: 'certificate_document',
          objectKey: 'p.pdf',
          viewUrl: '/p.pdf',
          createdAt: '',
        ),
      ),
    );
    expect(find.byType(IconButton), findsNothing);
    await tester.pumpWidget(app(rotate: (_, _) async {}, lang: 'kk'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Солға бұрып сақтау'), findsOneWidget);
    expect(find.byTooltip('Оңға бұрып сақтау'), findsOneWidget);
  });
}
