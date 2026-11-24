import { useParams } from 'react-router';
import { ApiStatus } from '../shared/ApiStatus';

export function PublicCenterView() {
  const { slug } = useParams();
  return <main><h1>Redondeado — Public site</h1><p>Center: {slug}</p><ApiStatus /></main>;
}

export function PublicHome() {
  return <main><h1>Redondeado</h1><p>Choose a center to book an appointment.</p></main>;
}
