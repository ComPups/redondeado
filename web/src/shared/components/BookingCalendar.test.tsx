// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BookingCalendar } from './BookingCalendar';

afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('shared booking calendar', () => {
  it('shows only available days and selects a time, including next month', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-10T15:00:00Z'));
    const onSelect = vi.fn();
    render(<BookingCalendar slots={[{ starts_at: '2026-11-12T13:00:00Z' }, { starts_at: '2026-12-02T13:00:00Z' }]} selected="" onSelect={onSelect} busy={false} />);
    const day = screen.getByRole('button', { name: /jueves, 12 de noviembre de 2026, con horas disponibles/i });
    expect((screen.getByRole('button', { name: /viernes, 13 de noviembre de 2026, sin horas disponibles/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(day);
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    expect(onSelect).toHaveBeenLastCalledWith('2026-11-12T13:00:00Z');
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(screen.getByRole('button', { name: /miércoles, 2 de diciembre de 2026, con horas disponibles/i })).toBeTruthy();
    expect(onSelect).toHaveBeenLastCalledWith('');
  });
});
