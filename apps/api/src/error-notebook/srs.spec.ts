import { nextReview } from './srs';

describe('SM-2 spaced repetition', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const fresh = { repetitions: 0, easeFactor: 2.5, intervalDays: 1 };

  it('to\'g\'ri javoblar ketma-ketligida interval o\'sadi', () => {
    const r1 = nextReview(fresh, 4, now);
    const r2 = nextReview(r1, 4, now);
    const r3 = nextReview(r2, 4, now);
    expect([r1.intervalDays, r2.intervalDays, r3.intervalDays]).toEqual([1, 3, 8]);
    expect(r3.repetitions).toBe(3);
  });

  it('xato javob intervalni qaytadan boshlaydi va easeFactor 1.3 dan tushmaydi', () => {
    let s = { repetitions: 5, easeFactor: 1.35, intervalDays: 40 };
    s = nextReview(s, 0, now);
    expect(s.repetitions).toBe(0);
    expect(s.intervalDays).toBe(1);
    expect(s.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('nextReviewAt interval bo\'yicha hisoblanadi', () => {
    const r = nextReview(fresh, 5, now);
    expect(r.nextReviewAt.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });
});
