import { useState } from "react";

export type Slot = { starts_at: string };
export const dateFormat = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  dateStyle: "full",
});
export const timeFormat = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const monthFormat = new Intl.DateTimeFormat("es-CL", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
const dateLabelFormat = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "full",
  timeZone: "UTC",
});

export function BookingCalendar({
  slots,
  selected,
  onSelect,
  disabled,
}: {
  slots: Slot[];
  selected: string;
  onSelect: (slot: string) => void;
  disabled: boolean;
}) {
  const [day, setDay] = useState("");
  const [monthOffset, setMonthOffset] = useState(0);
  const [currentYear, currentMonth] = dayKeyFormat
    .format(new Date())
    .split("-")
    .map(Number);
  const first = new Date(
    Date.UTC(currentYear, currentMonth - 1 + monthOffset, 1),
  );
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1;
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthKey = `${year}-${String(month).padStart(2, "0")}-`;
  const byDay = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = dayKeyFormat.format(new Date(slot.starts_at));
    const daySlots = byDay.get(key);
    if (daySlots) daySlots.push(slot);
    else byDay.set(key, [slot]);
  }
  const daySlots = byDay.get(day);
  const monthHasSlots = [...byDay.keys()].some((key) =>
    key.startsWith(monthKey),
  );

  function changeMonth(next: number) {
    setMonthOffset(next);
    setDay("");
    onSelect("");
  }

  return (
    <fieldset className="booking-calendar" disabled={disabled}>
      <legend>Elige una fecha y hora</legend>
      <div className="calendar-navigation">
        <button
          type="button"
          aria-label="Mes anterior"
          disabled={monthOffset === 0}
          onClick={() => changeMonth(0)}
        >
          ‹
        </button>
        <p className="calendar-month" aria-live="polite">
          {monthFormat.format(first)}
        </p>
        <button
          type="button"
          aria-label="Mes siguiente"
          disabled={monthOffset === 1}
          onClick={() => changeMonth(1)}
        >
          ›
        </button>
      </div>
      <div className="calendar-grid">
        {["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"].map((label) => (
          <span className="calendar-weekday" key={label}>
            {label}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const key = monthKey + String(i + 1).padStart(2, "0");
          const available = byDay.has(key);
          const label = dateLabelFormat.format(
            new Date(Date.UTC(year, month - 1, i + 1)),
          );
          return (
            <button
              type="button"
              key={key}
              className={day === key ? "calendar-day selected" : "calendar-day"}
              disabled={!available}
              aria-pressed={day === key}
              aria-label={`${label}, ${available ? "con" : "sin"} horas disponibles`}
              onClick={() => {
                setDay(key);
                onSelect("");
              }}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      {!monthHasSlots && <p>No hay horarios disponibles este mes.</p>}
      {monthHasSlots && !daySlots && (
        <p>Selecciona un día disponible. Horarios en hora de Santiago.</p>
      )}
      {daySlots && (
        <>
          <p>
            Horarios disponibles ·{" "}
            {dateFormat.format(new Date(daySlots[0].starts_at))}
          </p>
          <div className="calendar-times">
            {daySlots.map((item) => (
              <button
                type="button"
                key={item.starts_at}
                className={
                  selected === item.starts_at
                    ? "calendar-time selected"
                    : "calendar-time"
                }
                aria-pressed={selected === item.starts_at}
                onClick={() => onSelect(item.starts_at)}
              >
                {timeFormat.format(new Date(item.starts_at))}
              </button>
            ))}
          </div>
        </>
      )}
    </fieldset>
  );
}
