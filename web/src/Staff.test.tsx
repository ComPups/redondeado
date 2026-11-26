// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";

const auth = vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-key");
  return {
    listener: (_event: string, _session: unknown) => {},
    role: "member",
    session: null as null | { access_token: string; user: { id: string } },
    signOutOptions: null as null | { scope: string },
    revokeFails: false,
  };
});
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: auth.session } }),
      onAuthStateChange: (callback: typeof auth.listener) => {
        auth.listener = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signInWithPassword: async () => {
        window.history.replaceState({}, "", "/staff");
        auth.session = { access_token: auth.role, user: { id: auth.role } };
        auth.listener("SIGNED_IN", auth.session);
        return { error: null };
      },
      signOut: async (options: { scope: string }) => {
        auth.signOutOptions = options;
        if (options.scope === "local") {
          auth.session = null;
          window.history.replaceState({}, "", "/staff/login");
          auth.listener("SIGNED_OUT", null);
        }
        return { error: auth.revokeFails ? new Error("offline") : null };
      },
    },
  }),
}));
import { Staff } from "./Staff";

type CenterRole =
  "administrator" | "member" | "limited" | "platform_administrator";
const originalCenters = [
  {
    center_id: "a",
    role: "member",
    centers: {
      id: "a",
      name: "Center A",
      slug: "center-a",
      description: "",
      opens_at: "09:00",
      closes_at: "18:00",
    },
  },
  {
    center_id: "b",
    role: "member",
    centers: {
      id: "b",
      name: "Center B",
      slug: "center-b",
      description: "",
      opens_at: "09:00",
      closes_at: "18:00",
    },
  },
];
let centers = originalCenters;
const appointment = (id: string) => [
  {
    id,
    professional_user_id: auth.session?.user.id ?? auth.role,
    patient_name: `Patient ${id}`,
    service_name: "Consultation",
    patient_email: "patient@example.com",
    patient_phone: "+56912345678",
    starts_at: "2099-11-24T13:00:00Z",
    ends_at: "2099-11-24T14:00:00Z",
  },
];
const agenda = (items: ReturnType<typeof appointment>, has_more = false) => ({
  appointments: items,
  has_more,
});
const response = (data: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 500, json: async () => data }) as Response;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
let pendingAgenda: ReturnType<typeof deferred<Response>> | null;
let failRole: boolean;
function mockApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === "/staff/centers") return response(centers);
      if (path === "/staff/me")
        return response({
          platformAdmin: auth.role === "platform_administrator",
          displayName: "Camila Rojas",
        });
      if (path === "/staff/platform/editable-fields")
        return response({ centers: ["image_url"] });
      if (path === "/staff/platform/centers")
        return response([{ id: "a", name: "Center A", image_url: null }]);
      if (path === "/staff/centers/a")
        return response({ role: auth.role }, !failRole);
      if (path === "/staff/centers/b") return response({ role: auth.role });
      if (path === "/staff/centers/a/team" || path === "/staff/centers/b/team")
        return response({ members: [], invitations: [] });
      if (
        path === "/staff/centers/a/terms" ||
        path === "/staff/centers/b/terms"
      )
        return response([]);
      if (
        path === "/staff/centers/a/service-catalog" ||
        path === "/staff/centers/b/service-catalog"
      )
        return response([]);
      if (path === "/staff/centers/a/booking-options")
        return response({
          professionals: [{ id: "p", name: "Camila" }],
          services: [
            {
              id: "s",
              name: "Consulta",
              duration_minutes: 60,
              professional_id: "p",
            },
          ],
        });
      if (path === "/staff/centers/a/appointments")
        return pendingAgenda
          ? pendingAgenda.promise
          : response(agenda(appointment("A")));
      if (path === "/staff/centers/b/appointments")
        return response(agenda(appointment("B")));
      throw new Error(`Unexpected request ${path}`);
    }),
  );
}
async function signIn(role: CenterRole) {
  auth.role = role;
  render(
    <MemoryRouter>
      <Staff />
    </MemoryRouter>,
  );
  fireEvent.change(await screen.findByLabelText("Correo electrónico"), {
    target: { value: `${role}@example.com` },
  });
  fireEvent.change(screen.getByLabelText("Contraseña"), {
    target: { value: "password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));
  await screen.findByRole("heading", {
    name: role === "platform_administrator" ? "Centros" : "Agendamientos",
  });
}
beforeEach(() => {
  window.history.replaceState({}, "", "/staff/login");
  auth.session = null;
  auth.signOutOptions = null;
  auth.revokeFails = false;
  centers = originalCenters;
  pendingAgenda = null;
  failRole = false;
  mockApi();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("keeps the workspace loaded when auth repeats SIGNED_IN after tab focus", async () => {
  await signIn("member");
  await screen.findByRole("heading", { name: "¡Hola, Camila!" });
  await waitFor(() =>
    expect((screen.getByLabelText("Centro") as HTMLSelectElement).value).toBe(
      "a",
    ),
  );
  const callsBefore = vi.mocked(fetch).mock.calls.length;
  await act(async () => {
    auth.listener("SIGNED_IN", {
      ...auth.session!,
      user: { ...auth.session!.user },
    });
  });
  expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore);
  expect(screen.getByRole("heading", { name: "¡Hola, Camila!" })).toBeTruthy();
});

it("refreshes credentials without unmounting an open center settings form", async () => {
  await signIn("administrator");
  fireEvent.click(screen.getByRole("link", { name: "Mi centro" }));
  fireEvent.click(await screen.findByRole("button", { name: "Editar centro" }));
  fireEvent.change(screen.getByLabelText("Nombre del centro"), {
    target: { value: "Edición pendiente" },
  });
  const pendingCenters = deferred<Response>();
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((input, init) =>
    new URL(String(input)).pathname === "/staff/centers"
      ? pendingCenters.promise
      : originalFetch(input, init),
  );
  await act(async () => {
    auth.session = { ...auth.session!, access_token: "renewed-token" };
    auth.listener("TOKEN_REFRESHED", auth.session);
  });
  expect(
    (screen.getByLabelText("Nombre del centro") as HTMLInputElement).value,
  ).toBe("Edición pendiente");
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/staff/centers"),
    expect.objectContaining({
      headers: { Authorization: "Bearer renewed-token" },
    }),
  );
  await act(async () => pendingCenters.resolve(response(centers)));
  expect(
    (screen.getByLabelText("Nombre del centro") as HTMLInputElement).value,
  ).toBe("Edición pendiente");
});

describe("staff workspace through the screen", () => {
  it("greets the staff member and navigates between distinct pages", async () => {
    await signIn("member");
    expect(
      await screen.findByRole("heading", { name: "¡Hola, Camila!" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Servicios" }));
    expect(
      screen.getByRole("heading", { name: "Servicios ofrecidos" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Agendamientos" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Mi centro" }));
    expect(screen.getByRole("heading", { name: "Center A" })).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Servicios ofrecidos" }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Catálogo del centro" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "+ Agregar servicio" }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: "Equipo" })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Configuraciones del centro" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Editar centro" })).toBeNull();
  });

  for (const role of ["administrator", "member", "limited"] as const) {
    it(`signs in and displays the ${role} role and agenda`, async () => {
      await signIn(role);
      expect(
        await screen.findByRole("heading", { name: "Calendario de citas" }),
      ).toBeTruthy();
      expect((screen.getByLabelText("Centro") as HTMLSelectElement).value).toBe(
        "a",
      );
    });
  }
  it("shows appointments for the selected calendar day", async () => {
    const startsAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const endsAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (
        url.pathname === "/staff/centers/a/appointments" &&
        url.searchParams.has("month")
      )
        return response(
          agenda([
            {
              ...appointment("Calendar")[0],
              starts_at: startsAt,
              ends_at: endsAt,
            },
          ]),
        );
      return originalFetch(input, init);
    });
    await signIn("member");
    const calendarDay = await screen.findByRole("button", {
      name: /con citas activas$/,
    });
    fireEvent.click(calendarDay);
    expect(await screen.findByText(/Patient Calendar/)).toBeTruthy();
  });
  it("separates an administrator’s appointments from the center agenda", async () => {
    auth.role = "administrator";
    mockApi();
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (new URL(String(input)).pathname === "/staff/centers/a/appointments") {
        return response(
          agenda(
            new URL(String(input)).searchParams.get("scope") === "center"
              ? [
                  ...appointment("Own"),
                  {
                    ...appointment("Other")[0],
                    professional_user_id: "another-professional",
                  },
                ]
              : appointment("Own"),
          ),
        );
      }
      return originalFetch(input, init);
    });
    await signIn("administrator");
    fireEvent.click(screen.getByRole("link", { name: "Mi centro" }));
    expect(
      screen.getByRole("heading", { name: "Agendamientos del centro" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Catálogo del centro" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Equipo" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Equipo" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "+ Agregar servicio" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Configuraciones del centro" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Editar centro" }));
    expect(
      screen.getByRole("heading", { name: "Configuraciones del centro" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Nombre del centro"), {
      target: { value: "Cambio sin guardar" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.queryByRole("heading", { name: "Configuraciones del centro" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Editar centro" }));
    expect(
      (screen.getByLabelText("Nombre del centro") as HTMLInputElement).value,
    ).toBe("Center A");
  });
  it("closes the center editor after saving and updates the center card", async () => {
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (
        new URL(String(input)).pathname === "/staff/centers/a" &&
        init?.method === "PATCH"
      ) {
        return response({
          ...originalCenters[0].centers,
          ...JSON.parse(init.body as string),
        });
      }
      return originalFetch(input, init);
    });
    await signIn("administrator");
    fireEvent.click(screen.getByRole("link", { name: "Mi centro" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar centro" }));
    fireEvent.change(screen.getByLabelText("Nombre del centro"), {
      target: { value: "Centro actualizado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(
      await screen.findByRole("heading", { name: "Centro actualizado" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Configuraciones del centro" }),
    ).toBeNull();
    expect(screen.getByText("Configuración guardada.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Editar centro" }));
    fireEvent.change(screen.getByLabelText("Centro"), {
      target: { value: "b" },
    });
    await screen.findByRole("heading", { name: "Center B" });
    expect(
      screen.queryByRole("heading", { name: "Configuraciones del centro" }),
    ).toBeNull();
  });
  it("does not show the center agenda to members", async () => {
    await signIn("member");
    fireEvent.click(screen.getByRole("link", { name: "Mi centro" }));
    expect(
      screen.queryByRole("heading", { name: "Agendamientos del centro" }),
    ).toBeNull();
  });
  it("opens manual booking with the center options", async () => {
    await signIn("member");
    fireEvent.click(
      await screen.findByRole("button", { name: "+ Agendar cita" }),
    );
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(
      await screen.findByRole("option", { name: "Consulta · 60 min" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Profesional")).toBeNull();
  });
  it("lets administrators select a professional when booking from the center page", async () => {
    await signIn("administrator");
    fireEvent.click(screen.getByRole("link", { name: "Mi centro" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "+ Agendar cita" }),
    );
    expect(await screen.findByRole("option", { name: "Camila" })).toBeTruthy();
    expect(screen.getByLabelText("Profesional")).toBeTruthy();
  });
  it("does not offer manual booking to limited users", async () => {
    await signIn("limited");
    expect(screen.queryByRole("button", { name: "+ Agendar cita" })).toBeNull();
  });
  it("keeps the selected center on refresh", async () => {
    await signIn("member");
    fireEvent.change(screen.getByLabelText("Centro"), {
      target: { value: "b" },
    });
    await screen.findByText("Revisa la agenda y los servicios de Center B.");
    const requestsBeforeRefresh = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) =>
        String(url).endsWith("/staff/centers"),
      ).length;
    fireEvent.click(screen.getByRole("button", { name: "Actualizar centros" }));
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter(([url]) => String(url).endsWith("/staff/centers"))
          .length,
      ).toBe(requestsBeforeRefresh + 1),
    );
    await waitFor(() =>
      expect((screen.getByLabelText("Centro") as HTMLSelectElement).value).toBe(
        "b",
      ),
    );
  });
  it("signs out locally even when server revocation fails", async () => {
    auth.revokeFails = true;
    await signIn("member");
    expect(
      await screen.findByRole("heading", { name: "Calendario de citas" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await screen.findByRole("button", { name: "Ingresar" });
    expect(auth.signOutOptions).toEqual({ scope: "local" });
    expect(auth.session).toBeNull();
    cleanup();
    render(
      <MemoryRouter>
        <Staff />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: "Ingresar" }),
    ).toBeTruthy();
  });
  it("opens platform administration directly and refreshes center cards", async () => {
    await signIn("platform_administrator");
    expect(screen.queryByRole("heading", { name: "Agendamientos" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Mi centro" })).toBeNull();
    expect(screen.queryByText("Tu espacio de trabajo")).toBeNull();
    expect(
      await screen.findByRole("heading", { name: "Center B" }),
    ).toBeTruthy();
    centers = originalCenters.map((c) =>
      c.center_id === "b"
        ? { ...c, centers: { ...c.centers, name: "Renamed Center B" } }
        : c,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actualizar centros" }));
    const cards = screen.getByRole("region", { name: "Centros existentes" });
    await waitFor(() =>
      expect(
        within(cards).getByRole("heading", { name: "Renamed Center B" }),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole("heading", { name: "Center B" })).toBeNull();
  });
  it("uses the API field list to populate the platform editor", async () => {
    await signIn("platform_administrator");
    expect(
      screen.queryByRole("heading", { name: "Platform administration" }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "Registros" }).getAttribute("href"),
    ).toBe("/staff/registros");
    fireEvent.click(screen.getByRole("link", { name: "Registros" }));
    expect(
      await screen.findByRole("heading", { name: "Edit records" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Centros existentes" }),
    ).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const editor = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Editable fields (JSON)",
    });
    expect(JSON.parse(editor.value)).toEqual({ image_url: null });
    fireEvent.click(screen.getByRole("link", { name: "Centros" }));
    expect(
      await screen.findByRole("heading", { name: "Centros" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Edit records" })).toBeNull();
  });
  it("keeps a role error when the agenda succeeds", async () => {
    failRole = true;
    auth.role = "member";
    render(
      <MemoryRouter>
        <Staff />
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText("Correo electrónico"), {
      target: { value: "member@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(
      await screen.findByText("Could not load center access."),
    ).toBeTruthy();
    expect(
      await screen.findByRole("heading", { name: "Calendario de citas" }),
    ).toBeTruthy();
    expect(screen.getByText("Could not load center access.")).toBeTruthy();
  });
});

it("lets a platform administrator select the center whose team they manage", async () => {
  await signIn("platform_administrator");
  const card = (
    await screen.findByRole("heading", { name: "Center B" })
  ).closest("article")!;
  fireEvent.click(within(card).getByRole("button", { name: "Abrir centro" }));
  expect(await screen.findByRole("heading", { name: "Equipo" })).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Catálogo del centro" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "+ Agregar servicio" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Agendamientos del centro" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Términos y condiciones" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Editar centro" }));
  expect(
    screen.getByRole("heading", { name: "Configuraciones del centro" }),
  ).toBeTruthy();
  expect(
    (screen.getByLabelText("Nombre del centro") as HTMLInputElement).value,
  ).toBe("Center B");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/staff/centers/b/team"),
      expect.anything(),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "← Volver a centros" }));
  expect(screen.queryByRole("heading", { name: "Equipo" })).toBeNull();
});
