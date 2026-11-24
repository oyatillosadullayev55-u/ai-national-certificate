import 'package:anc_mobile/core/answer_queue.dart';
import 'package:anc_mobile/core/api_client.dart';
import 'package:anc_mobile/widgets/math_text.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('splitMath', () {
    test('matn va formulani ajratadi', () {
      final p = splitMath(r'Yeching: $2x+6=14$ va $x$ ni toping');
      expect(p.map((e) => e.isMath).toList(), [false, true, false, true, false]);
      expect(p[1].text, '2x+6=14');
    });

    test('formulasiz matn', () {
      expect(splitMath('oddiy matn').single.isMath, isFalse);
    });
  });

  group('AnswerQueue', () {
    test('offline bo\'lsa javobni saqlaydi, internet qaytganda yuboradi', () async {
      var online = false;
      final sent = <String, Map<String, dynamic>>{};
      final q = AnswerQueue('a1', persist: false, sender: (attempt, qv, body) async {
        if (!online) throw ApiException(0, 'offline', offline: true);
        sent[qv] = body;
      });

      q.enqueue('q1', response: {'optionId': 'x'});
      await q.flush();
      expect(q.pendingCount, 1);

      // Yangi javob eskisini almashtiradi — har savol uchun bitta
      q.enqueue('q1', response: {'optionId': 'y'});
      expect(q.pendingCount, 1);

      online = true;
      expect(await q.flush(), 0);
      expect(sent['q1']!['response'], {'optionId': 'y'});
      expect(sent['q1']!['clientUpdatedAt'], isNotNull);
      q.dispose();
    });

    test('409 — urinish yopilgan, navbat tozalanadi', () async {
      final q = AnswerQueue('a2', persist: false, sender: (a, qv, b) async => throw ApiException(409, 'closed'));
      q.enqueue('q1', response: {'value': 1});
      await q.flush();
      expect(q.closed, isTrue);
      expect(q.pendingCount, 0);
      q.dispose();
    });
  });
}
