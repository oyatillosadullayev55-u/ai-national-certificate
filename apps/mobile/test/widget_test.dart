import 'package:anc_mobile/widgets/question_input.dart';
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
