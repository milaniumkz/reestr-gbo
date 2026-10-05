import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ApiClient {
  ApiClient({required this.baseUrl, http.Client? httpClient})
    : _http = httpClient ?? http.Client();

  final String baseUrl;
  final http.Client _http;
  String? _accessToken;

  void setAccessToken(String? token) {
    _accessToken = token;
  }

  Future<Map<String, dynamic>> getJson(String path) async {
    final response = await _http.get(_uri(path), headers: _headers);
    if (response.statusCode == 401 && await _refreshAccessToken()) {
      return getJson(path);
    }
    return _decode(response);
  }

  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final response = await _http.post(
      _uri(path),
      headers: {..._headers, 'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
    if (response.statusCode == 401 && await _refreshAccessToken()) {
      return postJson(path, body);
    }
    return _decode(response);
  }

  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final response = await _http.patch(
      _uri(path),
      headers: {..._headers, 'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
    if (response.statusCode == 401 && await _refreshAccessToken()) {
      return patchJson(path, body);
    }
    return _decode(response);
  }

  Future<Map<String, dynamic>> postMultipart(
    String path, {
    required String fieldName,
    required String filename,
    required List<int> bytes,
    String? contentType,
    Map<String, String> fields = const {},
  }) async {
    final request = http.MultipartRequest('POST', _uri(path));
    request.headers.addAll(_headers);
    request.fields.addAll(fields);
    request.files.add(
      http.MultipartFile.fromBytes(
        fieldName,
        bytes,
        filename: filename,
        contentType: contentType == null ? null : _mediaType(contentType),
      ),
    );
    final streamed = await request.send();
    final response = await http.Response.fromStream(streamed);
    if (response.statusCode == 401 && await _refreshAccessToken()) {
      return postMultipart(
        path,
        fieldName: fieldName,
        filename: filename,
        bytes: bytes,
        contentType: contentType,
        fields: fields,
      );
    }
    return _decode(response);
  }

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Map<String, String> get _headers => {
    if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
  };

  Map<String, dynamic> _decode(http.Response response) {
    final decoded = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(response.statusCode, _errorMessage(decoded));
    }
    if (decoded is Map<String, dynamic>) return decoded;
    return {'items': decoded};
  }

  String _errorMessage(dynamic decoded) {
    if (decoded is Map<String, dynamic>) {
      final message = decoded['message'];
      if (message is List) return message.join(', ');
      if (message != null) return message.toString();
      final error = decoded['error'];
      if (error != null) return error.toString();
    }
    return decoded.toString();
  }

  Future<bool> _refreshAccessToken() async {
    final prefs = await SharedPreferences.getInstance();
    final refreshToken = prefs.getString('refreshToken');
    if (refreshToken == null || refreshToken.isEmpty) return false;
    try {
      final response = await _http.post(
        _uri('/auth/refresh'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': refreshToken}),
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        await _clearLocalAuth();
        return false;
      }
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      final accessToken = decoded['accessToken']?.toString();
      final nextRefreshToken = decoded['refreshToken']?.toString();
      final sessionExpiresAt = decoded['sessionExpiresAt']?.toString();
      if (accessToken == null || accessToken.isEmpty) return false;
      _accessToken = accessToken;
      await prefs.setString('accessToken', accessToken);
      if (nextRefreshToken != null && nextRefreshToken.isNotEmpty) {
        await prefs.setString('refreshToken', nextRefreshToken);
      }
      if (sessionExpiresAt != null && sessionExpiresAt.isNotEmpty) {
        await prefs.setString('sessionExpiresAt', sessionExpiresAt);
      }
      return true;
    } catch (_) {
      await _clearLocalAuth();
      return false;
    }
  }

  Future<void> _clearLocalAuth() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('accessToken');
    await prefs.remove('refreshToken');
    await prefs.remove('sessionUser');
    await prefs.remove('lastRoleCode');
    await prefs.remove('lastOrganizationBin');
    await prefs.remove('sessionExpiresAt');
    _accessToken = null;
  }
}

MediaType _mediaType(String value) {
  final parts = value.split('/');
  return MediaType(parts.first, parts.length > 1 ? parts[1] : 'octet-stream');
}

class ApiException implements Exception {
  const ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => 'ApiException($statusCode): $message';
}
