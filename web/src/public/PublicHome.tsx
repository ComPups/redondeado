import { useEffect, useState } from 'react';
import { apiUrl } from '../shared/api';
import centerInterior from './assets/center-interior.jpg';
import { LoadingSkeleton } from '../shared/components/LoadingSkeleton';
import { Link } from 'react-router';
import { PublicHeader } from './PublicComponents';

type Center = { slug: string; name: string; description: string; image_url: string | null };
type CentersResult = { status: 'loading' } | { status: 'unavailable' } | { status: 'ready'; centers: Center[] };

export function PublicHome() {
  const [result, setResult] = useState<CentersResult>({ status: 'loading' });
  const [page, setPage] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/public/centers`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Could not load centers'); return response.json(); })
      .then(centers => setResult({ status: 'ready', centers }))
      .catch(() => { if (!controller.signal.aborted) setResult({ status: 'unavailable' }); });
    return () => controller.abort();
  }, []);

  return (
    <div className="public-site" lang="es-CL">
      <PublicHeader />
      <main>
        <section className="public-container public-hero" aria-labelledby="hero-title">
          <div className="public-hero-copy">
            <h1 id="hero-title">Agenda tu próxima <em>atención en línea</em></h1>
            <p>Descubre los centros, explora sus servicios y reserva una hora sin crear una cuenta.</p>
            <a className="public-button" href="#centros">Explorar centros</a>
          </div>

        </section>

        <section className="public-catalog" id="centros" aria-labelledby="centers-title">
          <div className="public-container centers-section">
            <p className="public-kicker">Encuentra tu espacio</p>
            <h2 id="centers-title">Explora nuestros centros</h2>
            <p>Elige un centro para conocer sus servicios y profesionales.</p>
            {result.status === 'loading' ? <LoadingSkeleton label="Cargando centros…" /> : result.status === 'unavailable' ? (
              <p role="status">No pudimos cargar los centros en este momento. Inténtalo nuevamente más tarde.</p>
            ) : result.centers.length === 0 ? (
              <p role="status">Aún no hay centros disponibles.</p>
            ) : (
              <>
                <div className="centers-grid" aria-live="polite">
                  {result.centers.slice(page * 3, page * 3 + 3).map(center => (
                    <article className="discovery-card" key={center.slug}>
                      <img src={center.image_url || centerInterior} alt="" />
                      <div className="discovery-card-content">
                        <h3>{center.name}</h3>
                        <p>{center.description || 'Conoce los servicios y profesionales de este centro.'}</p>
                        <Link className="public-button public-button-outline" to={`/${encodeURIComponent(center.slug)}`} aria-label={`Ver centro ${center.name}`}>Ver centro <span aria-hidden="true">→</span></Link>
                      </div>
                    </article>
                  ))}
                </div>
                {result.centers.length > 3 && <div className="centers-navigation" aria-label="Navegación de centros">
                  <button type="button" onClick={() => setPage(page - 1)} disabled={page === 0}>← Anterior</button>
                  <span>Página {page + 1} de {Math.ceil(result.centers.length / 3)}</span>
                  <button type="button" onClick={() => setPage(page + 1)} disabled={(page + 1) * 3 >= result.centers.length}>Siguiente →</button>
                </div>}
              </>
            )}
          </div>
        </section>

        <section className="public-container booking-steps" aria-labelledby="steps-title">
          <h2 id="steps-title">Cómo reservar</h2>
          <ol>
            <li><h3>Selecciona un centro</h3><p>Explora los centros y elige dónde atenderte.</p></li>
            <li><h3>Elige servicio y profesional</h3><p>Puedes empezar por cualquiera de los dos.</p></li>
            <li><h3>Selecciona una hora</h3><p>Revisa los horarios disponibles para tu elección.</p></li>
            <li><h3>Confirma con tus datos</h3><p>Ingresa tu nombre, correo y teléfono para reservar.</p></li>
          </ol>
        </section>

        <section className="public-team" aria-labelledby="team-title">
          <div className="public-container public-team-inner">
            <div>
              <h2 id="team-title">¿Eres parte del equipo de algún centro?</h2>
              <p>Inicia sesión para revisar las citas a las que tienes acceso.</p>
            </div>
            <Link className="public-button public-button-outline" to="/staff/login">Iniciar sesión</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
