import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'api.dart';
import 'widgets.dart';

class TeachingPage extends StatelessWidget {
  final SchoolApi api;
  const TeachingPage({super.key, required this.api});
  @override
  Widget build(BuildContext context) => FeedPage(
    title: 'Ruang guru',
    load: () async => rows((await api.call('portal/teaching'))['data']),
    item: (context, assignment) => Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${assignment['class_name']} · ${assignment['subject_name']}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            Text(
              '${assignment['semester_name']} · ${rows(assignment['students']).length} siswa',
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: [
                FilledButton(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) =>
                          TeacherEntryPage(api: api, assignment: assignment),
                    ),
                  ),
                  child: const Text('Isi kehadiran'),
                ),
                OutlinedButton(
                  onPressed: rows(assignment['assessments']).isEmpty
                      ? null
                      : () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => TeacherEntryPage(
                              api: api,
                              assignment: assignment,
                              grades: true,
                            ),
                          ),
                        ),
                  child: const Text('Isi nilai'),
                ),
              ],
            ),
            if (rows(assignment['assessments']).isEmpty)
              const Text(
                'Buat penilaian melalui admin web untuk mulai mengisi nilai.',
              ),
          ],
        ),
      ),
    ),
  );
}

class TeacherEntryPage extends StatefulWidget {
  final SchoolApi api;
  final Map<String, dynamic> assignment;
  final bool grades;
  const TeacherEntryPage({
    super.key,
    required this.api,
    required this.assignment,
    this.grades = false,
  });
  @override
  State<TeacherEntryPage> createState() => _TeacherEntryPageState();
}

class _TeacherEntryPageState extends State<TeacherEntryPage> {
  final inputs = <String, TextEditingController>{};
  final statuses = <String, String>{};
  final notes = <String, String?>{};
  String? assessmentId;
  DateTime date = DateTime.now();
  bool loading = true;
  bool saving = false;
  String? error;
  List<Map<String, dynamic>> get students =>
      rows(widget.assignment['students']);
  List<Map<String, dynamic>> get assessments =>
      rows(widget.assignment['assessments']);
  String get isoDate => DateFormat('yyyy-MM-dd').format(date);
  @override
  void initState() {
    super.initState();
    assessmentId = assessments.firstOrNull?['id'];
    for (final s in students) {
      inputs[s['id']] = TextEditingController();
    }
    load();
  }

  @override
  void dispose() {
    for (final input in inputs.values) {
      input.dispose();
    }
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await widget.api.call(
        widget.grades
            ? 'grades?assessment_id=$assessmentId'
            : 'attendance?class_id=${widget.assignment['class_id']}&date=$isoDate',
      );
      for (final c in inputs.values) {
        c.clear();
      }
      statuses.clear();
      notes.clear();
      for (final row in rows(result[widget.grades ? 'data' : 'records'])) {
        if (widget.grades) {
          inputs[row['student_id']]?.text = '${row['score']}';
        } else {
          statuses[row['student_id']] = row['status'];
          notes[row['student_id']] = row['notes'];
        }
      }
    } catch (e) {
      error = '$e';
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> save() async {
    setState(() {
      saving = true;
      error = null;
    });
    try {
      if (widget.grades) {
        final max = num.parse(
          '${assessments.firstWhere((a) => a['id'] == assessmentId)['max_score']}',
        );
        final scores = <Map<String, dynamic>>[];
        for (final s in students) {
          final text = inputs[s['id']]!.text.trim();
          if (text.isEmpty) continue;
          final score = num.tryParse(text);
          if (score == null || !score.isFinite || score < 0 || score > max) {
            throw ApiException('Nilai ${s['name']} harus 0–$max.');
          }
          scores.add({'student_id': s['id'], 'score': score});
        }
        if (scores.isEmpty) throw ApiException('Isi minimal satu nilai.');
        await widget.api.call(
          'grades',
          method: 'PUT',
          body: {'assessment_id': assessmentId, 'scores': scores},
        );
      } else {
        if (students.any((s) => statuses[s['id']] == null)) {
          throw ApiException(
            'Pilih status untuk setiap siswa sebelum menyimpan.',
          );
        }
        await widget.api.call(
          'attendance',
          method: 'PUT',
          body: {
            'class_id': widget.assignment['class_id'],
            'semester_id': widget.assignment['semester_id'],
            'date': isoDate,
            'records': students
                .map(
                  (s) => {
                    'student_id': s['id'],
                    'status': statuses[s['id']],
                    if (notes[s['id']] != null) 'notes': notes[s['id']],
                  },
                )
                .toList(),
          },
        );
      }
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Perubahan tersimpan.')));
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.grades ? 'Isi nilai' : 'Isi kehadiran')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          '${widget.assignment['class_name']} · ${widget.assignment['subject_name']}',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 16),
        if (widget.grades)
          DropdownButtonFormField<String>(
            initialValue: assessmentId,
            decoration: const InputDecoration(labelText: 'Penilaian'),
            items: assessments
                .map(
                  (a) => DropdownMenuItem<String>(
                    value: a['id'],
                    child: Text('${a['name']} (maks. ${a['max_score']})'),
                  ),
                )
                .toList(),
            onChanged: loading || saving
                ? null
                : (value) {
                    assessmentId = value;
                    load();
                  },
          )
        else
          OutlinedButton.icon(
            onPressed: loading || saving
                ? null
                : () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: date,
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2100),
                    );
                    if (picked != null) {
                      date = picked;
                      load();
                    }
                  },
            icon: const Icon(Icons.calendar_today_outlined),
            label: Text(day(isoDate)),
          ),
        const SizedBox(height: 16),
        if (loading) const LinearProgressIndicator(),
        if (error != null) ErrorCard(message: error!, retry: load),
        if (!loading)
          ...students.map(
            (s) => Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('${s['name']} · ${s['nis']}'),
                    const SizedBox(height: 8),
                    if (widget.grades)
                      TextField(
                        controller: inputs[s['id']],
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: const InputDecoration(labelText: 'Nilai'),
                        enabled: !saving,
                      )
                    else
                      DropdownButtonFormField<String>(
                        key: ValueKey(
                          '$isoDate-${s['id']}-${statuses[s['id']]}',
                        ),
                        initialValue: statuses[s['id']],
                        decoration: const InputDecoration(
                          labelText: 'Status kehadiran',
                        ),
                        items:
                            const [
                                  'PRESENT',
                                  'LATE',
                                  'SICK',
                                  'PERMISSION',
                                  'ABSENT',
                                ]
                                .map(
                                  (status) => DropdownMenuItem(
                                    value: status,
                                    child: Text(status),
                                  ),
                                )
                                .toList(),
                        onChanged: saving
                            ? null
                            : (value) => statuses[s['id']] = value!,
                      ),
                  ],
                ),
              ),
            ),
          ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: loading || saving || error != null ? null : save,
          child: Text(saving ? 'Menyimpan…' : 'Simpan'),
        ),
      ],
    ),
  );
}
