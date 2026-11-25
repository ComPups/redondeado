import { LoadingSkeleton } from './LoadingSkeleton';
import { useState } from 'react';

export type Slot = { starts_at: string };
const dateFormat = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'full' });
const timeFormat = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });
const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' });
const monthFormat = new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', month: 'long', year: 'numeric' });

export function BookingCalendar({ slots, selected, onSelect, busy }: { slots: Slot[]; selected: string; onSelect: (slot: string) => void; busy: boolean }) {
  const [day, setDay] = useState('');
  const [monthOffset, setMonthOffset] = useState(0);
  const today = dayKeyFormat.format(new Date());
  const [currentYear, currentMonth] = today.split('-').map(Number);
  const first = new Date(Date.UTC(currentYear, currentMonth - 1 + monthOffset, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1;
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const byDay = new Map<string, Slot[]>();
  for (const item of slots) {
    const key = dayKeyFormat.format(new Date(item.starts_at));
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }
  const activeDay = byDay.has(day) ? day : '';
  const monthHasSlots = [...byDay.keys()].some(key => key.startsWith(`${year}-${String(month).padStart(2, '0')}-`));
  return <fieldset className="booking-calendar" disabled={busy}>
    <legend>Elige una fecha y hora</legend>
    <div className="calendar-navigation"><button type="button" aria-label="Mes anterior" disabled={monthOffset === 0} onClick={() => { setMonthOffset(0); setDay(''); onSelect(''); }}>‹</button><p className="calendar-month" aria-live="polite">{monthFormat.format(first)}</p><button type="button" aria-label="Mes siguiente" disabled={monthOffset === 1} onClick={() => { setMonthOffset(1); setDay(''); onSelect(''); }}>›</button></div>
    <div className="calendar-grid" aria-label="Calendario de disponibilidad">
      {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((label, index) => <span className="calendar-weekday" key={index}>{label}</span>)}
      {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
      {Array.from({ length: days }, (_, i) => {
        const key = `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
        const available = byDay.has(key);
        const label = new Intl.DateTimeFormat('es-CL', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, i + 1)));
        return <button type="button" key={key} className={activeDay === key ? 'calendar-day selected' : 'calendar-day'} disabled={!available} aria-label={`${label}${available ? ', con horas disponibles' : ', sin horas disponibles'}`} aria-pressed={activeDay === key} onClick={() => { setDay(key); onSelect(''); }}>{i + 1}</button>;
      })}
    </div>
    {busy ? <LoadingSkeleton label="Cargando horarios…" variant="calendar" /> : !monthHasSlots ? <p>No hay horarios disponibles este mes.</p> : !activeDay ? <p>Selecciona un día disponible. Horarios en hora de Santiago.</p> : <><p>Horarios disponibles · {dateFormat.format(new Date(byDay.get(activeDay)![0].starts_at))}</p><div className="calendar-times">{byDay.get(activeDay)!.map(item => <button type="button" key={item.starts_at} className={selected === item.starts_at ? 'calendar-time selected' : 'calendar-time'} aria-pressed={selected === item.starts_at} onClick={() => onSelect(item.starts_at)}>{timeFormat.format(new Date(item.starts_at))}</button>)}</div></>}
  </fieldset>;
}

