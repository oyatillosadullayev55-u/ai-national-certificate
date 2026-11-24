import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/session.dart';
import '../widgets/common.dart';
import 'dashboard_screen.dart';

class SubjectsScreen extends StatelessWidget {
  const SubjectsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Fanlarim')),
      body: AsyncView<List>(
        load: () async => await api.get('/users/me/subjects') as List,
        empty: (l) => l.isEmpty,
        builder: (context, list, _) => ListView(padding: const EdgeInsets.all(12), children: [
          for (final s in list.cast<Map>())
            Card(
              child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.menu_book)),
                title: Text(s['subject']['nameUz'] as String),
                subtitle: Text('Maqsad: ${s['targetLevel'] ?? '—'}'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => SubjectDetailScreen(subjectId: s['subjectId'] as String, name: s['subject']['nameUz'] as String),
                )),
              ),
            ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: session.editSubjects,
            icon: const Icon(Icons.edit),
            label: const Text('Fanlarni o\'zgartirish'),
          ),
        ]),
      ),
    );
  }
}

/// Knowledge Map: mavzular holati, prerequisite bo'shliqlari, tavsiyalar
class SubjectDetailScreen extends StatelessWidget {
  const SubjectDetailScreen({super.key, required this.subjectId, required this.name});

  final String subjectId;
  final String name;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(name)),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => startPractice(context, subjectId),
        icon: const Icon(Icons.play_arrow),
        label: const Text('Mashq'),
      ),
      body: AsyncView<Map>(
        load: () async => await api.get('/students/me/knowledge-map', query: {'subjectId': subjectId}) as Map,
        builder: (context, map, reload) {
          final nodes = (map['nodes'] as List).cast<Map>();
          final recs = (map['recommendations'] as List).cast<Map>();
          final roots = nodes.where((n) => n['parentId'] == null).toList()
            ..sort((a, b) => asNum(a['sortOrder']).compareTo(asNum(b['sortOrder'])));
          List<Map> childrenOf(String id) => nodes.where((n) => n['parentId'] == id).toList()
            ..sort((a, b) => asNum(a['sortOrder']).compareTo(asNum(b['sortOrder'])));

          Widget tile(Map n, {bool child = false}) {
            final status = n['status'] as String;
            final gaps = (n['prerequisiteGaps'] as List).cast<Map>();
            return ListTile(
              contentPadding: EdgeInsets.only(left: child ? 32 : 8, right: 8),
              leading: Icon(Icons.circle, size: 14, color: masteryColor(context, status)),
              title: Text(n['name'] as String),
              subtitle: gaps.isNotEmpty
                  ? Text('Avval: ${gaps.map((g) => g['name']).join(', ')}', style: const TextStyle(color: Colors.orange))
                  : (n['accuracy'] != null ? Text('Aniqlik: ${n['accuracy']}% · ${n['answered']} javob') : const Text('Boshlanmagan')),
              trailing: IconButton(
                icon: const Icon(Icons.play_circle_outline),
                tooltip: 'Shu mavzu bo\'yicha mashq',
                onPressed: () => startPractice(context, subjectId, topicIds: [n['id'] as String]).then((_) => reload()),
              ),
            );
          }

          return ListView(padding: const EdgeInsets.fromLTRB(8, 8, 8, 96), children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(children: [
                  SizedBox(
                    width: 64,
                    height: 64,
                    child: Stack(fit: StackFit.expand, children: [
                      CircularProgressIndicator(value: asNum(map['overall']) / 100, strokeWidth: 6),
                      Center(child: Text('${map['overall']}%', style: t.titleMedium)),
                    ]),
                  ),
                  const SizedBox(width: 16),
                  const Expanded(child: Text('Fan bo\'yicha umumiy o\'zlashtirish. Har bir yechilgan test bilan yangilanadi.')),
                ]),
              ),
            ),
            if (recs.isNotEmpty) ...[
              Padding(padding: const EdgeInsets.fromLTRB(8, 12, 8, 4), child: Text('Tavsiya: shu tartibda o\'rganing', style: t.titleMedium)),
              for (final r in recs)
                ListTile(
                  leading: const Icon(Icons.lightbulb_outline, color: Colors.amber),
                  title: Text(r['name'] as String? ?? ''),
                  subtitle: Text(r['reason'] as String),
                  onTap: () => startPractice(context, subjectId, topicIds: [r['topicId'] as String]).then((_) => reload()),
                ),
            ],
            Padding(padding: const EdgeInsets.fromLTRB(8, 12, 8, 4), child: Text('Bilim xaritasi', style: t.titleMedium)),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8),
              child: Wrap(spacing: 12, children: [_Legend('mastered', 'O\'zlashtirilgan'), _Legend('learning', 'O\'rganilmoqda'), _Legend('weak', 'Zaif'), _Legend('not_started', 'Boshlanmagan')]),
            ),
            for (final r in roots) ...[
              tile(r),
              for (final c in childrenOf(r['id'] as String)) tile(c, child: true),
            ],
          ]);
        },
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend(this.status, this.label);

  final String status;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.circle, size: 10, color: masteryColor(context, status)),
      const SizedBox(width: 4),
      Text(label, style: Theme.of(context).textTheme.bodySmall),
    ]);
  }
}
