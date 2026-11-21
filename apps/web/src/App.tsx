import { useQuery } from '@tanstack/react-query';
import { NavLink, Route, Routes } from 'react-router';
import type { QuotaResponse } from '@tubescope/shared';
import { getJson } from './api';
import { Keywords } from './Keywords';

const classicUrl = import.meta.env.DEV ? 'http://localhost:4949/' : '/';
const navigation = [
  { to: '/', label: 'Dashboard', glyph: '◫' },
  { to: '/keywords', label: 'Keywords', glyph: '⌕' },
  { to: '/outliers', label: 'Outliers', glyph: '↗' },
  { to: '/competitors', label: 'Competitors', glyph: '◉' },
];

function Quota() {
  const quota = useQuery({ queryKey: ['quota'], queryFn: ({ signal }) => getJson<QuotaResponse>('/quota', signal), refetchInterval: 60_000 });
  return (
    <div className="quota" aria-live="polite">
      <span className="status-dot" />
      <span>API quota today</span>
      {quota.data ? (
        <>
          <strong>
            {quota.data.today.units.toLocaleString()} / {quota.data.today.limit.toLocaleString()}
          </strong>
          <span className="quota-note">{quota.data.today.remaining.toLocaleString()} remaining</span>
        </>
      ) : (
        <strong>{quota.isError ? 'Unavailable' : 'Loading…'}</strong>
      )}
      {quota.isError ? (
        <button type="button" className="text-button" onClick={() => void quota.refetch()}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

function ComingSoon({ name, hash = '' }: { name: string; hash?: string }) {
  return (
    <section className="placeholder">
      <p className="eyebrow">Research desk</p>
      <h1>{name}</h1>
      <p>Coming soon — use the classic UI</p>
      <a className="classic-link" href={`${classicUrl}${hash}`}>
        Open classic UI <span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}

export function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/app/">
          <span className="brand-mark" aria-hidden="true">
            t
          </span>
          Tubescope<span className="preview-label">Preview</span>
        </a>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation.map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span aria-hidden="true">{item.glyph}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span>Read-only research</span>
          <a href={classicUrl}>Classic UI ↗</a>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <span className="header-label">YOUTUBE RESEARCH DESK</span>
          <Quota />
        </header>
        <main id="main-content">
          <Routes>
            <Route path="/" element={<ComingSoon name="Dashboard" />} />
            <Route path="/keywords" element={<Keywords />} />
            <Route path="/outliers" element={<ComingSoon name="Outliers" hash="#/outliers" />} />
            <Route path="/competitors" element={<ComingSoon name="Competitors" hash="#/competitors" />} />
            <Route path="*" element={<ComingSoon name="Page not found" />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
