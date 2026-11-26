export const apiUrl = import.meta.env?.VITE_API_URL || "http://localhost:3000";

export async function fetchAvailability(
  centerId: string,
  service: string,
  professional: string,
  token: string,
  signal?: AbortSignal,
): Promise<{ starts_at: string }[]> {
  const query = new URLSearchParams({
    service_id: service,
    professional_id: professional,
  });
  const response = await fetch(
    `${apiUrl}/staff/centers/${encodeURIComponent(centerId)}/availability?${query}`,
    { signal, headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw new Error("No se pudieron cargar los horarios disponibles.");
  return response.json();
}
