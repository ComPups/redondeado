import { apiFetch } from "../shared/requestCache";
import { apiUrl } from "../shared/api";
import { useEffect, useState } from "react";

export const demoCenterSlug = "centro-bienestar-arrayan";
export const demoCenterName = "Centro Bienestar Arrayán";

export type Service = {
  id: string;
  professional_id?: string;
  name: string;
  description?: string;
  price_clp: number;
  duration_minutes: number;
};

export type Professional = {
  id: string;
  name: string;
  description?: string;
  service_ids?: string[];
};

export type CenterProfile = {
  name: string;
  description: string;
  image_url?: string | null;
  opens_at?: string;
  closes_at?: string;
  services: Service[];
  professionals: Professional[];
};

type ProfileResult =
  | { status: "loading" | "unavailable" | "missing" }
  | { status: "ready"; profile: CenterProfile };

export const formatPrice = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
}).format;

export function useCenterProfile(slug: string): ProfileResult {
  const [request, setRequest] = useState<{
    slug: string;
    result: ProfileResult;
  }>();

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();

    const load = async () => {
      let result: ProfileResult;
      try {
        const response = await apiFetch(
          `${apiUrl}/public/centers/${encodeURIComponent(slug)}`,
          { signal: controller.signal },
        );
        if (response.status === 404) result = { status: "missing" };
        else if (!response.ok) throw new Error("Could not load center");
        else result = { status: "ready", profile: await response.json() };
      } catch {
        result = { status: "unavailable" };
      }
      if (!controller.signal.aborted) setRequest({ slug, result });
    };

    void load();
    return () => controller.abort();
  }, [slug]);

  return request?.slug === slug ? request.result : { status: "loading" };
}
