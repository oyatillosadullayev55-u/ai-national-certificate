# ANC — Flutter student ilovasi

Ekranlar: kirish / ro'yxatdan o'tish (SMS OTP) / parolni tiklash → onboarding (fanlar, maqsad, imtihon sanasi) →
Bosh sahifa · Fanlar (bilim xaritasi) · Testlar (testlar, topshiriqlar, tarix) · AI Tutor · Profil,
test ekrani (taymer, navigatsiya, belgilash, offline navbat), natija (mavzular, yechimlar, AI izoh), xatolar daftari.

## Ishga tushirish

Repoda faqat `lib/`, `test/` va `pubspec.yaml` bor — platforma papkalarini bir marta yarating:

```bash
cd apps/mobile
flutter create --platforms=android,ios --org uz.anc .   # mavjud fayllarni o'zgartirmaydi
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:3000/api/v1   # Android emulyator
# Haqiqiy telefon: API_URL=http://<kompyuter-IP>:3000/api/v1
```

`android/app/src/main/AndroidManifest.xml` ga qo'shing:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<!-- android:usesCleartextTraffic faqat development (http) uchun. Production'da HTTPS ishlating va uni olib tashlang -->
<application
    android:usesCleartextTraffic="true"
    ...>
```

Development'da SMS kelmaydi: API'ni `OTP_DEV_ECHO=true` bilan ishga tushirsangiz, kod ilovada xabar sifatida chiqadi.
Aks holda kod API logida ko'rinadi.

## Testlar

```bash
flutter analyze
flutter test
```

## Tuzilma

```
lib/
  core/      api_client (refresh token rotation), session, answer_queue (offline), config
  widgets/   math_text (LaTeX $...$), question_input (barcha savol turlari), common
  screens/   auth/, onboarding, home_shell, dashboard, subjects, tests, test, result, error_notebook, ai_tutor, profile
```
