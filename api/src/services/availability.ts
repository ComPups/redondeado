import type { PoolClient } from "pg";

const TIME_ZONE = "America/Santiago";
const DAY_MS = 24 * 60 * 60 * 1000;

type Offering = {
  center_id: string;
  professional_user_id: string;
  opens_at: string;
  closes_at: string;
  duration_minutes: number;
};
export type AvailabilitySlot = { starts_at: string };

function localParts(value: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}
function utcForSantiago(local: Date): Date {
  const wanted = local.getTime();
  let candidate = new Date(wanted);
  for (let i = 0; i < 3; i += 1) {
    const actual = localParts(candidate);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    candidate = new Date(wanted - (actualAsUtc - wanted));
  }
  return candidate;
}

function dayStart(value: Date): Date {
  const parts = localParts(value);
  return new Date(Date.UTC(parts.year, parts.month - 1, 1));
}

function localDateTime(day: Date, time: string): Date {
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  return new Date(
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      hour,
      minute,
    ),
  );
}

export async function availability(
  client: PoolClient,
  slug: string,
  serviceId: string,
  professionalId: string,
  now = new Date(),
): Promise<AvailabilitySlot[]> {
  const offering = (
    await client.query<Offering>(
      `select c.id as center_id, ps.professional_user_id, c.opens_at, c.closes_at, ps.duration_minutes
    from public.centers c
    join public.services s on s.center_id = c.id and s.id = $2 and s.active
    join public.professional_services ps on ps.center_id = c.id and ps.service_id = s.id and ps.active
    join public.staff_profiles p on p.user_id = ps.professional_user_id and p.professional_id = $3
    where c.slug = $1`,
      [slug, serviceId, professionalId],
    )
  ).rows[0];
  if (!offering) return [];

  const firstDay = dayStart(now);
  const endDay = new Date(firstDay.getTime());
  endDay.setUTCMonth(endDay.getUTCMonth() + 2);
  const rangeStart = utcForSantiago(new Date(firstDay.getTime() - DAY_MS));
  const rangeEnd = utcForSantiago(new Date(endDay.getTime() + DAY_MS));
  const busy = (
    await client.query<{ starts_at: Date | string; ends_at: Date | string }>(
      `select starts_at, ends_at from public.appointments
    where professional_user_id = $1 and starts_at < $2 and ends_at > $3`,
      [
        offering.professional_user_id,
        rangeEnd.toISOString(),
        rangeStart.toISOString(),
      ],
    )
  ).rows.map((row) => ({
    start: new Date(row.starts_at).getTime(),
    end: new Date(row.ends_at).getTime(),
  }));

  const slots: AvailabilitySlot[] = [];
  for (
    const day = new Date(firstDay);
    day < endDay;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const open = localDateTime(day, offering.opens_at);
    const close = localDateTime(day, offering.closes_at);
    for (
      let local = open;
      local.getTime() + offering.duration_minutes * 60_000 <= close.getTime();
      local = new Date(local.getTime() + 30 * 60_000)
    ) {
      const start = utcForSantiago(local);
      const end = new Date(
        start.getTime() + offering.duration_minutes * 60_000,
      );
      if (
        start <= now ||
        busy.some(
          (row) => row.start < end.getTime() && row.end > start.getTime(),
        )
      )
        continue;
      slots.push({ starts_at: start.toISOString() });
    }
  }
  return slots;
}

export async function offeringForBooking(
  client: PoolClient,
  centerId: string,
  serviceId: string,
  professionalId: string,
) {
  return (
    await client.query<{
      professional_user_id: string;
      service_name: string;
      price_clp: number;
      duration_minutes: number;
    }>(
      `select ps.professional_user_id, s.name as service_name, ps.price_clp, ps.duration_minutes
    from public.professional_services ps
    join public.services s on s.center_id = ps.center_id and s.id = ps.service_id and s.active
    join public.staff_profiles p on p.user_id = ps.professional_user_id and p.professional_id = $3
    where ps.center_id = $1 and ps.service_id = $2 and ps.active for share`,
      [centerId, serviceId, professionalId],
    )
  ).rows[0];
}

export function isValidSlot(slots: AvailabilitySlot[], start: string): boolean {
  return slots.some((slot) => slot.starts_at === new Date(start).toISOString());
}
