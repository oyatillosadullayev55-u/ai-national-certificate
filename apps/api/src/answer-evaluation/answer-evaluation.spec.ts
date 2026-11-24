import { evaluateAnswer, normalizeText, parseNumber, validateQuestionShape } from './answer-evaluation';

const opts = [
  { id: 'a', isCorrect: false },
  { id: 'b', isCorrect: true },
  { id: 'c', isCorrect: false },
];

describe('evaluateAnswer', () => {
  it('single choice', () => {
    expect(evaluateAnswer({ type: 'SINGLE_CHOICE', options: opts, answerKey: null }, { optionId: 'b' }).isCorrect).toBe(true);
    expect(evaluateAnswer({ type: 'SINGLE_CHOICE', options: opts, answerKey: null }, { optionId: 'a' }).isCorrect).toBe(false);
    expect(evaluateAnswer({ type: 'SINGLE_CHOICE', options: opts, answerKey: null }, null).isCorrect).toBe(false);
  });

  it('multiple choice — aniq moslik talab qilinadi', () => {
    const o = [{ id: 'a', isCorrect: true }, { id: 'b', isCorrect: true }, { id: 'c', isCorrect: false }];
    expect(evaluateAnswer({ type: 'MULTIPLE_CHOICE', options: o, answerKey: null }, { optionIds: ['b', 'a'] }).isCorrect).toBe(true);
    expect(evaluateAnswer({ type: 'MULTIPLE_CHOICE', options: o, answerKey: null }, { optionIds: ['a'] }).isCorrect).toBe(false);
    expect(evaluateAnswer({ type: 'MULTIPLE_CHOICE', options: o, answerKey: null }, { optionIds: ['a', 'b', 'c'] }).isCorrect).toBe(false);
  });

  it('numeric — vergul, kasr va tolerance', () => {
    const q = { type: 'NUMERIC' as const, options: [], answerKey: { value: 0.75, tolerance: 0.001 } };
    expect(evaluateAnswer(q, { value: '0,75' }).isCorrect).toBe(true);
    expect(evaluateAnswer(q, { value: '3/4' }).isCorrect).toBe(true);
    expect(evaluateAnswer(q, { value: 0.7505 }).isCorrect).toBe(true);
    expect(evaluateAnswer(q, { value: '0.76' }).isCorrect).toBe(false);
    expect(evaluateAnswer(q, { value: 'abc' }).isCorrect).toBe(false);
  });

  it('text — o\'zbek apostroflari va registr', () => {
    const q = { type: 'TEXT' as const, options: [], answerKey: { accepted: ["O'zbekiston"] } };
    expect(evaluateAnswer(q, { text: '  oʻzbekiston ' }).isCorrect).toBe(true);
    expect(evaluateAnswer(q, { text: 'o‘zbekiston' }).isCorrect).toBe(true);
    expect(evaluateAnswer(q, { text: 'ozbekiston' }).isCorrect).toBe(false);
  });

  it('matching — qisman ball', () => {
    const q = { type: 'MATCHING' as const, options: [], answerKey: { pairs: { l1: 'r1', l2: 'r2' }, partialCredit: true } };
    expect(evaluateAnswer(q, { pairs: { l1: 'r1', l2: 'r2' } })).toEqual({ isCorrect: true, fraction: 1 });
    expect(evaluateAnswer(q, { pairs: { l1: 'r1', l2: 'r1' } })).toEqual({ isCorrect: false, fraction: 0.5 });
  });

  it('ordering', () => {
    const q = { type: 'ORDERING' as const, options: [], answerKey: { order: ['x', 'y', 'z'] } };
    expect(evaluateAnswer(q, { order: ['x', 'y', 'z'] }).isCorrect).toBe(true);
    expect(evaluateAnswer(q, { order: ['y', 'x', 'z'] })).toEqual({ isCorrect: false, fraction: 0 });
  });

  it('written response — avtomatik tekshirilmaydi', () => {
    expect(evaluateAnswer({ type: 'WRITTEN_RESPONSE', options: [], answerKey: null }, { text: 'essay' }).isCorrect).toBeNull();
  });

  it('true/false', () => {
    const q = { type: 'TRUE_FALSE' as const, options: [], answerKey: { value: false } };
    expect(evaluateAnswer(q, { value: false }).isCorrect).toBe(true);
    expect(evaluateAnswer(q, { value: 'false' }).isCorrect).toBe(false);
  });
});

describe('helpers', () => {
  it('normalizeText', () => expect(normalizeText('  G‘ALABA  kuni ')).toBe("g'alaba kuni"));
  it('parseNumber', () => {
    expect(parseNumber('1 000,5')).toBe(1000.5);
    expect(parseNumber('1/0')).toBeNull();
  });
});

describe('validateQuestionShape', () => {
  it('single choice bitta to\'g\'ri javob talab qiladi', () => {
    expect(validateQuestionShape('SINGLE_CHOICE', [{ label: 'A', content: '1', isCorrect: true }, { label: 'B', content: '2', isCorrect: true }], null, null))
      .toContain('Aynan 1 ta to\'g\'ri variant bo\'lishi kerak');
  });
  it('ordering mosligini tekshiradi', () => {
    expect(validateQuestionShape('ORDERING', [], { order: ['a', 'b'] }, { items: [{ id: 'a' }, { id: 'b' }] })).toEqual([]);
    expect(validateQuestionShape('ORDERING', [], { order: ['a'] }, { items: [{ id: 'a' }, { id: 'b' }] }).length).toBeGreaterThan(0);
  });
});
