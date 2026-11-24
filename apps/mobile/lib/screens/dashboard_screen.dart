import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'error_notebook_screen.dart';
import 'study_plan_screen.dart';
import 'test_screen.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key, required this.onOpenTab});

  final ValueChanged<int> onOpenTab;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: AsyncView<Map>(
          load: () async => await api.get('/students/me/dashboard') as Map,
          builder: (context, d, reload) {
            final subjects = (d['subjects'] as List).cast<Map>();
            final weak = (d['weakTopics'] as List).cast<Map>();
            final recent = (d['recentResults'] as List).cast<Map>();
            final due = d['errorsDueToday'] as int;
            final name = session.firstName;
            return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 28), children: [
              // ── Salomlashish ──
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 4, 4, 12),
                child: Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(_greeting(), style: t.bodyMedium?.copyWith(color: cs.onSurfaceVariant)),
                      Text(name.isEmpty ? 'Xush kelibsiz!' : '$name 👋', style: t.headlineSmall),
                    ]),
                  ),
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: cs.primaryContainer,
                    child: Text(name.isEmpty ? '?' : name[0].toUpperCase(), style: TextStyle(fontWeight: FontWeight.w800, color: cs.onPrimaryContainer)),
                  ),
                ]),
              ),

              // ── Imtihongacha ──
              GradientCard(
                gradient: AppTheme.heroGradient,
                child: Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Imtihongacha', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 4),
                      Text(
                        d['daysToExam'] == null ? 'Sana belgilanmagan' : '${d['daysToExam']} kun',
                        style: t.headlineMedium?.copyWith(color: Colors.white),
                      ),
                    ]),
                  ),
                  _HeroStat(value: '${d['answersThisWeek']}', label: 'javob\nbu hafta', icon: Icons.local_fire_department),
                ]),
              ),

              // ── AI reja ──
              GradientCard(
                onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StudyPlanScreen())),
                child: Row(children: [
                  Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: .2), borderRadius: BorderRadius.circular(14)),
                    child: const Icon(Icons.auto_awesome, color: Colors.white),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('AI shaxsiy reja', style: t.titleMedium?.copyWith(color: Colors.white)),
                      const SizedBox(height: 2),
                      const Text('Zaif mavzularingiz asosida 7 kunlik reja', style: TextStyle(color: Colors.white70)),
                    ]),
                  ),
                  const Icon(Icons.arrow_forward_ios, color: Colors.white, size: 16),
                ]),
              ),

              // ── Takrorlash ──
              if (due > 0)
                Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    leading: IconBadge(Icons.replay, color: cs.error),
                    title: Text('Bugun takrorlash: $due ta xato', style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: const Text('Xatolar daftarini oching'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () async {
                      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ErrorNotebookScreen(dueOnly: true)));
                      reload();
                    },
                  ),
                ),

              // ── Tezkor mashq ──
              const SectionTitle('Tezkor mashq'),
              if (subjects.isEmpty) const Padding(padding: EdgeInsets.all(4), child: Text('Profilda fanlarni tanlang')),
              SizedBox(
                height: 104,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: subjects.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (context, i) {
                    final s = subjects[i];
                    final color = _palette[i % _palette.length];
                    return SizedBox(
                      width: 140,
                      child: Card(
                        margin: EdgeInsets.zero,
                        child: InkWell(
                          onTap: () => startPractice(context, s['subjectId'] as String).then((_) => reload()),
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              IconBadge(Icons.play_arrow_rounded, color: color, size: 34),
                              const Spacer(),
                              Text(s['subject']['nameUz'] as String, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                            ]),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),

              // ── Zaif mavzular ──
              const SectionTitle('Zaif mavzular'),
              if (weak.isEmpty)
                Card(
                  child: ListTile(
                    leading: IconBadge(Icons.insights, color: cs.tertiary),
                    title: const Text('Hali aniqlanmagan'),
                    subtitle: const Text('Bir nechta test yeching — zaif joylaringizni topamiz'),
                  ),
                ),
              for (final w in weak)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
                    child: Row(children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(w['name'] as String, style: const TextStyle(fontWeight: FontWeight.w700)),
                          const SizedBox(height: 8),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(99),
                            child: LinearProgressIndicator(value: asNum(w['mastery']).toDouble(), minHeight: 6, color: cs.error),
                          ),
                          const SizedBox(height: 4),
                          Text('O\'zlashtirish: ${(asNum(w['mastery']) * 100).round()}%', style: t.bodySmall),
                        ]),
                      ),
                      const SizedBox(width: 8),
                      FilledButton.tonal(
                        style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                        onPressed: () => startPractice(context, w['subjectId'] as String, topicIds: [w['topicId'] as String]).then((_) => reload()),
                        child: const Text('Mashq'),
                      ),
                    ]),
                  ),
                ),

              // ── Oxirgi natijalar ──
              SectionTitle('Oxirgi natijalar', trailing: TextButton(onPressed: () => onOpenTab(2), child: const Text('Hammasi'))),
              if (recent.isEmpty)
                Card(
                  child: ListTile(
                    leading: IconBadge(Icons.quiz_outlined, color: cs.primary),
                    title: const Text('Hali test yechilmagan'),
                    subtitle: const Text('Birinchi testingizni boshlang'),
                    onTap: () => onOpenTab(2),
                  ),
                ),
              for (final r in recent)
                Card(
                  child: ListTile(
                    leading: _ScoreRing(percent: asNum(r['percent']).toInt()),
                    title: Text(r['test']['title'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(_mode(r['test']['mode'] as String)),
                  ),
                ),
            ]);
          },
        ),
      ),
    );
  }

  static const _palette = [Color(0xFF4F46E5), Color(0xFF0EA5E9), Color(0xFF16A34A), Color(0xFFD97706), Color(0xFFDB2777), Color(0xFF7C3AED)];

  static String _greeting() {
    final h = DateTime.now().hour;
    if (h < 6) return 'Xayrli tun';
    if (h < 12) return 'Xayrli tong';
    if (h < 18) return 'Xayrli kun';
    return 'Xayrli kech';
  }

  static String _mode(String m) => switch (m) {
        'PRACTICE' => 'Mashq',
        'TOPIC' => 'Mavzu testi',
        'MIXED' => 'Aralash test',
        'ADAPTIVE' => 'Moslashuvchan test',
        'MOCK_EXAM' => 'Sinov imtihoni',
        'TEACHER_ASSIGNMENT' => 'O\'qituvchi topshirig\'i',
        'DAILY_CHALLENGE' => 'Kunlik musobaqa',
        'REVISION' => 'Takrorlash',
        _ => m,
      };
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({required this.value, required this.label, required this.icon});

  final String value;
  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: .16), borderRadius: BorderRadius.circular(16)),
      child: Row(children: [
        Icon(icon, color: const Color(0xFFFFB86B)),
        const SizedBox(width: 8),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 20)),
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11, height: 1.1)),
        ]),
      ]),
    );
  }
}

class _ScoreRing extends StatelessWidget {
  const _ScoreRing({required this.percent});

  final int percent;

  @override
  Widget build(BuildContext context) {
    final color = percent >= 80 ? Colors.green : percent >= 50 ? Colors.orange : Colors.red;
    return SizedBox(
      width: 44,
      height: 44,
      child: Stack(alignment: Alignment.center, children: [
        CircularProgressIndicator(value: percent / 100, strokeWidth: 4, color: color, backgroundColor: color.withValues(alpha: .15)),
        Text('$percent', style: TextStyle(fontWeight: FontWeight.w800, color: color, fontSize: 13)),
      ]),
    );
  }
}

/// Mashq testini yaratib, test ekranini ochadi
Future<void> startPractice(BuildContext context, String subjectId, {List<String>? topicIds, int count = 10}) async {
  try {
    final attempt = await api.post('/tests/practice', {
      'subjectId': subjectId,
      if (topicIds != null) 'topicIds': topicIds,
      'count': count,
    });
    if (!context.mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => TestScreen(attempt: Map<String, dynamic>.from(attempt as Map))));
  } catch (e) {
    if (context.mounted) showError(context, e);
  }
}
