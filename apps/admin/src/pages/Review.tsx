import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Paged, qs } from '../api';
import { MathText, Pager, State, useLoad, useToast } from '../components/ui';

interface Item {
  id: string;
  version: number;
  stem: string;
  solution: string | null;
  explanation: string | null;
  answerKey: unknown;
  difficulty: number;
  options: { id: string; label: string; content: string; isCorrect: boolean }[];
  question: { id: string; type: string; authorId: string };
}

export default function Review() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const list = useLoad(() => api<Paged<Item>>(`/questions/review-queue${qs({ page, limit: 10 })}`), [page]);
  const [comments, setComments] = useState<Record<string, string>>({});

  async function decide(it: Item, decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES') {
    if (decision !== 'APPROVE' && !comments[it.id]?.trim()) return toast.fail('Rad etish yoki o\'zgartirish so\'rash uchun izoh yozing');
    try {
      await api(`/questions/${it.question.id}/review`, { method: 'POST', json: { versionId: it.id, decision, comment: comments[it.id] || undefined } });
      toast.ok(decision === 'APPROVE' ? 'Tasdiqlandi' : 'Qaytarildi');
      list.reload();
    } catch (e) {
      toast.fail((e as Error).message);
    }
  }

  return (
    <>
      {toast.node}
      <h1>Tekshiruv navbati {list.data && <span className="muted">({list.data.meta.total})</span>}</h1>
      <State loading={list.loading} error={list.error} empty={!list.data?.items.length}>
        {list.data?.items.map((it) => (
          <div className="card" key={it.id}>
            <div className="row muted" style={{ marginBottom: 8 }}>
              {it.question.type} · v{it.version} · qiyinlik {it.difficulty}
              <span className="spacer" />
              <Link to={`/questions/${it.question.id}`}>Tahrirlash</Link>
            </div>
            <div className="preview">
              <MathText text={it.stem} />
              {it.options.map((o) => (
                <div key={o.id} className={`o ${o.isCorrect ? 'c' : ''}`}>{o.label}) <MathText text={o.content} /> {o.isCorrect && '✓'}</div>
              ))}
              {it.answerKey != null && <pre className="muted">{JSON.stringify(it.answerKey)}</pre>}
              {it.solution && <p><b>Yechim:</b> <MathText text={it.solution} /></p>}
            </div>
            <textarea
              placeholder="Izoh (rad etish uchun majburiy)"
              style={{ marginTop: 10, minHeight: 50 }}
              value={comments[it.id] ?? ''}
              onChange={(e) => setComments({ ...comments, [it.id]: e.target.value })}
            />
            <div className="row end" style={{ marginTop: 8 }}>
              <button className="danger" onClick={() => decide(it, 'REJECT')}>Rad etish</button>
              <button className="ghost" onClick={() => decide(it, 'REQUEST_CHANGES')}>O'zgartirish so'rash</button>
              <button className="ok" onClick={() => decide(it, 'APPROVE')}>Tasdiqlash</button>
            </div>
          </div>
        ))}
        {list.data && <Pager page={page} pages={list.data.meta.pages} onPage={setPage} />}
      </State>
    </>
  );
}
