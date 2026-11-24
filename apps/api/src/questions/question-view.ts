import { Prisma } from '@prisma/client';

export const versionWithOptions = {
  options: { orderBy: { sortOrder: 'asc' } },
  assets: true,
  question: { select: { id: true, type: true, topicId: true, subjectId: true } },
} satisfies Prisma.QuestionVersionInclude;

export type VersionWithOptions = Prisma.QuestionVersionGetPayload<{ include: typeof versionWithOptions }>;

/**
 * Test davomida mijozga yuboriladigan ko'rinish: to'g'ri javob, kalit, yechim va izoh YO'Q.
 * ORDERING elementlari va MATCHING o'ng ustuni tartibi javobni oshkor qilmasligi uchun aralashtiriladi.
 */
export function toStudentView(v: VersionWithOptions) {
  const payload = (v.payload ?? null) as any;
  let safePayload = payload;
  if (payload && v.question.type === 'ORDERING' && Array.isArray(payload.items)) {
    safePayload = { ...payload, items: stableShuffle(payload.items, v.id) };
  }
  if (payload && v.question.type === 'MATCHING' && Array.isArray(payload.right)) {
    safePayload = { ...payload, right: stableShuffle(payload.right, v.id) };
  }
  return {
    questionVersionId: v.id,
    questionId: v.questionId,
    type: v.question.type,
    topicId: v.question.topicId,
    stem: v.stem,
    payload: safePayload,
    points: Number(v.points),
    options: v.options.map((o) => ({ id: o.id, label: o.label, content: o.content })),
    assets: v.assets.map((a) => ({ id: a.id, kind: a.kind, storageKey: a.storageKey, alt: a.alt })),
  };
}

/** Natija sahifasi uchun: to'liq yechim bilan */
export function toReviewView(v: VersionWithOptions) {
  return {
    ...toStudentView(v),
    options: v.options.map((o) => ({ id: o.id, label: o.label, content: o.content, isCorrect: o.isCorrect })),
    answerKey: v.answerKey,
    solution: v.solution,
    explanation: v.explanation,
  };
}

/** Bir xil seed — bir xil tartib (sahifani yangilaganda variantlar sakramasligi uchun) */
export function stableShuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rnd = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
