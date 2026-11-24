import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'config.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message, {this.offline = false});

  final int status;
  final String message;

  /// Tarmoq yo'q yoki server javob bermadi
  final bool offline;

  @override
  String toString() => message;
}

/// REST mijoz: access token, avtomatik refresh (rotation), standart xato formati.
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  static const _kAccess = 'anc_access';
  static const _kRefresh = 'anc_refresh';
  final _storage = const FlutterSecureStorage();
  final _http = http.Client();

  String? _access;
  String? _refresh;
  Future<bool>? _refreshing;

  /// Refresh muvaffaqiyatsiz bo'lsa (sessiya tugagan) — chaqiriladi
  void Function()? onSessionExpired;

  bool get isLoggedIn => _refresh != null;

  Future<void> init() async {
    _access = await _storage.read(key: _kAccess);
    _refresh = await _storage.read(key: _kRefresh);
  }

  Future<void> saveTokens(Map<String, dynamic> t) async {
    _access = t['accessToken'] as String;
    _refresh = t['refreshToken'] as String;
    await _storage.write(key: _kAccess, value: _access);
    await _storage.write(key: _kRefresh, value: _refresh);
  }

  Future<void> clearTokens() async {
    _access = null;
    _refresh = null;
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) => request('GET', path, query: query);
  Future<dynamic> post(String path, [Object? body, Duration? timeout]) => request('POST', path, body: body ?? const {}, timeout: timeout);
  Future<dynamic> put(String path, Object body) => request('PUT', path, body: body);
  Future<dynamic> patch(String path, Object body) => request('PATCH', path, body: body);
  Future<dynamic> delete(String path) => request('DELETE', path);

  Future<dynamic> request(String method, String path, {Object? body, Map<String, String>? query, bool retry = true, Duration? timeout}) async {
    var uri = Uri.parse('${AppConfig.apiUrl}$path');
    if (query != null && query.isNotEmpty) uri = uri.replace(queryParameters: query);
    final headers = <String, String>{
      'content-type': 'application/json',
      'accept': 'application/json',
      if (_access != null) 'authorization': 'Bearer $_access',
    };

    http.Response res;
    try {
      final req = http.Request(method, uri)..headers.addAll(headers);
      if (body != null) req.body = jsonEncode(body);
      res = await http.Response.fromStream(await _http.send(req)).timeout(timeout ?? const Duration(seconds: 25));
    } on TimeoutException {
      throw ApiException(0, 'Server javob bermadi. Internetni tekshiring.', offline: true);
    } on SocketException {
      throw ApiException(0, 'Internet aloqasi yo\'q', offline: true);
    } on http.ClientException {
      throw ApiException(0, 'Internet aloqasi yo\'q', offline: true);
    }

    if (res.statusCode == 401 && retry && _refresh != null && !path.startsWith('/auth/')) {
      if (await _doRefresh()) return request(method, path, body: body, query: query, retry: false, timeout: timeout);
    }

    final dynamic data = res.bodyBytes.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode >= 400) throw ApiException(res.statusCode, _errorMessage(data, res.statusCode));
    return data;
  }

  Future<bool> _doRefresh() {
    return _refreshing ??= () async {
      try {
        final data = await request('POST', '/auth/refresh', body: {'refreshToken': _refresh}, retry: false);
        await saveTokens(Map<String, dynamic>.from(data as Map));
        return true;
      } on ApiException catch (e) {
        if (!e.offline) {
          await clearTokens();
          onSessionExpired?.call();
        }
        return false;
      } finally {
        _refreshing = null;
      }
    }();
  }

  static String _errorMessage(dynamic data, int status) {
    if (data is Map && data['error'] is Map) {
      final err = data['error'] as Map;
      final details = err['details'];
      if (details is List && details.isNotEmpty) return details.join('\n');
      if (err['message'] is String) return err['message'] as String;
    }
    return 'Xatolik ($status)';
  }
}

final api = ApiClient.instance;
