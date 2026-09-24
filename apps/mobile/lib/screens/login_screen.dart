import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../api.dart';

/// Login screen matching admin web design and data structure
class LoginScreen extends StatefulWidget {
  final SchoolApi api;
  final VoidCallback onLogin;
  final VoidCallback toggleTheme;

  const LoginScreen({
    super.key,
    required this.api,
    required this.onLogin,
    required this.toggleTheme,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _tenantController = TextEditingController(
    text: const String.fromEnvironment('TENANT_SLUG', defaultValue: 'demo'),
  );
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _isLoading = false;
  bool _passwordVisible = false;
  bool _googleReady = false;
  bool _rememberMe = false;
  String _accountType = 'SCHOOL_ADMIN';
  String? _error;
  static bool _googleInitialized = false;

  @override
  void initState() {
    super.initState();
    _configureGoogle();
  }

  Future<void> _configureGoogle() async {
    try {
      final config = await widget.api.call(
        'auth/google/config',
        authenticated: false,
      );
      if (config['enabled'] == true) {
        if (!_googleInitialized) {
          const iosClient = String.fromEnvironment('GOOGLE_IOS_CLIENT_ID');
          await GoogleSignIn.instance.initialize(
            serverClientId: config['client_id'],
            clientId: Platform.isIOS && iosClient.isNotEmpty ? iosClient : null,
          );
          _googleInitialized = true;
        }
        if (mounted) {
          setState(() => _googleReady = GoogleSignIn.instance.supportsAuthenticate());
        }
      }
    } catch (_) {
      // Google sign-in unavailable, password sign-in remains available
    }
  }

  Future<void> _submit({bool google = false}) async {
    if (google ? _tenantController.text.trim().isEmpty : !_formKey.currentState!.validate()) {
      if (google) setState(() => _error = 'Kode yayasan wajib diisi.');
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      if (google) {
        final account = await GoogleSignIn.instance.authenticate();
        final idToken = account.authentication.idToken;
        if (idToken == null) {
          throw ApiException('Google tidak mengembalikan ID token.');
        }
        await widget.api.googleLogin(
          _tenantController.text,
          idToken,
          accountPassword: _passwordController.text,
          accountType: _accountType,
        );
      } else {
        await widget.api.login(
          _tenantController.text,
          _emailController.text,
          _passwordController.text,
          accountType: _accountType,
        );
      }
      if (mounted) widget.onLogin();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  void dispose() {
    _tenantController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: scheme.surface,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Brand header matching admin .brandmark + .brand
                    Center(
                      child: Column(
                        children: [
                          Container(
                            width: 60,
                            height: 60,
                            decoration: BoxDecoration(
                              color: scheme.primary,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: const Center(
                              child: Text(
                                'L',
                                style: TextStyle(
                                  fontFamily: 'Manrope',
                                  fontWeight: FontWeight.w800,
                                  fontSize: 36,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'LangkahSiswa',
                            style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                                  fontFamily: 'Manrope',
                                  fontWeight: FontWeight.w800,
                                  color: scheme.onSurface,
                                ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Satu tempat untuk mengikuti kegiatan sekolah.',
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                  color: scheme.onSurfaceVariant,
                                ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 32),

                    // Eyebrow matching admin .eyebrow
                    Text(
                      'SELAMAT DATANG',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            fontSize: 10,
                            letterSpacing: 1.7,
                            fontWeight: FontWeight.w800,
                            color: scheme.onSurfaceVariant,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Masuk ke sekolah Anda',
                      style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                            fontFamily: 'Manrope',
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Gunakan satu akun untuk mengakses semua peran yang diberikan oleh sekolah.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                    ),
                    const SizedBox(height: 24),

                    // Error display
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Text(
                          _error!,
                          style: TextStyle(
                            color: scheme.error,
                            fontFamily: 'DM Sans',
                            fontSize: 14,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),

                    // Account type dropdown (matching admin's role concept)
                    DropdownButtonFormField<String>(
                      initialValue: _accountType,
                      decoration: InputDecoration(
                        labelText: 'Jenis akun',
                        prefixIcon: Icon(Icons.badge_outlined, color: scheme.onSurfaceVariant),
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'SCHOOL_ADMIN',
                          child: Text('Admin Sekolah'),
                        ),
                        DropdownMenuItem(
                          value: 'FAMILY',
                          child: Text('Siswa / Wali'),
                        ),
                        DropdownMenuItem(
                          value: 'SCHOOL_TENANT',
                          child: Text('Tenant Sekolah'),
                        ),
                      ],
                      onChanged: _isLoading
                          ? null
                          : (value) => setState(() => _accountType = value ?? 'SCHOOL_ADMIN'),
                    ),
                    const SizedBox(height: 16),

                    // Tenant code field
                    TextFormField(
                      controller: _tenantController,
                      decoration: InputDecoration(
                        labelText: 'Kode yayasan',
                        prefixIcon: Icon(Icons.apartment_outlined, color: scheme.onSurfaceVariant),
                      ),
                      validator: (value) =>
                          value == null || value.trim().isEmpty ? 'Wajib diisi' : null,
                      textInputAction: TextInputAction.next,
                    ),
                    const SizedBox(height: 16),

                    // Email field
                    TextFormField(
                      controller: _emailController,
                      decoration: InputDecoration(
                        labelText: 'Email',
                        prefixIcon: Icon(Icons.email_outlined, color: scheme.onSurfaceVariant),
                        hintText: 'nama@sekolah.sch.id',
                      ),
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.username],
                      validator: (value) =>
                          value == null || value.trim().isEmpty ? 'Wajib diisi' : null,
                      textInputAction: TextInputAction.next,
                    ),
                    const SizedBox(height: 16),

                    // Password field with visibility toggle
                    TextFormField(
                      controller: _passwordController,
                      decoration: InputDecoration(
                        labelText: 'Kata sandi',
                        prefixIcon: Icon(Icons.lock_outline, color: scheme.onSurfaceVariant),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _passwordVisible ? Icons.visibility_off : Icons.visibility,
                            color: scheme.onSurfaceVariant,
                          ),
                          onPressed: () => setState(() => _passwordVisible = !_passwordVisible),
                        ),
                      ),
                      obscureText: !_passwordVisible,
                      autofillHints: const [AutofillHints.password],
                      validator: (value) =>
                          value == null || value.isEmpty ? 'Wajib diisi' : null,
                      onFieldSubmitted: (_) {
                        if (!_isLoading) _submit();
                      },
                    ),
                    const SizedBox(height: 12),

                    // Remember me checkbox
                    Row(
                      children: [
                        Checkbox(
                          value: _rememberMe,
                          onChanged: _isLoading
                              ? null
                              : (value) => setState(() => _rememberMe = value ?? false),
                        ),
                        Expanded(
                          child: Text(
                            'Tetap masuk di perangkat ini',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Primary login button
                    FilledButton(
                      onPressed: _isLoading ? null : _submit,
                      child: Text(_isLoading ? 'Memproses…' : 'Masuk ke LangkahSiswa →'),
                    ),

                    // Google sign-in button
                    if (_googleReady) ...[
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: _isLoading ? null : () => _submit(google: true),
                        icon: const Icon(Icons.account_circle_outlined, size: 22),
                        label: const Text('Lanjutkan dengan Google'),
                      ),
                    ],

                    const SizedBox(height: 24),

                    // Footer links
                    Text(
                      'Akses data mengikuti peran dan sekolah Anda.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: scheme.onSurfaceVariant.withValues(alpha: 0.7),
                          ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () {
                        // Navigate to PPDB public page
                      },
                      child: Text(
                        'Pendaftaran siswa baru (PPDB) →',
                        style: TextStyle(
                          color: scheme.primary,
                          fontFamily: 'DM Sans',
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}