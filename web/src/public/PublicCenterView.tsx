import { Link, useParams } from 'react-router';
import { PublicHeader, ServiceList } from './PublicComponents';
import { useCenterProfile } from './centerProfile';

function PublicMessage({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="public-site" lang="es-CL">
      <PublicHeader />
      <main className="public-container public-message">
        <h1>{title}</h1>
        <p>{copy}</p>
        <Link className="public-button public-button-outline" to="/">Volver al inicio</Link>
      </main>
    </div>
  );
}

export function PublicNotFound() {
  return <PublicMessage title="Página no disponible" copy="Revisa el enlace o vuelve al inicio de Redondeado." />;
}

export function PublicCenterView() {
  const { slug = '' } = useParams();
  const result = useCenterProfile(slug);

  if (result.status === 'missing') {
    return <PublicMessage title="Centro no disponible" copy="Revisa el enlace del centro o vuelve al inicio." />;
  }

  if (result.status === 'unavailable') {
    return <PublicMessage title="No pudimos cargar el centro" copy="Vuelve a intentarlo en unos momentos." />;
  }

  return (
    <div className="public-site" lang="es-CL">
      <PublicHeader />
      <main className="public-container public-profile">
        {result.status === 'ready' ? (
          <>
            <h1>{result.profile.name}</h1>
            <p>{result.profile.description}</p>
            <p className="public-profile-notice">Las reservas en línea aún no están disponibles.</p>
            <div className="public-profile-columns">
              <section>
                <h2>Servicios</h2>
                {result.profile.services.length ? (
                  <ServiceList services={result.profile.services} />
                ) : <p>El centro aún no tiene servicios disponibles.</p>}
              </section>
              <section>
                <h2>Profesionales</h2>
                {result.profile.professionals.length ? (
                  <ul className="public-service-list">
                    {result.profile.professionals.map(professional => (
                      <li key={professional.id}>{professional.name}</li>
                    ))}
                  </ul>
                ) : <p>El centro aún no tiene profesionales disponibles.</p>}
              </section>
            </div>
          </>
        ) : <p role="status">Cargando perfil del centro…</p>}
      </main>
    </div>
  );
}
