/**
 * Spaced Repetition — SM-2 algoritmining soddalashtirilgan varianti.
 * quality: 0..5 (0-2 = noto'g'ri, 3 = qiyinchilik bilan to'g'ri, 4 = to'g'ri, 5 = oson)
 */
export interface SrsState {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
}

export function nextReview(state: SrsState, quality: number, now = new Date()): SrsState & { nextReviewAt: Date } {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { repetitions, easeFactor, intervalDays } = state;

  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 3;
    else intervalDays = Math.round(intervalDays * easeFactor);
  }
  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  intervalDays = Math.min(intervalDays, 180);

  return {
    repetitions,
    easeFactor: Math.round(easeFactor * 100) / 100,
    intervalDays,
    nextReviewAt: new Date(now.getTime() + intervalDays * 86_400_000),
  };
}

/** Xato 3 marta ketma-ket to'g'ri yechilsa — "tuzatildi" deb hisoblanadi */
export const RESOLVE_AFTER_REPETITIONS = 3;
