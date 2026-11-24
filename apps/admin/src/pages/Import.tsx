import { useState } from 'react';
import { api } from '../api';
import { PageHead } from '../components/ui';

const SAMPLE = `[
  {
    "subjectId": "<fan-uuid>",
    "topicId": "<mavzu-uuid>",
    "type": "SINGLE_CHOICE",
    "stem": "$5 + 7$ = ?",
    "options": [
      { "label": "A", "content": "12", "isCorrect": true },
      { "label": "B", "content": "13" }
    ],
    "solution": "5 + 7 = 12",
    "difficulty": 1,
    "source": "markaz-2026",
    "copyrightStatus": "ORIGINAL"
  }
]`;

/** Bir qatorni CSV maydonlariga ajratadi (qo'shtirnoqli maydonlar bilan) */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * CSV formati (single choice): subjectId,topicId,stem,A,B,C,D,correct,solution,difficulty
 * correct — A/B/C/D. Excel'dan "CSV UTF-8" sifatida saqlang.
 */
function csvToItems(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const [, ...rows] = lines;
  return rows.map((l) => {
    const [subjectId, topicId, stem, a, b, c, d, correct, solution, difficulty] = parseCsvLine(l);
    const opts = [['A', a], ['B', b], ['C', c], ['D', d]].filter(([, v]) => v?.trim());
    return {
      subjectId, topicId, type: 'SINGLE_CHOICE', stem,
      options: opts.map(([label, content]) => ({ label, content, isCorrect: label === correct?.trim().toUpperCase() })),
      solution: solution || undefined, difficulty: difficulty ? Number(difficulty) : 3, source: 'csv-import',
    };
  });
}

export default function Import() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ created: number; failed: number; errors: { index: number; message: string }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    const t = await file.text();
    setText(file.name.endsWith('.csv') ? JSON.stringify(csvToItems(t), null, 2) : t);
  }

  async function run() {
    setErr(null);
    setResult(null);
    let items: unknown;
    try {
      items = JSON.parse(text);
      if (!Array.isArray(items)) throw new Error();
    } catch {
      return setErr('JSON massiv bo\'lishi kerak');
    }
    setBusy(true);
    try {
      setResult(await api('/questions/import', { method: 'POST', json: { items } }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="Savollarni import qilish" sub="JSON yoki CSV fayldan savollarni ommaviy yuklash — ular tekshiruv navbatiga tushadi" />
      <div className="card">
        <p className="muted">
          JSON yoki CSV (<code>subjectId,topicId,stem,A,B,C,D,correct,solution,difficulty</code>) fayl yuklang.
          Import qilingan savollar avtomatik nashr qilinmaydi — tekshiruv navbatiga tushadi. Bir martada 500 tagacha.
        </p>
        <div className="row" style={{ marginBottom: 10 }}>
          <input type="file" accept=".json,.csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <button className="ghost" onClick={() => setText(SAMPLE)}>Namuna</button>
        </div>
        <textarea style={{ minHeight: 320 }} value={text} onChange={(e) => setText(e.target.value)} />
        {err && <div className="alert error" style={{ marginTop: 10 }}>{err}</div>}
        <div className="row end" style={{ marginTop: 10 }}>
          <button onClick={run} disabled={busy || !text.trim()}>{busy ? 'Yuklanmoqda…' : 'Import'}</button>
        </div>
      </div>
      {result && (
        <div className="card">
          <h2>Natija: {result.created} ta qo'shildi, {result.failed} ta xato</h2>
          {result.errors.map((e) => <div key={e.index} className="muted">#{e.index + 1}: {e.message}</div>)}
        </div>
      )}
    </>
  );
}
