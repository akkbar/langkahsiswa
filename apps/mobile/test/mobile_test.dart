import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:langkahsiswa_mobile/api.dart';
import 'package:langkahsiswa_mobile/main.dart';
import 'package:langkahsiswa_mobile/theme/app_theme.dart';
import 'package:langkahsiswa_mobile/screens/login_screen.dart';
import 'package:langkahsiswa_mobile/teaching_pages.dart';
import 'package:langkahsiswa_mobile/finance_pages.dart';

Widget shell(Widget child) =>
    MaterialApp(theme: lightTheme, home: child);
const assignment = {
  'id': 'subject',
  'class_id': 'class',
  'semester_id': 'semester',
  'class_name': '7A',
  'subject_name': 'Matematika',
  'students': [
    {'id': 'student', 'name': 'Alya', 'nis': '001'},
  ],
  'assessments': [
    {'id': 'quiz', 'name': 'Quiz 1', 'max_score': 100},
  ],
};

void main() {
  test(
    'Themes keep blue brand with white light and near black dark surfaces',
    () {
      expect(
        lightTheme.scaffoldBackgroundColor,
        Colors.white,
      );
      expect(
        lightTheme.colorScheme.primary,
        const Color(0xff004aad),
      );
      expect(
        darkTheme.scaffoldBackgroundColor,
        const Color(0xff0d121a),
      );
    },
  );
  testWidgets('Login validates required credentials before requesting API', (
    tester,
  ) async {
    int loginRequests = 0;
    final api = SchoolApi(
      client: MockClient((request) async {
        if (request.url.path.endsWith('/login')) loginRequests++;
        return http.Response('{"enabled":false}', 200);
      }),
    );
    await tester.pumpWidget(
      shell(LoginScreen(api: api, onLogin: () {}, toggleTheme: () {})),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Masuk ke LangkahSiswa →'));
    await tester.tap(find.text('Masuk ke LangkahSiswa →'));
    await tester.pumpAndSettle();
    expect(find.text('Wajib diisi'), findsNWidgets(2)); // email, password (tenant has default)
    expect(loginRequests, 0);
  });
  testWidgets(
    'Parent home exposes linked student screens and hides teacher input',
    (tester) async {
      final api = SchoolApi(
        client: MockClient(
          (request) async => http.Response(
            request.url.path.endsWith('/students')
                ? '{"data":[{"id":"student","name":"Alya","nis":"001"}]}'
                : '{"data":[],"unread":2}',
            200,
          ),
        ),
      );
      api.user = {
        'name': 'Wali Alya',
        'roles': ['PARENT'],
      };
      await tester.pumpWidget(
        shell(HomePage(api: api, onLogout: () {}, toggleTheme: () {})),
      );
      await tester.pumpAndSettle();
      expect(find.text('Halo, Wali Alya'), findsOneWidget);
      expect(find.text('Kehadiran'), findsOneWidget);
      expect(find.text('Ruang guru'), findsNothing);
      await tester.drag(find.byType(ListView), const Offset(0, -450));
      await tester.pumpAndSettle();
      expect(find.text('Tagihan'), findsOneWidget);
    },
  );
  testWidgets(
    'Teacher attendance never defaults an unmarked student to present',
    (tester) async {
      final api = SchoolApi(
        client: MockClient((_) async => http.Response('{"records":[]}', 200)),
      );
      await tester.pumpWidget(
        shell(TeacherEntryPage(api: api, assignment: assignment)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Simpan'));
      await tester.pumpAndSettle();
      expect(
        find.text('Pilih status untuk setiap siswa sebelum menyimpan.'),
        findsOneWidget,
      );
    },
  );
  testWidgets(
    'Teacher grade rejects out of range score then submits a real API write',
    (tester) async {
      Map<String, dynamic>? submitted;
      final api = SchoolApi(
        client: MockClient((request) async {
          if (request.method == 'PUT') {
            submitted = Map<String, dynamic>.from(jsonDecode(request.body));
            return http.Response('{"data":[]}', 200);
          }
          return http.Response('{"data":[]}', 200);
        }),
      );
      await tester.pumpWidget(
        shell(TeacherEntryPage(api: api, assignment: assignment, grades: true)),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), '101');
      await tester.tap(find.text('Simpan'));
      await tester.pumpAndSettle();
      expect(find.text('Nilai Alya harus 0–100.'), findsOneWidget);
      expect(submitted, isNull);
      await tester.tap(find.text('Coba lagi'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), '85');
      await tester.tap(find.text('Simpan'));
      await tester.pumpAndSettle();
      expect(submitted, {
        'assessment_id': 'quiz',
        'scores': [
          {'student_id': 'student', 'score': 85},
        ],
      });
      expect(find.text('Perubahan tersimpan.'), findsOneWidget);
    },
  );
  testWidgets('Proof form refuses submitting money without an attachment', (
    tester,
  ) async {
    int requests = 0;
    final api = SchoolApi(
      client: MockClient((_) async {
        requests++;
        return http.Response('{}', 200);
      }),
    );
    await tester.pumpWidget(
      shell(TransferDialog(api: api, studentId: 'student', maximum: 50000)),
    );
    await tester.tap(find.text('Kirim'));
    await tester.pumpAndSettle();
    expect(
      find.text('Isi nominal yang valid dan pilih bukti transfer.'),
      findsOneWidget,
    );
    expect(requests, 0);
  });
}
