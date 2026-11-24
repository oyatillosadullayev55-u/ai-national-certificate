import { useState } from 'react';
import { api, Paged, qs } from '../api';
import { Badge, Pager, State, useLoad, useToast, PageHead } from '../components/ui';

interface U {
  id: string;
  phone: string | null;
  email: string | null;
  status: string;
  createdAt: string;
  profile: { firstName: string; lastName: string | null } | null;
  roles: { id: string; organizationId: string | null; role: { key: string; name: string } }[];
}

export default function Users() {
  const toast = useToast();
  const [f, setF] = useState({ q: '', role: '', page: 1 });
  const list = useLoad(() => api<Paged<U>>(`/admin/users${qs({ ...f, limit: 25 })}`), [f]);
  const roles = useLoad(() => api<{ key: string; name: string; scope: string }[]>('/admin/roles').catch(() => []), []);
  const [pick, setPick] = useState<Record<string, string>>({});

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.ok(msg);
      list.reload();
    } catch (e) {
      toast.fail((e as Error).message);
    }
  };

  const globalRoles = (roles.data ?? []).filter((r) => r.scope === 'GLOBAL');

  return (
    <>
      {toast.node}
      <PageHead title="Foydalanuvchilar" sub="Foydalanuvchilar, holatlari va rollari" />
      <div className="card row">
        <input placeholder="Telefon, email yoki ism" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} style={{ flex: 1 }} />
        <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, page: 1 })}>
          <option value="">Barcha rollar</option>
          {roles.data?.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </select>
      </div>
      <div className="card">
        <State loading={list.loading} error={list.error} empty={!list.data?.items.length}>
          <table>
            <thead><tr><th>Foydalanuvchi</th><th>Rollar</th><th>Holat</th><th>Rol berish</th><th /></tr></thead>
            <tbody>
              {list.data?.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.profile?.firstName} {u.profile?.lastName}</b>
                    <div className="muted">{u.phone ?? u.email}</div>
                  </td>
                  <td>
                    {u.roles.map((r) => (
                      <span key={r.id} className="badge" style={{ marginRight: 4 }}>
                        {r.role.key}{r.organizationId ? ' (org)' : ''}
                        {!r.organizationId && (
                          <button className="ghost sm" style={{ padding: '0 4px', border: 0 }} title="Olib tashlash"
                            onClick={() => confirm(`${r.role.key} rolini olib tashlaysizmi?`) && act(() => api(`/admin/users/${u.id}/roles/${r.id}`, { method: 'DELETE' }), 'Rol olib tashlandi')}>×</button>
                        )}
                      </span>
                    ))}
                  </td>
                  <td><Badge value={u.status} /></td>
                  <td className="row">
                    <select value={pick[u.id] ?? ''} onChange={(e) => setPick({ ...pick, [u.id]: e.target.value })}>
                      <option value="">—</option>
                      {globalRoles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                    </select>
                    <button className="sm" disabled={!pick[u.id]} onClick={() => act(() => api(`/admin/users/${u.id}/roles`, { method: 'POST', json: { roleKey: pick[u.id] } }), 'Rol berildi')}>Berish</button>
                  </td>
                  <td>
                    {u.status === 'ACTIVE' ? (
                      <button className="danger sm" onClick={() => confirm('Bloklaysizmi? Barcha sessiyalari yopiladi.') && act(() => api(`/admin/users/${u.id}/status`, { method: 'PATCH', json: { status: 'BLOCKED' } }), 'Bloklandi')}>Bloklash</button>
                    ) : (
                      <button className="ok sm" onClick={() => act(() => api(`/admin/users/${u.id}/status`, { method: 'PATCH', json: { status: 'ACTIVE' } }), 'Faollashtirildi')}>Faollashtirish</button>
                    )}
                  </td>
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
