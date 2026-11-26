import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:speech_to_text/speech_to_text.dart';

/// Suhbat tillari: kod → (ko'rinadigan nom, brauzer/qurilma lokali)
const speakingLanguages = <String, ({String name, String locale})>{
  'en': (name: 'Ingliz tili', locale: 'en-US'),
  'ru': (name: 'Rus tili', locale: 'ru-RU'),
  'uz': (name: "O'zbek tili", locale: 'uz-UZ'),
};

/// Qurilma (yoki brauzer) ovoz xizmatlari: nutqni matnga o'girish va matnni o'qib berish.
class Voice {
  final _stt = SpeechToText();
  final _tts = FlutterTts();
  void Function(String? error)? _onDone;

  /// Tinglashni boshlaydi. [onDone] har bir tinglash uchun bir marta chaqiriladi.
  /// `false` — mikrofon yoki nutqni tanish mavjud emas.
  Future<bool> listen(String language, {required void Function(String text) onText, required void Function(String? error) onDone}) async {
    try {
      final ready = await _stt.initialize(
        onStatus: (status) {
          if (status == SpeechToText.doneStatus) _finish(null);
        },
        onError: (e) => _finish(e.errorMsg),
      );
      if (!ready) return false;
      _onDone = onDone;
      final locale = speakingLanguages[language]!.locale;
      await _stt.listen(
        onResult: (r) {
          if (_onDone == null) return;
          onText(r.recognizedWords);
          if (r.finalResult) _finish(null);
        },
        listenOptions: SpeechListenOptions(
          localeId: kIsWeb ? locale : locale.replaceAll('-', '_'),
          listenMode: ListenMode.dictation,
          partialResults: true,
          cancelOnError: true,
          pauseFor: const Duration(seconds: 4), // o'ylab olish uchun
          listenFor: const Duration(seconds: 90),
        ),
      );
      return true;
    } catch (_) {
      _onDone = null;
      return false;
    }
  }

  void _finish(String? error) {
    final done = _onDone;
    _onDone = null;
    done?.call(error);
  }

  Future<void> stopListening() async {
    try {
      await _stt.stop();
    } catch (_) {}
  }

  /// `false` — qurilmada bu til uchun ovoz yo'q (boshqa tildagi ovoz bilan o'qimaymiz)
  Future<bool> speak(String text, String language) async {
    final locale = speakingLanguages[language]!.locale;
    try {
      var available = await _tts.isLanguageAvailable(locale) == true;
      if (!available) {
        // Brauzer ovozlar ro'yxatini kechikib yuklaydi
        await Future<void>.delayed(const Duration(milliseconds: 600));
        available = await _tts.isLanguageAvailable(locale) == true;
      }
      if (!available) return false;
      await _tts.stop();
      await _tts.setLanguage(locale);
      await _tts.setSpeechRate(kIsWeb ? 0.95 : 0.48);
      await _tts.speak(text);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> stopSpeaking() async {
    try {
      await _tts.stop();
    } catch (_) {}
  }

  /// Ekran yopilganda
  Future<void> dispose() async {
    _onDone = null;
    try {
      await _stt.cancel();
    } catch (_) {}
    await stopSpeaking();
  }

  static String errorText(String code) {
    if (code.contains('not-allowed') || code.contains('permission')) return 'Mikrofonga ruxsat bering';
    if (code.contains('network')) return 'Nutqni tanish xizmatiga ulanib bo\'lmadi. Chrome brauzerida oching yoki javobni yozing';
    if (code.contains('no-speech') || code.contains('no_match') || code.contains('timeout')) return 'Ovoz eshitilmadi. Qayta urinib ko\'ring';
    if (code.contains('language')) return 'Qurilmangiz bu tilni tanimaydi. Javobni yozishingiz mumkin';
    return 'Mikrofon ishlamadi ($code). Javobni yozishingiz mumkin';
  }
}
