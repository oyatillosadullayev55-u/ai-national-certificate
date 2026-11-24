import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../widgets/common.dart';

/// 3 bosqich: telefon → SMS kod → ism va parol. `reset: true` — parolni tiklash.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, this.reset = false});

  final bool reset;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  int _step = 0;
  final _phone = TextEditingController(text: '+998');
  final _code = TextEditingController();
  final _name = TextEditingController();
  final _password = TextEditingController();
  String? _verificationToken;

  String get _purpose => widget.reset ? 'RESET_PASSWORD' : 'REGISTER';

  @override
  void dispose() {
    for (final c in [_phone, _code, _name, _password]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _sendOtp() async {
    final phone = _phone.text.trim();
    if (!RegExp(r'^\+998\d{9}$').hasMatch(phone)) throw ApiException(400, 'Raqam +998XXXXXXXXX formatida bo\'lsin');
    final r = await api.post('/auth/send-otp', {'phone': phone, 'purpose': _purpose}) as Map;
    if (!mounted) return;
    // Faqat development serverda qaytadi (OTP_DEV_ECHO)
    if (r['devCode'] != null) showInfo(context, 'Dev kod: ${r['devCode']}');
    setState(() => _step = 1);
  }

  Future<void> _verify() async {
    final r = await api.post('/auth/verify-otp', {'phone': _phone.text.trim(), 'purpose': _purpose, 'code': _code.text.trim()}) as Map;
    _verificationToken = r['verificationToken'] as String;
    setState(() => _step = 2);
  }

  Future<void> _finish() async {
    if (_password.text.length < 8) throw ApiException(400, 'Parol kamida 8 belgi');
    if (widget.reset) {
      await api.post('/auth/password/reset', {'verificationToken': _verificationToken, 'newPassword': _password.text});
      if (!mounted) return;
      showInfo(context, 'Parol yangilandi. Endi kiring.');
      Navigator.of(context).pop();
      return;
    }
    if (_name.text.trim().isEmpty) throw ApiException(400, 'Ismingizni kiriting');
    final tokens = await api.post('/auth/register', {
      'verificationToken': _verificationToken,
      'password': _password.text,
      'firstName': _name.text.trim(),
      'accountType': 'student',
    });
    if (!mounted) return;
    Navigator.of(context).popUntil((r) => r.isFirst);
    await session.loggedIn(Map<String, dynamic>.from(tokens as Map));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.reset ? 'Parolni tiklash' : 'Ro\'yxatdan o\'tish')),
      body: ListView(padding: const EdgeInsets.all(24), children: [
        LinearProgressIndicator(value: (_step + 1) / 3),
        const SizedBox(height: 24),
        if (_step == 0) ...[
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Telefon raqam', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 16),
          BusyButton(onPressed: _sendOtp, child: const Text('SMS kod olish')),
        ],
        if (_step == 1) ...[
          Text('${_phone.text} raqamiga yuborilgan 6 xonali kodni kiriting'),
          const SizedBox(height: 12),
          TextField(
            controller: _code,
            keyboardType: TextInputType.number,
            maxLength: 6,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Kod', border: OutlineInputBorder()),
          ),
          BusyButton(onPressed: _verify, child: const Text('Tasdiqlash')),
          TextButton(onPressed: () => setState(() => _step = 0), child: const Text('Raqamni o\'zgartirish')),
        ],
        if (_step == 2) ...[
          if (!widget.reset) ...[
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'Ismingiz', border: OutlineInputBorder())),
            const SizedBox(height: 12),
          ],
          TextField(
            controller: _password,
            obscureText: true,
            decoration: InputDecoration(labelText: widget.reset ? 'Yangi parol' : 'Parol', helperText: 'Kamida 8 belgi', border: const OutlineInputBorder()),
          ),
          const SizedBox(height: 16),
          BusyButton(onPressed: _finish, child: Text(widget.reset ? 'Saqlash' : 'Ro\'yxatdan o\'tish')),
          if (!widget.reset)
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Text(
                'Davom etish orqali foydalanish shartlari va maxfiylik siyosatiga rozilik bildirasiz.',
                textAlign: TextAlign.center,
              ),
            ),
        ],
      ]),
    );
  }
}
