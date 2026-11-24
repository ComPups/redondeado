export const apiUrl = import.meta.env?.VITE_API_URL || 'http://localhost:3000';

export async function fetchAvailability(slug: string, service: string, professional: string, signal?: AbortSignal): Promise<{ starts_at: string }[]> {
  const query = new URLSearchParams({ service_id: service, professional_id: professional });
  const response = await fetch(`${apiUrl}/public/centers/${encodeURIComponent(slug)}/availability?${query}`, { signal });
  if (!response.ok) throw new Error('No se pudieron cargar los horarios disponibles.');
  return response.json();
}
