import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, Paged, qs, QUESTION_TYPES, Subject } from '../api';
import { Icon } from '../components/icons';
import { Badge, MathText, PageHead, Pager, State, useLoad } from '../components/ui';

interface Row {
  id: string;
  type: string;
  status: string;
  updatedAt: string;
  versions: { id: string; version: number; stem: string; status: string; difficulty: number }[];
}

export default function Questions() {
  const nav = useNavigate();
  const subjects = useLoad(() => api<Subject[]>('/subjects'), []);
  const [f, setF] = useState({ subjectId: '', status: '', type: '', q: '', page: 1 });
  const list = useLoad(() => api<Paged<Row>>(`/questions${qs({ ...f, limit: 25 })}`), [f]);
  const set = (k: keyof typeof f, v: string | number) => setF({ ...f, [k]: v, page: k === 'page' ? Number(v) : 1 });

  return (
    <>
      <PageHead title="Savollar" sub="Savollar banki: qidirish, filtrlash va tahrirlash">
        <Link to="/ai-generate"><button className="ai"><Icon name="sparkles" size={16} /> AI bilan yaratish</button></Link>
        <Link to="/questions/new"><button>+ Yangi savol</button></Link>
      </PageHead>
      <div className="card row">
        <select value={f.subjectId} onChange={(e) => set('subjectId', e.target.value)}>
          <option value="">Barcha fanlar</option>
          {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.nameUz}</option>)}
        </select>
        <select value={f.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">Barcha holatlar</option>
          {['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={f.type} onChange={(e) => set('type', e.target.value)}>
          <option value="">Barcha turlar</option>
          {QUESTION_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input placeholder="Matn bo'yicha qidirish" value={f.q} onChange={(e) => set('q', e.target.value)} style={{ flex: 1 }} />
      </div>
      <div className="card">
        <State loading={list.loading} error={list.error} empty={!list.data?.items.length}>
          <table>
            <thead><tr><th>Savol</th><th>Tur</th><th>Qiyinlik</th><th>Holat</th><th>v</th></tr></thead>
            <tbody>
              {list.data?.items.map((q) => {
                const v = q.versions[0];
                return (
                  <tr key={q.id} className="click" onClick={() => nav(`/questions/${q.id}`)}>
                    <td><MathText text={(v?.stem ?? '').slice(0, 140)} /></td>
                    <td className="muted">{q.type}</td>
                    <td>{v?.difficulty}</td>
                    <td><Badge value={q.status} /> {v && v.status !== q.status && <Badge value={v.status} />}</td>
                    <td>{v?.version}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.data && <Pager page={list.data.meta.page} pages={list.data.meta.pages} onPage={(p) => set('page', p)} />}
        </State>
      </div>
    </>
  );
}
