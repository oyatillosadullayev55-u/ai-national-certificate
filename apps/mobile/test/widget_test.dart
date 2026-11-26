import 'package:anc_mobile/widgets/otp_countdown.dart';
import 'package:anc_mobile/widgets/question_input.dart';
import 'package:anc_mobile/widgets/speaking_result.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('single choice variant tanlanganda {optionId} qaytaradi', (tester) async {
    Map<String, dynamic>? got;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: QuestionInput(
          question: const {
            'questionVersionId': 'qv1',
            'type': 'SINGLE_CHOICE',
            'options': [
              {'id': 'o1', 'label': 'A', 'content': '3'},
              {'id': 'o2', 'label': 'B', 'content': '4'},
            ],
          },
          response: null,
          onChanged: (r) => got = r,
        ),
      ),
    ));
    await tester.tap(find.text('4'));
    expect(got, {'optionId': 'o2'});
  });

  testWidgets('SMS kod taymeri: 2 daqiqadan keyin qayta yuborish chiqadi', (tester) async {
    var now = DateTime(2026, 1, 1, 12);
    var resent = 0;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: OtpCountdown(
          expiresAt: now.add(const Duration(seconds: 120)),
          now: () => now,
          onResend: () async => resent++,
        ),
      ),
    ));
    Future<void> advance(int seconds) async {
      now = now.add(Duration(seconds: seconds));
      await tester.pump(const Duration(seconds: 1));
    }

    expect(find.text('Kod 2:00 davomida amal qiladi'), findsOneWidget);
    await advance(61);
    expect(find.text('Kod 0:59 davomida amal qiladi'), findsOneWidget);
    expect(find.text('Kodni qayta yuborish'), findsNothing);

    await advance(59);
    expect(find.text('Kod muddati tugadi'), findsOneWidget);
    await tester.tap(find.text('Kodni qayta yuborish'));
    await tester.pump();
    expect(resent, 1);
  });

  testWidgets('til darajasi: baholanmagan ko\'rsatkich va yozilgan javoblar ochiq aytiladi', (tester) async {
    tester.view.physicalSize = const Size(1000, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: SpeakingResultView(session: {
          'language': 'en',
          'answers': 4,
          'spokenAnswers': 1,
          'result': {
            'level': 'B1',
            'fluency': 55,
            'vocabulary': 48,
            'grammar': null,
            'coherence': null,
            'summary': 'Xulosa',
            'strengths': ['Ravon'],
            'improvements': ['Kengaytiring'],
            'corrections': [],
          },
        }),
      ),
    ));
    expect(find.text('B1'), findsOneWidget);
    expect(find.text('55 / 100'), findsOneWidget);
    expect(find.text('baholanmadi'), findsNWidgets(2));
    expect(find.textContaining('4 ta javobdan 3 tasi yozib kiritilgan'), findsOneWidget);
  });

  testWidgets('numeric javob matn sifatida yuboriladi', (tester) async {
    Map<String, dynamic>? got;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: QuestionInput(
          question: const {'questionVersionId': 'qv2', 'type': 'NUMERIC'},
          response: null,
          onChanged: (r) => got = r,
        ),
      ),
    ));
    await tester.enterText(find.byType(TextField), '3,5');
    expect(got, {'value': '3,5'});
  });
}
