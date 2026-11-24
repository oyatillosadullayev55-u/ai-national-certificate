import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { isLoggedIn, logout, onAuthChange } from './api';
import { Icon, IconName } from './components/icons';
import AiGenerate from './pages/AiGenerate';
import AiUsage from './pages/AiUsage';
import Audit from './pages/Audit';
import Dashboard from './pages/Dashboard';
import Import from './pages/Import';
import Login from './pages/Login';
import QuestionEditor from './pages/QuestionEditor';
import Questions from './pages/Questions';
import Review from './pages/Review';
import Subjects from './pages/Subjects';
import Users from './pages/Users';
import './styles.css';

const NAV: { group: string; items: { to: string; label: string; icon: IconName; ai?: boolean }[] }[] = [
  { group: 'Asosiy', items: [{ to: '/', label: 'Dashboard', icon: 'home' }] },
  {
    group: 'Kontent',
    items: [
      { to: '/subjects', label: 'Fanlar va mavzular', icon: 'book' },
      { to: '/questions', label: 'Savollar', icon: 'list' },
      { to: '/ai-generate', label: 'AI savol yaratish', icon: 'sparkles', ai: true },
      { to: '/review', label: 'Tekshiruv navbati', icon: 'check' },
      { to: '/import', label: 'Import', icon: 'upload' },
    ],
  },
  {
    group: 'Boshqaruv',
    items: [
      { to: '/users', label: 'Foydalanuvchilar', icon: 'users' },
      { to: '/ai-usage', label: 'AI sarfi', icon: 'chart' },
      { to: '/audit', label: 'Audit log', icon: 'shield' },
    ],
  },
];

function App() {
  const [authed, setAuthed] = useState(isLoggedIn());
  useEffect(() => {
    const off = onAuthChange(() => setAuthed(isLoggedIn()));
    return () => {
      off();
    };
  }, []);

  if (!authed) return <Login />;

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <div className="logo"><Icon name="grad" size={19} /></div>
          <div>AI National Certificate<small>Boshqaruv paneli</small></div>
        </div>
        <nav>
          {NAV.map((g) => (
            <div key={g.group} style={{ display: 'contents' }}>
              <div className="nav-group">{g.group}</div>
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'}>
                  <Icon name={n.icon} />
                  {n.label}
                  {n.ai && <span className="pill">AI</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <button className="ghost logout" onClick={() => logout()}><Icon name="logout" size={16} /> Chiqish</button>
        </div>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/subjects" element={<Subjects />} />
          <Route path="/questions" element={<Questions />} />
          <Route path="/questions/new" element={<QuestionEditor />} />
          <Route path="/questions/:id" element={<QuestionEditor />} />
          <Route path="/ai-generate" element={<AiGenerate />} />
          <Route path="/review" element={<Review />} />
          <Route path="/import" element={<Import />} />
          <Route path="/users" element={<Users />} />
          <Route path="/ai-usage" element={<AiUsage />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
