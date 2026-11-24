import { api } from '../api';
import { State, useLoad, PageHead } from '../components/ui';

interface Row {
  day: string;
  feature: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
}

export default function AiUsage() {
  const { data, error, loading } = useLoad(() => api<Row[]>('/admin/ai-usage'), []);
  const total = (data ?? []).reduce((s, r) => ({ req: s.req + r.requests, tin: s.tin + r.tokensIn, tout: s.tout + r.tokensOut }), { req: 0, tin: 0, tout: 0 });
  return (
    <>
      <PageHead title="AI sarfi" sub="So'nggi 30 kundagi AI so'rovlari va token sarfi" />
      <State loading={loading} error={error} empty={!data?.length}>
        <div className="grid" style={{ marginBottom: 16 }}>
          <div className="card stat"><div className="v">{total.req.toLocaleString('uz')}</div><div className="l">So'rovlar</div></div>
          <div className="card stat"><div className="v">{total.tin.toLocaleString('uz')}</div><div className="l">Kiruvchi tokenlar</div></div>
          <div className="card stat"><div className="v">{total.tout.toLocaleString('uz')}</div><div className="l">Chiquvchi tokenlar</div></div>
        </div>
        <div className="card">
          <table>
            <thead><tr><th>Kun</th><th>Funksiya</th><th>So'rovlar</th><th>Tokenlar (in / out)</th></tr></thead>
            <tbody>
              {data?.map((r, i) => (
                <tr key={i}>
                  <td>{new Date(r.day).toLocaleDateString('uz')}</td>
                  <td>{r.feature}</td>
                  <td>{r.requests}</td>
                  <td className="muted">{r.tokensIn.toLocaleString('uz')} / {r.tokensOut.toLocaleString('uz')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </State>
    </>
  );
}
