import 'dart:io';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'theme/app_theme.dart';
import 'api.dart';
import 'push.dart';
import 'widgets.dart';
import 'finance_pages.dart';
import 'teaching_pages.dart';
import 'screens/splash_screen.dart';
import 'screens/login_screen.dart';
import 'screens/role_landing.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const LangkahSiswa());
}

class LangkahSiswa extends StatefulWidget {
  const LangkahSiswa({super.key});
  @override
  State<LangkahSiswa> createState() => _LangkahSiswaState();
}

class _LangkahSiswaState extends State<LangkahSiswa> {
  ThemeMode mode = ThemeMode.system;
  final api = SchoolApi();

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((prefs) {
      if (mounted) {
        setState(() => mode = ThemeMode.values[prefs.getInt('theme') ?? 0]);
      }
    });
  }

  void toggle() async {
    setState(
      () => mode = mode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark,
    );
    (await SharedPreferences.getInstance()).setInt('theme', mode.index);
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'LangkahSiswa',
        debugShowCheckedModeBanner: false,
        theme: lightTheme,
        darkTheme: darkTheme,
        themeMode: mode,
        home: SplashWrapper(api: api, toggleTheme: toggle),
      );
}

class SplashWrapper extends StatefulWidget {
  final SchoolApi api;
  final VoidCallback toggleTheme;
  const SplashWrapper({super.key, required this.api, required this.toggleTheme});

  @override
  State<SplashWrapper> createState() => _SplashWrapperState();
}

class _SplashWrapperState extends State<SplashWrapper> {
  bool _showSplash = true;

  @override
  void initState() {
    super.initState();
    // Check session after splash
    _checkSession();
  }

  Future<void> _checkSession() async {
    try {
      await widget.api.restore();
    } catch (_) {
      // Session restore failed, will show login
    }
    if (mounted) {
      setState(() => _showSplash = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_showSplash) {
      return SplashScreen(onComplete: _checkSession);
    }

    if (widget.api.user != null) {
      return RoleLanding(
        roles: List<String>.from(widget.api.user?['roles'] ?? []),
        api: widget.api,
        toggleTheme: widget.toggleTheme,
        onLogout: () => setState(() {}),
      );
    }
    return LoginScreen(
      api: widget.api,
      onLogin: () => setState(() {}),
      toggleTheme: widget.toggleTheme,
    );
  }
}

class HomePage extends StatefulWidget {
  final SchoolApi api;
  final VoidCallback onLogout;
  final VoidCallback toggleTheme;
  const HomePage({
    super.key,
    required this.api,
    required this.onLogout,
    required this.toggleTheme,
  });
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  late final PushService push;
  List<Map<String, dynamic>> students = [];
  String? selected;
  bool loading = true;
  String? error;
  int unread = 0;
  List<String> get roles => List<String>.from(widget.api.user?['roles'] ?? []);
  bool get teacher => roles.contains('TEACHER');
  bool get financeAccess => roles.any(
    (r) => [
      'PARENT',
      'STUDENT',
      'FINANCE',
      'SCHOOL_ADMIN',
      'SUPER_ADMIN',
    ].contains(r),
  );

  @override
  void initState() {
    super.initState();
    push = PushService(widget.api);
    load();
    push
        .initialize(message, () {
          if (mounted) openInbox();
        })
        .catchError((_) {
          message('Push belum siap. Kotak notifikasi tetap tersedia.');
        });
  }

  void message(String text) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
    }
  }

  Future<void> load() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final result = await widget.api.call('portal/students');
      final inbox = await widget.api.call('notifications?limit=1');
      students = rows(result['data']);
      unread = inbox['unread'] ?? 0;
      if (!students.any((s) => s['id'] == selected)) {
        selected = students.firstOrNull?['id'];
      }
    } catch (e) {
      error = '$e';
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> openInbox() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => InboxPage(api: widget.api, push: push),
      ),
    );
    if (mounted) load();
  }

  void open(Widget page) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));

  Future<void> logout() async {
    try {
      await push.detach();
    } catch (_) {
      /* Detach also attempts deletion of the Firebase token. */
    }
    try {
      await widget.api.logout();
    } catch (e) {
      message('$e');
    }
    if (mounted) widget.onLogout();
  }

  @override
  void dispose() {
    push.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('LangkahSiswa'),
          actions: [
            IconButton(
              onPressed: openInbox,
              icon: Badge(
                isLabelVisible: unread > 0,
                label: Text('$unread'),
                child: const Icon(Icons.notifications_outlined),
              ),
              tooltip: 'Notifikasi',
            ),
            IconButton(
              onPressed: widget.toggleTheme,
              icon: const Icon(Icons.brightness_6_outlined),
              tooltip: 'Ganti tema',
            ),
            IconButton(
              onPressed: logout,
              icon: const Icon(Icons.logout),
              tooltip: 'Keluar',
            ),
          ],
        ),
        body: RefreshIndicator(
          onRefresh: load,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                'Halo, ${widget.api.user?['name'] ?? ''}',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 8),
              Text(roles.join(' · ')),
              const SizedBox(height: 24),
              if (loading) const LinearProgressIndicator(),
              if (error != null) ErrorCard(message: error!, retry: load),
              if (students.isNotEmpty)
                DropdownButtonFormField<String>(
                  initialValue: selected,
                  decoration: const InputDecoration(labelText: 'Siswa'),
                  items: students
                      .map(
                        (s) => DropdownMenuItem<String>(
                          value: s['id'],
                          child: Text(
                            '${s['name']} · ${s['nis']}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => setState(() => selected = value),
                ),
              if (!loading && students.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(20),
                    child: Text(
                      'Belum ada siswa yang terhubung ke akun Anda. Hubungi administrasi sekolah untuk menghubungkan akun.',
                    ),
                  ),
                ),
              const SizedBox(height: 20),
              if (selected != null) ...[
                menu(
                  'Kehadiran',
                  'Riwayat kehadiran dan catatan',
                  Icons.fact_check_outlined,
                  () => open(
                    AcademicPage(
                      api: widget.api,
                      studentId: selected!,
                      section: 'attendance',
                      title: 'Kehadiran',
                    ),
                  ),
                ),
                menu(
                  'Jadwal',
                  'Pelajaran dan ruang kelas',
                  Icons.calendar_view_week_outlined,
                  () => open(
                    AcademicPage(
                      api: widget.api,
                      studentId: selected!,
                      section: 'schedule',
                      title: 'Jadwal pelajaran',
                    ),
                  ),
                ),
                menu(
                  'Nilai',
                  'Hasil penilaian per mata pelajaran',
                  Icons.insights_outlined,
                  () => open(
                    AcademicPage(
                      api: widget.api,
                      studentId: selected!,
                      section: 'grades',
                      title: 'Nilai',
                    ),
                  ),
                ),
                menu(
                  'Raport',
                  'Raport terbit dan unduhan PDF',
                  Icons.description_outlined,
                  () => open(
                    AcademicPage(
                      api: widget.api,
                      studentId: selected!,
                      section: 'reports',
                      title: 'Raport',
                    ),
                  ),
                ),
                if (financeAccess) ...[
                  menu(
                    'Tagihan',
                    'Pembayaran dan bukti transfer',
                    Icons.receipt_long_outlined,
                    () => open(
                      BillingPage(
                        api: widget.api,
                        studentId: selected!,
                        canPay: !roles.contains('STUDENT'),
                      ),
                    ),
                  ),
                  menu(
                    'Dompet siswa',
                    'Saldo, pengeluaran, dan batas belanja',
                    Icons.account_balance_wallet_outlined,
                    () => open(
                      WalletPage(
                        api: widget.api,
                        studentId: selected!,
                        canManage: roles.contains('PARENT'),
                      ),
                    ),
                  ),
                ],
              ],
              if (teacher)
                menu(
                  'Ruang guru',
                  'Isi kehadiran dan nilai kelas Anda',
                  Icons.edit_note_outlined,
                  () => open(TeachingPage(api: widget.api)),
                ),
              menu(
                'Agenda sekolah',
                'Kegiatan dan pengumuman',
                Icons.event_outlined,
                () => open(EventsPage(api: widget.api)),
              ),
              menu(
                'Notifikasi',
                '$unread belum dibaca',
                Icons.notifications_outlined,
                openInbox,
              ),
            ],
          ),
        ),
      );

  Widget menu(
    String title,
    String subtitle,
    IconData icon,
    VoidCallback onTap,
  ) => Card(
        child: ListTile(
          leading: Icon(icon, color: Theme.of(context).colorScheme.primary),
          title: Text(title),
          subtitle: Text(subtitle),
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        ),
      );
}

class AcademicPage extends StatelessWidget {
  final SchoolApi api;
  final String studentId;
  final String section;
  final String title;
  const AcademicPage({
    super.key,
    required this.api,
    required this.studentId,
    required this.section,
    required this.title,
  });
  @override
  Widget build(BuildContext context) => FeedPage(
        title: title,
        load: () async => rows(
          (await api.call('portal/overview?student_id=$studentId'))[section],
        ),
        item: (context, row) {
          if (section == 'attendance') {
            return Card(
              child: ListTile(
                leading: const Icon(Icons.check_circle_outline),
                title: Text('${row['status']} · ${day(row['date'])}'),
                subtitle: Text(
                  '${row['class_name']}${row['notes'] == null ? '' : '\n${row['notes']}'}',
                ),
              ),
            );
          }
          if (section == 'schedule') {
            return Card(
              child: ListTile(
                title: Text('${row['subject_name']}'),
                subtitle: Text(
                  '${['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'][row['day_of_week']]} · ${row['start_time'].toString().substring(0, 5)}–${row['end_time'].toString().substring(0, 5)}\n${row['teacher_name']} · ${row['room'] ?? row['class_name']}',
                ),
              ),
            );
          }
          if (section == 'grades') {
            return Card(
              child: ListTile(
                title: Text('${row['assessment_name']}'),
                subtitle: Text(
                  '${row['subject_name']} · ${row['category_name']}\n${day(row['due_date'])}',
                ),
                trailing: Text(
                  '${row['score']} / ${row['max_score']}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            );
          }
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${row['class_name']} · ${row['semester_name']}',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  Text('Terbit ${day(row['published_at'])}'),
                  const SizedBox(height: 12),
                  ...rows(row['items']).map(
                    (i) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 5),
                      child: Row(
                        children: [
                          Expanded(child: Text('${i['subject_name']}')),
                          Text('${i['final_grade']}'),
                        ],
                      ),
                    ),
                  ),
                  if ('${row['notes'] ?? ''}'.isNotEmpty) Text('${row['notes']}'),
                  TextButton.icon(
                    onPressed: () async {
                      try {
                        final bytes = await api.bytes('reports/${row['id']}/pdf');
                        final dir = await getTemporaryDirectory();
                        final file = await File(
                          '${dir.path}/raport-${row['id']}.pdf',
                        ).writeAsBytes(bytes);
                        final result = await OpenFilex.open(file.path);
                        if (result.type != ResultType.done) {
                          throw ApiException(result.message);
                        }
                      } catch (e) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(
                            context,
                          ).showSnackBar(SnackBar(content: Text('$e')));
                        }
                      }
                    },
                    icon: const Icon(Icons.download_outlined),
                    label: const Text('Buka PDF'),
                  ),
                ],
              ),
            ),
          );
        },
      );
}

class EventsPage extends StatelessWidget {
  final SchoolApi api;
  const EventsPage({super.key, required this.api});
  @override
  Widget build(BuildContext context) => FeedPage(
        title: 'Agenda sekolah',
        load: () async => rows((await api.call('events'))['data']),
        item: (context, row) => Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${row['title']}',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Text('${day(row['starts_at'])} · ${row['type']}'),
                    if ('${row['description'] ?? ''}'.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text('${row['description']}'),
                    ],
                  ],
                ),
              ),
            ),
      );
}

class InboxPage extends StatefulWidget {
  final SchoolApi api;
  final PushService push;
  const InboxPage({super.key, required this.api, required this.push});
  @override
  State<InboxPage> createState() => _InboxPageState();
}

class _InboxPageState extends State<InboxPage> {
  int revision = 0;
  @override
  Widget build(BuildContext context) => FeedPage(
        key: ValueKey(revision),
        title: 'Notifikasi',
        actions: [
          IconButton(
            tooltip: 'Aktifkan push',
            icon: const Icon(Icons.notifications_active_outlined),
            onPressed: () async {
              try {
                await widget.push.enable();
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Notifikasi perangkat aktif.')),
                  );
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(
                    context,
                  ).showSnackBar(SnackBar(content: Text('$e')));
                }
              }
            },
          ),
        ],
        load: () async => rows((await widget.api.call('notifications'))['data']),
        item: (context, row) => Card(
              child: ListTile(
                isThreeLine: true,
                leading: Icon(
                  row['read_at'] == null
                      ? Icons.mark_email_unread_outlined
                      : Icons.drafts_outlined,
                ),
                title: Text(
                  '${row['title']}',
                  style: TextStyle(
                    fontWeight: row['read_at'] == null
                        ? FontWeight.bold
                        : FontWeight.normal,
                  ),
                ),
                subtitle: Text('${row['body']}\n${day(row['created_at'])}'),
                onTap: () async {
                  try {
                    await widget.api.call(
                      'notifications/${row['id']}/read',
                      method: 'PATCH',
                    );
                    if (mounted) setState(() => revision++);
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(
                        context,
                      ).showSnackBar(SnackBar(content: Text('$e')));
                    }
                  }
                },
              ),
            ),
      );
}