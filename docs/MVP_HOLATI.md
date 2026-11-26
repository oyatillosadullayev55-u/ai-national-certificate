# AI National Certificate — MVP holati

Sana: 2026-11-26. Milliy sertifikat imtihoniga tayyorlanish platformasi: testlar, mock imtihonlar, xatolar daftari,
bilim xaritasi va AI yordamchi. Arxitektura va to'liq yo'riqnoma — [README](../README.md).

| Qism | Texnologiya | Papka |
|---|---|---|
| API | NestJS, Prisma, PostgreSQL | `apps/api` |
| Admin panel | React, Vite | `apps/admin` |
| O'quvchi ilovasi | Flutter | `apps/mobile` |
| AI Engine | FastAPI | `services/ai-engine` |

## Ishga tushirish (Windows)

Kerak: Node.js 20+. AI uchun Python 3.10+, mobil ilova uchun Flutter.

```powershell
powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
```

Skript bazani, migratsiya va seed'ni, API, AI Engine, admin panel va ilovani ishga tushiradi. Manzillar va
development kirish ma'lumotlari README'ning "Tezkor start" bo'limida.

## Imkoniyatlar

| Imkoniyat | Izoh |
|---|---|
| Ro'yxatdan o'tish va parolni tiklash | SMS kod 2 daqiqa amal qiladi, muddati tugagach qayta yuboriladi (10 daqiqada ko'pi bilan 3 ta) |
| Mock imtihon va mashq | Development seed: 9 fanning har biriga 10 savollik namuna mock |
| Natija va xatolar daftari | Mavzular kesimida tahlil, takrorlash jadvali |
| AI Tutor, xato izohi, o'qish rejasi | Nazoratli imtihon paytida Tutor va ovozli suhbat o'chadi |
| AI savol generatori | Admin panelda; savolni boshqa ekspert tasdiqlaydi |
| Ovozli suhbat va til darajasi | Ingliz, rus, o'zbek; 3–20 ta javobdan CEFR (A1–C2) bahosi |

## Bajarilgan ishlar

### Tuzatilgan xatolar

- Javoblar yo'qolishi yoki "yuborilmadi" deb noto'g'ri ko'rinishi (offline navbat).
- Access token muddati tugagach o'quvchining tizimdan chiqib qolishi.
- Vaqt tugaganda ochiq dialog bilan avtomatik yakunlash, savollarni surishda vaqt hisobi.
- So'rov limiti IP o'rniga foydalanuvchi bo'yicha (bir sinf bitta limitni bo'lishmaydi).
- Mock "AI izoh"ning ichki prompt matnini ko'rsatishi.
- Dashboard tekshiruv navbatida o'chirilgan savollarni sanashi.

### Yangi

- Eskiz.uz SMS provayderi.
- Barcha fanlar uchun namuna savollar va mock imtihonlar.
- SMS kod taymeri va qayta yuborish.
- Ovozli suhbat va til darajasini aniqlash.
- Docker uchun `.dockerignore`, konteynerda seed, production'da zaif admin parolini rad etish.

## Sozlamalar

Haqiqiy kalit va parollarni faqat lokal `.env` fayllariga yozing — repoga qo'shmang.

**SMS** (`apps/api/.env`, Docker'da ildizdagi `.env`). Production rejimida API bularsiz ishga tushmaydi:

```env
SMS_PROVIDER=eskiz
ESKIZ_EMAIL=
ESKIZ_PASSWORD=
OTP_DEV_ECHO=false
```

**AI** (`services/ai-engine/.env`). Standart rejim `mock`:

```env
LLM_PROVIDER=anthropic
LLM_API_KEY=
```

## Mock rejim cheklovlari

- AI javoblari namunaviy; haqiqiy model javoblari emas.
- Ovozli suhbat savollari tayyor ro'yxatdan keladi.
- Til darajasi faqat javob uzunligi va so'z boyligidan taxmin qilinadi, B2 dan oshmaydi, grammatika tekshirilmaydi.
- Talaffuz hech qaysi rejimda baholanmaydi (AI faqat matnni oladi).

## Testlar

Oxirgi lokal natijalar:

| Tekshiruv | Natija |
|---|---|
| API unit testlari | 43/43 |
| API xavfsizlik e2e | 13/13 |
| AI Engine | 26/26 |
| Flutter analyze va testlar | toza, 11/11 |

**Hali sinalmagan:** haqiqiy SMS yuborish, haqiqiy AI model, haqiqiy mikrofon va ovoz chiqarish, Docker image
yig'ish, Android va iOS build.

## Ommaga chiqarishdan oldin

- [ ] Eskiz hisobi: test holatidan chiqarish, SMS shablonini tasdiqlatish, balans.
- [ ] AI kaliti va haqiqiy javoblar sifatini tekshirish.
- [ ] Ekspert tasdiqlagan savollar bazasi (namuna savollar production'ga qo'shilmaydi va tekshirilmagan).
- [ ] Foydalanish shartlari va maxfiylik siyosati (brauzer nutqni tanishda ovozni o'z xizmatiga yuborishi mumkinligi bilan).
- [ ] Yuborilmagan SMS urinishlari OTP limitiga kirmasligi.
- [ ] CI workflow'ni GitHub'ga qo'shish (README'dagi CI belgisi hozircha ishlamaydi).
- [ ] Docker va mobil build'larni sinash.

## Pull request'lar

1. [#1 — MVP tuzatishlari, SMS, namuna mocklar](https://github.com/oyatillosadullayev55-u/ai-national-certificate/pull/1)
2. [#2 — Ovozli suhbat va til darajasi](https://github.com/oyatillosadullayev55-u/ai-national-certificate/pull/2) (#1 ustida; avval #1 merge qilinadi)
