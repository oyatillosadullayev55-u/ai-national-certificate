import { useState } from 'react';
import { api, Paged, qs } from '../api';
import { Pager, State, useLoad, PageHead } from '../components/ui';

interface Log {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  meta: unknown;
  ip: string | null;
  createdAt: string;
}

export default function Audit() {
  const [f, setF] = useState({ action: '', entityType: '', page: 1 });
  const list = useLoad(() => api<Paged<Log>>(`/admin/audit-logs${qs({ ...f, limit: 50 })}`), [f]);
  return (
    <>
      <PageHead title="Audit log" sub="Tizimdagi muhim amallar tarixi" />
      <div className="card row">
        <input placeholder="action (masalan question.review)" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value, page: 1 })} />
        <input placeholder="entityType" value={f.entityType} onChange={(e) => setF({ ...f, entityType: e.target.value, page: 1 })} />
      </div>
      <div className="card">
        <State loading={list.loading} error={list.error} empty={!list.data?.items.length}>
          <table>
            <thead><tr><th>Vaqt</th><th>Amal</th><th>Obyekt</th><th>Kim</th><th>Ma'lumot</th></tr></thead>
            <tbody>
              {list.data?.items.map((l) => (
                <tr key={l.id}>
                  <td className="muted">{new Date(l.createdAt).toLocaleString('uz')}</td>
                  <td><code>{l.action}</code></td>
                  <td>{l.entityType} <span className="muted">{l.entityId?.slice(0, 8)}</span></td>
                  <td className="muted">{l.actorId?.slice(0, 8) ?? '—'}</td>
                  <td className="muted"><code>{l.meta ? JSON.stringify(l.meta) : ''}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data && <Pager page={f.page} pages={list.data.meta.pages} onPage={(p) => setF({ ...f, page: p })} />}
        </State>
      </div>
    </>
  );
}
