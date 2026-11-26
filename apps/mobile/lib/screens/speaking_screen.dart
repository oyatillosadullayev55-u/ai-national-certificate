import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/theme.dart';
import '../core/voice.dart';
import '../widgets/common.dart';
import '../widgets/speaking_result.dart';

/// Ovozli suhbat: tilni tanlash va oldingi natijalar
class SpeakingScreen extends StatefulWidget {
  const SpeakingScreen({super.key});

  @override
  State<SpeakingScreen> createState() => _SpeakingScreenState();
}

class _SpeakingScreenState extends State<SpeakingScreen> {
  final _key = GlobalKey<AsyncViewState<List>>();
  String _language = 'en';

  Future<void> _open(Map<String, dynamic> session) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => SpeakingSessionScreen(session: session)));
    _key.currentState?.reload();
  }

  Future<void> _start() async {
    final s = await api.post('/ai/speaking/sessions', {'language': _language}) as Map;
    if (mounted) await _open(Map<String, dynamic>.from(s));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ovozli suhbat')),
      body: AsyncView<List>(
        key: _key,
        load: () async => await api.get('/ai/speaking/sessions') as List,
        builder: (context, list, reload) => ListView(padding: const EdgeInsets.all(16), children: [
          const Text('AI bilan gaplashing — kamida 3 ta javobdan keyin til darajangizni (A1–C2) aniqlaydi.'),
          const SizedBox(height: 16),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final l in speakingLanguages.entries)
              ChoiceChip(label: Text(l.value.name), selected: _language == l.key, onSelected: (_) => setState(() => _language = l.key)),
          ]),
          const SizedBox(height: 16),
          BusyButton(onPressed: _start, child: const Text('Suhbatni boshlash')),
          if (list.isNotEmpty) const SectionTitle('Suhbatlarim'),
          for (final s in list.cast<Map>())
            Card(
              child: ListTile(
                leading: CircleAvatar(child: Text(s['level'] as String? ?? '…')),
                title: Text(speakingLanguages[s['language']]?.name ?? ''),
                subtitle: Text('${_date(s['createdAt'] as String)}${s['level'] == null ? ' · davom ettirish' : ''}'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  try {
                    final full = await api.get('/ai/speaking/sessions/${s['id']}') as Map;
                    if (mounted) await _open(Map<String, dynamic>.from(full));
                  } catch (e) {
                    if (context.mounted) showError(context, e);
                  }
                },
              ),
            ),
        ]),
      ),
    );
  }

  static String _date(String iso) {
    final d = DateTime.parse(iso).toLocal();
    return '${d.day}.${d.month}.${d.year} ${d.hour}:${d.minute.toString().padLeft(2, '0')}';
  }
}

class SpeakingSessionScreen extends StatefulWidget {
  const SpeakingSessionScreen({super.key, required this.session});

  final Map<String, dynamic> session;

  @override
  State<SpeakingSessionScreen> createState() => _SpeakingSessionScreenState();
}

class _SpeakingSessionScreenState extends State<SpeakingSessionScreen> {
  late Map<String, dynamic> _session = widget.session;
  final _voice = Voice();
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _listening = false;
  bool _sending = false;

  /// Matn maydonidagi javob ovozdan olinganmi (qo'lda o'zgartirilsa — yo'q)
  bool _fromVoice = false;
  bool _noVoiceShown = false;

  String get _language => _session['language'] as String;
  List<Map> get _messages => (_session['messages'] as List).cast<Map>();
  String get _path => '/ai/speaking/sessions/${_session['id']}';

  @override
  void initState() {
    super.initState();
    if (_session['result'] == null && _messages.last['role'] == 'assistant') {
      WidgetsBinding.instance.addPostFrameCallback((_) => _say(_messages.last['content'] as String));
    }
  }

  @override
  void dispose() {
    _voice.dispose();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _say(String text) async {
    final ok = await _voice.speak(text, _language);
    if (!ok && mounted && !_noVoiceShown) {
      _noVoiceShown = true;
      showInfo(context, 'Qurilmangizda ${speakingLanguages[_language]!.name.toLowerCase()} ovozi yo\'q — savollarni o\'qib javob bering');
    }
  }

  Future<void> _toggleMic() async {
    if (_listening) return _voice.stopListening(); // natija onDone orqali keladi
    await _voice.stopSpeaking();
    _input.clear();
    setState(() => _listening = true);
    final started = await _voice.listen(
      _language,
      onText: (text) {
        if (!mounted) return;
        _fromVoice = true;
        _input.text = text;
      },
      onDone: (error) {
        if (!mounted) return;
        setState(() => _listening = false);
        if (_input.text.trim().isNotEmpty) {
          _send();
        } else if (error != null) {
          showInfo(context, Voice.errorText(error));
        }
      },
    );
    if (!started && mounted) {
      setState(() => _listening = false);
      showInfo(context, 'Mikrofon mavjud emas. Ruxsatni tekshiring, Chrome\'da oching yoki javobni yozing');
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    final spoken = _fromVoice;
    final previous = _session;
    setState(() {
      _sending = true;
      _session = {
        ...previous,
        'messages': [..._messages, {'role': 'user', 'content': text}],
      };
      _input.clear();
      _fromVoice = false;
    });
    _toBottom();
    try {
      final r = await api.post('$_path/messages', {'content': text, 'spoken': spoken}, const Duration(seconds: 75)) as Map;
      if (!mounted) return;
      setState(() => _session = Map<String, dynamic>.from(r));
      _say(_messages.last['content'] as String);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _session = previous;
        _input.text = text;
        _fromVoice = spoken;
      });
      showError(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
      _toBottom();
    }
  }

  Future<void> _assess() async {
    await _voice.stopSpeaking();
    final r = await api.post('$_path/assess', const <String, dynamic>{}, const Duration(seconds: 130)) as Map;
    if (mounted) setState(() => _session = Map<String, dynamic>.from(r));
  }

  void _toBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    });
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final done = _session['result'] != null;
    final needed = _session['answersNeeded'] as int? ?? 0;
    final canAnswer = _session['canAnswer'] != false;

    return Scaffold(
      appBar: AppBar(title: Text(done ? 'Til darajangiz' : speakingLanguages[_language]!.name)),
      body: done
          ? SpeakingResultView(session: _session)
          : Column(children: [
              Expanded(
                child: ListView(controller: _scroll, padding: const EdgeInsets.all(12), children: [
                  for (final m in _messages)
                    Align(
                      alignment: m['role'] == 'user' ? Alignment.centerRight : Alignment.centerLeft,
                      child: Card(
                        color: m['role'] == 'user' ? cs.primaryContainer : null,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Flexible(child: Text(m['content'] as String)),
                            if (m['role'] == 'assistant')
                              IconButton(tooltip: 'Qayta eshitish', icon: const Icon(Icons.volume_up_outlined), onPressed: () => _say(m['content'] as String)),
                          ]),
                        ),
                      ),
                    ),
                  if (_sending) const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator()),
                ]),
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    BusyButton(
                      tonal: true,
                      onPressed: needed > 0 || _sending || _listening ? null : _assess,
                      child: Text(needed > 0 ? 'Darajani aniqlash: yana $needed ta javob' : 'Darajamni aniqlash'),
                    ),
                    if (canAnswer) ...[
                      const SizedBox(height: 10),
                      FloatingActionButton.large(
                        heroTag: 'mic',
                        tooltip: _listening ? 'To\'xtatish' : 'Gapirish',
                        backgroundColor: _listening ? cs.error : cs.primary,
                        foregroundColor: _listening ? cs.onError : cs.onPrimary,
                        onPressed: _sending ? null : _toggleMic,
                        child: Icon(_listening ? Icons.stop : Icons.mic),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Text(_listening ? 'Tinglayapman… tugatsangiz jim turing' : 'Bosing va gapiring'),
                      ),
                      TextField(
                        controller: _input,
                        minLines: 1,
                        maxLines: 3,
                        maxLength: 2000,
                        readOnly: _listening,
                        textInputAction: TextInputAction.send,
                        onChanged: (_) => _fromVoice = false,
                        onSubmitted: (_) => _send(),
                        decoration: InputDecoration(
                          counterText: '',
                          hintText: 'yoki javobni yozing…',
                          border: const OutlineInputBorder(),
                          suffixIcon: IconButton(tooltip: 'Yuborish', icon: const Icon(Icons.send), onPressed: _sending || _listening ? null : _send),
                        ),
                      ),
                    ],
                  ]),
                ),
              ),
            ]),
    );
  }
}
