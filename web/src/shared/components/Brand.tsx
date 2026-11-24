import { Link } from 'react-router';

export function Brand({ to = '/' }: { to?: string }) {
  return <Link className="brand" to={to}><span className="brand-mark" aria-hidden="true">✳</span> redondeado</Link>;
}
