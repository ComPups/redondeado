// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CenterSettings } from "./CenterSettings";

const center = {
  id: "a",
  slug: "centro-a",
  name: "Centro A",
  description: "Descripción actual",
  opens_at: "09:00:00",
  closes_at: "18:00:00",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("edits the public profile and reports the saved center to the workspace", async () => {
  const updated = {
    ...center,
    name: "Nuevo nombre",
    description: "Nueva descripción",
    opens_at: "08:30:00",
    closes_at: "19:00:00",
  };
  const request = vi.fn(async () => ({ ok: true, json: async () => updated }));
  vi.stubGlobal("fetch", request);
  const onSaved = vi.fn();
  render(
    <CenterSettings center={center} token="staff-token" onSaved={onSaved} />,
  );
  expect(
    (screen.getByLabelText("Hora de apertura") as HTMLInputElement).value,
  ).toBe("09:00");
  expect(screen.getByLabelText("Descripción").getAttribute("maxlength")).toBe(
    "400",
  );
  fireEvent.change(screen.getByLabelText("Nombre del centro"), {
    target: { value: updated.name },
  });
  fireEvent.change(screen.getByLabelText("Descripción"), {
    target: { value: updated.description },
  });
  fireEvent.change(screen.getByLabelText("Hora de apertura"), {
    target: { value: "08:30" },
  });
  fireEvent.change(screen.getByLabelText("Hora de cierre"), {
    target: { value: "19:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(await screen.findByText("Configuración guardada.")).toBeTruthy();
  expect(onSaved).toHaveBeenCalledWith(updated);
  const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toContain("/staff/centers/a");
  expect(init.method).toBe("PATCH");
  expect(JSON.parse(init.body as string)).toEqual({
    name: updated.name,
    description: updated.description,
    opens_at: "08:30",
    closes_at: "19:00",
  });
});

it("rejects reversed or equal hours before saving", () => {
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  render(<CenterSettings center={center} token="token" onSaved={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Hora de cierre"), {
    target: { value: "09:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(screen.getByRole("alert").textContent).toContain("posterior");
  expect(request).not.toHaveBeenCalled();
});

it("keeps unsaved edits after a server error so the administrator can retry", async () => {
  const onSaved = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "No se pudo guardar." }),
    })),
  );
  render(<CenterSettings center={center} token="token" onSaved={onSaved} />);
  fireEvent.change(screen.getByLabelText("Nombre del centro"), {
    target: { value: "Mi edición" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "No se pudo guardar.",
  );
  expect(
    (screen.getByLabelText("Nombre del centro") as HTMLInputElement).value,
  ).toBe("Mi edición");
  expect(onSaved).not.toHaveBeenCalled();
});
