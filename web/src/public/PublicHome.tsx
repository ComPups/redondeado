import { Link } from 'react-router';
import { PublicHeader, ServiceList } from './PublicComponents';
import { demoCenterName, demoCenterSlug, useCenterProfile } from './centerProfile';

const centerPath = `/${demoCenterSlug}`;

export function PublicHome() {
  const result = useCenterProfile(demoCenterSlug);
  const center = result.status === 'ready' ? result.profile : undefined;

  return (
    <div className="public-site" lang="es-CL">
      <PublicHeader />
      <main>
        <section className="public-container public-hero" aria-labelledby="hero-title">
          <div className="public-hero-copy">
            <h1 id="hero-title">Agenda tu próxima <em>atención en línea</em></h1>
            <p>Explora los servicios y profesionales del centro. Reserva una hora sin crear una cuenta.</p>
            <Link className="public-button" to={centerPath}>Ver perfil del centro</Link>
          </div>
          <div className="booking-preview">
            <div className="booking-preview-card">
              <p className="booking-preview-label">Vista de ejemplo</p>
              <h2>¿Cómo quieres empezar?</h2>
              <div className="booking-preview-option">
                <span className="booking-icon" aria-hidden="true">✚</span>
                <div><strong>Por servicio</strong><span>Elige el tipo de atención</span></div>
              </div>
              <div className="booking-preview-option">
                <span className="booking-icon booking-person" aria-hidden="true" />
                <div><strong>Por profesional</strong><span>Elige con quién atenderte</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="public-catalog" aria-labelledby="demo-title">
          <div className="public-container public-catalog-inner">
            <div className="public-catalog-copy">
              <p className="public-kicker">Centro de demostración</p>
              <h2 id="demo-title">{center?.name ?? demoCenterName}</h2>
              {center?.description && <p>{center.description}</p>}
              <Link className="public-button public-button-outline" to={centerPath}>Ver perfil del centro</Link>
            </div>
            <div className="catalog-preview" aria-busy={result.status === 'loading'}>
              <h3>Servicios del centro</h3>
              {center?.services.length ? (
                <ServiceList services={center.services.slice(0, 3)} />
              ) : (
                <p role="status">{center ? 'El centro aún no tiene servicios disponibles.' : result.status === 'loading' ? 'Cargando servicios…' : 'La vista previa de servicios no está disponible en este momento.'}</p>
              )}
            </div>
          </div>
        </section>

        <section className="public-container booking-steps" aria-labelledby="steps-title">
          <h2 id="steps-title">Cómo reservar</h2>
          <ol>
            <li><h3>Elige servicio y profesional</h3><p>Puedes empezar por cualquiera de los dos.</p></li>
            <li><h3>Selecciona una hora</h3><p>Revisa los horarios disponibles para tu elección.</p></li>
            <li><h3>Confirma con tus datos</h3><p>Ingresa tu nombre, correo y teléfono para reservar.</p></li>
          </ol>
        </section>

        <section className="public-team" aria-labelledby="team-title">
          <div className="public-container public-team-inner">
            <div>
              <h2 id="team-title">¿Eres parte del equipo del centro?</h2>
              <p>Inicia sesión para revisar las citas a las que tienes acceso.</p>
            </div>
            <Link className="public-button public-button-outline" to="/staff/login">Iniciar sesión</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
