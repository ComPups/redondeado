import { BrandLoader } from '../../shared/components/BrandLoader';
import { useState, type FormEvent } from 'react';
import { Brand } from '../../shared/components/Brand';
import { TextField } from '../../shared/components/TextField';

type Props = { onSignIn: (email: string, password: string) => Promise<string | null> };

export function LoginView({ onSignIn }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(''); setSubmitting(true);
    try { setError((await onSignIn(email.trim(), password)) ?? ''); }
    catch { setError('No pudimos iniciar sesión. Inténtalo nuevamente.'); }
    finally { setSubmitting(false); }
  }

  if (submitting) return <BrandLoader label="Ingresando a tu espacio…" />;

  return <main className="login-page">
    <header className="login-header"><Brand /><span className="login-header-label">ESPACIO PARA EQUIPOS</span></header>
    <div className="login-content">
      <section className="login-intro" aria-labelledby="intro-title">
        <p className="login-kicker"><span aria-hidden="true">✳︎</span> TU ESPACIO DE TRABAJO</p>
        <h1 id="intro-title">Más tiempo para<br /><em>lo que importa.</em></h1>
        <p>Un espacio para organizar tu centro y acompañar mejor a quienes confían en ti.</p>
        <div className="login-intro-note"><span aria-hidden="true">✳︎</span><div><strong>Todo en su lugar</strong><br />Tu equipo, tus centros y tus citas, juntos.</div></div>
      </section>
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-card-icon" aria-hidden="true">✳︎</div>
        <p className="login-card-eyebrow">BIENVENIDO A REDONDEADO</p>
        <h2 id="login-title">Inicia sesión</h2>
        <p className="login-description">Ingresa con tu cuenta para acceder a tu espacio de trabajo.</p>
        <form onSubmit={submit}>
          <TextField label="Correo electrónico" type="email" name="email" placeholder="tu@correo.com" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
          <TextField label="Contraseña" type="password" name="password" placeholder="Ingresa tu contraseña" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="login-submit" type="submit" disabled={submitting}>{submitting ? 'Ingresando…' : 'Ingresar'} <span aria-hidden="true">→</span></button>
        </form>
        <p className="login-help">¿Necesitas acceso? <strong>Contacta al administrador de tu equipo.</strong></p>
      </section>
    </div>
    <footer className="login-footer"><span>© Redondeado</span><span>Un espacio para cuidar mejor.</span></footer>
  </main>;
}
