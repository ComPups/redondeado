import { Link } from 'react-router';
import { Brand } from '../shared/components/Brand';
import { formatPrice, type Service } from './centerProfile';
import './public.css';

export function PublicHeader() {
  return (
    <header className="public-header">
      <div className="public-container public-header-inner">
        <Brand />
        <Link className="public-team-link" to="/staff/login">Acceso equipo</Link>
      </div>
    </header>
  );
}

export function ServiceList({ services }: { services: Service[] }) {
  return (
    <ul className="public-service-list">
      {services.map(service => (
        <li key={service.id}>
          <strong>{service.name}</strong>
          <span>{service.duration_minutes} min <span aria-hidden="true">·</span> {formatPrice(service.price_clp)} CLP</span>
        </li>
      ))}
    </ul>
  );
}
