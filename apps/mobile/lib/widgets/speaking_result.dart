import 'package:flutter/material.dart';

import '../core/voice.dart';

const cefrNames = {
  'A1': "Boshlang'ich",
  'A2': 'Elementar',
  'B1': "O'rta",
  'B2': "Yuqori o'rta",
  'C1': "Ilg'or",
  'C2': 'Mukammal',
};

/// Til darajasi natijasi (GET /ai/speaking/sessions/:id javobidagi `result`)
class SpeakingResultView extends StatelessWidget {
  const SpeakingResultView({super.key, required this.session});

  final Map<String, dynamic> session;

  static const _scores = {'fluency': 'Ravonlik', 'vocabulary': "So'z boyligi", 'grammar': 'Grammatika', 'coherence': 'Mantiqiylik'};

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final r = Map<String, dynamic>.from(session['result'] as Map);
    final level = r['level'] as String;
    final answers = session['answers'] as int? ?? 0;
    final spoken = session['spokenAnswers'] as int? ?? 0;
    final corrections = (r['corrections'] as List? ?? const []).cast<Map>();

    Widget bullets(String title, List items) => items.isEmpty
        ? const SizedBox.shrink()
        : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const SizedBox(height: 16),
            Text(title, style: t.titleMedium),
            for (final i in items) Padding(padding: const EdgeInsets.only(top: 6), child: Text('• $i')),
          ]);

    return ListView(padding: const EdgeInsets.all(20), children: [
      Text(speakingLanguages[session['language']]?.name ?? '', textAlign: TextAlign.center),
      Text(level, textAlign: TextAlign.center, style: t.displayLarge?.copyWith(fontWeight: FontWeight.w800, color: cs.primary)),
      Text(cefrNames[level] ?? '', textAlign: TextAlign.center, style: t.titleMedium),
      const SizedBox(height: 12),
      Text(r['summary'] as String? ?? '', textAlign: TextAlign.center),
      const SizedBox(height: 16),
      for (final s in _scores.entries)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(s.value)),
              Text(r[s.key] == null ? 'baholanmadi' : '${r[s.key]} / 100'),
            ]),
            const SizedBox(height: 4),
            LinearProgressIndicator(value: ((r[s.key] as num?) ?? 0) / 100),
          ]),
        ),
      bullets('Kuchli tomonlaringiz', r['strengths'] as List? ?? const []),
      bullets('Yaxshilash kerak', r['improvements'] as List? ?? const []),
      if (corrections.isNotEmpty) ...[
        const SizedBox(height: 16),
        Text('Xatolar va to\'g\'ri variantlar', style: t.titleMedium),
        for (final c in corrections)
          Card(
            child: ListTile(
              title: Text('${c['corrected']}'),
              subtitle: Text('${c['original']}', style: const TextStyle(decoration: TextDecoration.lineThrough)),
            ),
          ),
      ],
      const SizedBox(height: 20),
      Text(
        [
          if (spoken < answers) '$answers ta javobdan ${answers - spoken} tasi yozib kiritilgan.',
          'Talaffuz baholanmaydi. Bu mashq natijasi, rasmiy sertifikat emas.',
        ].join('\n'),
        textAlign: TextAlign.center,
        style: t.bodySmall?.copyWith(color: cs.outline),
      ),
    ]);
  }
}
