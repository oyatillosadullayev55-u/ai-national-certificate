import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Subject, TopicNode } from '../api';
import { Icon } from '../components/icons';
import { MathText, PageHead, useLoad, useToast } from '../components/ui';

const TYPES = [
  ['SINGLE_CHOICE', 'Bitta javob'],
  ['MULTIPLE_CHOICE', 'Bir nechta javob'],
  ['TRUE_FALSE', "To'g'ri / noto'g'ri"],
  ['NUMERIC', 'Son javob'],
] as const;
type GenType = (typeof TYPES)[number][0];

interface GenQuestion {
  stem: string;
  options: { label: string; content: string; isCorrect: boolean }[];
  numericValue: number | null;
  trueFalseValue: boolean | null;
  solution: string;
  explanation: string;
  difficulty: number;
}

const DIFF = ['', 'Oson', "O'rtacha-oson", "O'rtacha", 'Qiyin', 'Juda qiyin'];

function flatten(nodes: TopicNode[], depth = 0): { id: string; name: string }[] {
  return nodes.flatMap((n) => [{ id: n.id, name: `${'— '.repeat(depth)}${n.name}` }, ...flatten(n.children ?? [], depth + 1)]);
}

export default function AiGenerate() {
  const toast = useToast();
  const subjects = useLoad(() => api<Subject[]>('/subjects'), []);
  const [f, setF] = useState({ subjectId: '', topicId: '', type: 'SINGLE_CHOICE' as GenType, count: 5, difficulty: 3, instructions: '' });
  const topics = useLoad(() => (f.subjectId ? api<TopicNode[]>(`/subjects/${f.subjectId}/topics`) : Promise.resolve([])), [f.subjectId]);
  const topicList = useMemo(() => flatten(topics.data ?? []), [topics.data]);

  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ model: string; type: GenType; subjectId: string; topicId: string; questions: GenQuestion[] } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<number | null>(null);

  async function generate() {
    setBusy(true);
    setErr(null);
    setSaved(null);
    try {
      const r = await api<{ model: string; questions: GenQuestion[] }>('/ai/questions/generate', {
        method: 'POST',
        json: { ...f, instructions: f.instructions.trim() || undefined },
      });
      setResult({ ...r, type: f.type, subjectId: f.subjectId, topicId: f.topicId });
      setSelected(new Set(r.questions.map((_, i) => i)));
      if (!r.questions.length) setErr("AI yaroqli savol qaytarmadi. Ko'rsatmani o'zgartirib, qayta urinib ko'ring.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function edit(i: number, patch: Partial<GenQuestion>) {
    if (!result) return;
    setResult({ ...result, questions: result.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  }

  function setCorrect(i: number, oi: number) {
    if (!result) return;
    const q = result.questions[i];
    const single = result.type === 'SINGLE_CHOICE';
    edit(i, { options: q.options.map((o, j) => ({ ...o, isCorrect: single ? j === oi : j === oi ? !o.isCorrect : o.isCorrect })) });
  }

  function toggle(i: number) {
    const s = new Set(selected);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    setSelected(s);
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    try {
      const questions = result.questions.filter((_, i) => selected.has(i));
      const r = await api<{ created: number; failed: number; errors: { index: number; message: string }[] }>('/ai/questions/save', {
        method: 'POST',
        json: { subjectId: result.subjectId, topicId: result.topicId, type: result.type, model: result.model, questions },
      });
      if (r.failed) toast.fail(`${r.created} ta saqlandi, ${r.failed} ta xato: ${r.errors[0]?.message}`);
      else toast.ok(`${r.created} ta savol tekshiruvga yuborildi`);
      setSaved(r.created);
      setResult(null);
      setSelected(new Set());
    } catch (e) {
      toast.fail((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const canGenerate = !!f.subjectId && !!f.topicId && !busy;

  return (
    <>
      <PageHead title="AI savol yaratish" sub="Claude mavzu bo'yicha savol qoralamalarini tayyorlaydi — siz tahrirlaysiz, ekspert tasdiqlaydi">
        <span className="badge ai">✦ Claude</span>
      </PageHead>

      <div className="split wide">
        <div className="card" style={{ position: 'sticky', top: 20 }}>
          <h2>Parametrlar</h2>
          <label className="f">Fan
            <select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value, topicId: '' })}>
              <option value="">Fanni tanlang</option>
              {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.nameUz}</option>)}
            </select>
          </label>
          <label className="f">Mavzu
            <select value={f.topicId} onChange={(e) => setF({ ...f, topicId: e.target.value })} disabled={!f.subjectId}>
              <option value="">{f.subjectId && !topicList.length && !topics.loading ? 'Bu fanda mavzu yo\'q' : 'Mavzuni tanlang'}</option>
              {topicList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <div className="f" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, fontWeight: 600, fontSize: 13 }}>
            Savol turi
            <div className="seg">
              {TYPES.map(([v, l]) => (
                <button key={v} type="button" className={f.type === v ? 'on' : ''} onClick={() => setF({ ...f, type: v })}>{l}</button>
              ))}
            </div>
          </div>
          <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
            <label className="f" style={{ flex: 1 }}>Soni: {f.count}
              <input type="range" min={1} max={10} value={f.count} onChange={(e) => setF({ ...f, count: +e.target.value })} />
            </label>
            <label className="f" style={{ flex: 1.4 }}>Qiyinlik: {DIFF[f.difficulty]}
              <input type="range" min={1} max={5} value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: +e.target.value })} />
            </label>
          </div>
          <label className="f">Qo'shimcha ko'rsatma <span>Ixtiyoriy. Masalan: "hayotiy masalalar", "grafik bilan bog'liq"</span>
            <textarea className="prose" rows={3} maxLength={1000} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} />
          </label>
          <button className="ai lg" style={{ width: '100%' }} disabled={!canGenerate} onClick={generate}>
            {busy ? <><span className="spin" /> Yaratilmoqda…</> : <><Icon name="sparkles" size={17} /> Savollarni yaratish</>}
          </button>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            AI savollari avtomatik nashr qilinmaydi: ular <b>tekshiruv navbatiga</b> tushadi va boshqa ekspert tasdiqlaydi.
          </p>
        </div>

        <div>
          {err && <div className="alert error">{err}</div>}
          {saved !== null && (
            <div className="alert info row">
              <Icon name="check" /> {saved} ta savol tekshiruv navbatiga qo'shildi.
              <span className="spacer" />
              <Link to="/review">Tekshiruv navbatiga o'tish →</Link>
            </div>
          )}

          {busy && [0, 1, 2].map((i) => <div key={i} className="shimmer" />)}

          {!busy && !result && (
            <div className="card empty-ai">
              <div className="orb"><Icon name="sparkles" size={30} /></div>
              <h2 style={{ color: 'var(--text)' }}>Savollar shu yerda paydo bo'ladi</h2>
              <div>Chap tomonda fan va mavzuni tanlang, so'ng «Savollarni yaratish» tugmasini bosing.</div>
            </div>
          )}

          {!busy && result && result.questions.length > 0 && (
            <>
              <div className="row" style={{ marginBottom: 10 }}>
                <span className="muted">{result.questions.length} ta qoralama · model: <code>{result.model}</code></span>
                <span className="spacer" />
                <button className="ghost sm" onClick={() => setSelected(new Set(result.questions.map((_, i) => i)))}>Hammasini tanlash</button>
                <button className="ghost sm" onClick={() => setSelected(new Set())}>Tozalash</button>
              </div>

              {result.questions.map((q, i) => (
                <div key={i} className={`gq${selected.has(i) ? ' sel' : ''}`}>
                  <div className="head">
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} aria-label="Tanlash" />
                    <span className="num">{i + 1}</span>
                    <span className="badge">{DIFF[q.difficulty]}</span>
                    <span className="spacer" />
                    <select value={q.difficulty} onChange={(e) => edit(i, { difficulty: +e.target.value })} style={{ padding: '4px 8px' }}>
                      {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>Qiyinlik {d}</option>)}
                    </select>
                  </div>

                  <div className="preview" style={{ marginBottom: 8 }}><MathText text={q.stem} /></div>
                  <textarea className="prose" rows={2} value={q.stem} onChange={(e) => edit(i, { stem: e.target.value })} />

                  {q.options.length > 0 && (
                    <div className="opts">
                      {q.options.map((o, oi) => (
                        <div key={oi} className={`optrow${o.isCorrect ? ' c' : ''}`}>
                          <span className="lbl">{o.label}</span>
                          <input type="text" value={o.content} onChange={(e) => edit(i, { options: q.options.map((x, j) => (j === oi ? { ...x, content: e.target.value } : x)) })} />
                          <button type="button" className={o.isCorrect ? 'ok sm' : 'ghost sm'} onClick={() => setCorrect(i, oi)}>
                            {o.isCorrect ? "✓ To'g'ri" : 'Belgilash'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {result.type === 'NUMERIC' && (
                    <label className="f" style={{ marginTop: 10 }}>To'g'ri javob (son)
                      <input type="number" value={q.numericValue ?? ''} onChange={(e) => edit(i, { numericValue: e.target.value === '' ? null : +e.target.value })} />
                    </label>
                  )}
                  {result.type === 'TRUE_FALSE' && (
                    <div className="row" style={{ marginTop: 10 }}>
                      <span style={{ fontWeight: 600 }}>To'g'ri javob:</span>
                      <div className="seg">
                        <button type="button" className={q.trueFalseValue === true ? 'on' : ''} onClick={() => edit(i, { trueFalseValue: true })}>To'g'ri</button>
                        <button type="button" className={q.trueFalseValue === false ? 'on' : ''} onClick={() => edit(i, { trueFalseValue: false })}>Noto'g'ri</button>
                      </div>
                    </div>
                  )}

                  <details>
                    <summary>Yechim va izoh</summary>
                    <div className="preview" style={{ margin: '8px 0' }}><MathText text={q.solution} /></div>
                    <label className="f">Yechim (ekspert uchun)
                      <textarea className="prose" rows={3} value={q.solution} onChange={(e) => edit(i, { solution: e.target.value })} />
                    </label>
                    <label className="f" style={{ marginBottom: 0 }}>Qisqa izoh (o'quvchi uchun)
                      <textarea className="prose" rows={2} value={q.explanation} onChange={(e) => edit(i, { explanation: e.target.value })} />
                    </label>
                  </details>
                </div>
              ))}

              <div className="sticky-bar">
                <b>{selected.size}</b> ta tanlandi
                <span className="spacer" />
                <button className="ghost" onClick={generate}>Qayta yaratish</button>
                <button disabled={!selected.size || saving} onClick={save}>
                  <Icon name="send" size={16} /> {saving ? 'Saqlanmoqda…' : 'Tekshiruvga yuborish'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {toast.node}
    </>
  );
}
