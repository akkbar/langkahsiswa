import 'package:flutter/material.dart';
import '../api.dart';

/// Placeholder page used for each tab; replace with real UI later.
class _PlaceholderPage extends StatelessWidget {
  final String title;
  final IconData icon;
  const _PlaceholderPage({required this.title, required this.icon});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(title)),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 80, color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.3)),
              const SizedBox(height: 16),
              Text(title, style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 8),
              Text('Halaman belum diimplementasikan',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      )),
            ],
          ),
        ),
      );
}

/// "Lainnya" page – grid of icons that can navigate to other pages later.
class _LainnyaPage extends StatelessWidget {
  final List<_LainnyaItem> items;
  const _LainnyaPage({required this.items});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Lainnya')),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: GridView.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              mainAxisSpacing: 16,
              crossAxisSpacing: 16,
              childAspectRatio: 1,
            ),
            itemCount: items.length,
            itemBuilder: (context, index) {
              final item = items[index];
              return InkWell(
                onTap: item.onTap,
                borderRadius: BorderRadius.circular(16),
                child: Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(color: Theme.of(context).colorScheme.outline),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(item.icon, size: 36, color: Theme.of(context).colorScheme.primary),
                      const SizedBox(height: 12),
                      Text(item.label,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.labelLarge),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      );
}

class _LainnyaItem {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  _LainnyaItem({required this.label, required this.icon, required this.onTap});
}

/// Bottom navigation landing for a specific role.
class RoleLanding extends StatefulWidget {
  final List<String> roles;
  final SchoolApi api;
  final VoidCallback toggleTheme;
  final VoidCallback onLogout;
  const RoleLanding({
    super.key,
    required this.roles,
    required this.api,
    required this.toggleTheme,
    required this.onLogout,
  });

  @override
  State<RoleLanding> createState() => _RoleLandingState();
}

class _RoleLandingState extends State<RoleLanding> {
  late int _currentIndex;
  late List<_TabSpec> _tabs;

  @override
  void initState() {
    super.initState();
    _currentIndex = 0;
    _tabs = _buildTabs(widget.roles);
  }

  List<_TabSpec> _buildTabs(List<String> roles) {
    // Determine primary role priority
    bool isParent = roles.contains('PARENT');
    bool isStudent = roles.contains('STUDENT');
    bool isTeacher = roles.contains('TEACHER');
    bool isAdmin = roles.contains('SCHOOL_ADMIN') || roles.contains('SUPER_ADMIN');

    if (isParent) {
      return [
        _TabSpec('Dashboard', Icons.dashboard_outlined, const _PlaceholderPage(title: 'Dashboard Orang Tua', icon: Icons.dashboard_outlined)),
        _TabSpec('Siswa', Icons.people_outline, const _PlaceholderPage(title: 'Siswa', icon: Icons.people_outline)),
        _TabSpec('Tagihan', Icons.receipt_long_outlined, const _PlaceholderPage(title: 'Tagihan', icon: Icons.receipt_long_outlined)),
        _TabSpec('Events', Icons.event_outlined, const _PlaceholderPage(title: 'Events', icon: Icons.event_outlined)),
        _TabSpec('Lainnya', Icons.more_horiz, _LainnyaPage(items: _parentLainnyaItems())),
      ];
    } else if (isStudent) {
      return [
        _TabSpec('Dashboard', Icons.dashboard_outlined, const _PlaceholderPage(title: 'Dashboard Siswa', icon: Icons.dashboard_outlined)),
        _TabSpec('Kelas', Icons.class_outlined, const _PlaceholderPage(title: 'Kelas', icon: Icons.class_outlined)),
        _TabSpec('Uang Saku', Icons.account_balance_wallet_outlined, const _PlaceholderPage(title: 'Uang Saku', icon: Icons.account_balance_wallet_outlined)),
        _TabSpec('Events', Icons.event_outlined, const _PlaceholderPage(title: 'Events', icon: Icons.event_outlined)),
        _TabSpec('Lainnya', Icons.more_horiz, _LainnyaPage(items: _studentLainnyaItems())),
      ];
    } else if (isTeacher) {
      return [
        _TabSpec('Dashboard', Icons.dashboard_outlined, const _PlaceholderPage(title: 'Dashboard Guru', icon: Icons.dashboard_outlined)),
        _TabSpec('Jadwal', Icons.calendar_view_week_outlined, const _PlaceholderPage(title: 'Jadwal', icon: Icons.calendar_view_week_outlined)),
        _TabSpec('Siswa', Icons.people_outline, const _PlaceholderPage(title: 'Siswa', icon: Icons.people_outline)),
        _TabSpec('Events', Icons.event_outlined, const _PlaceholderPage(title: 'Events', icon: Icons.event_outlined)),
        _TabSpec('Lainnya', Icons.more_horiz, _LainnyaPage(items: _teacherLainnyaItems())),
      ];
    } else if (isAdmin) {
      return [
        _TabSpec('Dashboard', Icons.dashboard_outlined, const _PlaceholderPage(title: 'Dashboard Operasional', icon: Icons.dashboard_outlined)),
        _TabSpec('Keuangan', Icons.attach_money_outlined, const _PlaceholderPage(title: 'Keuangan', icon: Icons.attach_money_outlined)),
        _TabSpec('Yayasan', Icons.apartment_outlined, const _PlaceholderPage(title: 'Yayasan', icon: Icons.apartment_outlined)),
        _TabSpec('Events', Icons.event_outlined, const _PlaceholderPage(title: 'Events', icon: Icons.event_outlined)),
        _TabSpec('Lainnya', Icons.more_horiz, _LainnyaPage(items: _adminLainnyaItems())),
      ];
    }
    // fallback
    return [
      _TabSpec('Dashboard', Icons.dashboard_outlined, const _PlaceholderPage(title: 'Dashboard', icon: Icons.dashboard_outlined)),
      _TabSpec('Lainnya', Icons.more_horiz, _LainnyaPage(items: [])),
    ];
  }

  List<_LainnyaItem> _parentLainnyaItems() => [
        _LainnyaItem(label: 'Profil', icon: Icons.person_outline, onTap: () {}),
        _LainnyaItem(label: 'Pengaturan', icon: Icons.settings_outlined, onTap: () {}),
        _LainnyaItem(label: 'Bantuan', icon: Icons.help_outline, onTap: () {}),
      ];

  List<_LainnyaItem> _studentLainnyaItems() => [
        _LainnyaItem(label: 'Profil', icon: Icons.person_outline, onTap: () {}),
        _LainnyaItem(label: 'Pengaturan', icon: Icons.settings_outlined, onTap: () {}),
        _LainnyaItem(label: 'Bantuan', icon: Icons.help_outline, onTap: () {}),
      ];

  List<_LainnyaItem> _teacherLainnyaItems() => [
        _LainnyaItem(label: 'Profil', icon: Icons.person_outline, onTap: () {}),
        _LainnyaItem(label: 'Pengaturan', icon: Icons.settings_outlined, onTap: () {}),
        _LainnyaItem(label: 'Bantuan', icon: Icons.help_outline, onTap: () {}),
      ];

  List<_LainnyaItem> _adminLainnyaItems() => [
        _LainnyaItem(label: 'Pengguna', icon: Icons.people_outline, onTap: () {}),
        _LainnyaItem(label: 'Pengaturan', icon: Icons.settings_outlined, onTap: () {}),
        _LainnyaItem(label: 'Bantuan', icon: Icons.help_outline, onTap: () {}),
      ];

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _tabs.map((t) => t.page).toList(),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (i) => setState(() => _currentIndex = i),
        destinations: _tabs
            .map((t) => NavigationDestination(
                  icon: Icon(t.icon),
                  label: t.label,
                ))
            .toList(),
        indicatorColor: scheme.primaryContainer,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      ),
    );
  }
}

class _TabSpec {
  final String label;
  final IconData icon;
  final Widget page;
  _TabSpec(this.label, this.icon, this.page);
}