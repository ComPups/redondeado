// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ServiceCatalog } from "./ServiceCatalog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("creates a center service independently of staff offerings and uses icon actions", async () => {
  const service = {
    id: "service-1",
    name: "Consulta",
    description: "Atención",
    price_clp: 30000,
    duration_minutes: 60,
  };
  const request = vi.fn(async (_url: string, options?: RequestInit) => ({
    ok: true,
    json: async () => (options?.method === "POST" ? service : []),
  }));
  vi.stubGlobal("fetch", request);
  render(<ServiceCatalog centerId="center" token="token" canManage />);
  await screen.findByText("El centro aún no tiene servicios.");
  fireEvent.click(screen.getByRole("button", { name: "+ Agregar servicio" }));
  fireEvent.change(screen.getByLabelText("Nombre"), {
    target: { value: "Consulta" },
  });
  fireEvent.change(screen.getByLabelText("Descripción"), {
    target: { value: "Atención" },
  });
  fireEvent.change(screen.getByLabelText("Precio sugerido (CLP)"), {
    target: { value: "30000" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await screen.findByRole("heading", { name: "Consulta" });
  expect(
    screen
      .getByRole("button", { name: "Editar Consulta" })
      .querySelector("svg"),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Eliminar Consulta" })
      .querySelector("svg"),
  ).toBeTruthy();
  const writes = request.mock.calls.filter(
    ([, options]) => options?.method === "POST",
  );
  expect(writes).toHaveLength(1);
  expect(writes[0][0]).toContain("/service-catalog");
  expect(JSON.parse(String(writes[0][1]?.body))).toEqual({
    name: "Consulta",
    description: "Atención",
    price_clp: 30000,
    duration_minutes: 60,
  });
});

it("shows the catalog without management controls to other staff", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          id: "s",
          name: "Consulta",
          description: "",
          price_clp: 0,
          duration_minutes: 30,
        },
      ],
    })),
  );
  render(<ServiceCatalog centerId="center" token="token" canManage={false} />);
  const section = within(
    await screen.findByRole("region", { name: "Catálogo del centro" }),
  );
  await waitFor(() =>
    expect(section.getByRole("heading", { name: "Consulta" })).toBeTruthy(),
  );
  expect(
    section.queryByRole("button", { name: /Agregar servicio|Editar|Eliminar/ }),
  ).toBeNull();
});
