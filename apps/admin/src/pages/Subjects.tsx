import { FormEvent, useEffect, useState } from 'react';
import { api, Subject, TopicNode } from '../api';
import { State, useLoad, useToast, PageHead } from '../components/ui';

export default function Subjects() {
  const toast = useToast();
  const subjects = useLoad(() => api<Subject[]>('/subjects'), []);
  const [subjectId, setSubjectId] = useState<string>('');
  const [selected, setSelected] = useState<TopicNode | null>(null);

  useEffect(() => {
    if (!subjectId && subjects.data?.length) setSubjectId(subjects.data[0].id);
  }, [subjects.data, subjectId]);

  const topics = useLoad(() => (subjectId ? api<TopicNode[]>(`/subjects/${subjectId}/topics`) : Promise.resolve([])), [subjectId]);

  const flat: TopicNode[] = [];
  const walk = (n: TopicNode[]) => n.forEach((t) => (flat.push(t), walk(t.children)));
  walk(topics.data ?? []);

  return (
    <>
      <PageHead title="Fanlar va mavzular" sub="Fanlar, mavzular daraxti va mavzular orasidagi bog'liqliklar" />
      {toast.node}
      <div className="row" style={{ marginBottom: 16 }}>
        <select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setSelected(null); }}>
          {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.nameUz}</option>)}
        </select>
        <NewSubject onDone={() => { subjects.reload(); toast.ok('Fan qo\'shildi'); }} onError={toast.fail} />
      </div>

      <div className="split">
        <div className="card tree">
          <h2>Mavzular daraxti</h2>
          <State loading={topics.loading} error={topics.error} empty={!flat.length}>
            <Tree nodes={topics.data ?? []} selected={selected?.id} onSelect={setSelected} />
          </State>
          <NewTopic
            subjectId={subjectId}
            parent={selected?.level === 'TOPIC' ? selected : null}
            onDone={() => { topics.reload(); toast.ok('Mavzu qo\'shildi'); }}
            onError={toast.fail}
          />
        </div>
        <div>
          {selected ? (
            <TopicPanel key={selected.id} topic={selected} all={flat} onChanged={topics.reload} toast={toast} />
          ) : (
            <div className="card muted">Mavzuni tanlang</div>
          )}
        </div>
      </div>
    </>
  );
}

function Tree({ nodes, selected, onSelect }: { nodes: TopicNode[]; selected?: string; onSelect: (t: TopicNode) => void }) {
  return (
    <ul>
      {nodes.map((n) => (
        <li key={n.id}>
          <span className={`node ${selected === n.id ? 'sel' : ''}`} onClick={() => onSelect(n)}>{n.name}</span>
          {n.children.length > 0 && <Tree nodes={n.children} selected={selected} onSelect={onSelect} />}
        </li>
      ))}
    </ul>
  );
}

function NewSubject({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: '', nameUz: '', nameRu: '' });
  if (!open) return <button className="ghost" onClick={() => setOpen(true)}>+ Fan</button>;
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/subjects', { method: 'POST', json: f });
      setOpen(false);
      setF({ code: '', nameUz: '', nameRu: '' });
      onDone();
    } catch (err) {
      onError((err as Error).message);
    }
  }
  return (
    <form className="row" onSubmit={submit}>
      <input placeholder="kod (informatics)" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required />
      <input placeholder="Nomi (uz)" value={f.nameUz} onChange={(e) => setF({ ...f, nameUz: e.target.value })} required />
      <input placeholder="Название (ru)" value={f.nameRu} onChange={(e) => setF({ ...f, nameRu: e.target.value })} required />
      <button>Saqlash</button>
      <button type="button" className="ghost" onClick={() => setOpen(false)}>Bekor</button>
    </form>
  );
}

function NewTopic({ subjectId, parent, onDone, onError }: { subjectId: string; parent: TopicNode | null; onDone: () => void; onError: (m: string) => void }) {
  const [name, setName] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/topics', { method: 'POST', json: { subjectId, name, parentId: parent?.id } });
      setName('');
      onDone();
    } catch (err) {
      onError((err as Error).message);
    }
  }
  return (
    <form onSubmit={submit} style={{ marginTop: 12 }}>
      <label className="f">{parent ? `«${parent.name}» ichiga subtopic` : 'Yangi mavzu'}
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <button disabled={!subjectId}>Qo'shish</button>
    </form>
  );
}

interface Deps {
  prerequisites: { id: string; name: string }[];
  dependents: { id: string; name: string }[];
}

function TopicPanel({ topic, all, onChanged, toast }: { topic: TopicNode; all: TopicNode[]; onChanged: () => void; toast: ReturnType<typeof useToast> }) {
  const deps = useLoad(() => api<Deps>(`/topics/${topic.id}/dependencies`), [topic.id]);
  const [name, setName] = useState(topic.name);
  const [pre, setPre] = useState('');

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.ok(msg);
      deps.reload();
      onChanged();
    } catch (e) {
      toast.fail((e as Error).message);
    }
  };

  return (
    <>
      <div className="card">
        <h2>{topic.level === 'TOPIC' ? 'Mavzu' : 'Subtopic'}</h2>
        <div className="row">
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
          <button onClick={() => run(() => api(`/topics/${topic.id}`, { method: 'PATCH', json: { name } }), 'Saqlandi')}>Saqlash</button>
          <button className="danger" onClick={() => confirm('Mavzuni o\'chirasizmi?') && run(() => api(`/topics/${topic.id}`, { method: 'DELETE' }), 'O\'chirildi')}>O'chirish</button>
        </div>
      </div>
      <div className="card">
        <h2>Knowledge Graph — oldin o'rganilishi kerak</h2>
        <State loading={deps.loading} error={deps.error}>
          <ul>
            {deps.data?.prerequisites.map((p) => (
              <li key={p.id} className="row">
                {p.name}
                <button className="ghost sm" onClick={() => run(() => api(`/topics/${topic.id}/dependencies/${p.id}`, { method: 'DELETE' }), 'Olib tashlandi')}>×</button>
              </li>
            ))}
            {!deps.data?.prerequisites.length && <li className="muted">Yo'q</li>}
          </ul>
          <div className="row">
            <select value={pre} onChange={(e) => setPre(e.target.value)}>
              <option value="">Mavzu tanlang…</option>
              {all.filter((t) => t.id !== topic.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button disabled={!pre} onClick={() => run(() => api(`/topics/${topic.id}/dependencies`, { method: 'POST', json: { prerequisiteId: pre } }), 'Bog\'liqlik qo\'shildi')}>
              Qo'shish
            </button>
          </div>
          {!!deps.data?.dependents.length && (
            <p className="muted">Bu mavzuga tayanadi: {deps.data.dependents.map((d) => d.name).join(', ')}</p>
          )}
        </State>
      </div>
    </>
  );
}
