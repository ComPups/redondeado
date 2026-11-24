import type { Center } from '../centers';

export function CenterList({ centers, loading }: { centers: Center[]; loading: boolean }) {
  return (
    <section aria-labelledby="centers-heading">
      <div className="section-heading"><div><h2 id="centers-heading">Centros existentes</h2><p>Revisa los centros registrados.</p></div><span className="count">{centers.length}</span></div>
      {loading ? <div className="empty">Cargando centros…</div> : centers.length === 0 ? (
        <div className="empty"><strong>Aún no hay centros</strong><p>Crea el primero para comenzar.</p></div>
      ) : (
        <div className="center-list">{centers.map(center => (
          <article className="center-card" key={center.id}>
            <div className="center-icon" aria-hidden="true">✳</div>
            <div className="center-info"><h3>{center.name}</h3><p>{center.description || 'Sin descripción'}</p>
              <div className="meta"><span>◷ &nbsp;{center.opens_at.slice(0, 5)} – {center.closes_at.slice(0, 5)}</span><span>/{center.slug}</span></div>
            </div>
            <span className="card-tag">Centro</span>
          </article>
        ))}</div>
      )}
    </section>
  );
}
