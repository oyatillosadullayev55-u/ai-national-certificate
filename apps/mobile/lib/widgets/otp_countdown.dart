import 'dart:async';

import 'package:flutter/material.dart';

import 'common.dart';

/// SMS kodning amal qilish muddati. Muddat tugagach "qayta yuborish" tugmasi chiqadi.
class OtpCountdown extends StatefulWidget {
  const OtpCountdown({super.key, required this.expiresAt, required this.onResend, this.now = DateTime.now});

  final DateTime expiresAt;
  final Future<void> Function() onResend;

  /// Testlarda soatni almashtirish uchun
  final DateTime Function() now;

  @override
  State<OtpCountdown> createState() => _OtpCountdownState();
}

class _OtpCountdownState extends State<OtpCountdown> {
  Timer? _ticker;

  /// Qolgan soniyalar. Soatdan hisoblanadi — ilova fonda tursa ham vaqt to'g'ri qoladi
  int get _left {
    final ms = widget.expiresAt.difference(widget.now()).inMilliseconds;
    return ms <= 0 ? 0 : (ms / 1000).ceil();
  }

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void didUpdateWidget(OtpCountdown old) {
    super.didUpdateWidget(old);
    if (old.expiresAt != widget.expiresAt) _start();
  }

  void _start() {
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_left == 0) t.cancel();
      setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final left = _left;
    if (left > 0) {
      final time = '${left ~/ 60}:${(left % 60).toString().padLeft(2, '0')}';
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Text('Kod $time davomida amal qiladi', textAlign: TextAlign.center),
      );
    }
    return Column(children: [
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Text('Kod muddati tugadi', textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.error)),
      ),
      BusyButton(onPressed: widget.onResend, tonal: true, child: const Text('Kodni qayta yuborish')),
    ]);
  }
}
