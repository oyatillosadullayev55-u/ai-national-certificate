import 'package:flutter/foundation.dart';

import 'api_client.dart';

enum SessionStatus { loading, loggedOut, onboarding, ready }

/// Ilova holati: kim kirgan, onboarding tugaganmi.
class Session extends ChangeNotifier {
  Session._();
  static final Session instance = Session._();

  SessionStatus status = SessionStatus.loading;
  Map<String, dynamic>? me;
  List<Map<String, dynamic>> mySubjects = [];

  String get firstName => (me?['profile']?['firstName'] as String?) ?? '';

  Future<void> bootstrap() async {
    await api.init();
    api.onSessionExpired = () {
      me = null;
      _set(SessionStatus.loggedOut);
    };
    if (!api.isLoggedIn) return _set(SessionStatus.loggedOut);
    try {
      await refreshMe();
    } on ApiException catch (e) {
      // Offline bo'lsa ham kirgan holatda qoladi — keyinroq qayta urinadi
      if (!e.offline) {
        await api.clearTokens();
        return _set(SessionStatus.loggedOut);
      }
      _set(SessionStatus.ready);
    }
  }

  Future<void> refreshMe() async {
    me = Map<String, dynamic>.from(await api.get('/auth/me') as Map);
    final subjects = await api.get('/users/me/subjects') as List;
    mySubjects = subjects.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    _set(mySubjects.isEmpty ? SessionStatus.onboarding : SessionStatus.ready);
  }

  Future<void> loggedIn(Map<String, dynamic> tokens) async {
    await api.saveTokens(tokens);
    await refreshMe();
  }

  Future<void> logout({bool all = false}) async {
    try {
      await api.post(all ? '/auth/logout-all' : '/auth/logout');
    } catch (_) {
      // tarmoq bo'lmasa ham lokal chiqamiz
    }
    await api.clearTokens();
    me = null;
    mySubjects = [];
    _set(SessionStatus.loggedOut);
  }

  /// Fanlarni qayta tanlash uchun onboarding'ga qaytish
  void editSubjects() => _set(SessionStatus.onboarding);

  void _set(SessionStatus s) {
    status = s;
    notifyListeners();
  }
}

final session = Session.instance;
