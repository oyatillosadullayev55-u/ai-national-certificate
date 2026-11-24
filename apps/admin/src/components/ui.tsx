import katex from 'katex';
import 'katex/dist/katex.min.css';
import { ReactNode, useCallback, useEffect, useState } from 'react';

/** $...$ ichidagi LaTeX'ni render qiladi, qolganini oddiy matn sifatida */
export function MathText({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <span className="math">
      {parts.map((p, i) => {
        if (p.startsWith('$') && p.endsWith('$') && p.length > 2) {
          const html = katex.renderToString(p.slice(1, -1), { throwOnError: false });
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        }
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}

/** Oddiy ma'lumot yuklash hook'i: loading / error / reload */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const run = useCallback(() => {
    setLoading(true);
    setError(null);
    fn()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { data, error, loading, reload: run, setData };
}

export function State({ loading, error, empty, children }: { loading: boolean; error: string | null; empty?: boolean; children: ReactNode }) {
  if (loading) return <div className="shimmer" style={{ height: 80 }} />;
  if (error) return <div className="alert error">{error}</div>;
  if (empty) return <div className="muted pad">Ma'lumot yo'q</div>;
  return <>{children}</>;
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
      <span>{page} / {pages}</span>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button>
    </div>
  );
}

export function Badge({ value }: { value: string }) {
  return <span className={`badge b-${value.toLowerCase()}`}>{value}</span>;
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? <div className={`toast ${msg.kind}`}>{msg.text}</div> : null;
  return { node, ok: (text: string) => setMsg({ text, kind: 'ok' }), fail: (text: string) => setMsg({ text, kind: 'error' }) };
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
