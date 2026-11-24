import { QuestionType } from '@prisma/client';

/**
 * Deterministik javob tekshiruvi (Hybrid AI: baholashni AI emas, qoidalar qiladi).
 * Sof funksiyalar — DB'ga bog'liq emas, shuning uchun unit test bilan to'liq qoplangan.
 */

export interface EvaluableQuestion {
  type: QuestionType;
  options: { id: string; isCorrect: boolean }[];
  answerKey: any;
}

export interface EvaluationResult {
  /** null — avtomatik tekshirib bo'lmaydi (yozma javob), ekspert/AI tekshiruvi kerak */
  isCorrect: boolean | null;
  /** 0..1 — qisman ball (matching/ordering, partialCredit yoqilgan bo'lsa) */
  fraction: number;
}

export const SINGLE_OPTION_TYPES: QuestionType[] = ['SINGLE_CHOICE', 'IMAGE_BASED', 'DIAGRAM_BASED', 'CONTEXT_BASED'];
export const MANUAL_TYPES: QuestionType[] = ['WRITTEN_RESPONSE'];

const WRONG: EvaluationResult = { isCorrect: false, fraction: 0 };
const RIGHT: EvaluationResult = { isCorrect: true, fraction: 1 };

/** O'zbek apostrof variantlarini (o‘ oʻ o' o`) bir xil ko'rinishga keltiradi */
export function normalizeText(s: string, caseSensitive = false): string {
  let r = s.normalize('NFC').replace(/[‘’ʻʼ`´]/g, "'").replace(/\s+/g, ' ').trim();
  if (!caseSensitive) r = r.toLocaleLowerCase('uz');
  return r;
}

export function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s/g, '').replace(',', '.');
  // Oddiy kasr: 3/4
  const frac = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(s);
  if (frac) {
    const d = Number(frac[2]);
    return d === 0 ? null : Number(frac[1]) / d;
  }
  if (!/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(s)) return null;
  return Number(s);
}

export function evaluateAnswer(q: EvaluableQuestion, response: any): EvaluationResult {
  if (response === null || response === undefined) return WRONG;
  const key = q.answerKey ?? {};

  if (MANUAL_TYPES.includes(q.type)) return { isCorrect: null, fraction: 0 };

  if (SINGLE_OPTION_TYPES.includes(q.type)) {
    const correct = q.options.find((o) => o.isCorrect);
    return correct && response.optionId === correct.id ? RIGHT : WRONG;
  }

  switch (q.type) {
    case 'MULTIPLE_CHOICE': {
      if (!Array.isArray(response.optionIds)) return WRONG;
      const correct = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id));
      const chosen = new Set<string>(response.optionIds);
      if (chosen.size !== correct.size) return WRONG;
      for (const id of chosen) if (!correct.has(id)) return WRONG;
      return RIGHT;
    }

    case 'TRUE_FALSE':
      return typeof response.value === 'boolean' && response.value === key.value ? RIGHT : WRONG;

    case 'NUMERIC': {
      const got = parseNumber(response.value);
      const expected = parseNumber(key.value);
      if (got === null || expected === null) return WRONG;
      const tol = typeof key.tolerance === 'number' ? key.tolerance : 1e-9;
      return Math.abs(got - expected) <= tol ? RIGHT : WRONG;
    }

    case 'TEXT': {
      if (typeof response.text !== 'string') return WRONG;
      const cs = !!key.caseSensitive;
      const got = normalizeText(response.text, cs);
      const accepted: string[] = Array.isArray(key.accepted) ? key.accepted : [];
      return accepted.some((a) => normalizeText(a, cs) === got) ? RIGHT : WRONG;
    }

    case 'FORMULA': {
      if (typeof response.text !== 'string') return WRONG;
      const strip = (s: string) => normalizeText(s).replace(/\s/g, '').replace(/\*\*/g, '^');
      const got = strip(response.text);
      const accepted: string[] = Array.isArray(key.accepted) ? key.accepted : [];
      if (accepted.some((a) => strip(a) === got)) return RIGHT;
      // Ekvivalent, lekin boshqacha yozilgan formulani AI/ekspert ko'rib chiqadi
      return key.manualFallback ? { isCorrect: null, fraction: 0 } : WRONG;
    }

    case 'MATCHING': {
      const expected: Record<string, string> = key.pairs ?? {};
      const got: Record<string, string> = response.pairs ?? {};
      const leftIds = Object.keys(expected);
      if (leftIds.length === 0) return WRONG;
      const hits = leftIds.filter((l) => got[l] === expected[l]).length;
      return result(hits, leftIds.length, !!key.partialCredit);
    }

    case 'ORDERING': {
      const expected: string[] = key.order ?? [];
      const got: string[] = Array.isArray(response.order) ? response.order : [];
      if (expected.length === 0 || got.length !== expected.length) return WRONG;
      const hits = expected.filter((id, i) => got[i] === id).length;
      return result(hits, expected.length, !!key.partialCredit);
    }

    default:
      return WRONG;
  }
}

function result(hits: number, total: number, partial: boolean): EvaluationResult {
  if (hits === total) return RIGHT;
  return { isCorrect: false, fraction: partial ? hits / total : 0 };
}

/**
 * Savol yaratishda answerKey va variantlarning to'g'riligini tekshiradi.
 * Qaytaradi: xatolar ro'yxati (bo'sh = to'g'ri).
 */
export function validateQuestionShape(
  type: QuestionType,
  options: { label: string; content: string; isCorrect?: boolean }[] | undefined,
  answerKey: any,
  payload: any,
): string[] {
  const errors: string[] = [];
  const opts = options ?? [];
  const correctCount = opts.filter((o) => o.isCorrect).length;

  if (SINGLE_OPTION_TYPES.includes(type)) {
    if (opts.length < 2) errors.push('Kamida 2 ta variant kerak');
    if (correctCount !== 1) errors.push('Aynan 1 ta to\'g\'ri variant bo\'lishi kerak');
  } else if (type === 'MULTIPLE_CHOICE') {
    if (opts.length < 2) errors.push('Kamida 2 ta variant kerak');
    if (correctCount < 1) errors.push('Kamida 1 ta to\'g\'ri variant kerak');
  } else if (type === 'TRUE_FALSE') {
    if (typeof answerKey?.value !== 'boolean') errors.push('answerKey.value boolean bo\'lishi kerak');
  } else if (type === 'NUMERIC') {
    if (parseNumber(answerKey?.value) === null) errors.push('answerKey.value son bo\'lishi kerak');
  } else if (type === 'TEXT' || type === 'FORMULA') {
    if (!Array.isArray(answerKey?.accepted) || answerKey.accepted.length === 0) errors.push('answerKey.accepted ro\'yxati kerak');
  } else if (type === 'MATCHING') {
    const left: { id: string }[] = payload?.left ?? [];
    const right: { id: string }[] = payload?.right ?? [];
    const pairs = answerKey?.pairs ?? {};
    if (left.length < 2 || right.length < 2) errors.push('payload.left va payload.right kamida 2 tadan');
    const rightIds = new Set(right.map((r) => r.id));
    for (const l of left) if (!rightIds.has(pairs[l.id])) errors.push(`"${l.id}" uchun juftlik noto'g'ri`);
  } else if (type === 'ORDERING') {
    const items: { id: string }[] = payload?.items ?? [];
    const order: string[] = answerKey?.order ?? [];
    const ids = new Set(items.map((i) => i.id));
    if (items.length < 2) errors.push('payload.items kamida 2 ta');
    if (order.length !== items.length || !order.every((id) => ids.has(id))) errors.push('answerKey.order payload.items bilan mos emas');
  }
  return errors;
}
