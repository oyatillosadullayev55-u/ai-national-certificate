import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, QuestionType, QUESTION_TYPES, Subject, TopicNode } from '../api';
import { Badge, MathText, useLoad, useToast } from '../components/ui';

const OPTION_TYPES: QuestionType[] = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'IMAGE_BASED', 'DIAGRAM_BASED', 'CONTEXT_BASED'];
const JSON_TYPES: QuestionType[] = ['MATCHING', 'ORDERING'];

const TEMPLATES: Partial<Record<QuestionType, { payload: object; answerKey: object }>> = {
  MATCHING: {
    payload: { left: [{ id: 'l1', text: 'H2O' }, { id: 'l2', text: 'NaCl' }], right: [{ id: 'r1', text: 'Suv' }, { id: 'r2', text: 'Osh tuzi' }] },
    answerKey: { pairs: { l1: 'r1', l2: 'r2' }, partialCredit: true },
  },
  ORDERING: {
    payload: { items: [{ id: 'a', text: '1-qadam' }, { id: 'b', text: '2-qadam' }, { id: 'c', text: '3-qadam' }] },
    answerKey: { order: ['a', 'b', 'c'] },
  },
};

interface Opt { label: string; content: string; isCorrect: boolean }

interface Form {
  subjectId: string;
  topicId: string;
  type: QuestionType;
  stem: string;
  options: Opt[];
  tfValue: boolean;
  numValue: string;
  tolerance: string;
  accepted: string;
  payloadJson: string;
  answerKeyJson: string;
  context: string;
  solution: string;
  explanation: string;
  difficulty: number;
  points: number;
  source: string;
  copyrightStatus: string;
}

const emptyOpts = (): Opt[] => ['A', 'B', 'C', 'D'].map((label) => ({ label, content: '', isCorrect: false }));

const blank: Form = {
  subjectId: '', topicId: '', type: 'SINGLE_CHOICE', stem: '', options: emptyOpts(), tfValue: true, numValue: '', tolerance: '0',
  accepted: '', payloadJson: '', answerKeyJson: '', context: '', solution: '', explanation: '', difficulty: 3, points: 1, source: '', copyrightStatus: 'ORIGINAL',
};

export default function QuestionEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState<Form>(blank);
  const [meta, setMeta] = useState<{ status: string; versions: { id: string; version: number; status: string; reviews: { decision: string; comment: string | null }[] }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const subjects = useLoad(() => api<Subject[]>('/subjects'), []);
  const topics = useLoad(() => (f.subjectId ? api<TopicNode[]>(`/subjects/${f.subjectId}/topics`) : Promise.resolve([])), [f.subjectId]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  // Tahrirlash: oxirgi versiyani formaga yuklash
  useEffect(() => {
    if (!id) return;
    api(`/questions/${id}`).then((q) => {
      const v = q.versions[0];
      const key = v.answerKey ?? {};
      setMeta({ status: q.status, versions: q.versions });
      setF({
        ...blank,
        subjectId: q.subjectId, topicId: q.topicId, type: q.type, stem: v.stem,
        options: v.options.length ? v.options.map((o: Opt) => ({ label: o.label, content: o.content, isCorrect: o.isCorrect })) : emptyOpts(),
        tfValue: key.value ?? true,
        numValue: key.value !== undefined ? String(key.value) : '',
        tolerance: key.tolerance !== undefined ? String(key.tolerance) : '0',
        accepted: Array.isArray(key.accepted) ? key.accepted.join('\n') : '',
        payloadJson: v.payload ? JSON.stringify(v.payload, null, 2) : '',
        answerKeyJson: v.answerKey ? JSON.stringify(v.answerKey, null, 2) : '',
        context: v.payload?.context ?? '',
        solution: v.solution ?? '', explanation: v.explanation ?? '', difficulty: v.difficulty, points: Number(v.points),
        source: q.source ?? '', copyrightStatus: q.copyrightStatus,
      });
    }).catch((e) => toast.fail(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function changeType(t: QuestionType) {
    const tpl = TEMPLATES[t];
    setF((p) => ({
      ...p, type: t,
      payloadJson: tpl && !p.payloadJson ? JSON.stringify(tpl.payload, null, 2) : p.payloadJson,
      answerKeyJson: tpl && !p.answerKeyJson ? JSON.stringify(tpl.answerKey, null, 2) : p.answerKeyJson,
    }));
  }

  const flatTopics = useMemo(() => {
    const out: { id: string; name: string }[] = [];
    const walk = (n: TopicNode[], d: number) => n.forEach((t) => (out.push({ id: t.id, name: `${'— '.repeat(d)}${t.name}` }), walk(t.children, d + 1)));
    walk(topics.data ?? [], 0);
    return out;
  }, [topics.data]);

  function buildBody() {
    const t = f.type;
    const body: Record<string, unknown> = {
      stem: f.stem, solution: f.solution || undefined, explanation: f.explanation || undefined,
      difficulty: Number(f.difficulty), points: Number(f.points),
    };
    if (OPTION_TYPES.includes(t)) body.options = f.options.filter((o) => o.content.trim());
    if (t === 'CONTEXT_BASED' && f.context.trim()) body.payload = { context: f.context };
    if (t === 'TRUE_FALSE') body.answerKey = { value: f.tfValue };
    if (t === 'NUMERIC') body.answerKey = { value: Number(f.numValue.replace(',', '.')), tolerance: Number(f.tolerance || 0) };
    if (t === 'TEXT' || t === 'FORMULA') body.answerKey = { accepted: f.accepted.split('\n').map((s) => s.trim()).filter(Boolean) };
    if (JSON_TYPES.includes(t)) {
      body.payload = JSON.parse(f.payloadJson || '{}');
      body.answerKey = JSON.parse(f.answerKeyJson || '{}');
    }
    return body;
  }

  async function save(e: FormEvent, thenSubmit = false) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = buildBody();
      let qid = id;
      if (id) {
        await api(`/questions/${id}`, { method: 'PATCH', json: body });
      } else {
        const q = await api('/questions', {
          method: 'POST',
          json: { ...body, subjectId: f.subjectId, topicId: f.topicId, type: f.type, source: f.source || undefined, copyrightStatus: f.copyrightStatus },
        });
        qid = q.id;
      }
      if (thenSubmit) await api(`/questions/${qid}/submit-review`, { method: 'POST' });
      toast.ok(thenSubmit ? 'Tekshiruvga yuborildi' : 'Yangi versiya saqlandi');
      if (!id) nav(`/questions/${qid}`, { replace: true });
      else nav(0);
    } catch (err) {
      toast.fail(err instanceof SyntaxError ? 'JSON noto\'g\'ri' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const opt = (i: number, patch: Partial<Opt>) =>
    set('options', f.options.map((o, j) => (j === i ? { ...o, ...patch } : f.type === 'MULTIPLE_CHOICE' || !patch.isCorrect ? o : { ...o, isCorrect: false })));

  return (
    <>
      {toast.node}
      <div className="row" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>{id ? 'Savolni tahrirlash' : 'Yangi savol'}</h1>
        {meta && <Badge value={meta.status} />}
      </div>
      <form onSubmit={(e) => save(e)} className="split" style={{ gridTemplateColumns: '1fr 380px' }}>
        <div>
          <div className="card">
            <div className="row">
              <select value={f.subjectId} onChange={(e) => set('subjectId', e.target.value)} disabled={!!id} required>
                <option value="">Fan…</option>
                {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.nameUz}</option>)}
              </select>
              <select value={f.topicId} onChange={(e) => set('topicId', e.target.value)} disabled={!!id} required>
                <option value="">Mavzu…</option>
                {flatTopics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value={f.type} onChange={(e) => changeType(e.target.value as QuestionType)} disabled={!!id}>
                {QUESTION_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="card">
            <label className="f">Savol matni <span>Markdown + LaTeX: $x^2$</span>
              <textarea value={f.stem} onChange={(e) => set('stem', e.target.value)} required />
            </label>
            {f.type === 'CONTEXT_BASED' && (
              <label className="f">Kontekst matni<textarea value={f.context} onChange={(e) => set('context', e.target.value)} /></label>
            )}

            {OPTION_TYPES.includes(f.type) && (
              <>
                <h2>Variantlar {f.type === 'MULTIPLE_CHOICE' ? '(bir nechta to\'g\'ri)' : '(bitta to\'g\'ri)'}</h2>
                {f.options.map((o, i) => (
                  <div className="opt" key={i}>
                    <input value={o.label} onChange={(e) => opt(i, { label: e.target.value })} />
                    <input value={o.content} onChange={(e) => opt(i, { content: e.target.value })} placeholder="Variant matni" />
                    <label className="row"><input type="checkbox" checked={o.isCorrect} onChange={(e) => opt(i, { isCorrect: e.target.checked })} /> to'g'ri</label>
                    <button type="button" className="ghost sm" onClick={() => set('options', f.options.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
                <button type="button" className="ghost sm" onClick={() => set('options', [...f.options, { label: String.fromCharCode(65 + f.options.length), content: '', isCorrect: false }])}>+ variant</button>
              </>
            )}

            {f.type === 'TRUE_FALSE' && (
              <div className="row">
                To'g'ri javob:
                <label><input type="radio" checked={f.tfValue} onChange={() => set('tfValue', true)} /> Rost</label>
                <label><input type="radio" checked={!f.tfValue} onChange={() => set('tfValue', false)} /> Yolg'on</label>
              </div>
            )}
            {f.type === 'NUMERIC' && (
              <div className="row">
                <label className="f">Javob<input value={f.numValue} onChange={(e) => set('numValue', e.target.value)} required /></label>
                <label className="f">Xatolik chegarasi<input value={f.tolerance} onChange={(e) => set('tolerance', e.target.value)} /></label>
              </div>
            )}
            {(f.type === 'TEXT' || f.type === 'FORMULA') && (
              <label className="f">Qabul qilinadigan javoblar <span>har qatorda bittadan; registr va apostrof farqi hisobga olinmaydi</span>
                <textarea value={f.accepted} onChange={(e) => set('accepted', e.target.value)} required />
              </label>
            )}
            {JSON_TYPES.includes(f.type) && (
              <>
                <label className="f">payload (JSON)<textarea value={f.payloadJson} onChange={(e) => set('payloadJson', e.target.value)} /></label>
                <label className="f">answerKey (JSON)<textarea value={f.answerKeyJson} onChange={(e) => set('answerKeyJson', e.target.value)} /></label>
              </>
            )}
            {f.type === 'WRITTEN_RESPONSE' && <p className="muted">Yozma javob avtomatik baholanmaydi — ekspert tekshiradi.</p>}
          </div>

          <div className="card">
            <label className="f">Yechim (ekspert)<textarea value={f.solution} onChange={(e) => set('solution', e.target.value)} /></label>
            <label className="f">Qisqa izoh<textarea value={f.explanation} onChange={(e) => set('explanation', e.target.value)} /></label>
            <div className="row">
              <label className="f">Qiyinlik (1–5)<input type="number" min={1} max={5} value={f.difficulty} onChange={(e) => set('difficulty', Number(e.target.value))} /></label>
              <label className="f">Ball<input type="number" min={0} step={0.5} value={f.points} onChange={(e) => set('points', Number(e.target.value))} /></label>
              {!id && (
                <>
                  <label className="f">Manba<input value={f.source} onChange={(e) => set('source', e.target.value)} /></label>
                  <label className="f">Mualliflik huquqi
                    <select value={f.copyrightStatus} onChange={(e) => set('copyrightStatus', e.target.value)}>
                      {['ORIGINAL', 'LICENSED', 'PUBLIC_DOMAIN', 'UNKNOWN'].map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                </>
              )}
            </div>
          </div>
          <div className="row end">
            <button className="ghost" disabled={busy}>{id ? 'Yangi versiya saqlash' : 'Qoralama saqlash'}</button>
            <button type="button" disabled={busy} onClick={(e) => save(e as unknown as FormEvent, true)}>Saqlash va tekshiruvga yuborish</button>
          </div>
        </div>

        <div>
          <div className="card preview">
            <h2>Ko'rinish</h2>
            <MathText text={f.stem || '…'} />
            {OPTION_TYPES.includes(f.type) && f.options.filter((o) => o.content).map((o, i) => (
              <div key={i} className={`o ${o.isCorrect ? 'c' : ''}`}>{o.label}) <MathText text={o.content} /></div>
            ))}
            {f.solution && <><hr /><b>Yechim:</b> <MathText text={f.solution} /></>}
          </div>
          {meta && (
            <div className="card">
              <h2>Versiyalar</h2>
              {meta.versions.map((v) => (
                <div key={v.id} style={{ marginBottom: 8 }}>
                  v{v.version} <Badge value={v.status} />
                  {v.reviews.map((r, i) => <div key={i} className="muted">{r.decision}: {r.comment}</div>)}
                </div>
              ))}
            </div>
          )}
        </div>
      </form>
    </>
  );
}
