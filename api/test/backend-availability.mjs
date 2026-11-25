import assert from 'node:assert/strict';
import { availability } from '../dist/services/availability.js';

const busyStart = '2026-12-01T12:00:00.000Z';
const client = {
  async query(sql) {
    if (sql.includes('from public.centers c')) return { rows: [{ center_id: 'center', professional_user_id: 'user', opens_at: '09:00:00', closes_at: '10:00:00', duration_minutes: 30 }] };
    return { rows: [{ starts_at: busyStart, ends_at: '2026-12-01T12:30:00.000Z' }] };
  },
};

const now = new Date('2026-11-25T12:00:00.000Z');
const slots = await availability(client, 'arrayan', 'service', 'professional', now);
assert.ok(slots.length > 0, 'availability includes future slots');
assert.ok(!slots.some(slot => slot.starts_at === busyStart), 'existing appointment removes an overlapping slot');
const months = new Set(slots.map(slot => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit' }).format(new Date(slot.starts_at))));
assert.deepEqual([...months].sort(), ['2026-11', '2026-12'], 'calendar window is current and next Santiago month only');
assert.ok(slots.every(slot => new Date(slot.starts_at).getUTCMinutes() % 30 === 0), 'slots stay on 30-minute boundaries');
console.log('Backend Santiago availability generation and overlap filtering passed');
