import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  final String message;
  final int status;
  ApiException(this.message, [this.status = 0]);
  @override
  String toString() => message;
}

class SchoolApi {
  final String baseUrl;
  final http.Client client;
  final FlutterSecureStorage storage;
  String? accessToken;
  String? refreshToken;
  Map<String, dynamic>? user;
  Future<void>? _refreshing;
  SchoolApi({
    String? baseUrl,
    http.Client? client,
    FlutterSecureStorage? storage,
  }) : baseUrl =
           (baseUrl ??
                   const String.fromEnvironment(
                     'API_URL',
                     defaultValue: 'http://10.0.2.2:3000/api/v1',
                   ))
               .replaceAll(RegExp(r'/$'), ''),
       client = client ?? http.Client(),
       storage = storage ?? const FlutterSecureStorage();

  Future<bool> restore() async {
    refreshToken = await storage.read(key: 'refresh_token');
    if (refreshToken == null) return false;
    try {
      await _refresh();
      return true;
    } on ApiException catch (e) {
      if (e.status == 401) await clear();
      rethrow;
    }
  }

  Future<void> saveSession(Map<String, dynamic> value) async {
    accessToken = value['access_token'];
    refreshToken = value['refresh_token'];
    user = Map<String, dynamic>.from(value['user']);
    await storage.write(key: 'refresh_token', value: refreshToken);
  }

  Future<void> login(String tenant, String email, String password) async {
    await saveSession(
      await call(
        'auth/login',
        method: 'POST',
        body: {
          'tenant_slug': tenant.trim(),
          'email': email.trim().toLowerCase(),
          'password': password,
        },
        authenticated: false,
      ),
    );
  }

  Future<void> googleLogin(
    String tenant,
    String credential, {
    String? accountPassword,
  }) async {
    await saveSession(
      await call(
        'auth/google',
        method: 'POST',
        body: {
          'tenant_slug': tenant.trim(),
          'credential': credential,
          if (accountPassword != null && accountPassword.isNotEmpty)
            'account_password': accountPassword,
        },
        authenticated: false,
      ),
    );
  }

  Future<void> _refresh() async {
    if (_refreshing != null) return _refreshing;
    final task = () async {
      if (refreshToken == null) {
        throw ApiException('Silakan masuk kembali.', 401);
      }
      await saveSession(
        await call(
          'auth/refresh',
          method: 'POST',
          body: {'refresh_token': refreshToken},
          authenticated: false,
        ),
      );
    }();
    _refreshing = task;
    try {
      await task;
    } finally {
      _refreshing = null;
    }
  }

  Future<http.Response> _request(
    String path,
    String method,
    Object? body,
    bool authenticated,
  ) async {
    final request = http.Request(method, Uri.parse('$baseUrl/$path'));
    request.headers['Content-Type'] = 'application/json';
    if (authenticated && accessToken != null) {
      request.headers['Authorization'] = 'Bearer $accessToken';
    }
    if (body != null) request.body = jsonEncode(body);
    try {
      return await http.Response.fromStream(
        await client.send(request).timeout(const Duration(seconds: 25)),
      );
    } catch (_) {
      throw ApiException(
        'Tidak dapat terhubung ke sekolah. Periksa koneksi lalu coba lagi.',
      );
    }
  }

  Future<http.Response> response(
    String path, {
    String method = 'GET',
    Object? body,
    bool authenticated = true,
  }) async {
    var result = await _request(path, method, body, authenticated);
    if (result.statusCode == 401 && authenticated && refreshToken != null) {
      await _refresh();
      result = await _request(path, method, body, authenticated);
    }
    if (result.statusCode >= 400) {
      String message = 'Permintaan gagal (${result.statusCode}).';
      try {
        final data = jsonDecode(result.body);
        message = data['message'] is List
            ? (data['message'] as List).join(', ')
            : '${data['message'] ?? message}';
      } catch (_) {}
      throw ApiException(message, result.statusCode);
    }
    return result;
  }

  Future<Map<String, dynamic>> call(
    String path, {
    String method = 'GET',
    Object? body,
    bool authenticated = true,
  }) async {
    final result = await response(
      path,
      method: method,
      body: body,
      authenticated: authenticated,
    );
    return Map<String, dynamic>.from(jsonDecode(result.body));
  }

  Future<Uint8List> bytes(String path) async =>
      (await response(path)).bodyBytes;
  Future<void> logout() async {
    try {
      if (refreshToken != null) {
        await call(
          'auth/logout',
          method: 'POST',
          body: {'refresh_token': refreshToken},
          authenticated: false,
        );
      }
    } finally {
      await clear();
    }
  }

  Future<void> clear() async {
    accessToken = null;
    refreshToken = null;
    user = null;
    await storage.delete(key: 'refresh_token');
  }
}
