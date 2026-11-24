import { apiUrl } from '../shared/api';

export type Center = { id: string; name: string; slug: string; description: string; opens_at: string; closes_at: string };
export type CenterInput = Pick<Center, 'name' | 'description' | 'opens_at' | 'closes_at'>;

async function readResponse(response: Response): Promise<unknown> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}

export async function createCenter(token: string, input: CenterInput): Promise<Center> {
  return await readResponse(await fetch(`${apiUrl}/staff/platform/centers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(input),
  })) as Center;
}
