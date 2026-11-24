import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../widgets/common.dart';
import '../widgets/math_text.dart';
import '../widgets/question_input.dart';

const reasonNames = {
  'CONCEPT': 'Tushunmagan',
  'CALCULATION': 'Hisob xatosi',
  'CARELESS': 'E\'tiborsizlik',
  'TIME': 'Vaqt yetmadi',
  'UNKNOWN': 'Aniqlanmagan',
};

/// Smart Error Notebook: xatolar mavzu bo'yicha, takrorlash jadvali bilan
class ErrorNotebookScreen extends StatefulWidget {
  const ErrorNotebookScreen({super.key, this.dueOnly = false});

  final bool dueOnly;

  @override
  State<ErrorNotebookScreen> createState() => _ErrorNotebookScreenState();
}

class _ErrorNotebookScreenState extends State<ErrorNotebookScreen> {
  late bool _due = widget.dueOnly;
  final _key = GlobalKey<AsyncViewState<Map>>();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Xatolar daftari')),
      body: Column(children: [
        AsyncView<Map>(
          load: () async => await api.get('/error-notebook/summary') as Map,
          builder: (context, s, _) {
            final topics = (s['byTopic'] as List).cast<Map>();
            return SizedBox(
              height: 64,
              child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.all(12), children: [
                for (final t in topics)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Chip(label: Text('${t['topicName']}: ${t['open']}')),
                  ),
              ]),
            );
          },
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: SegmentedButton<bool>(
            segments: const [ButtonSegment(value: true, label: Text('Bugun takrorlash')), ButtonSegment(value: false, label: Text('Hammasi'))],
            selected: {_due},
            onSelectionChanged: (s) {
              setState(() => _due = s.first);
              _key.currentState?.reload();
            },
          ),
        ),
        Expanded(
          child: AsyncView<Map>(
            key: _key,
            load: () async => await api.get('/error-notebook', query: {
              if (_due) 'due': 'true',
              if (!_due) 'status': 'OPEN',
              'limit': '50',
            }) as Map,
            empty: (d) => (d['items'] as List).isEmpty,
            builder: (context, d, reload) => ListView(children: [
              for (final e in (d['items'] as List).cast<Map>())
                ListTile(
                  leading: CircleAvatar(child: Text('${e['wrongCount']}×')),
                  title: MathText(e['question']['stem'] as String, style: Theme.of(context).textTheme.bodyMedium),
                  subtitle: Text('${reasonNames[e['reason']] ?? ''} · keyingi: ${_date(e['nextReviewAt'] as String)}'),
                  onTap: () async {
                    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ErrorRetryScreen(entry: Map<String, dynamic>.from(e))));
                    reload();
                  },
                ),
            ]),
          ),
        ),
      ]),
    );
  }

  static String _date(String iso) {
    final d = DateTime.parse(iso).toLocal();
    return '${d.day}.${d.month}';
  }
}

class ErrorRetryScreen extends StatefulWidget {
  const ErrorRetryScreen({super.key, required this.entry});

  final Map<String, dynamic> entry;

  @override
  State<ErrorRetryScreen> createState() => _ErrorRetryScreenState();
}

class _ErrorRetryScreenState extends State<ErrorRetryScreen> {
  Map<String, dynamic>? _response;
  Map<String, dynamic>? _result;
  late String _reason = widget.entry['reason'] as String? ?? 'UNKNOWN';

  Map<String, dynamic> get _q => Map<String, dynamic>.from(widget.entry['question'] as Map);

  Future<void> _check() async {
    if (_response == null) throw ApiException(400, 'Avval javob bering');
    final r = await api.post('/error-notebook/${widget.entry['id']}/retry', {'response': _response});
    setState(() => _result = Map<String, dynamic>.from(r as Map));
  }

  Future<void> _setReason(String r) async {
    setState(() => _reason = r);
    try {
      await api.patch('/error-notebook/${widget.entry['id']}/status', {'reason': r});
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final correct = _result?['correct'] as Map?;
    final ok = _result?['isCorrect'] == true;
    return Scaffold(
      appBar: AppBar(title: const Text('Qayta yechish')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        MathText(_q['stem'] as String, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 16),
        QuestionInput(question: _q, response: _response, enabled: _result == null, onChanged: (r) => setState(() => _response = r)),
        const SizedBox(height: 16),
        if (_result == null) BusyButton(onPressed: _check, child: const Text('Tekshirish')),
        if (_result != null) ...[
          Card(
            color: ok ? Colors.green.withValues(alpha: 0.15) : Theme.of(context).colorScheme.errorContainer,
            child: ListTile(
              leading: Icon(ok ? Icons.check_circle : Icons.cancel, color: ok ? Colors.green : Colors.red),
              title: Text(ok ? 'To\'g\'ri!' : 'Yana xato'),
              subtitle: Text(_result!['status'] == 'RESOLVED' ? 'Xato tuzatildi 🎉' : 'Keyingi takrorlash: ${(_result!['nextReviewAt'] as String).substring(0, 10)}'),
            ),
          ),
          if (correct?['solution'] != null) ...[
            const SizedBox(height: 8),
            const Text('Yechim', style: TextStyle(fontWeight: FontWeight.w700)),
            MathText(correct!['solution'] as String),
          ],
        ],
        const SizedBox(height: 24),
        const Text('Xato sababi', style: TextStyle(fontWeight: FontWeight.w700)),
        Wrap(spacing: 6, children: [
          for (final e in reasonNames.entries)
            ChoiceChip(label: Text(e.value), selected: _reason == e.key, onSelected: (_) => _setReason(e.key)),
        ]),
      ]),
    );
  }
}
