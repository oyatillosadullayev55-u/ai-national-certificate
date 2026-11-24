import 'package:flutter/material.dart';

import '../core/api_client.dart';

/// Future'ni yuklash / xato / natija holatlari bilan ko'rsatadi, pastga tortib yangilash bilan.
class AsyncView<T> extends StatefulWidget {
  const AsyncView({super.key, required this.load, required this.builder, this.empty});

  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;
  final bool Function(T data)? empty;

  @override
  State<AsyncView<T>> createState() => AsyncViewState<T>();
}

class AsyncViewState<T> extends State<AsyncView<T>> {
  late Future<T> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.load();
  }

  Future<void> reload() async {
    final f = widget.load();
    setState(() => _future = f);
    try {
      await f;
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
        if (snap.hasError) return ErrorView(message: snap.error.toString(), onRetry: reload);
        final data = snap.data as T;
        if (widget.empty?.call(data) ?? false) {
          return RefreshIndicator(onRefresh: reload, child: ListView(children: const [SizedBox(height: 120), EmptyView()]));
        }
        return RefreshIndicator(onRefresh: reload, child: widget.builder(context, data, reload));
      },
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.cloud_off_outlined, size: 48, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          if (onRetry != null) ...[
            const SizedBox(height: 12),
            FilledButton.tonal(onPressed: onRetry, child: const Text('Qayta urinish')),
          ],
        ]),
      ),
    );
  }
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, this.text = 'Hozircha hech narsa yo\'q'});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(child: Text(text, style: TextStyle(color: Theme.of(context).colorScheme.outline)));
  }
}

void showError(BuildContext context, Object e) {
  final msg = e is ApiException ? e.message : 'Kutilmagan xatolik';
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
}

void showInfo(BuildContext context, String msg) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
}

/// Tugma bosilganda async amalni bajaradi va kutish holatini ko'rsatadi
class BusyButton extends StatefulWidget {
  const BusyButton({super.key, required this.onPressed, required this.child, this.tonal = false});

  final Future<void> Function()? onPressed;
  final Widget child;
  final bool tonal;

  @override
  State<BusyButton> createState() => _BusyButtonState();
}

class _BusyButtonState extends State<BusyButton> {
  bool _busy = false;

  Future<void> _run() async {
    setState(() => _busy = true);
    try {
      await widget.onPressed!();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final child = _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : widget.child;
    final onPressed = widget.onPressed == null || _busy ? null : _run;
    return widget.tonal ? FilledButton.tonal(onPressed: onPressed, child: child) : FilledButton(onPressed: onPressed, child: child);
  }
}

Color masteryColor(BuildContext context, String status) {
  switch (status) {
    case 'mastered':
      return Colors.green;
    case 'learning':
      return Colors.orange;
    case 'weak':
      return Colors.red;
    default:
      return Theme.of(context).colorScheme.outlineVariant;
  }
}

String percentText(num? score, num? max) {
  if (score == null || max == null || max == 0) return '0%';
  return '${(score / max * 100).round()}%';
}

num asNum(dynamic v) => v is num ? v : num.tryParse('$v') ?? 0;
