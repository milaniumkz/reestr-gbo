import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:reestr_ts_demo/widgets/inspection_address_gate.dart';

void main() {
  testWidgets(
    'failure blocks continuation; retry only unlocks after address resolves',
    (tester) async {
      var attempts = 0;
      var continued = false;
      final retry = Completer<String>();
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                child: const Text('Start'),
                onPressed: () async {
                  continued = await confirmInspectionAddress(
                    context,
                    resolve: () async {
                      if (++attempts == 1) throw StateError('offline');
                      return retry.future;
                    },
                  );
                },
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Start'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Без адреса продолжить нельзя'),
        findsOneWidget,
      );
      expect(find.text('Продолжить'), findsNothing);
      expect(continued, isFalse);
      await tester.tap(find.text('Попробовать снова определить адрес'));
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Продолжить'), findsNothing);
      retry.complete('Казахстан, Астана, улица Тестовая, д. 12');
      await tester.pumpAndSettle();
      expect(find.textContaining('улица Тестовая'), findsOneWidget);
      await tester.tap(find.text('Продолжить'));
      await tester.pumpAndSettle();
      expect(continued, isTrue);
      expect(attempts, 2);
    },
  );
  testWidgets('GPS placeholder never unlocks continuation', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              child: const Text('Start'),
              onPressed: () => confirmInspectionAddress(
                context,
                resolve: () async => 'GPS: 51.18, 71.37',
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Start'));
    await tester.pumpAndSettle();
    expect(find.text('Продолжить'), findsNothing);
    expect(find.text('Попробовать снова определить адрес'), findsOneWidget);
    await tester.tap(find.text('Отмена'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
  });
}
