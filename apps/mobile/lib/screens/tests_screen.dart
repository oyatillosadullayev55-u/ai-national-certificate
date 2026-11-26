import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../widgets/common.dart';
import 'error_notebook_screen.dart';
import 'result_screen.dart';
import 'test_screen.dart';

const modeNames = {
  'MOCK_EXAM': 'Mock imtihon',
  'DIAGNOSTIC': 'Diagnostika',
  'TOPIC': 'Mavzu testi',
  'MIXED': 'Aralash',
  'PRACTICE': 'Mashq',
  'TEACHER_ASSIGNMENT': 'Topshiriq',
  'DAILY_CHALLENGE': 'Kunlik',
  'REVISION': 'Takrorlash',
  'ADAPTIVE': 'Adaptiv',
};

class TestsScreen extends StatelessWidget {
  const TestsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Testlar'),
          actions: [
            IconButton(
              tooltip: 'Xatolar daftari',
              icon: const Icon(Icons.menu_book_outlined),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ErrorNotebookScreen())),
            ),
          ],
          bottom: const TabBar(tabs: [Tab(text: 'Testlar'), Tab(text: 'Topshiriqlar'), Tab(text: 'Tarix')]),
        ),
        body: const TabBarView(children: [_PublicTests(), _Assigned(), _History()]),
      ),
    );
  }
}

Future<void> startTest(BuildContext context, Map test) async {
  final duration = test['durationSec'] as int?;
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(test['title'] as String),
      content: Text([
        if (test['_count'] != null) '${test['_count']['questions']} ta savol',
        duration != null ? 'Vaqt: ${duration ~/ 60} daqiqa. Boshlangach vaqt to\'xtamaydi.' : 'Vaqt cheklovi yo\'q',
        if (test['mode'] == 'MOCK_EXAM') 'Imtihon davomida AI Tutor o\'chiriladi.',
      ].join('\n')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Bekor')),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Boshlash')),
      ],
    ),
  );
  if (ok != true || !context.mounted) return;
  try {
    final attempt = await api.post('/tests/${test['id']}/start');
    if (!context.mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => TestScreen(attempt: Map<String, dynamic>.from(attempt as Map))));
  } catch (e) {
    if (context.mounted) showError(context, e);
  }
}

class _PublicTests extends StatelessWidget {
  const _PublicTests();

  @override
  Widget build(BuildContext context) {
    return AsyncView<Map>(
      load: () async => await api.get('/tests', query: {'limit': '50'}) as Map,
      empty: (d) => (d['items'] as List).isEmpty,
      builder: (context, d, _) => ListView(children: [
        for (final t in (d['items'] as List).cast<Map>())
          ListTile(
            leading: const CircleAvatar(child: Icon(Icons.assignment_outlined)),
            title: Text(t['title'] as String),
            subtitle: Text('${modeNames[t['mode']] ?? t['mode']} · ${t['_count']['questions']} savol'
                '${t['durationSec'] != null ? ' · ${(t['durationSec'] as int) ~/ 60} daq' : ''}'),
            onTap: () => startTest(context, t),
          ),
      ]),
    );
  }
}

class _Assigned extends StatelessWidget {
  const _Assigned();

  @override
  Widget build(BuildContext context) {
    return AsyncView<List>(
      load: () async => await api.get('/tests/assigned') as List,
      empty: (l) => l.isEmpty,
      builder: (context, list, reload) => ListView(children: [
        for (final a in list.cast<Map>())
          Builder(builder: (context) {
            final t = a['test'] as Map;
            final last = (t['attempts'] as List).isEmpty ? null : (t['attempts'] as List).first as Map;
            final done = last != null && last['status'] != 'IN_PROGRESS';
            final due = DateTime.tryParse(a['dueAt'] as String? ?? '');
            return ListTile(
              leading: Icon(done ? Icons.task_alt : Icons.pending_actions, color: done ? Colors.green : Colors.orange),
              title: Text(t['title'] as String),
              subtitle: Text(done
                  ? 'Natija: ${percentText(asNum(last['score']), asNum(last['maxScore']))}'
                  : (due != null ? 'Muddat: ${due.day}.${due.month}.${due.year}' : 'Muddatsiz')),
              onTap: done ? null : () => startTest(context, t).then((_) => reload()),
            );
          }),
      ]),
    );
  }
}

class _History extends StatelessWidget {
  const _History();

  @override
  Widget build(BuildContext context) {
    return AsyncView<List>(
      load: () async => await api.get('/attempts/me') as List,
      empty: (l) => l.isEmpty,
      builder: (context, list, reload) => ListView(children: [
        for (final a in list.cast<Map>())
          ListTile(
            leading: CircleAvatar(
              child: a['status'] == 'IN_PROGRESS'
                  ? const Icon(Icons.play_arrow)
                  : Text(percentText(asNum(a['score']), asNum(a['maxScore'])), style: const TextStyle(fontSize: 11)),
            ),
            title: Text(a['test']['title'] as String),
            subtitle: Text('${modeNames[a['test']['mode']] ?? ''} · ${_date(a['startedAt'] as String)}'
                '${a['status'] == 'IN_PROGRESS' ? ' · davom ettirish' : ''}'),
            onTap: () async {
              try {
                if (a['status'] == 'IN_PROGRESS') {
                  final attempt = await api.get('/attempts/${a['id']}') as Map;
                  if (!context.mounted) return;
                  if (attempt['status'] == 'IN_PROGRESS') {
                    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => TestScreen(attempt: Map<String, dynamic>.from(attempt))));
                    reload();
                    return;
                  }
                }
                final result = await api.get('/attempts/${a['id']}/result') as Map;
                if (!context.mounted) return;
                await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ResultScreen(result: Map<String, dynamic>.from(result))));
              } catch (e) {
                if (context.mounted) showError(context, e);
              }
            },
          ),
      ]),
    );
  }

  static String _date(String iso) {
    final d = DateTime.parse(iso).toLocal();
    return '${d.day}.${d.month}.${d.year} ${d.hour}:${d.minute.toString().padLeft(2, '0')}';
  }
}
