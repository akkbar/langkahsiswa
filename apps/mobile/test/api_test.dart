import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:schoolapp_mobile/api.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  test(
    'Login sends tenant and stores only refresh credential securely',
    () async {
      final api = SchoolApi(
        baseUrl: 'https://school.test/api/v1',
        client: MockClient((request) async {
          expect(request.url.path, '/api/v1/auth/login');
          expect(jsonDecode(request.body), {
            'tenant_slug': 'demo',
            'email': 'wali@school.test',
            'password': 'secret',
          });
          return http.Response(
            jsonEncode({
              'access_token': 'access',
              'refresh_token': 'refresh',
              'user': {
                'id': 'parent',
                'roles': ['PARENT'],
              },
            }),
            200,
          );
        }),
      );
      await api.login(' demo ', 'WALI@school.test ', 'secret');
      expect(api.accessToken, 'access');
      expect(await api.storage.readAll(), {'refresh_token': 'refresh'});
    },
  );
  test(
    'Concurrent expired requests share one rotated refresh session',
    () async {
      int refreshes = 0;
      final api = SchoolApi(
        baseUrl: 'https://school.test/api/v1',
        client: MockClient((request) async {
          if (request.url.path.endsWith('/auth/refresh')) {
            refreshes++;
            expect(jsonDecode(request.body)['refresh_token'], 'old-refresh');
            await Future<void>.delayed(const Duration(milliseconds: 10));
            return http.Response(
              jsonEncode({
                'access_token': 'new-access',
                'refresh_token': 'new-refresh',
                'user': {'id': 'parent'},
              }),
              200,
            );
          }
          if (request.headers['Authorization'] == 'Bearer expired') {
            return http.Response('{"message":"Expired"}', 401);
          }
          expect(request.headers['Authorization'], 'Bearer new-access');
          return http.Response('{"data":[]}', 200);
        }),
      );
      api.accessToken = 'expired';
      api.refreshToken = 'old-refresh';
      await Future.wait([api.call('events'), api.call('notifications')]);
      expect(refreshes, 1);
      expect(await api.storage.read(key: 'refresh_token'), 'new-refresh');
    },
  );
  test(
    'Logout revokes the mobile refresh token and removes local session on failure',
    () async {
      final api = SchoolApi(
        baseUrl: 'https://school.test/api/v1',
        client: MockClient((request) async {
          expect(request.url.path, '/api/v1/auth/logout');
          expect(jsonDecode(request.body)['refresh_token'], 'revoke-me');
          return http.Response('{"message":"Offline"}', 503);
        }),
      );
      api.accessToken = 'access';
      api.refreshToken = 'revoke-me';
      api.user = {'id': 'parent'};
      await api.storage.write(key: 'refresh_token', value: 'revoke-me');
      await expectLater(api.logout(), throwsA(isA<ApiException>()));
      expect(api.user, isNull);
      expect(await api.storage.readAll(), isEmpty);
    },
  );
  test('Unauthorized restore clears invalid stored session', () async {
    FlutterSecureStorage.setMockInitialValues({'refresh_token': 'revoked'});
    final api = SchoolApi(
      baseUrl: 'https://school.test',
      client: MockClient(
        (_) async => http.Response('{"message":"Sesi berakhir"}', 401),
      ),
    );
    await expectLater(
      api.restore(),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)),
    );
    expect(await api.storage.readAll(), isEmpty);
  });
  test('Google ID token is exchanged with the same tenant boundary', () async {
    final api = SchoolApi(
      baseUrl: 'https://school.test',
      client: MockClient((request) async {
        expect(request.url.path, '/auth/google');
        expect(jsonDecode(request.body), {
          'tenant_slug': 'demo',
          'credential': 'google-id-token',
        });
        return http.Response(
          '{"access_token":"a","refresh_token":"r","user":{"id":"parent"}}',
          200,
        );
      }),
    );
    await api.googleLogin('demo', 'google-id-token');
    expect(api.user?['id'], 'parent');
  });
  test(
    'Google first-time linking can prove the existing school password',
    () async {
      final api = SchoolApi(
        baseUrl: 'https://school.test',
        client: MockClient((request) async {
          expect(jsonDecode(request.body), {
            'tenant_slug': 'demo',
            'credential': 'google-id-token',
            'account_password': 'school-password',
          });
          return http.Response(
            '{"access_token":"a","refresh_token":"r","user":{"id":"parent"}}',
            200,
          );
        }),
      );
      await api.googleLogin(
        'demo',
        'google-id-token',
        accountPassword: 'school-password',
      );
      expect(api.user?['id'], 'parent');
    },
  );
}
