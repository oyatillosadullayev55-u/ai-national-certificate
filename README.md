# AI National Certificate — MVP

[![CI](https://github.com/oyatillosadullayev55-u/ai-national-certificate/actions/workflows/ci.yml/badge.svg)](https://github.com/oyatillosadullayev55-u/ai-national-certificate/actions/workflows/ci.yml)

O'zbekistondagi milliy sertifikat imtihoniga tayyorlanish platformasi: testlar, xatolar daftari, bilim xaritasi va Claude asosidagi AI yordamchi.

PRD v1.0 asosida: **Modular Monolith (NestJS) + mustaqil AI Engine (FastAPI) + React admin + Flutter student ilova**.

## Tezkor start (Windows, bitta buyruq)

Kerak: **Node.js 20+**. Ixtiyoriy: **Python 3.10+** (AI Engine), **Flutter** (mobil ilova Chrome'da).

```powershell
powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
```

Skript o'rnatishsiz PostgreSQL'ni (port 5433) ishga tushiradi, `.env` fayllarni sirlar bilan yaratadi, migratsiya va seed'ni bajaradi, so'ng barcha xizmatlarni alohida oynalarda ochadi. Development seed har bir fanga 10 ta namuna savol va mock imtihon qo'shadi (`apps/api/prisma/demo-content.ts`; ekspert tekshiruvidan o'tmagan, production'ga qo'shilmaydi):

| Xizmat | Manzil |
|---|---|
| Admin panel | http://localhost:5173 — `+998900000000` / `ChangeMe123!` |
| Flutter ilova | http://localhost:5180 — yangi o'quvchi sifatida ro'yxatdan o'ting (SMS kod ekranda chiqadi) |
| API + Swagger | http://localhost:3000/api/docs |
| AI Engine | http://localhost:8000/health |

> Seed admin paroli faqat development uchun. Production'da `SEED_ADMIN_PASSWORD` ni albatta o'zgartiring.

## AI imkoniyatlari (Claude)

| Funksiya | Kim uchun | Qayerda |
|---|---|---|
| **AI Tutor** — masalani bosqichma-bosqich tushuntiradi, tayyor javob bermaydi | O'quvchi | mobil: AI Tutor |
| **Xato izohi** — ekspert yechimiga tayangan holda | O'quvchi | mobil: natija ekrani |
| **Shaxsiy o'qish rejasi** — zaif mavzular, natijalar va xatolar asosida 7 kunlik reja | O'quvchi | mobil: Bosh sahifa → AI shaxsiy reja |
| **AI savol generatori** — mavzu bo'yicha yechimi bilan qoralamalar; ekspert tasdiqlaydi (4 ko'z) | Kontent jamoasi | admin: AI savol yaratish |
| **Ovozli suhbat va til darajasi** — ingliz / rus / o'zbek tilida suhbat, CEFR (A1–C2) bo'yicha baho va tavsiyalar. Talaffuz baholanmaydi | O'quvchi | mobil: AI Tutor → Ovozli suhbat |

`mock` rejimda suhbat savollari tayyor ro'yxatdan keladi, daraja esa faqat javob uzunligi va so'z boyligidan taxminan hisoblanadi — haqiqiy baholash uchun Claude ulang.

Standart holatda `LLM_PROVIDER=mock` — tashqi API chaqirilmaydi, namunaviy javoblar qaytadi. Claude'ni ulash uchun `services/ai-engine/.env`:

```env
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-...          # https://console.anthropic.com
LLM_MODEL=claude-sonnet-5-5
```

Xavfsizlik: prompt injection filtri, `<untrusted>` bilan o'ralgan foydalanuvchi matni, tizim promptining sizib chiqishini tekshirish, server tomonidagi refusal fallback, nazoratli imtihon paytida AI o'chadi, o'quvchilar uchun kunlik limit.

## SMS (OTP kod)

Provayder `SMS_PROVIDER` bilan tanlanadi (Docker'da — ildizdagi `.env`, lokal ishga tushirishda — `apps/api/.env`):

| O'zgaruvchi | Standart | Izoh |
|---|---|---|
| `SMS_PROVIDER` | `console` | `console` — SMS yubormaydi, kod API logiga chiqadi (faqat development). `eskiz` — [Eskiz.uz](https://eskiz.uz/sms) |
| `ESKIZ_EMAIL` | — | Eskiz kabinetidagi email (`eskiz` uchun majburiy) |
| `ESKIZ_PASSWORD` | — | API paroli (`eskiz` uchun majburiy); repoga yozmang |
| `ESKIZ_FROM` | `4546` | Jo'natuvchi: `4546` yoki tasdiqlangan nikingiz |
| `ESKIZ_TIMEOUT_MS` | `10000` | Har bir HTTP so'rov uchun |

`NODE_ENV=production` da API `SMS_PROVIDER=eskiz` va ikkala kirish ma'lumotisiz ishga tushmaydi. Adapter tokenni o'zi oladi va 30 kunlik muddati tugashidan oldin yangilaydi; yuborib bo'lmasa, mijozga `503` qaytadi, sababi logga yoziladi (kod va to'liq raqamsiz).

Ishga tushirishdan oldin Eskiz tomonida:

1. Hisobni test holatidan chiqaring — test holatida faqat Eskiz'ning namunaviy matnlari yuboriladi, OTP kod yetib bormaydi ([API hujjati](https://documenter.getpostman.com/view/663428/RzfmES4z)).
2. `AI National Certificate tasdiqlash kodi: 123456` matnini kabinetda shablon sifatida moderatsiyadan o'tkazing. Matn `apps/api/src/auth/auth.service.ts` da — o'zgartirsangiz, shablonni ham yangilang.
3. Balansni to'ldiring va o'z raqamingizga bitta haqiqiy ro'yxatdan o'tish bilan tekshiring.

## MVP qabul mezonlari (PRD 13)

| Mezon | Qayerda |
|---|---|
| Foydalanuvchi ro'yxatdan o'ta oladi | `auth/` (SMS OTP, parolni tiklash), mobil: `screens/auth/` |
| Barcha fanlar katalogda | seed: 9 ta fan; admin: Fanlar sahifasi |
| Fan va mavzular boshqariladi | admin: Fanlar va mavzular (daraxt + Knowledge Graph) |
| Savol qo'shish va tasdiqlash | admin: Savollar, Tekshiruv navbati, Import (JSON/CSV) |
| O'quvchi test topshiradi | mobil: Testlar → test ekrani (taymer, navigatsiya, belgilash) |
| Javoblar serverda to'g'ri saqlanadi | idempotent `PUT /attempts/:id/answers/:qv` + offline navbat |
| Natijalar hisoblanadi | deterministik baholash + mavzular kesimida tahlil |
| Xatolar daftari | avtomatik yoziladi, SM-2 takrorlash, mobil ekran |
| AI Tutor javob beradi | AI Engine + mobil chat; imtihon paytida o'chadi |
| AI izohlari manbalar bilan | izoh ekspert yechimiga tayanadi, manba qaytariladi |
| Admin savollarni boshqaradi | `apps/admin` |
| Mobil ekranlarda test ishlaydi | `apps/mobile` (Flutter) |
| RBAC va tenant isolation | guard + resurs tekshiruvlari, `test/security.e2e-spec.ts` |
| Monitoring va backup | `/api/v1/metrics` + Prometheus/Grafana, shifrlangan kunlik backup |
| Kritik xavfsizlik testlari | e2e: IDOR, tenant, javob kaliti sizishi, token o'g'irlash, 4 ko'z |

```
anc/
├── apps/admin/               React + Vite admin panel
├── apps/mobile/              Flutter student ilova (README ichida)
├── ops/backup/               pg_dump + GPG, restore sinovi
├── ops/monitoring/           Prometheus + alert qoidalari
├── apps/api/                 NestJS + Prisma + PostgreSQL
│   ├── prisma/schema.prisma  ERD (tahlildagi tuzatishlar bilan)
│   ├── prisma/seed.ts        rollar, ruxsatlar, 9 ta fan, admin, namuna savollar, tariflar
│   └── src/
│       ├── common/           prisma, RBAC guard, access (tenant/resurs), audit, xato filtri, request-id
│       ├── auth/             OTP, register, login, refresh rotation, sessiyalar
│       ├── users/            profil, onboarding (fanlar, imtihon sanasi)
│       ├── organizations/    markaz, filial, a'zolar, guruhlar, guruh tahlili
│       ├── subjects/ topics/ fanlar, mavzular daraxti, Knowledge Graph (sikl tekshiruvi), imtihon spetsifikatsiyasi
│       ├── questions/        12 savol turi, versiyalash, ekspert tekshiruvi (4 ko'z), import
│       ├── answer-evaluation/ deterministik baholash (+ unit testlar)
│       ├── exam/             testlar, topshiriqlar, attempt lifecycle (start → answers → submit → result)
│       ├── error-notebook/   Smart Error Notebook + SM-2 spaced repetition
│       ├── progress/         dashboard, knowledge map, ota-ona ↔ farzand bog'lanishi
│       └── ai-tutor/         AI Gateway client, tutor suhbatlari, xato izohi
└── services/ai-engine/       FastAPI: gateway (fallback), agents, safety, prompts
```

## Ishga tushirish

```bash
cp .env.example .env            # sirlarni to'ldiring: openssl rand -base64 48
docker compose up -d postgres

cd apps/api
npm install
npx prisma migrate dev --name init   # birinchi migratsiyani yaratadi — commit qiling
npm run seed
npm run start:dev                     # http://localhost:3000/api/docs (Swagger)

cd ../../services/ai-engine
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Hammasini Docker'da (production rejimi):

```bash
docker compose up -d --build
# Birinchi marta: rollar, fanlar, admin va tariflar (.env da kuchli SEED_ADMIN_PASSWORD bo'lishi shart)
docker compose exec api npm run seed
```

Production seed namuna savollarni qo'shmaydi. Production rejimida `.env` da `SMS_PROVIDER=eskiz`, `ESKIZ_EMAIL` va `ESKIZ_PASSWORD` bo'lishi shart, aks holda API ishga tushmaydi (yuqoridagi "SMS" bo'limi).
Monitoring bilan: `docker compose --profile monitoring up -d` → Prometheus :9090, Grafana :3001.

**Admin panel:** `cd apps/admin && npm install && npm run dev` → http://localhost:5173
(seed admin: `SEED_ADMIN_PHONE` / `SEED_ADMIN_PASSWORD`). Muallif o'z savolini tasdiqlay olmaydi —
Foydalanuvchilar sahifasida kamida bitta odamga `subject_expert` roli bering.

**Mobil ilova:** `apps/mobile/README.md`.

Development'da (`SMS_PROVIDER=console`, standart) SMS yuborilmaydi — OTP kod API logida chiqadi.
`LLM_PROVIDER=mock` bo'lsa AI Engine tashqi API'ga murojaat qilmaydi.

## Testlar

```bash
cd apps/api && npm test          # baholash, SM-2, DI/route yig'ilishi, Eskiz adapteri (HTTP mock)
cd apps/api && OTP_DEV_ECHO=true npm run test:e2e   # xavfsizlik e2e (haqiqiy PostgreSQL + seed kerak)
cd apps/mobile && flutter test
cd services/ai-engine && pytest  # injection himoyasi, prompt sizishi, fallback
```

## Asosiy oqim (Student)

| Qadam | Endpoint |
|---|---|
| OTP | `POST /api/v1/auth/send-otp` → `POST /auth/verify-otp` |
| Ro'yxat | `POST /auth/register` (`accountType: student/teacher/parent`) |
| Onboarding | `PUT /users/me/subjects`, `PATCH /users/me/student-profile` |
| Mashq | `POST /tests/practice` → darhol attempt qaytadi |
| Javob | `PUT /attempts/:id/answers/:questionVersionId` (idempotent) |
| Yakunlash | `POST /attempts/:id/submit` (idempotent) → natija, mavzular kesimida |
| Xatolar | `GET /error-notebook?due=true`, `POST /error-notebook/:id/retry` |
| Bilim xaritasi | `GET /students/me/knowledge-map?subjectId=` |
| AI | `POST /ai/tutor/conversations/:id/messages`, `POST /ai/explanations` |
| AI reja | `POST /ai/study-plan` → saqlanadi, `GET /ai/study-plan` |
| AI savollar (admin) | `POST /ai/questions/generate` → `POST /ai/questions/save` (`IN_REVIEW`) |

## PRD talablari qanday bajarilgan

- **Javob kaliti mijozga yuborilmaydi**: `toStudentView()` — `isCorrect`, `answerKey`, yechim olib tashlanadi; ORDERING/MATCHING tartibi aralashtiriladi.
- **Vaqt serverda**: `deadlineAt` + `EXAM_GRACE_SEC`; muddati o'tgan urinishlar har daqiqada avtomatik yopiladi.
- **Offline**: `clientUpdatedAt` — kech kelgan eski javob yangisini bosib ketmaydi.
- **Idempotentlik**: `answers (attemptId, questionVersionId)` unique + `updateMany(status=IN_PROGRESS)` bilan bir martalik yakunlash.
- **Savol versiyasi urinishda saqlanadi**: test va javoblar `question_versions`ga bog'langan; tasdiqlangan versiya o'zgartirilmaydi.
- **Import avtomatik nashr qilinmaydi**: `IN_REVIEW` holatiga tushadi; muallif o'z savolini tasdiqlay olmaydi.
- **RBAC + tenant**: rollar global yoki tashkilot doirasida; `@RequirePermissions(..., { orgFrom })`; resurs darajasida teacher↔student, parent↔child tekshiruvi.
- **AI imtihonda yopiq**: MOCK/DIAGNOSTIC/TEACHER_ASSIGNMENT davomida tutor javob bermaydi; izoh faqat yakunlangandan keyin.
- **Rasmiy ball ko'rsatilmaydi**: natijada `disclaimer`; IRT uchun `question_statistics` birinchi kundan yig'iladi.
- **Refresh token rotation**: qayta ishlatilgan token aniqlansa sessiya bekor qilinadi.

## MVP'dan keyin (PRD 5–8-bosqichlar)

- Click/Payme webhooklari va obuna limitlarini qo'llash (sxema tayyor: `payments.provider+providerTransactionId` unique)
- Zaxira SMS provayder (Playmobile) adapteri — `SmsProvider` interfeysi tayyor, Eskiz.uz ulangan
- Media yuklash (S3 signed URL) — rasmli savollar uchun
- BullMQ worker: bildirishnomalar, embedding, imtihon sweeper
- RAG, adaptiv test, Rasch/IRT (AI o'qish rejasi MVP'da tayyor)
- AI javoblarini streaming qilish, AI savol generatorida MATCHING/ORDERING turlari
- Teacher / Center web portali (API tayyor: tashkilot, guruh, topshiriq, guruh tahlili), ota-ona ilovasi
- Gamifikatsiya, leaderboard, support, Sentry
