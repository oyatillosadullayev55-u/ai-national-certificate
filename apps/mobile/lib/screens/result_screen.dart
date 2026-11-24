import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../widgets/common.dart';
import '../widgets/math_text.dart';

/// Natija: umumiy ball, mavzular kesimida aniqlik, har savol bo'yicha yechim va AI izoh.
class ResultScreen extends StatelessWidget {
  const ResultScreen({super.key, required this.result});

  final Map<String, dynamic> result;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final topics = (result['topics'] as List).cast<Map>();
    final questions = (result['questions'] as List).cast<Map>();
    final percent = asNum(result['percent']);

    return Scaffold(
      appBar: AppBar(title: Text(result['title'] as String? ?? 'Natija')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(children: [
              Text('$percent%', style: t.displaySmall?.copyWith(fontWeight: FontWeight.w800, color: percent >= 70 ? Colors.green : (percent >= 40 ? Colors.orange : cs.error))),
              Text('${result['score']} / ${result['maxScore']} ball · ${result['correctCount']} / ${result['totalQuestions']} to\'g\'ri'),
              const SizedBox(height: 8),
              Wrap(spacing: 12, children: [
                Text('Javobsiz: ${result['unanswered']}'),
                Text('O\'rtacha: ${result['avgTimePerQuestionSec']} s/savol'),
                if (asNum(result['pendingManualReview']) > 0) Text('Tekshiruvda: ${result['pendingManualReview']}'),
              ]),
              const SizedBox(height: 12),
              Text(result['disclaimer'] as String? ?? '', textAlign: TextAlign.center, style: t.bodySmall?.copyWith(color: cs.outline)),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        Text('Mavzular bo\'yicha', style: t.titleMedium),
        for (final tp in topics)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(tp['topicName'] as String),
            subtitle: LinearProgressIndicator(
              value: asNum(tp['accuracy']) / 100,
              color: asNum(tp['accuracy']) >= 70 ? Colors.green : (asNum(tp['accuracy']) >= 40 ? Colors.orange : Colors.red),
            ),
            trailing: Text('${tp['correct']}/${tp['total']}'),
          ),
        const SizedBox(height: 12),
        Text('Savollar tahlili', style: t.titleMedium),
        for (final q in questions) _QuestionReview(attemptId: result['id'] as String, q: Map<String, dynamic>.from(q)),
        const SizedBox(height: 16),
        FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Tayyor')),
      ]),
    );
  }
}

class _QuestionReview extends StatelessWidget {
  const _QuestionReview({required this.attemptId, required this.q});

  final String attemptId;
  final Map<String, dynamic> q;

  String _describe(dynamic response) {
    if (response == null) return 'Javob berilmagan';
    final r = Map<String, dynamic>.from(response as Map);
    final options = (q['options'] as List).cast<Map>();
    String label(String? id) => options.firstWhere((o) => o['id'] == id, orElse: () => {'label': '?'})['label'] as String;
    if (r['optionId'] != null) return label(r['optionId'] as String);
    if (r['optionIds'] is List) return (r['optionIds'] as List).map((id) => label(id as String)).join(', ');
    if (r.containsKey('value')) return '${r['value'] is bool ? (r['value'] == true ? 'Rost' : 'Yolg\'on') : r['value']}';
    if (r['text'] != null) return r['text'] as String;
    return 'Javob berilgan';
  }

  Future<void> _explain(BuildContext context) async {
    try {
      final r = await api.post('/ai/explanations', {'attemptId': attemptId, 'questionVersionId': q['questionVersionId']}) as Map;
      if (!context.mounted) return;
      showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        builder: (c) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.6,
          builder: (c, scroll) => ListView(controller: scroll, padding: const EdgeInsets.all(20), children: [
            Row(children: [const Icon(Icons.auto_awesome), const SizedBox(width: 8), Text('AI izoh', style: Theme.of(c).textTheme.titleMedium)]),
            const SizedBox(height: 12),
            MathText(r['explanation'] as String),
            const Divider(height: 32),
            Text('Manba: ekspert tasdiqlagan yechim', style: Theme.of(c).textTheme.bodySmall),
          ]),
        ),
      );
    } catch (e) {
      if (context.mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final correct = q['isCorrect'];
    final icon = correct == true
        ? const Icon(Icons.check_circle, color: Colors.green)
        : correct == null
            ? const Icon(Icons.hourglass_top, color: Colors.orange)
            : const Icon(Icons.cancel, color: Colors.red);
    final options = (q['options'] as List).cast<Map>();
    return Card(
      child: ExpansionTile(
        leading: icon,
        title: MathText('${q['index']}. ${q['stem']}', style: Theme.of(context).textTheme.bodyMedium),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final o in options)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(children: [
                Icon(o['isCorrect'] == true ? Icons.check : Icons.remove, size: 16, color: o['isCorrect'] == true ? Colors.green : null),
                const SizedBox(width: 6),
                Text('${o['label']}) '),
                Expanded(child: MathText(o['content'] as String)),
              ]),
            ),
          if (options.isEmpty && q['answerKey'] != null) Text('To\'g\'ri javob: ${q['answerKey']}'),
          const SizedBox(height: 8),
          Text('Sizning javobingiz: ${_describe(q['yourResponse'])}', style: const TextStyle(fontWeight: FontWeight.w600)),
          if (q['solution'] != null) ...[
            const SizedBox(height: 8),
            const Text('Yechim:', style: TextStyle(fontWeight: FontWeight.w600)),
            MathText(q['solution'] as String),
          ],
          if (correct != true)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(onPressed: () => _explain(context), icon: const Icon(Icons.auto_awesome), label: const Text('AI izoh')),
            ),
        ],
      ),
    );
  }
}
