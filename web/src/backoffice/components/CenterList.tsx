import { Link } from "react-router";
import { LoadingSkeleton } from "../../shared/components/LoadingSkeleton";
import type { Center } from "../centers";

export function CenterList({
  centers,
  loading,
  onSelect,
}: {
  centers: Center[];
  loading: boolean;
  onSelect?: (id: string) => void;
}) {
  return (
    <section aria-labelledby="centers-heading">
      <div className="section-heading">
        <div>
          <h2 id="centers-heading">Centros existentes</h2>
          <p>Revisa los centros registrados.</p>
        </div>
        <span className="count">{centers.length}</span>
      </div>
      {loading ? (
        <LoadingSkeleton label="Cargando centros…" />
      ) : centers.length === 0 ? (
        <div className="empty">
          <strong>Aún no hay centros</strong>
          <p>Crea el primero para comenzar.</p>
        </div>
      ) : (
        <div className="center-list">
          {centers.map((center) => (
            <article className="center-card" key={center.id}>
              <div className="center-icon" aria-hidden="true">
                ✳
              </div>
              <div className="center-info">
                <h3>{center.name}</h3>
                <p>{center.description || "Sin descripción"}</p>
                <div className="meta">
                  <span>
                    ◷ &nbsp;{center.opens_at.slice(0, 5)} –{" "}
                    {center.closes_at.slice(0, 5)}
                  </span>
                  <span>/{center.slug}</span>
                </div>
              </div>
              <div>
                {onSelect && (
                  <button
                    className="button button-primary btn"
                    onClick={() => onSelect(center.id)}
                  >
                    Abrir centro
                  </button>
                )}
                <p>
                  <Link to={`/${center.slug}`}>Ver página pública →</Link>
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
