import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_client.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'error_notebook_screen.dart';

/// AI tuzgan 7 kunlik shaxsiy o'qish rejasi
class StudyPlanScreen extends StatefulWidget {
  const StudyPlanScreen({super.key});

  @override
  State<StudyPlanScreen> createState() => _StudyPlanScreenState();
}

class _StudyPlanScreenState extends State<StudyPlanScreen> {
  Map<String, dynamic>? _plan;
  String? _createdAt;
  int _minutes = 60;
  final _goal = TextEditingController();
  bool _loading = true;
  bool _generating = false;
  String? _error;
  Set<String> _done = {};

  String get _doneKey => 'plan_done_${_createdAt ?? ''}';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _goal.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final r = Map<String, dynamic>.from(await api.get('/ai/study-plan') as Map);
      await _apply(r);
    } catch (e) {
      _error = e.toString();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _apply(Map<String, dynamic> r) async {
    _plan = r['plan'] == null ? null : Map<String, dynamic>.from(r['plan'] as Map);
    _createdAt = r['createdAt'] as String?;
    if (r['minutesPerDay'] is int) _minutes = r['minutesPerDay'] as int;
    final prefs = await SharedPreferences.getInstance();
    _done = (prefs.getStringList(_doneKey) ?? []).toSet();
  }

  Future<void> _generate() async {
    setState(() => _generating = true);
    try {
      final r = await api.post(
        '/ai/study-plan',
        {'minutesPerDay': _minutes, if (_goal.text.trim().isNotEmpty) 'goal': _goal.text.trim()},
        const Duration(minutes: 3),
      );
      await _apply(Map<String, dynamic>.from(r as Map));
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  Future<void> _toggle(String id) async {
    setState(() {
      if (!_done.remove(id)) _done.add(id);
    });
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_doneKey, _done.toList());
  }

  Future<void> _settings() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (c) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(c).viewInsets.bottom + 20),
        child: StatefulBuilder(
          builder: (c, setLocal) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Yangi reja', style: Theme.of(c).textTheme.titleLarge),
            const SizedBox(height: 16),
            _MinutesPicker(value: _minutes, onChanged: (v) => setLocal(() => _minutes = v)),
            const SizedBox(height: 16),
            TextField(controller: _goal, maxLength: 200, decoration: const InputDecoration(labelText: 'Maqsadingiz (ixtiyoriy)', hintText: 'Masalan: matematikadan A+')),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () {
                  Navigator.pop(c);
                  _generate();
                },
                icon: const Icon(Icons.auto_awesome),
                label: const Text('Rejani tuzish'),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI o\'qish rejasi'),
        actions: [
          if (_plan != null && !_generating)
            IconButton(tooltip: 'Yangi reja', onPressed: _settings, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : _generating
                  ? const _Generating()
                  : _plan == null
                      ? _Intro(minutes: _minutes, goal: _goal, onMinutes: (v) => setState(() => _minutes = v), onGenerate: _generate)
                      : _PlanView(plan: _plan!, done: _done, onToggle: _toggle, onRefresh: _load),
    );
  }
}

class _Intro extends StatelessWidget {
  const _Intro({required this.minutes, required this.goal, required this.onMinutes, required this.onGenerate});

  final int minutes;
  final TextEditingController goal;
  final ValueChanged<int> onMinutes;
  final VoidCallback onGenerate;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return ListView(padding: const EdgeInsets.all(20), children: [
      GradientCard(
        padding: const EdgeInsets.all(22),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.auto_awesome, color: Colors.white, size: 34),
          const SizedBox(height: 14),
          Text('Shaxsiy reja — bir bosishda', style: t.headlineSmall?.copyWith(color: Colors.white)),
          const SizedBox(height: 8),
          const Text(
            'AI natijalaringiz, zaif mavzularingiz va xatolar daftaringizni tahlil qilib, keyingi 7 kun uchun aniq reja tuzadi.',
            style: TextStyle(color: Colors.white, height: 1.4),
          ),
        ]),
      ),
      const SizedBox(height: 20),
      _MinutesPicker(value: minutes, onChanged: onMinutes),
      const SizedBox(height: 16),
      TextField(controller: goal, maxLength: 200, decoration: const InputDecoration(labelText: 'Maqsadingiz (ixtiyoriy)', hintText: 'Masalan: matematikadan A+')),
      const SizedBox(height: 8),
      FilledButton.icon(onPressed: onGenerate, icon: const Icon(Icons.auto_awesome), label: const Text('Rejani tuzish')),
    ]);
  }
}

class _MinutesPicker extends StatelessWidget {
  const _MinutesPicker({required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Kuniga qancha vaqt ajrata olasiz?', style: Theme.of(context).textTheme.titleSmall),
      const SizedBox(height: 10),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final m in const [30, 45, 60, 90, 120])
          ChoiceChip(label: Text(m < 60 ? '$m daq' : '${m ~/ 60} soat${m % 60 > 0 ? ' ${m % 60} daq' : ''}'), selected: value == m, onSelected: (_) => onChanged(m)),
      ]),
    ]);
  }
}

class _Generating extends StatelessWidget {
  const _Generating();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(gradient: AppTheme.aiGradient, borderRadius: BorderRadius.circular(22)),
            child: const Icon(Icons.auto_awesome, color: Colors.white, size: 36),
          ),
          const SizedBox(height: 20),
          Text('Reja tuzilmoqda…', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          const Text('AI natijalaringizni tahlil qilyapti. Bu 10–60 soniya olishi mumkin.', textAlign: TextAlign.center),
          const SizedBox(height: 20),
          const SizedBox(width: 160, child: LinearProgressIndicator()),
        ]),
      ),
    );
  }
}

class _PlanView extends StatelessWidget {
  const _PlanView({required this.plan, required this.done, required this.onToggle, required this.onRefresh});

  final Map<String, dynamic> plan;
  final Set<String> done;
  final ValueChanged<String> onToggle;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final days = (plan['days'] as List).cast<Map>();
    final focus = (plan['focusTopics'] as List).cast<Map>();
    final tips = (plan['tips'] as List).cast<String>();
    final total = days.fold<int>(0, (s, d) => s + (d['tasks'] as List).length);
    final completed = done.length.clamp(0, total);

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        GradientCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.auto_awesome, color: Colors.white),
              const SizedBox(width: 8),
              Text('Haftalik reja', style: t.titleMedium?.copyWith(color: Colors.white)),
              const Spacer(),
              Text('$completed / $total', style: t.titleMedium?.copyWith(color: Colors.white)),
            ]),
            const SizedBox(height: 10),
            Text(plan['summary'] as String, style: const TextStyle(color: Colors.white, height: 1.4)),
            const SizedBox(height: 14),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                value: total == 0 ? 0 : completed / total,
                minHeight: 8,
                color: Colors.white,
                backgroundColor: Colors.white.withValues(alpha: .25),
              ),
            ),
          ]),
        ),
        if (focus.isNotEmpty) ...[
          const SectionTitle('Diqqat markazida'),
          for (final f in focus)
            Card(
              child: ListTile(
                leading: const IconBadge(Icons.center_focus_strong, color: Color(0xFFDC2626)),
                title: Text(f['name'] as String, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(f['reason'] as String),
              ),
            ),
        ],
        const SectionTitle('Kunlar bo\'yicha'),
        for (final d in days) _DayCard(day: d, done: done, onToggle: onToggle),
        if (tips.isNotEmpty) ...[
          const SectionTitle('Maslahatlar'),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                for (final tip in tips)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Icon(Icons.lightbulb_outline, size: 18, color: Color(0xFFD97706)),
                      const SizedBox(width: 10),
                      Expanded(child: Text(tip)),
                    ]),
                  ),
              ]),
            ),
          ),
        ],
      ]),
    );
  }
}

class _DayCard extends StatelessWidget {
  const _DayCard({required this.day, required this.done, required this.onToggle});

  final Map day;
  final Set<String> done;
  final ValueChanged<String> onToggle;

  static const _kinds = {
    'learn': (Icons.menu_book, Color(0xFF2563EB), 'Nazariya'),
    'practice': (Icons.edit_note, Color(0xFF7C3AED), 'Mashq'),
    'review': (Icons.replay, Color(0xFFDC2626), 'Takrorlash'),
    'test': (Icons.quiz, Color(0xFF16A34A), 'Test'),
  };

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final n = day['day'] as int;
    final tasks = (day['tasks'] as List).cast<Map>();
    final minutes = tasks.fold<int>(0, (s, t) => s + (t['minutes'] as int));
    final allDone = tasks.isNotEmpty && List.generate(tasks.length, (i) => '$n-$i').every(done.contains);

    return Card(
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: n == 1,
          leading: Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: allDone ? Colors.green : cs.primaryContainer,
              borderRadius: BorderRadius.circular(12),
            ),
            child: allDone
                ? const Icon(Icons.check, color: Colors.white)
                : Text('$n', style: TextStyle(fontWeight: FontWeight.w800, color: cs.onPrimaryContainer)),
          ),
          title: Text(day['title'] as String, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text('${tasks.length} ta vazifa · $minutes daqiqa'),
          childrenPadding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
          children: [
            for (var i = 0; i < tasks.length; i++) _task(context, tasks[i], '$n-$i'),
          ],
        ),
      ),
    );
  }

  Widget _task(BuildContext context, Map task, String id) {
    final k = _kinds[task['kind']] ?? _kinds['learn']!;
    final isDone = done.contains(id);
    return ListTile(
      dense: true,
      leading: IconBadge(k.$1, color: k.$2, size: 34),
      title: Text(
        task['title'] as String,
        style: TextStyle(fontWeight: FontWeight.w600, decoration: isDone ? TextDecoration.lineThrough : null),
      ),
      subtitle: Text('${k.$3} · ${task['minutes']} daq${task['topic'] != null ? ' · ${task['topic']}' : ''}'),
      trailing: Checkbox(value: isDone, onChanged: (_) => onToggle(id)),
      onTap: task['kind'] == 'review'
          ? () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ErrorNotebookScreen()))
          : () => onToggle(id),
    );
  }
}
