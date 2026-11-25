import { useState } from 'react';
import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';
import { Link, useParams } from 'react-router';
import centerInterior from './assets/center-interior.jpg';
import { BookingModal, type BookingChoice } from './BookingModal';
import { PublicHeader } from './PublicComponents';
import { formatPrice, useCenterProfile, type CenterProfile } from './centerProfile';

export function PublicNotFound() {
  return (
    <div className="public-site" lang="es-CL">
      <PublicHeader />
      <main className="public-container public-message">
        <h1>Página no disponible</h1>
        <p>Revisa el enlace o vuelve al inicio de Redondeado.</p>
        <Link className="public-button public-button-outline" to="/">Volver al inicio</Link>
      </main>
    </div>
  );
}

function searchable(text: string) {
  return text.toLocaleLowerCase('es-CL').normalize('NFD').replace(/\p{M}/gu, '');
}

function CenterPage({ center, slug }: { center: CenterProfile; slug: string }) {
  const [mode, setMode] = useState<BookingChoice['kind']>('service');
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState<BookingChoice | null>(null);
  const search = searchable(query.trim());
  const offeringsByService = [...center.services.reduce((map, service) => {
    const key = service.id;
    map.set(key, [...(map.get(key) ?? []), service]);
    return map;
  }, new Map<string, typeof center.services>()).values()].filter(versions => versions.some(service =>
    searchable([service.name, service.description].join(' ')).includes(search)));
  const professionals = center.professionals.filter(professional =>
    searchable([professional.name, professional.description].join(' ')).includes(search));

  function searchField(kind: BookingChoice['kind'], label: string, placeholder: string) {
    return (
      <label className="center-search">
        <span>{label}</span>
        <input type="search" value={mode === kind ? query : ''} placeholder={placeholder}
          onChange={event => setQuery(event.target.value)} />
      </label>
    );
  }

  return (
    <main>
      <section className="public-container center-hero">
        <div className="center-hero-copy">
          <h1>{center.name}</h1>
          {center.description && <p>{center.description}</p>}
          {center.opens_at && center.closes_at && (
            <p className="center-hours">Horario de atención · {center.opens_at.slice(0, 5)} a {center.closes_at.slice(0, 5)}</p>
          )}
          <a className="public-button" href="#agenda">Agendar una hora <span aria-hidden="true">↓</span></a>
        </div>
        <img className="center-hero-image" src={center.image_url || centerInterior}
          alt={center.image_url ? center.name : ''}
          onError={event => {
            const image = event.currentTarget;
            if (image.getAttribute('src') !== centerInterior) {
              image.alt = '';
              image.src = centerInterior;
            }
          }} />
      </section>

      <section className="center-scheduling" id="agenda" tabIndex={-1} aria-labelledby="scheduling-heading">
        <div className="public-container">
          <h2 id="scheduling-heading">Agenda tu atención</h2>
          <Tabs id="booking-browse" variant="pills" className="center-tabs" aria-label="Método de búsqueda" activeKey={mode} transition={false}
            onSelect={key => {
              if ((key === 'service' || key === 'professional') && key !== mode) {
                setMode(key);
                setQuery('');
              }
            }}>
            <Tab eventKey="service" title="Por servicio">
              {searchField('service', 'Buscar servicios', 'Nombre o descripción')}
              {offeringsByService.length ? (
                <div className="center-card-grid">
                  {offeringsByService.map(versions => {
                    const service = versions[0];
                    const bookable = center.professionals.some(person => versions.some(version => version.professional_id ? version.professional_id === person.id : person.service_ids?.includes(version.id)));
                    const prices = versions.map(version => version.price_clp);
                    const durations = new Set(versions.map(version => version.duration_minutes));
                    return (
                      <article className="center-booking-card" key={service.id}>
                        <h3>{service.name}</h3>
                        <p className="center-service-meta">
                          <strong>{new Set(prices).size > 1 ? 'Desde ' : ''}{formatPrice(Math.min(...prices))}</strong>
                          <span>{durations.size > 1 ? 'Duración variable' : `${service.duration_minutes} min`}</span>
                        </p>
                        {(service.description) && <p className="center-card-description">{service.description}</p>}
                        {bookable ? (
                          <button type="button" className="public-button public-button-outline"
                            aria-label={`Reservar ${service.name}`}
                            onClick={() => setChoice({ kind: 'service', service, versions })}>Reservar <span aria-hidden="true">→</span></button>
                        ) : <p className="center-card-unavailable">Sin profesionales disponibles para reservar.</p>}
                      </article>
                    );
                  })}
                </div>
              ) : <p className="center-catalog-empty" role="status">{search ? 'No encontramos servicios que coincidan con tu búsqueda.' : 'No hay servicios disponibles.'}</p>}
            </Tab>
            <Tab eventKey="professional" title="Por profesional">
              {searchField('professional', 'Buscar profesionales', 'Nombre o descripción')}
              {professionals.length ? (
                <div className="center-card-grid">
                  {professionals.map(professional => (
                    <article className="center-booking-card" key={professional.id}>
                      <div className="center-professional-heading">
                        <span className="center-avatar" aria-hidden="true">{professional.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es-CL')}</span>
                        <h3>{professional.name}</h3>
                      </div>
                      {professional.description && <p className="center-card-description">{professional.description}</p>}
                      {professional.service_ids?.length ? (
                        <>
                          <ul className="center-service-tags" aria-label={`Servicios de ${professional.name}`}>
                            {center.services.filter(service => (service.professional_id ? service.professional_id === professional.id : professional.service_ids?.includes(service.id))).map(service => <li key={service.id}>{service.name}</li>)}
                          </ul>
                          <button type="button" className="public-button public-button-outline stretched-link"
                            aria-label={`Reservar con ${professional.name}`}
                            onClick={() => setChoice({ kind: 'professional', professional })}>Reservar <span aria-hidden="true">→</span></button>
                        </>
                      ) : <p className="center-card-unavailable">Sin servicios disponibles para reservar.</p>}
                    </article>
                  ))}
                </div>
              ) : <p className="center-catalog-empty" role="status">{search ? 'No encontramos profesionales que coincidan con tu búsqueda.' : 'No hay profesionales disponibles.'}</p>}
            </Tab>
          </Tabs>
        </div>
      </section>
      {choice && <BookingModal center={center} slug={slug} choice={choice} onClose={() => setChoice(null)} />}
    </main>
  );
}

export function PublicCenterView() {
  const { slug = '' } = useParams();
  const result = useCenterProfile(slug);

  return (
    <div className="public-site" lang="es-CL">
      <PublicHeader />
      {result.status === 'ready' ? <CenterPage key={slug} center={result.profile} slug={slug} /> : (
        <main className="public-container public-message">
          {result.status === 'loading' ? <p role="status">Cargando centro…</p> : (
            <>
              <h1>Centro no disponible</h1>
              <p>{result.status === 'missing' ? 'No encontramos este centro.' : 'No pudimos cargar el centro.'}</p>
              <Link className="public-button public-button-outline" to="/">Volver al inicio</Link>
            </>
          )}
        </main>
      )}
    </div>
  );
}
