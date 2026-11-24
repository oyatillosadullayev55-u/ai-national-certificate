import { FormEvent, useState } from 'react';
import { login } from '../api';
import { Icon } from '../components/icons';

export default function Login() {
  const [id, setId] = useState('+998');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(id.trim(), pw);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div className="brand">
          <div className="logo"><Icon name="grad" size={19} /></div>
          <div>AI National Certificate<small>Boshqaruv paneliga kirish</small></div>
        </div>
        {err && <div className="alert error">{err}</div>}
        <label className="f">Telefon yoki email
          <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" required />
        </label>
        <label className="f">Parol
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
        </label>
        <button className="lg" disabled={busy} style={{ width: '100%', marginTop: 6 }}>{busy ? 'Kirilmoqda…' : 'Kirish'}</button>
      </form>
    </div>
  );
}
