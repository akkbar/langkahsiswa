import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'api.dart';
import 'widgets.dart';

Future<bool> transferDialog(
  BuildContext context,
  SchoolApi api,
  String studentId, {
  String? invoiceId,
  num? maximum,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (_) => TransferDialog(
      api: api,
      studentId: studentId,
      invoiceId: invoiceId,
      maximum: maximum,
    ),
  );
  return result == true;
}

class TransferDialog extends StatefulWidget {
  final SchoolApi api;
  final String studentId;
  final String? invoiceId;
  final num? maximum;
  const TransferDialog({
    super.key,
    required this.api,
    required this.studentId,
    this.invoiceId,
    this.maximum,
  });
  @override
  State<TransferDialog> createState() => _TransferDialogState();
}

class _TransferDialogState extends State<TransferDialog> {
  final amount = TextEditingController();
  final reference = TextEditingController();
  PlatformFile? file;
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    if (widget.maximum != null) amount.text = '${widget.maximum!.toInt()}';
  }

  @override
  void dispose() {
    amount.dispose();
    reference.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    final value = int.tryParse(amount.text);
    if (value == null ||
        value <= 0 ||
        (widget.maximum != null && value > widget.maximum!) ||
        file?.bytes == null) {
      setState(
        () => error = 'Isi nominal yang valid dan pilih bukti transfer.',
      );
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final proof = await widget.api.call(
        'payment-proofs',
        method: 'POST',
        body: {
          'student_id': widget.studentId,
          'file_name': file!.name,
          'mime_type': file!.extension?.toLowerCase() == 'pdf'
              ? 'application/pdf'
              : file!.extension?.toLowerCase() == 'png'
              ? 'image/png'
              : 'image/jpeg',
          'data_base64': base64Encode(file!.bytes!),
        },
      );
      await widget.api.call(
        widget.invoiceId == null
            ? 'wallet-topups'
            : 'invoices/${widget.invoiceId}/payments',
        method: 'POST',
        body: {
          if (widget.invoiceId == null) 'student_id': widget.studentId,
          'amount': value,
          'proof_id': proof['id'],
          if (reference.text.trim().isNotEmpty)
            'reference': reference.text.trim(),
        },
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(
      widget.invoiceId == null ? 'Ajukan top up' : 'Kirim bukti pembayaran',
    ),
    content: SizedBox(
      width: 380,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Transfer ke rekening sekolah sesuai instruksi administrasi, lalu lampirkan buktinya. Saldo atau tagihan diperbarui setelah verifikasi.',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: amount,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Nominal (Rp)'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: reference,
              decoration: const InputDecoration(
                labelText: 'Referensi transfer (opsional)',
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: busy
                  ? null
                  : () async {
                      final picked = await FilePicker.pickFiles(
                        type: FileType.custom,
                        allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
                        withData: true,
                      );
                      if (!mounted || picked == null) return;
                      if (picked.files.single.size > 2 * 1024 * 1024) {
                        setState(() => error = 'Bukti transfer maksimal 2 MB.');
                        return;
                      }
                      setState(() {
                        file = picked.files.single;
                        error = null;
                      });
                    },
              icon: const Icon(Icons.attach_file),
              label: Text(
                file?.name ?? 'Pilih bukti · PDF/JPG/PNG, maks. 2 MB',
              ),
            ),
            if (error != null)
              Text(
                error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: busy ? null : () => Navigator.pop(context, false),
        child: const Text('Batal'),
      ),
      FilledButton(
        onPressed: busy ? null : submit,
        child: Text(busy ? 'Mengirim…' : 'Kirim'),
      ),
    ],
  );
}

class BillingPage extends StatefulWidget {
  final SchoolApi api;
  final String studentId;
  final bool canPay;
  const BillingPage({
    super.key,
    required this.api,
    required this.studentId,
    required this.canPay,
  });
  @override
  State<BillingPage> createState() => _BillingPageState();
}

class _BillingPageState extends State<BillingPage> {
  int revision = 0;
  @override
  Widget build(BuildContext context) => FeedPage(
    key: ValueKey(revision),
    title: 'Tagihan',
    load: () async => rows(
      (await widget.api.call(
        'invoices?student_id=${widget.studentId}',
      ))['data'],
    ),
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
            Text('Jatuh tempo ${day(row['due_date'])} · ${row['status']}'),
            const SizedBox(height: 12),
            Text(
              money(row['total_amount']),
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            Text('Dibayar ${money(row['paid_amount'])}'),
            TextButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => FeedPage(
                    title: 'Riwayat pembayaran',
                    load: () async => rows(
                      (await widget.api.call(
                        'invoices/${row['id']}',
                      ))['payments'],
                    ),
                    item: (_, payment) => Card(
                      child: ListTile(
                        title: Text(money(payment['amount'])),
                        subtitle: Text(
                          '${payment['status']} · ${day(payment['created_at'])}\n${payment['reference'] ?? ''}',
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              child: const Text('Riwayat pembayaran'),
            ),
            if (widget.canPay && row['status'] != 'PAID')
              FilledButton(
                onPressed: () async {
                  if (await transferDialog(
                        context,
                        widget.api,
                        widget.studentId,
                        invoiceId: row['id'],
                        maximum:
                            (num.tryParse('${row['total_amount']}') ?? 0) -
                            (num.tryParse('${row['paid_amount']}') ?? 0),
                      ) &&
                      mounted) {
                    setState(() => revision++);
                  }
                },
                child: const Text('Unggah bukti pembayaran'),
              ),
          ],
        ),
      ),
    ),
  );
}

class WalletPage extends StatefulWidget {
  final SchoolApi api;
  final String studentId;
  final bool canManage;
  const WalletPage({
    super.key,
    required this.api,
    required this.studentId,
    required this.canManage,
  });
  @override
  State<WalletPage> createState() => _WalletPageState();
}

class _WalletPageState extends State<WalletPage> {
  late Future<Map<String, dynamic>> future;
  @override
  void initState() {
    super.initState();
    future = load();
  }

  Future<Map<String, dynamic>> load() =>
      widget.api.call('wallets/${widget.studentId}');
  void reload() => setState(() => future = load());
  Future<void> limits(Map<String, dynamic> value) async {
    final daily = TextEditingController(text: '${value['daily_limit'] ?? ''}');
    final monthly = TextEditingController(
      text: '${value['monthly_limit'] ?? ''}',
    );
    String? error;
    bool busy = false;
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, update) => AlertDialog(
          title: const Text('Batas pengeluaran'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Kosongkan untuk tanpa batas. Nilai dalam rupiah.'),
              const SizedBox(height: 16),
              TextField(
                controller: daily,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Batas harian'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: monthly,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Batas bulanan'),
              ),
              if (error != null) Text(error!),
            ],
          ),
          actions: [
            TextButton(
              onPressed: busy ? null : () => Navigator.pop(ctx),
              child: const Text('Batal'),
            ),
            FilledButton(
              onPressed: busy
                  ? null
                  : () async {
                      int? limit(String text) {
                        if (text.isEmpty) return null;
                        final n = int.tryParse(text);
                        if (n == null || n < 0) {
                          throw ApiException(
                            'Batas harus bilangan rupiah positif.',
                          );
                        }
                        return n;
                      }

                      update(() {
                        busy = true;
                        error = null;
                      });
                      try {
                        await widget.api.call(
                          'wallets/${widget.studentId}/limits',
                          method: 'PUT',
                          body: {
                            'daily_limit': limit(daily.text.trim()),
                            'monthly_limit': limit(monthly.text.trim()),
                            'category_limits': value['category_limits'] ?? {},
                            'blocked_merchant_ids':
                                value['blocked_merchant_ids'] ?? [],
                          },
                        );
                        if (ctx.mounted) Navigator.pop(ctx);
                        if (mounted) reload();
                      } catch (e) {
                        if (ctx.mounted) {
                          update(() {
                            error = '$e';
                            busy = false;
                          });
                        }
                      }
                    },
              child: const Text('Simpan'),
            ),
          ],
        ),
      ),
    );
    daily.dispose();
    monthly.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Dompet siswa')),
    body: FutureBuilder<Map<String, dynamic>>(
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
        final data = snapshot.data!;
        final walletLimits = Map<String, dynamic>.from(data['limits'] ?? {});
        return RefreshIndicator(
          onRefresh: () async {
            reload();
            try {
              await future;
            } catch (_) {}
          },
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Saldo tersedia'),
                      const SizedBox(height: 8),
                      Text(
                        money(data['balance']),
                        style: Theme.of(context).textTheme.displaySmall,
                      ),
                      const SizedBox(height: 16),
                      Text('Belanja hari ini ${money(data['today_spending'])}'),
                      Text(
                        'Belanja bulan ini ${money(data['month_spending'])}',
                      ),
                    ],
                  ),
                ),
              ),
              if (widget.canManage) ...[
                FilledButton.icon(
                  onPressed: () async {
                    if (await transferDialog(
                          context,
                          widget.api,
                          widget.studentId,
                        ) &&
                        mounted) {
                      reload();
                    }
                  },
                  icon: const Icon(Icons.add),
                  label: const Text('Top up saldo'),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () => limits(walletLimits),
                  icon: const Icon(Icons.tune),
                  label: const Text('Atur batas pengeluaran'),
                ),
              ],
              const SizedBox(height: 12),
              Text(
                'Batas harian: ${walletLimits['daily_limit'] == null ? 'Tanpa batas' : money(walletLimits['daily_limit'])}',
              ),
              Text(
                'Batas bulanan: ${walletLimits['monthly_limit'] == null ? 'Tanpa batas' : money(walletLimits['monthly_limit'])}',
              ),
              const SizedBox(height: 24),
              Text(
                'Riwayat transaksi',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              if (rows(data['transactions']).isEmpty)
                const Text('Belum ada transaksi.'),
              ...rows(data['transactions']).map(
                (t) => Card(
                  child: ListTile(
                    title: Text('${t['merchant_name'] ?? t['type']}'),
                    subtitle: Text(
                      '${t['description'] ?? ''}\n${day(t['created_at'])}',
                    ),
                    trailing: Text(money(t['amount'])),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    ),
  );
}
