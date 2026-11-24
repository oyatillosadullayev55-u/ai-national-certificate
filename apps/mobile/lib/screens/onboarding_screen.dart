import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/session.dart';
import '../widgets/common.dart';

const levels = ['A+', 'A', 'B+', 'B', 'C+', 'C'];

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final Map<String, String> _selected = {}; // subjectId → maqsadli daraja
  DateTime? _examDate;
  double _minutes = 60;

  @override
  void initState() {
    super.initState();
    // Fanlarni o'zgartirish rejimida avvalgi tanlov saqlanadi
    for (final s in session.mySubjects) {
      _selected[s['subjectId'] as String] = (s['targetLevel'] as String?) ?? 'A';
    }
    final exam = session.me?['studentProfile']?['examDate'] as String?;
    if (exam != null) _examDate = DateTime.tryParse(exam);
    final mins = session.me?['studentProfile']?['dailyMinutes'];
    if (mins is num) _minutes = mins.toDouble().clamp(15.0, 240.0).toDouble();
  }

  Future<void> _save() async {
    if (_selected.isEmpty) throw ApiException(400, 'Kamida bitta fan tanlang');
    await api.put('/users/me/subjects', {
      'subjects': [for (final e in _selected.entries) {'subjectId': e.key, 'targetLevel': e.value}],
    });
    await api.patch('/users/me/student-profile', {
      if (_examDate != null) 'examDate': _examDate!.toIso8601String().substring(0, 10),
      'dailyMinutes': _minutes.round(),
    });
    await session.refreshMe();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Xush kelibsiz, ${session.firstName}!')),
      body: AsyncView<List>(
        load: () async => await api.get('/subjects') as List,
        builder: (context, subjects, _) => ListView(padding: const EdgeInsets.all(16), children: [
          Text('Qaysi fanlardan tayyorlanasiz?', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          for (final s in subjects.cast<Map>())
            Card(
              child: Column(children: [
                CheckboxListTile(
                  title: Text(s['nameUz'] as String),
                  value: _selected.containsKey(s['id']),
                  onChanged: (v) => setState(() {
                    final id = s['id'] as String;
                    if (v == true) {
                      _selected[id] = 'A';
                    } else {
                      _selected.remove(id);
                    }
                  }),
                ),
                if (_selected.containsKey(s['id']))
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                    child: Wrap(spacing: 6, children: [
                      const Padding(padding: EdgeInsets.only(top: 8, right: 4), child: Text('Maqsad:')),
                      for (final l in levels)
                        ChoiceChip(
                          label: Text(l),
                          selected: _selected[s['id']] == l,
                          onSelected: (_) => setState(() => _selected[s['id'] as String] = l),
                        ),
                    ]),
                  ),
              ]),
            ),
          const SizedBox(height: 16),
          ListTile(
            leading: const Icon(Icons.event),
            title: const Text('Imtihon sanasi'),
            subtitle: Text(_examDate == null ? 'Tanlanmagan' : '${_examDate!.day}.${_examDate!.month}.${_examDate!.year}'),
            onTap: () async {
              final now = DateTime.now();
              final d = await showDatePicker(context: context, firstDate: now, lastDate: now.add(const Duration(days: 730)), initialDate: now.add(const Duration(days: 90)));
              if (d != null) setState(() => _examDate = d);
            },
          ),
          ListTile(leading: const Icon(Icons.timer_outlined), title: Text('Kuniga ${_minutes.round()} daqiqa')),
          Slider(value: _minutes, min: 15, max: 240, divisions: 15, label: '${_minutes.round()}', onChanged: (v) => setState(() => _minutes = v)),
          const SizedBox(height: 16),
          BusyButton(onPressed: _save, child: const Text('Boshlash')),
        ]),
      ),
    );
  }
}
