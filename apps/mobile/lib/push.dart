import 'dart:async';
import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'api.dart';

const firebaseEnabled = bool.fromEnvironment('FIREBASE_ENABLED');
FirebaseOptions get firebaseOptions => const FirebaseOptions(
  apiKey: String.fromEnvironment('FIREBASE_API_KEY'),
  appId: String.fromEnvironment('FIREBASE_APP_ID'),
  messagingSenderId: String.fromEnvironment('FIREBASE_SENDER_ID'),
  projectId: String.fromEnvironment('FIREBASE_PROJECT_ID'),
  iosBundleId: String.fromEnvironment(
    'FIREBASE_IOS_BUNDLE_ID',
    defaultValue: 'id.langkahsiswa.langkahsiswaMobile',
  ),
);

@pragma('vm:entry-point')
Future<void> onBackgroundMessage(RemoteMessage message) async {
  if (Firebase.apps.isEmpty) {
    await Firebase.initializeApp(options: firebaseOptions);
  }
}

class PushService {
  final SchoolApi api;
  StreamSubscription<String>? tokenSubscription;
  StreamSubscription<RemoteMessage>? foregroundSubscription;
  StreamSubscription<RemoteMessage>? openedSubscription;
  bool initialized = false;
  PushService(this.api);
  Future<void> initialize(
    void Function(String) onMessage,
    void Function() onOpen,
  ) async {
    if (!firebaseEnabled || initialized) return;
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(options: firebaseOptions);
    }
    FirebaseMessaging.onBackgroundMessage(onBackgroundMessage);
    foregroundSubscription = FirebaseMessaging.onMessage.listen(
      (message) => onMessage(
        message.notification?.title ?? 'Notifikasi baru dari sekolah',
      ),
    );
    openedSubscription = FirebaseMessaging.onMessageOpenedApp.listen(
      (_) => onOpen(),
    );
    tokenSubscription = FirebaseMessaging.instance.onTokenRefresh.listen((
      token,
    ) async {
      if (api.user != null) {
        try {
          await register(token);
        } catch (_) {
          onMessage(
            'Pendaftaran push belum berhasil. Aktifkan notifikasi kembali.',
          );
        }
      }
    });
    initialized = true;
    if (await FirebaseMessaging.instance.getInitialMessage() != null) onOpen();
  }

  Future<void> enable() async {
    if (!firebaseEnabled || !initialized) {
      throw ApiException(
        'Push belum dikonfigurasi untuk aplikasi ini. Kotak notifikasi tetap tersedia.',
      );
    }
    final settings = await FirebaseMessaging.instance.requestPermission();
    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      throw ApiException(
        'Izin notifikasi belum diberikan. Ubah melalui pengaturan perangkat.',
      );
    }
    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) {
      throw ApiException('Token perangkat belum siap. Coba lagi sebentar.');
    }
    await register(token);
  }

  Future<void> register(String token) async {
    final result = await api.call(
      'device-tokens',
      method: 'POST',
      body: {'token': token, 'platform': Platform.isIOS ? 'IOS' : 'ANDROID'},
    );
    await api.storage.write(key: 'device_id', value: result['id']);
  }

  Future<void> detach() async {
    await tokenSubscription?.cancel();
    tokenSubscription = null;
    final id = await api.storage.read(key: 'device_id');
    try {
      if (id != null) await api.call('device-tokens/$id', method: 'DELETE');
    } finally {
      await api.storage.delete(key: 'device_id');
      if (initialized) await FirebaseMessaging.instance.deleteToken();
    }
  }

  void dispose() {
    tokenSubscription?.cancel();
    foregroundSubscription?.cancel();
    openedSubscription?.cancel();
  }
}
