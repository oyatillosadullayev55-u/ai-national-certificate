import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Icon, IconName } from '../components/icons';
import { PageHead, State, useLoad } from '../components/ui';

interface Dash {
  users: number;
  newUsersWeek: number;
  students: number;
  reviewQueue: number;
  attemptsWeek: number;
  questions: Record<string, number>;
  aiToday: { requests: number; tokensIn: number; tokensOut: number };
  subjects: { id: string; name: string; topics: number; approvedQuestions: number }[];
}

export default function Dashboard() {
  const nav = useNavigate();
  const { data, error, loading } = useLoad(() => api<Dash>('/admin/dashboard'), []);
  const maxQ = Math.max(1, ...(data?.subjects.map((s) => s.approvedQuestions) ?? [1]));
  return (
    <>
      <PageHead title="Dashboard" sub="Platformaning bugungi holati bir qarashda" />
      <State loading={loading} error={error}>
        {data && (
          <>
            <div className="grid">
              <Stat icon="users" v={data.users} l="Foydalanuvchilar" />
              <Stat icon="userPlus" v={data.newUsersWeek} l="Yangi (7 kun)" />
              <Stat icon="grad" v={data.students} l="O'quvchilar" />
              <Stat icon="activity" v={data.attemptsWeek} l="Test urinishlari (7 kun)" />
              <Stat icon="check" v={data.questions.APPROVED ?? 0} l="Tasdiqlangan savollar" />
              <Link className="stat-link" to="/review"><Stat icon="clock" v={data.reviewQueue} l="Tekshiruvda →" /></Link>
              <Link className="stat-link" to="/ai-usage"><Stat icon="sparkles" v={data.aiToday.requests} l="AI so'rovlari (bugun)" ai /></Link>
            </div>

            <div className="card ai-hero" style={{ marginTop: 16 }}>
              <h2>AI bilan savol banki to'ldiring</h2>
              <p>Mavzuni tanlang — Claude bir necha soniyada yechimi bilan test savollarini tayyorlaydi. Siz tahrirlab, ekspert tekshiruviga yuborasiz.</p>
              <button onClick={() => nav('/ai-generate')}><Icon name="sparkles" size={16} /> Savol yaratish</button>
            </div>

            <div className="card">
              <h2>Fanlar bo'yicha kontent</h2>
              <table>
                <thead><tr><th>Fan</th><th>Mavzular</th><th>Tasdiqlangan savollar</th><th style={{ width: '30%' }}></th></tr></thead>
                <tbody>
                  {data.subjects.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td>{s.topics}</td>
                      <td>{s.approvedQuestions}</td>
                      <td><div className="bar"><i style={{ width: `${(s.approvedQuestions / maxQ) * 100}%` }} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </State>
    </>
  );
}

function Stat({ v, l, icon, ai }: { v: number; l: string; icon: IconName; ai?: boolean }) {
  return (
    <div className={`card stat${ai ? ' ai' : ''}`} style={{ marginBottom: 0 }}>
      <div className="ic"><Icon name={icon} /></div>
      <div className="v">{v.toLocaleString('uz')}</div>
      <div className="l">{l}</div>
    </div>
  );
}
