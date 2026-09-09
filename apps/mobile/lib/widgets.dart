import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

const brandBlue = Color(0xff004aad);
final currency = NumberFormat.currency(
  locale: 'id_ID',
  symbol: 'Rp',
  decimalDigits: 0,
);
String money(dynamic value) => currency.format(num.tryParse('$value') ?? 0);
String day(dynamic value) {
  final date = DateTime.tryParse('$value');
  return date == null ? '—' : DateFormat('dd MMM yyyy').format(date.toLocal());
}

List<Map<String, dynamic>> rows(dynamic value) =>
    (value as List? ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
String? requiredText(String? value) =>
    value == null || value.trim().isEmpty ? 'Wajib diisi' : null;

class ErrorCard extends StatelessWidget {
  final String message;
  final VoidCallback retry;
  const ErrorCard({super.key, required this.message, required this.retry});
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(message),
          const SizedBox(height: 8),
          OutlinedButton(onPressed: retry, child: const Text('Coba lagi')),
        ],
      ),
    ),
  );
}

class FeedPage extends StatefulWidget {
  final String title;
  final Future<List<Map<String, dynamic>>> Function() load;
  final Widget Function(BuildContext, Map<String, dynamic>) item;
  final List<Widget>? actions;
  const FeedPage({
    super.key,
    required this.title,
    required this.load,
    required this.item,
    this.actions,
  });
  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends State<FeedPage> {
  late Future<List<Map<String, dynamic>>> future;
  @override
  void initState() {
    super.initState();
    future = widget.load();
  }

  Future<void> reload() async {
    setState(() => future = widget.load());
    try {
      await future;
    } catch (_) {
      /* FutureBuilder renders the error. */
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.title), actions: widget.actions),
    body: FutureBuilder<List<Map<String, dynamic>>>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(
            child: ErrorCard(message: '${snapshot.error}', retry: reload),
          );
        }
        final data = snapshot.data ?? [];
        return RefreshIndicator(
          onRefresh: reload,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(20),
            children: data.isEmpty
                ? [
                    const Padding(
                      padding: EdgeInsets.all(32),
                      child: Text(
                        'Belum ada data untuk ditampilkan.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ]
                : data.map((row) => widget.item(context, row)).toList(),
          ),
        );
      },
    ),
  );
}
