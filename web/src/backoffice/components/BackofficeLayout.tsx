import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Brand } from '../../shared/components/Brand';

export function BackofficeLayout({ children, onSignOut, page, onCenters }: { children: ReactNode; onSignOut: () => void; onCenters?: () => void; page: 'agenda' | 'services' | 'center' | 'platform' }) {
  return <div className="shell staff-shell">
    <aside className="sidebar">
      <Brand to="/staff" />
      <p className="sidebar-label">{page === 'platform' ? 'ADMINISTRACIÓN' : 'ESPACIO DE TRABAJO'}</p>
      <nav aria-label="Navegación principal">
        {page === 'platform' ? <><a href="#centros" onClick={onCenters}><span aria-hidden="true">▦</span> Centros</a><a href="#registros"><span aria-hidden="true">✳︎</span> Registros</a></> : <><Link to="/staff" aria-current={page === 'agenda' ? 'page' : undefined}><span aria-hidden="true">▦</span> Agendamientos</Link>
        <Link to="/staff/servicios" aria-current={page === 'services' ? 'page' : undefined}><span aria-hidden="true">✳︎</span> Servicios</Link>
        <Link to="/staff/centro" aria-current={page === 'center' ? 'page' : undefined}><span aria-hidden="true">⌂</span> Mi centro</Link></>}
      </nav>
      {page !== 'platform' && <div className="sidebar-note"><strong>Tu espacio de trabajo</strong><p>Consulta la información de tu centro en un solo lugar.</p></div>}
    </aside>
    <main className="workspace">
      <header className="topbar"><span>{page === 'platform' ? 'Administración de plataforma' : <>Mi espacio <span className="separator">/</span> {page === 'center' ? 'Mi centro' : page === 'services' ? 'Servicios' : 'Agendamientos'}</>}</span><button className="staff-signout" onClick={onSignOut}>Cerrar sesión</button></header>
      <div className="content">{children}</div>
    </main>
  </div>;
}
