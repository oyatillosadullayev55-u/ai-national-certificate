import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/math_text.dart';
import 'study_plan_screen.dart';

class AiTutorScreen extends StatefulWidget {
  const AiTutorScreen({super.key});

  @override
  State<AiTutorScreen> createState() => _AiTutorScreenState();
}

class _AiTutorScreenState extends State<AiTutorScreen> {
  final _key = GlobalKey<AsyncViewState<List>>();

  Future<void> _new() async {
    String? subjectId;
    if (session.mySubjects.length > 1) {
      subjectId = await showModalBottomSheet<String>(
        context: context,
        builder: (c) => SafeArea(
          child: ListView(shrinkWrap: true, children: [
            const ListTile(title: Text('Qaysi fan bo\'yicha?')),
            for (final s in session.mySubjects)
              ListTile(title: Text(s['subject']['nameUz'] as String), onTap: () => Navigator.pop(c, s['subjectId'] as String)),
          ]),
        ),
      );
      if (subjectId == null) return;
    } else if (session.mySubjects.isNotEmpty) {
      subjectId = session.mySubjects.first['subjectId'] as String;
    }
    try {
      final c = await api.post('/ai/tutor/conversations', {if (subjectId != null) 'subjectId': subjectId}) as Map;
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(conversationId: c['id'] as String)));
      _key.currentState?.reload();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('AI Tutor')),
      floatingActionButton: FloatingActionButton.extended(onPressed: _new, icon: const Icon(Icons.add_comment), label: const Text('Yangi savol')),
      body: AsyncView<List>(
        key: _key,
        load: () async => await api.get('/ai/tutor/conversations') as List,
        builder: (context, list, reload) => ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 96), children: [
          GradientCard(
            onTap: _new,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.auto_awesome, color: Colors.white, size: 30),
              const SizedBox(height: 10),
              Text('Shaxsiy repetitoringiz', style: t.titleLarge?.copyWith(color: Colors.white)),
              const SizedBox(height: 4),
              const Text(
                "Istalgan masalani so'rang — AI tayyor javob bermaydi, balki bosqichma-bosqich o'zingiz yechishingizga yordam beradi.",
                style: TextStyle(color: Colors.white, height: 1.4),
              ),
            ]),
          ),
          Card(
            child: ListTile(
              leading: const IconBadge(Icons.calendar_month, color: Color(0xFF7C3AED)),
              title: const Text("AI o'qish rejasi", style: TextStyle(fontWeight: FontWeight.w700)),
              subtitle: const Text('7 kunlik shaxsiy reja'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StudyPlanScreen())),
            ),
          ),
          SectionTitle(list.isEmpty ? 'Suhbatlar' : 'Suhbatlar (${list.length})'),
          if (list.isEmpty)
            const Card(child: ListTile(leading: Icon(Icons.forum_outlined), title: Text("Hali suhbat yo'q"), subtitle: Text('«Yangi savol» tugmasini bosing'))),
          for (final c in list.cast<Map>())
            Card(
              child: ListTile(
                leading: const IconBadge(Icons.chat_bubble_outline),
                title: Text(c['title'] as String? ?? 'Yangi suhbat', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(_ago(c['updatedAt'] as String?)),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(conversationId: c['id'] as String)));
                  reload();
                },
              ),
            ),
        ]),
      ),
    );
  }

  static String _ago(String? iso) {
    final d = iso == null ? null : DateTime.tryParse(iso)?.toLocal();
    if (d == null) return '';
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'hozirgina';
    if (diff.inHours < 1) return '${diff.inMinutes} daqiqa oldin';
    if (diff.inDays < 1) return '${diff.inHours} soat oldin';
    if (diff.inDays < 7) return '${diff.inDays} kun oldin';
    return '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
  }
}

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.conversationId});

  final String conversationId;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final List<Map<String, dynamic>> _messages = [];
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _loading = true;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    api.get('/ai/tutor/conversations/${widget.conversationId}').then((c) {
      if (!mounted) return;
      setState(() {
        _messages.addAll(((c as Map)['messages'] as List).map((e) => Map<String, dynamic>.from(e as Map)));
        _loading = false;
      });
      _toBottom();
    }).catchError((Object e) {
      if (!mounted) return;
      setState(() => _loading = false);
      showError(context, e);
    });
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _toBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    });
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() {
      _sending = true;
      _messages.add({'role': 'user', 'content': text});
      _input.clear();
    });
    _toBottom();
    try {
      final reply = await api.post('/ai/tutor/conversations/${widget.conversationId}/messages', {'content': text});
      if (!mounted) return;
      setState(() => _messages.add(Map<String, dynamic>.from(reply as Map)));
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _messages.removeLast();
        _input.text = text;
      });
      showError(context, e); // 403: imtihon davomida, 429: kunlik limit
    } finally {
      if (mounted) setState(() => _sending = false);
      _toBottom();
    }
  }

  static const _suggestions = [
    'Kvadrat tenglamani qanday yechaman?',
    'Bugun nimani takrorlashim kerak?',
    'Foizga oid masalani tushuntirib bering',
    'Menga 3 ta mashq bering',
  ];

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(children: [
          const _AiAvatar(),
          const SizedBox(width: 10),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('AI Tutor', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
            Text(_sending ? 'yozmoqda…' : 'onlayn', style: TextStyle(fontSize: 12, color: cs.primary)),
          ]),
        ]),
      ),
      body: Column(children: [
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _messages.isEmpty
                  ? ListView(padding: const EdgeInsets.all(24), children: [
                      const SizedBox(height: 24),
                      const Center(child: _AiAvatar(size: 64)),
                      const SizedBox(height: 16),
                      Text('Nima haqida gaplashamiz?', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 6),
                      Text(
                        "Masala yoki mavzu haqida so'rang. Men bosqichma-bosqich tushuntiraman va sizni tekshiruvchi savol beraman.",
                        textAlign: TextAlign.center,
                        style: TextStyle(color: cs.onSurfaceVariant),
                      ),
                      const SizedBox(height: 20),
                      Wrap(alignment: WrapAlignment.center, spacing: 8, runSpacing: 8, children: [
                        for (final q in _suggestions)
                          ActionChip(
                            avatar: Icon(Icons.auto_awesome, size: 16, color: cs.primary),
                            label: Text(q),
                            onPressed: () {
                              _input.text = q;
                              _send();
                            },
                          ),
                      ]),
                    ])
                  : ListView.builder(
                      controller: _scroll,
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
                      itemCount: _messages.length + (_sending ? 1 : 0),
                      itemBuilder: (context, i) {
                        if (i == _messages.length) return const _Bubble(mine: false, child: _TypingDots());
                        final m = _messages[i];
                        final mine = m['role'] == 'user';
                        return _Bubble(
                          mine: mine,
                          child: MathText(
                            m['content'] as String,
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: mine ? cs.onPrimary : cs.onSurface, height: 1.45),
                          ),
                        );
                      },
                    ),
        ),
        SafeArea(
          top: false,
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
            decoration: BoxDecoration(color: cs.surfaceContainerLow, border: Border(top: BorderSide(color: cs.outlineVariant.withValues(alpha: .5)))),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _input,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: InputDecoration(
                    hintText: 'Savolingizni yozing…',
                    fillColor: cs.surface,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              IconButton.filled(
                style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
                onPressed: _sending ? null : _send,
                icon: const Icon(Icons.arrow_upward_rounded),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _AiAvatar extends StatelessWidget {
  const _AiAvatar({this.size = 36});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(gradient: AppTheme.aiGradient, borderRadius: BorderRadius.circular(size * .32)),
      child: Icon(Icons.auto_awesome, color: Colors.white, size: size * .5),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.mine, required this.child});

  final bool mine;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final bubble = Container(
      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * (mine ? .8 : .78)),
      margin: const EdgeInsets.symmetric(vertical: 5),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        color: mine ? cs.primary : cs.surfaceContainerLow,
        border: mine ? null : Border.all(color: cs.outlineVariant.withValues(alpha: .6)),
        borderRadius: BorderRadius.only(
          topLeft: const Radius.circular(18),
          topRight: const Radius.circular(18),
          bottomLeft: Radius.circular(mine ? 18 : 4),
          bottomRight: Radius.circular(mine ? 4 : 18),
        ),
      ),
      child: child,
    );
    if (mine) return Align(alignment: Alignment.centerRight, child: bubble);
    return Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
      const Padding(padding: EdgeInsets.only(bottom: 6, right: 8), child: _AiAvatar(size: 28)),
      Flexible(child: bubble),
    ]);
  }
}

class _TypingDots extends StatefulWidget {
  const _TypingDots();

  @override
  State<_TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<_TypingDots> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.primary;
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) => Row(mainAxisSize: MainAxisSize.min, children: [
        for (var i = 0; i < 3; i++)
          Container(
            width: 7,
            height: 7,
            margin: const EdgeInsets.symmetric(horizontal: 2.5, vertical: 4),
            decoration: BoxDecoration(
              color: color.withValues(alpha: (1 - ((_c.value * 3 - i) % 3) / 3).clamp(.3, 1.0)),
              shape: BoxShape.circle,
            ),
          ),
      ]),
    );
  }
}
