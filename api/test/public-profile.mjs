import assert from "node:assert/strict";
import { publicCenterProfile } from "../dist/services/publicProfile.js";

const client = {
  async query(sql) {
    if (sql.includes("from public.centers where slug"))
      return {
        rows: [
          {
            id: "center",
            name: "Arrayán",
            description: "",
            image_url: null,
            opens_at: "09:00:00",
            closes_at: "18:00:00",
          },
        ],
      };
    if (
      sql.includes("from public.services s join public.professional_services")
    )
      return {
        rows: [
          {
            id: "service-a",
            name: "A",
            description: "",
            duration_minutes: 30,
            price_clp: 1000,
            professional_id: "professional-a",
            display_name: "Ana",
          },
        ],
      };
    if (sql.includes("from public.center_memberships"))
      return {
        rows: [
          {
            user_id: "user-a",
            professional_id: "professional-a",
            display_name: "Ana",
            description: "",
          },
          {
            user_id: "user-b",
            professional_id: "professional-b",
            display_name: "Beto",
            description: "",
          },
        ],
      };
    return {
      rows: [
        { professional_user_id: "user-a", service_id: "service-a" },
        { professional_user_id: "user-b", service_id: "service-b" },
      ],
    };
  },
};

const profile = await publicCenterProfile(client, "arrayan");
assert.deepEqual(
  profile.professionals.map((professional) => professional.service_ids),
  [["service-a"], ["service-b"]],
  "profile preserves per-professional offerings",
);
console.log("Backend public profile offering projection passed");
