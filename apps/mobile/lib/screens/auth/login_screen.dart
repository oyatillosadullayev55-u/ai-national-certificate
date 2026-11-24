import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../widgets/common.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController(text: '+998');
  final _password = TextEditingController();
  final _form = GlobalKey<FormState>();
  bool _hide = true;

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_form.currentState!.validate()) return;
    final tokens = await api.post('/auth/login', {'login': _phone.text.trim(), 'password': _password.text});
    await session.loggedIn(Map<String, dynamic>.from(tokens as Map));
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _form,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Icon(Icons.school_rounded, size: 56, color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 12),
                Text('AI National Certificate', textAlign: TextAlign.center, style: t.headlineSmall),
                const SizedBox(height: 4),
                Text('Test yechish emas — natijaga erishish tizimi', textAlign: TextAlign.center, style: t.bodyMedium),
                const SizedBox(height: 32),
                TextFormField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Telefon raqam', border: OutlineInputBorder()),
                  validator: (v) => RegExp(r'^\+998\d{9}$').hasMatch(v?.trim() ?? '') ? null : '+998XXXXXXXXX formatida',
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _password,
                  obscureText: _hide,
                  decoration: InputDecoration(
                    labelText: 'Parol',
                    border: const OutlineInputBorder(),
                    suffixIcon: IconButton(icon: Icon(_hide ? Icons.visibility : Icons.visibility_off), onPressed: () => setState(() => _hide = !_hide)),
                  ),
                  validator: (v) => (v ?? '').isEmpty ? 'Parolni kiriting' : null,
                ),
                const SizedBox(height: 20),
                BusyButton(onPressed: _login, child: const Text('Kirish')),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RegisterScreen())),
                  child: const Text('Ro\'yxatdan o\'tish'),
                ),
                TextButton(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RegisterScreen(reset: true))),
                  child: const Text('Parolni unutdingizmi?'),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
