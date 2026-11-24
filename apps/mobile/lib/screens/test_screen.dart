import 'dart:async';

import 'package:flutter/material.dart';

import '../core/answer_queue.dart';
import '../core/api_client.dart';
import '../widgets/common.dart';
import '../widgets/math_text.dart';
import '../widgets/question_input.dart';
import 'result_screen.dart';

/// Test / Exam Simulator ekrani (PRD 3.7, 7.7).
/// Vaqt server soatiga nisbatan hisoblanadi; javoblar darhol, offline bo'lsa navbat orqali yuboriladi.
class TestScreen extends StatefulWidget {
  const TestScreen({super.key, required this.attempt});

  /// GET /attempts/:id yoki POST /tests/:id/start javobi
  final Map<String, dynamic> attempt;

  @override
  State<TestScreen> createState() => _TestScreenState();
}

class _TestScreenState extends State<TestScreen> {
  late final String _attemptId = widget.attempt['id'] as String;
  late final List<Map<String, dynamic>> _questions =
      (widget.attempt['questions'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  late final AnswerQueue _queue = AnswerQueue(_attemptId);
  final _pages = PageController();

  final Map<String, Map<String, dynamic>> _responses = {};
  final Set<String> _flagged = {};
  final Map<String, int> _timeMs = {};

  int _index = 0;
  DateTime _shownAt = DateTime.now();
  Duration _serverOffset = Duration.zero;
  DateTime? _deadline;
  Duration? _remaining;
  Timer? _ticker;
  bool _submitting = false;

  String get _mode => widget.attempt['mode'] as String? ?? '';
  bool get _isExam => _mode == 'MOCK_EXAM' || _mode == 'DIAGNOSTIC' || _mode == 'TEACHER_ASSIGNMENT';

  @override
  void initState() {
    super.initState();
    for (final a in (widget.attempt['answers'] as List? ?? const [])) {
      final m = Map<String, dynamic>.from(a as Map);
      final qv = m['questionVersionId'] as String;
      if (m['response'] is Map) _responses[qv] = Map<String, dynamic>.from(m['response'] as Map);
      if (m['flagged'] == true) _flagged.add(qv);
    }
    // Offline navbatdagi (serverga yetmagan) javoblar ustun turadi
    _queue.restore().then((_) {
      if (!mounted) return;
      setState(() {
        _queue.pendingAnswers.forEach((qv, body) {
          if (body['response'] is Map) _responses[qv] = Map<String, dynamic>.from(body['response'] as Map);
        });
      });
    });
    _queue.addListener(_onQueue);

    final serverTime = DateTime.tryParse(widget.attempt['serverTime'] as String? ?? '');
    if (serverTime != null) _serverOffset = serverTime.difference(DateTime.now());
    _deadline = DateTime.tryParse(widget.attempt['deadlineAt'] as String? ?? '');
    if (_deadline != null) {
      final left = _deadline!.difference(DateTime.now().add(_serverOffset));
      _remaining = left.isNegative ? Duration.zero : left;
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
    }
  }

  void _onQueue() {
    if (!mounted) return;
    if (_queue.closed && !_submitting) {
      // server urinishni yopgan (vaqt tugagan) — natijaga o'tamiz
      _openResult().catchError((Object e) {
        if (mounted) showError(context, e);
      });
      return;
    }
    setState(() {});
  }

  void _tick() {
    final now = DateTime.now().add(_serverOffset);
    final left = _deadline!.difference(now);
    setState(() => _remaining = left.isNegative ? Duration.zero : left);
    if (left <= Duration.zero && !_submitting) _submit(auto: true);
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _queue.removeListener(_onQueue);
    _queue.dispose();
    _pages.dispose();
    super.dispose();
  }

  String _qv(int i) => _questions[i]['questionVersionId'] as String;

  void _accumulateTime() {
    final qv = _qv(_index);
    _timeMs[qv] = (_timeMs[qv] ?? 0) + DateTime.now().difference(_shownAt).inMilliseconds;
    _shownAt = DateTime.now();
  }

  void _goTo(int i) {
    if (i < 0 || i >= _questions.length) return;
    _accumulateTime();
    _pages.jumpToPage(i);
  }

  void _answer(Map<String, dynamic> response) {
    final qv = _qv(_index);
    _accumulateTime();
    setState(() => _responses[qv] = response);
    _queue.enqueue(qv, response: response, flagged: _flagged.contains(qv), timeSpentMs: _timeMs[qv]);
  }

  void _toggleFlag() {
    final qv = _qv(_index);
    setState(() {
      if (!_flagged.remove(qv)) _flagged.add(qv);
    });
    _queue.enqueue(qv, response: _responses[qv], flagged: _flagged.contains(qv), timeSpentMs: _timeMs[qv]);
  }

  bool _isAnswered(String qv) {
    final r = _responses[qv];
    if (r == null || r.isEmpty) return false;
    final v = r.values.first;
    if (v is String) return v.trim().isNotEmpty;
    if (v is List) return v.isNotEmpty;
    if (v is Map) return v.isNotEmpty;
    return v != null;
  }

  Future<void> _submit({bool auto = false}) async {
    if (_submitting) return;
    if (!auto) {
      final unanswered = _questions.where((q) => !_isAnswered(q['questionVersionId'] as String)).length;
      final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Testni yakunlaysizmi?'),
          content: Text(unanswered > 0 ? '$unanswered ta savolga javob berilmagan.' : 'Barcha savollarga javob berdingiz.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Qaytish')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Yakunlash')),
          ],
        ),
      );
      if (ok != true) return;
    }
    setState(() => _submitting = true);
    _ticker?.cancel();
    try {
      final left = await _queue.flush();
      if (left > 0 && !_queue.closed) {
        throw ApiException(0, '$left ta javob hali yuborilmadi. Internet tiklanganda qayta urinib ko\'ring.', offline: true);
      }
      await _openResult();
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      if (_deadline != null) _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
      showError(context, e);
    }
  }

  Future<void> _openResult() async {
    _submitting = true;
    // submit idempotent: server allaqachon yopgan bo'lsa ham natijani qaytaradi
    final result = await api.post('/attempts/$_attemptId/submit');
    if (!mounted) return;
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => ResultScreen(result: Map<String, dynamic>.from(result as Map))));
  }

  Future<bool> _confirmLeave() async {
    final r = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Chiqasizmi?'),
        content: Text(_deadline != null ? 'Javoblar saqlanadi, lekin vaqt to\'xtamaydi.' : 'Javoblar saqlanadi, keyinroq davom ettirishingiz mumkin.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Qolish')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Chiqish')),
        ],
      ),
    );
    return r == true;
  }

  void _openNavigator() {
    showModalBottomSheet(
      context: context,
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Wrap(spacing: 8, runSpacing: 8, children: [
            for (var i = 0; i < _questions.length; i++)
              _NavCell(
                n: i + 1,
                answered: _isAnswered(_qv(i)),
                flagged: _flagged.contains(_qv(i)),
                current: i == _index,
                onTap: () {
                  Navigator.pop(c);
                  _goTo(i);
                },
              ),
          ]),
        ),
      ),
    );
  }

  String _fmt(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return h > 0 ? '$h:$m:$s' : '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final qv = _qv(_index);
    final lowTime = _remaining != null && _remaining! < const Duration(minutes: 5);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final nav = Navigator.of(context);
        if (await _confirmLeave()) nav.pop();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text('${_index + 1} / ${_questions.length}'),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 4),
              child: Icon(_queue.isSynced ? Icons.cloud_done_outlined : Icons.cloud_upload_outlined, color: _queue.isSynced ? null : cs.error),
            ),
            if (_remaining != null)
              Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text(_fmt(_remaining!), style: TextStyle(fontWeight: FontWeight.w700, color: lowTime ? cs.error : null, fontFeatures: const [FontFeature.tabularFigures()])),
                ),
              ),
            IconButton(icon: Icon(_flagged.contains(qv) ? Icons.flag : Icons.outlined_flag), tooltip: 'Keyinroq qaytish', onPressed: _toggleFlag),
            IconButton(icon: const Icon(Icons.grid_view), tooltip: 'Savollar', onPressed: _openNavigator),
          ],
        ),
        body: Column(children: [
          if (!_queue.isSynced)
            MaterialBanner(
              content: Text('${_queue.pendingCount} ta javob internet tiklanishini kutmoqda — telefonda saqlangan'),
              actions: [TextButton(onPressed: () => _queue.flush(), child: const Text('Qayta yuborish'))],
            ),
          Expanded(
            child: PageView.builder(
              controller: _pages,
              itemCount: _questions.length,
              onPageChanged: (i) => setState(() {
                _index = i;
                _shownAt = DateTime.now();
              }),
              itemBuilder: (context, i) {
                final q = _questions[i];
                final payload = q['payload'] as Map?;
                return ListView(padding: const EdgeInsets.all(16), children: [
                  if (payload?['context'] is String)
                    Card(child: Padding(padding: const EdgeInsets.all(12), child: MathText(payload!['context'] as String))),
                  MathText(q['stem'] as String, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 16),
                  QuestionInput(
                    question: q,
                    response: _responses[q['questionVersionId']],
                    onChanged: _answer,
                    enabled: !_submitting,
                  ),
                ]);
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
              child: Row(children: [
                IconButton.outlined(onPressed: _index > 0 ? () => _goTo(_index - 1) : null, icon: const Icon(Icons.chevron_left)),
                const Spacer(),
                FilledButton.icon(
                  onPressed: _submitting ? null : () => _submit(),
                  icon: _submitting ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.check),
                  label: Text(_isExam ? 'Imtihonni yakunlash' : 'Yakunlash'),
                ),
                const Spacer(),
                IconButton.outlined(onPressed: _index < _questions.length - 1 ? () => _goTo(_index + 1) : null, icon: const Icon(Icons.chevron_right)),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

class _NavCell extends StatelessWidget {
  const _NavCell({required this.n, required this.answered, required this.flagged, required this.current, required this.onTap});

  final int n;
  final bool answered;
  final bool flagged;
  final bool current;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 44,
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: answered ? cs.primaryContainer : null,
          border: Border.all(color: current ? cs.primary : cs.outlineVariant, width: current ? 2 : 1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Stack(clipBehavior: Clip.none, children: [
          Text('$n', style: const TextStyle(fontWeight: FontWeight.w600)),
          if (flagged) Positioned(right: -14, top: -12, child: Icon(Icons.flag, size: 14, color: cs.error)),
        ]),
      ),
    );
  }
}
