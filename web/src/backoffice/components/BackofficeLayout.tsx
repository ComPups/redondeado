import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';

export function BackofficeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" to="/staff/centers"><span className="brand-mark">✳</span> redondeado</Link>
        <p className="sidebar-label">ESPACIO DE TRABAJO</p>
        <nav aria-label="Navegación principal">
          <NavLink className="nav-active" to="/staff/centers"><span aria-hidden="true">▦</span> Centros</NavLink>
        </nav>
        <div className="sidebar-note"><strong>Tu espacio de trabajo</strong><p>Gestiona la información de tus centros desde un solo lugar.</p></div>
      </aside>
      <main className="workspace">
        <header className="topbar"><span>Backoffice <span className="separator">/</span> Centros</span><span className="badge">Gestión local</span></header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
