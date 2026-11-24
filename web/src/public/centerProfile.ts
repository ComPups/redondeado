import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

export const demoCenterSlug = 'centro-bienestar-arrayan';
export const demoCenterName = 'Centro Bienestar Arrayán';

export type Service = {
  id: string;
  name: string;
  price_clp: number;
  duration_minutes: number;
};

type CenterProfile = {
  name: string;
  description: string;
  services: Service[];
  professionals: { id: string; name: string }[];
};

type ProfileResult =
  | { status: 'loading' | 'unavailable' | 'missing' }
  | { status: 'ready'; profile: CenterProfile };

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const publicClient = url && key ? createClient(url, key, {
  auth: {
    storageKey: 'redondeado-public',
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
}) : null;

export const formatPrice = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
}).format;

export function useCenterProfile(slug: string): ProfileResult {
  const [request, setRequest] = useState<{ slug: string; result: ProfileResult }>();

  useEffect(() => {
    const client = publicClient;
    if (!client) return;
    const controller = new AbortController();

    const load = async () => {
      let result: ProfileResult;
      try {
        const { data, error } = await client
          .rpc('public_center_profile', { center_slug: slug })
          .abortSignal(controller.signal);
        if (error) throw error;
        result = data ? { status: 'ready', profile: data } : { status: 'missing' };
      } catch {
        result = { status: 'unavailable' };
      }
      if (!controller.signal.aborted) setRequest({ slug, result });
    };

    void load();
    return () => controller.abort();
  }, [slug]);

  if (!publicClient) return { status: 'unavailable' };
  return request?.slug === slug ? request.result : { status: 'loading' };
}
