import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

/// Javob yuborish callback'i — testlarda almashtirish uchun
typedef AnswerSender = Future<void> Function(String attemptId, String questionVersionId, Map<String, dynamic> body);

Future<void> _defaultSender(String attemptId, String qvId, Map<String, dynamic> body) async {
  await api.put('/attempts/$attemptId/answers/$qvId', body);
}

/// Offline-chidamli javob navbati (PRD 3.7: internet uzilganda vaqtincha saqlash).
/// Har savol uchun faqat oxirgi javob saqlanadi; `clientUpdatedAt` serverda eski javob
/// yangisini bosib ketmasligini ta'minlaydi.
class AnswerQueue extends ChangeNotifier {
  AnswerQueue(this.attemptId, {AnswerSender? sender, this.persist = true}) : _send = sender ?? _defaultSender;

  final String attemptId;
  final AnswerSender _send;
  final bool persist;
  final Map<String, Map<String, dynamic>> _pending = {};
  Timer? _retry;
  bool _flushing = false;

  /// Yakunlangan / vaqti tugagan urinish — boshqa yuborilmaydi
  bool closed = false;

  int get pendingCount => _pending.length;
  bool get isSynced => _pending.isEmpty;

  String get _key => 'answer_queue_$attemptId';

  Future<void> restore() async {
    if (!persist) return;
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return;
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    decoded.forEach((k, v) => _pending[k] = Map<String, dynamic>.from(v as Map));
    notifyListeners();
    unawaited(flush());
  }

  /// Saqlangan (hali yuborilmagan) javoblar — sahifa qayta ochilganda UI'ni tiklash uchun
  Map<String, Map<String, dynamic>> get pendingAnswers => Map.unmodifiable(_pending);

  void enqueue(String questionVersionId, {required Object? response, bool? flagged, int? timeSpentMs}) {
    if (closed) return;
    _pending[questionVersionId] = {
      'response': response,
      if (flagged != null) 'flagged': flagged,
      if (timeSpentMs != null) 'timeSpentMs': timeSpentMs,
      'clientUpdatedAt': DateTime.now().toUtc().toIso8601String(),
    };
    _save();
    notifyListeners();
    unawaited(flush());
  }

  /// Hammasini yuboradi. Qaytaradi: yuborilmay qolganlar soni.
  Future<int> flush() async {
    if (_flushing || closed) return _pending.length;
    _flushing = true;
    try {
      for (final qvId in _pending.keys.toList()) {
        final body = _pending[qvId]!;
        try {
          await _send(attemptId, qvId, body);
          // Yuborish paytida yangi javob kelgan bo'lsa — uni o'chirmaymiz
          if (identical(_pending[qvId], body)) _pending.remove(qvId);
        } on ApiException catch (e) {
          if (e.offline) break; // tarmoq yo'q — keyinroq
          if (e.status == 409) {
            closed = true; // urinish yakunlangan
            _pending.clear();
            break;
          }
          _pending.remove(qvId); // 4xx — qayta yuborishdan foyda yo'q
        }
      }
    } finally {
      _flushing = false;
      _save();
      notifyListeners();
      _scheduleRetry();
    }
    return _pending.length;
  }

  void _scheduleRetry() {
    _retry?.cancel();
    if (_pending.isNotEmpty && !closed) _retry = Timer(const Duration(seconds: 5), () => flush());
  }

  Future<void> _save() async {
    if (!persist) return;
    final prefs = await SharedPreferences.getInstance();
    if (_pending.isEmpty) {
      await prefs.remove(_key);
    } else {
      await prefs.setString(_key, jsonEncode(_pending));
    }
  }

  @override
  void dispose() {
    _retry?.cancel();
    super.dispose();
  }
}
