/**
 * Faqat development uchun namuna kontent: har bir fanga 10 ta savol va 1 ta mock imtihon.
 * Ekspert tekshiruvidan o'tmagan — production'da ishlatilmaydi (seed.ts ga qarang).
 */
import { Prisma, PrismaClient, QuestionType } from '@prisma/client';

type Item = { type: QuestionType; stem: string; options?: string[]; value?: number | boolean; solution: string };

/** Variantlardan birinchisi — to'g'ri javob (bazaga yozishda o'rni almashtiriladi) */
const c = (stem: string, options: string[], solution: string): Item => ({ type: 'SINGLE_CHOICE', stem, options, solution });
const num = (stem: string, value: number, solution: string): Item => ({ type: 'NUMERIC', stem, value, solution });
const tf = (stem: string, value: boolean, solution: string): Item => ({ type: 'TRUE_FALSE', stem, value, solution });

const DEMO: { code: string; topics: { name: string; items: Item[] }[] }[] = [
  {
    code: 'math',
    topics: [
      {
        name: 'Funksiyalar',
        items: [
          c("$f(x) = 3x - 2$ bo'lsa, $f(4)$ nechaga teng?", ['10', '12', '14', '6'], '$f(4) = 3 \\cdot 4 - 2 = 10$.'),
          c("$y = 2x + 5$ to'g'ri chiziq $Oy$ o'qini qaysi nuqtada kesadi?", ['(0; 5)', '(5; 0)', '(0; 2)', '(0; -5)'], "$x = 0$ bo'lganda $y = 5$."),
          num('$g(x) = x^2 + 1$ bo\'lsa, $g(-3)$ ni toping.', 10, '$g(-3) = 9 + 1 = 10$.'),
          tf("$y = -4x + 1$ funksiya o'suvchi.", false, "Burchak koeffitsiyenti manfiy ($-4$), demak funksiya kamayuvchi."),
          c('$y = x^2 - 6x + 5$ funksiyaning nollari qaysilar?', ['1 va 5', '-1 va -5', '2 va 3', '0 va 6'], '$(x - 1)(x - 5) = 0$.'),
        ],
      },
      {
        name: 'Uchburchaklar',
        items: [
          num("To'g'ri burchakli uchburchakning katetlari 6 va 8. Gipotenuzani toping.", 10, '$\\sqrt{36 + 64} = 10$.'),
          c("Uchburchak ichki burchaklarining yig'indisi nechaga teng?", ['180°', '90°', '270°', '360°'], "Har qanday uchburchakda yig'indi 180°."),
          c("Asosi 10, shu asosga tushirilgan balandligi 6 bo'lgan uchburchakning yuzi:", ['30', '60', '16', '15'], '$S = \\frac{10 \\cdot 6}{2} = 30$.'),
          tf("Teng tomonli uchburchakning har bir burchagi 60° ga teng.", true, '$180° : 3 = 60°$.'),
          c("Ikki burchagi 35° va 65° bo'lgan uchburchakning uchinchi burchagi:", ['80°', '100°', '90°', '70°'], '$180° - 35° - 65° = 80°$.'),
        ],
      },
    ],
  },
  {
    code: 'physics',
    topics: [
      {
        name: 'Mexanika',
        items: [
          c('Xalqaro birliklar tizimida (SI) kuch birligi qaysi?', ['Nyuton', 'Joul', 'Vatt', 'Paskal'], "Kuch nyutonda (N) o'lchanadi."),
          num("Avtomobil 150 km yo'lni 3 soatda bosib o'tdi. O'rtacha tezligi necha km/soat?", 50, '$150 : 3 = 50$ km/soat.'),
          num("Massasi 4 kg bo'lgan jismga 3 m/s² tezlanish berayotgan kuch necha nyuton?", 12, '$F = ma = 4 \\cdot 3 = 12$ N.'),
          c('Nyutonning ikkinchi qonuni formulasi:', ['$F = ma$', '$F = \\frac{m}{a}$', '$F = m + a$', '$F = \\frac{a}{m}$'], "Kuch massa va tezlanish ko'paytmasiga teng."),
          c("Massasi 2 kg, tezligi 3 m/s bo'lgan jismning kinetik energiyasi:", ['9 J', '6 J', '18 J', '3 J'], '$E = \\frac{mv^2}{2} = \\frac{2 \\cdot 9}{2} = 9$ J.'),
        ],
      },
      {
        name: 'Elektr toki',
        items: [
          c("Zanjir qismi uchun Om qonuni qaysi javobda to'g'ri yozilgan?", ['$I = U / R$', '$I = UR$', '$I = R / U$', '$I = U + R$'], "Tok kuchi kuchlanishga to'g'ri, qarshilikka teskari proporsional."),
          num("Qarshiligi 5 Ω bo'lgan o'tkazgichga 20 V kuchlanish berilgan. Tok kuchi necha amper?", 4, '$I = 20 : 5 = 4$ A.'),
          c('Elektr quvvatining birligi:', ['Vatt', 'Volt', 'Amper', 'Om'], "Quvvat vattda (W) o'lchanadi."),
          tf("Rezistorlar ketma-ket ulanganda umumiy qarshilik qarshiliklar yig'indisiga teng.", true, '$R = R_1 + R_2 + \\dots$'),
          c("Tok kuchini o'lchaydigan asbob:", ['Ampermetr', 'Voltmetr', 'Barometr', 'Dinamometr'], 'Ampermetr zanjirga ketma-ket ulanadi.'),
        ],
      },
    ],
  },
  {
    code: 'chemistry',
    topics: [
      {
        name: 'Atom tuzilishi',
        items: [
          c('Natriyning kimyoviy belgisi:', ['Na', 'N', 'Ne', 'Ni'], 'Na — natriy.'),
          num('Uglerod atomining yadrosida nechta proton bor?', 6, 'Uglerodning tartib raqami 6.'),
          c('Atom yadrosi qaysi zarralardan tashkil topgan?', ['Proton va neytronlar', 'Proton va elektronlar', 'Faqat elektronlar', 'Neytron va elektronlar'], 'Elektronlar yadro atrofida joylashadi.'),
          c('Inert (nodir) gazni ko\'rsating:', ['Geliy', 'Vodorod', 'Kislorod', 'Azot'], 'Geliy VIII guruh elementi.'),
          tf('Elektron musbat zaryadlangan zarra.', false, 'Elektron manfiy zaryadlangan.'),
        ],
      },
      {
        name: 'Moddalar va birikmalar',
        items: [
          num("Suvning ($H_2O$) nisbiy molekulyar massasini toping ($H = 1$, $O = 16$).", 18, '$2 \\cdot 1 + 16 = 18$.'),
          num('$CO_2$ ning nisbiy molekulyar massasi nechaga teng ($C = 12$, $O = 16$)?', 44, '$12 + 2 \\cdot 16 = 44$.'),
          c('Neytral muhitda pH qiymati (25 °C da):', ['7', '0', '1', '14'], "pH = 7 — neytral muhit."),
          c('Osh tuzining formulasi:', ['$NaCl$', '$KCl$', '$Na_2CO_3$', '$CaCl_2$'], 'Osh tuzi — natriy xlorid.'),
          c('$HCl$ qaysi sinf birikmasiga kiradi?', ['Kislota', 'Asos', 'Oksid', "O'rta tuz"], 'HCl — xlorid kislota.'),
        ],
      },
    ],
  },
  {
    code: 'biology',
    topics: [
      {
        name: 'Hujayra',
        items: [
          c('Hujayraning «energiya stansiyasi» deb ataladigan organoid:', ['Mitoxondriya', 'Ribosoma', 'Lizosoma', 'Golji apparati'], "Mitoxondriyada ATF hosil bo'ladi."),
          c('Irsiy axborot asosan qaysi molekulada saqlanadi?', ['DNK', 'Glyukoza', "Yog'", 'ATF'], 'DNK irsiy axborot tashuvchisi.'),
          c('Oqsil sintezi qaysi organoidda amalga oshadi?', ['Ribosoma', 'Lizosoma', 'Vakuola', 'Sentriola'], 'Ribosomalar oqsil sintezlaydi.'),
          tf("Bakteriya hujayrasida shakllangan yadro bo'lmaydi.", true, 'Bakteriyalar prokariotlardir.'),
          c('Fotosintez qaysi organoidda boradi?', ['Xloroplast', 'Mitoxondriya', 'Yadro', 'Ribosoma'], "Xlorofill xloroplastlarda joylashgan."),
        ],
      },
      {
        name: 'Hayotiy jarayonlar',
        items: [
          num("Sog'lom odamning tana hujayrasida nechta xromosoma bor?", 46, '23 juft — 46 ta.'),
          c('Fotosintez jarayonida atmosferaga qaysi gaz ajraladi?', ['Kislorod', 'Azot', 'Karbonat angidrid', 'Vodorod'], 'Suvning parchalanishidan kislorod ajraladi.'),
          c('Qonda kislorod tashuvchi oqsil:', ['Gemoglobin', 'Insulin', 'Pepsin', 'Keratin'], 'Gemoglobin eritrotsitlarda joylashgan.'),
          c("Insulin gormonini qaysi a'zo ishlab chiqaradi?", ["Me'da osti bezi", 'Jigar', 'Buyrak', 'Taloq'], "Insulin me'da osti bezida sintezlanadi."),
          tf("Odam yuragi to'rt kamerali.", true, "Ikki bo'lmacha va ikki qorincha."),
        ],
      },
    ],
  },
  {
    code: 'history',
    topics: [
      {
        name: "O'zbekiston tarixi",
        items: [
          num("Amir Temur nechanchi yilda tug'ilgan?", 1336, 'Amir Temur 1336-yilda tug\'ilgan.'),
          c('Amir Temur davlatining poytaxti:', ['Samarqand', 'Buxoro', 'Xiva', 'Toshkent'], 'Poytaxt — Samarqand.'),
          num("O'zbekiston Respublikasi mustaqilligi nechanchi yilda e'lon qilingan?", 1991, "Mustaqillik 1991-yilda e'lon qilingan."),
          c('Samarqandda mashhur rasadxona qurdirgan hukmdor:', ["Mirzo Ulug'bek", 'Shohrux Mirzo', 'Husayn Boyqaro', 'Zahiriddin Muhammad Bobur'], "Rasadxonani Mirzo Ulug'bek qurdirgan."),
          c('Hindistonda Boburiylar davlatiga asos solgan shaxs:', ['Zahiriddin Muhammad Bobur', 'Akbarshoh', 'Humoyun', 'Shayboniyxon'], 'Bobur 1526-yilda davlatga asos solgan.'),
        ],
      },
      {
        name: 'Tarixiy voqea va shaxslar',
        items: [
          c("Mo'g'ul bosqinchilariga qarshi kurashgan Xorazmshoh:", ['Jaloliddin Manguberdi', 'Spitamen', 'Muqanna', "To'maris"], 'Jaloliddin Manguberdi — XIII asr sarkardasi.'),
          num('Ikkinchi jahon urushi nechanchi yilda tugagan?', 1945, 'Urush 1945-yilda tugagan.'),
          num('Xristofor Kolumb Amerikaga birinchi marta nechanchi yilda yetib borgan?', 1492, 'Birinchi ekspeditsiya — 1492-yil.'),
          tf('Birinchi jahon urushi 1914-yilda boshlangan.', true, '1914–1918-yillar.'),
          c("«Al-jabr» asari bilan algebra faniga asos solgan olim:", ['Muhammad al-Xorazmiy', 'Abu Rayhon Beruniy', 'Abu Ali ibn Sino', "Ahmad al-Farg'oniy"], '«Algebra» atamasi shu asar nomidan olingan.'),
        ],
      },
    ],
  },
  {
    code: 'geography',
    topics: [
      {
        name: 'Tabiiy geografiya',
        items: [
          c('Yer yuzidagi eng katta okean:', ['Tinch okeani', 'Atlantika okeani', 'Hind okeani', 'Shimoliy Muz okeani'], 'Tinch okeani maydoni eng katta.'),
          c("Dengiz sathidan eng baland cho'qqi:", ['Everest (Jomolungma)', 'Kilimanjaro', 'Elbrus', 'Monblan'], 'Everest balandligi 8849 m.'),
          c("Maydoni bo'yicha eng katta materik:", ['Yevrosiyo', 'Afrika', 'Shimoliy Amerika', 'Antarktida'], 'Yevrosiyo — eng katta materik.'),
          tf('Ekvator Yer sharini Shimoliy va Janubiy yarimsharlarga ajratadi.', true, 'Ekvator — 0° kenglik chizig\'i.'),
          tf("Grinvich meridiani 180° uzunlikdan o'tadi.", false, 'Grinvich meridiani — boshlang\'ich (0°) meridian.'),
        ],
      },
      {
        name: "O'zbekiston va dunyo",
        items: [
          num("O'zbekiston nechta davlat bilan chegaradosh?", 5, "Qozog'iston, Qirg'iziston, Tojikiston, Afg'oniston, Turkmaniston."),
          c('Amudaryo va Sirdaryo qaysi havzaga tegishli?', ['Orol dengizi', 'Kaspiy dengizi', 'Hind okeani', "Balxash ko'li"], "Ikkala daryo Orol havzasiga kiradi."),
          c("Maydoni bo'yicha dunyodagi eng katta davlat:", ['Rossiya', 'Kanada', 'Xitoy', 'AQSh'], 'Rossiya maydoni eng katta.'),
          c("O'zbekiston va Qozog'iston hududida joylashgan yirik cho'l:", ['Qizilqum', 'Sahroi Kabir', 'Gobi', 'Atakama'], "Qizilqum Amudaryo va Sirdaryo oralig'ida."),
          tf("O'zbekiston okeanga to'g'ridan-to'g'ri chiqa olmaydigan davlat.", true, "O'zbekistonning okeanga chiqish yo'li yo'q."),
        ],
      },
    ],
  },
  {
    code: 'uzbek_lit',
    topics: [
      {
        name: 'Grammatika',
        items: [
          c("«Kitob» so'zi qaysi so'z turkumiga mansub?", ['Ot', 'Sifat', "Fe'l", 'Son'], "Narsa nomini bildiradi — ot."),
          c("«Chiroyli» so'zi qaysi so'z turkumiga mansub?", ['Sifat', 'Ot', 'Ravish', 'Olmosh'], 'Belgi bildiradi — sifat.'),
          c("Quyidagilardan fe'lni toping:", ['yugurdi', 'tez', 'uchta', "bog'"], "Harakat bildiradi — fe'l."),
          num("Lotin yozuviga asoslangan o'zbek alifbosida nechta unli harf bor?", 6, "a, e, i, o, u, o' — 6 ta."),
          tf("«-lar» qo'shimchasi ko'plik ma'nosini bildiradi.", true, "Masalan: kitob — kitoblar."),
        ],
      },
      {
        name: 'Adabiyot',
        items: [
          c("Turkiy (eski o'zbek) tilda «Xamsa» yaratgan shoir:", ['Alisher Navoiy', 'Zahiriddin Muhammad Bobur', 'Lutfiy', 'Mashrab'], 'Navoiy «Xamsa»sini XV asrda yozgan.'),
          c("«O'tkan kunlar» romanining muallifi:", ['Abdulla Qodiriy', "Cho'lpon", 'Oybek', "G'afur G'ulom"], 'Birinchi o\'zbek romani muallifi — Abdulla Qodiriy.'),
          num("Alisher Navoiy «Xamsa»si nechta dostondan iborat?", 5, '«Xamsa» — beshlik.'),
          c('«Boburnoma» asarining muallifi:', ['Zahiriddin Muhammad Bobur', 'Alisher Navoiy', "Abulg'ozi Bahodirxon", 'Ogahiy'], 'Asar Boburning xotiralaridir.'),
          c("«Katta» so'zining antonimi:", ['kichik', 'ulkan', 'baland', 'keng'], "Qarama-qarshi ma'no — kichik."),
        ],
      },
    ],
  },
  {
    code: 'russian',
    topics: [
      {
        name: 'Грамматика',
        items: [
          c('Какого рода существительное «окно»?', ['Среднего', 'Мужского', 'Женского', 'Общего'], '«Окно» — оно, средний род.'),
          num('Сколько падежей в русском языке (по школьной программе)?', 6, 'Именительный, родительный, дательный, винительный, творительный, предложный.'),
          c('К какой части речи относится слово «бежать»?', ['Глагол', 'Существительное', 'Прилагательное', 'Наречие'], 'Обозначает действие — глагол.'),
          c('Укажите правильную форму множественного числа слова «стул»:', ['стулья', 'стулы', 'стули', 'стулов'], 'Один стул — несколько стульев, стулья.'),
          c('Укажите слово, написанное правильно:', ['жизнь', 'жызнь', 'шына', 'чяща'], '«Жи», «ши» пиши с буквой «и».'),
        ],
      },
      {
        name: 'Лексика и литература',
        items: [
          tf('Слово «мышь» — мужского рода.', false, '«Мышь» — женского рода.'),
          c('Подберите антоним к слову «высокий»:', ['низкий', 'длинный', 'широкий', 'большой'], 'Высокий — низкий.'),
          c('Кто автор романа в стихах «Евгений Онегин»?', ['А. С. Пушкин', 'М. Ю. Лермонтов', 'Н. В. Гоголь', 'И. С. Тургенев'], 'Роман написал А. С. Пушкин.'),
          c('Кто написал роман «Война и мир»?', ['Л. Н. Толстой', 'Ф. М. Достоевский', 'А. П. Чехов', 'И. А. Гончаров'], 'Автор — Л. Н. Толстой.'),
          c('Автор поэмы «Мёртвые души»:', ['Н. В. Гоголь', 'А. С. Грибоедов', 'И. А. Крылов', 'А. Н. Островский'], 'Поэму написал Н. В. Гоголь.'),
        ],
      },
    ],
  },
  {
    code: 'karakalpak',
    topics: [
      {
        name: 'Sóz shaqapları',
        items: [
          c('«Kitap» sózi qaysı sóz shaqabına kiredi?', ['Atlıq', 'Kelbetlik', 'Feyil', 'Sanlıq'], '«Kitap» — atlıq.'),
          c('«Qızıl» sózi qaysı sóz shaqabına kiredi?', ['Kelbetlik', 'Atlıq', 'Feyil', 'Almasıq'], '«Qızıl» — kelbetlik.'),
          c('Qatardan feyildi tabıń:', ['oqıdı', 'kitap', 'úsh', 'aq'], '«Oqıdı» — feyil.'),
          c('Qatardan sanlıqtı tabıń:', ['bes', 'bala', 'jaqsı', 'keldi'], '«Bes» — sanlıq.'),
          c('«Men» sózi qaysı sóz shaqabına kiredi?', ['Almasıq', 'Atlıq', 'Ráwish', 'Sanlıq'], '«Men» — almasıq.'),
        ],
      },
      {
        name: 'Sóz mánisi hám forması',
        items: [
          c('«Mektep» sóziniń kóplik formasın tabıń:', ['mektepler', 'mekteplar', 'mekteptiń', 'mektepke'], 'Jińishke buwınlı sózge «-ler» qosımtası jalǵanadı.'),
          c('«Aq» sóziniń antonimin tabıń:', ['qara', 'qızıl', 'kók', 'sarı'], 'Aq — qara.'),
          c('«Úlken» sóziniń antonimin tabıń:', ['kishi', 'biyik', 'keń', 'uzın'], 'Úlken — kishi.'),
          num('«Eki» hám «úsh» sanlarınıń qosındısı neshege teń?', 5, '2 + 3 = 5.'),
          tf('«Balalar» sózi kóplik formada tur.', true, '«-lar» — kóplik qosımtası.'),
        ],
      },
    ],
  },
];

export async function seedDemoContent(prisma: PrismaClient, authorId: string) {
  let added = 0;
  for (const demo of DEMO) {
    const subject = await prisma.subject.findUniqueOrThrow({ where: { code: demo.code } });
    const title = `${subject.nameUz} — namuna mock (10 savol)`;
    // Takroriy seed hech narsani ikki marta yaratmaydi
    if (await prisma.test.findFirst({ where: { subjectId: subject.id, title } })) continue;

    await prisma.$transaction(
      async (tx) => {
        const versionIds: string[] = [];
        for (const [topicIndex, t] of demo.topics.entries()) {
          const topic =
            (await tx.topic.findFirst({ where: { subjectId: subject.id, name: t.name, deletedAt: null } })) ??
            (await tx.topic.create({ data: { subjectId: subject.id, name: t.name, sortOrder: topicIndex } }));
          for (const item of t.items) {
            versionIds.push(await createQuestion(tx, subject.id, topic.id, authorId, item, versionIds.length));
          }
        }
        await tx.test.create({
          data: {
            title, mode: 'MOCK_EXAM', status: 'PUBLISHED', subjectId: subject.id, createdById: authorId,
            durationSec: 20 * 60, shuffle: false,
            questions: { create: versionIds.map((id, i) => ({ questionVersionId: id, sortOrder: i })) },
          },
        });
      },
      { timeout: 30_000 },
    );
    added++;
  }
  console.log(`✓ namuna kontent: ${added} ta fanga yangi mock qo'shildi`);
}

async function createQuestion(
  tx: Prisma.TransactionClient, subjectId: string, topicId: string, authorId: string, item: Item, index: number,
): Promise<string> {
  const question = await tx.question.create({
    data: { subjectId, topicId, type: item.type, status: 'APPROVED', authorId, source: 'seed-demo', copyrightStatus: 'ORIGINAL' },
  });
  let options: { label: string; content: string; isCorrect: boolean; sortOrder: number }[] = [];
  if (item.options) {
    // To'g'ri javob har doim bir xil o'rinda turmasligi uchun A–D bo'ylab aylantiramiz
    const [correct, ...wrong] = item.options;
    const ordered = [...wrong];
    ordered.splice(index % item.options.length, 0, correct);
    options = ordered.map((content, i) => ({ label: 'ABCD'[i], content, isCorrect: content === correct, sortOrder: i }));
  }
  const version = await tx.questionVersion.create({
    data: {
      questionId: question.id, version: 1, stem: item.stem, solution: item.solution, status: 'APPROVED',
      createdById: authorId, difficulty: 2,
      answerKey: item.value === undefined ? undefined : item.type === 'NUMERIC' ? { value: item.value, tolerance: 0 } : { value: item.value },
      options: { create: options },
    },
  });
  await tx.question.update({ where: { id: question.id }, data: { currentVersionId: version.id } });
  return version.id;
}
