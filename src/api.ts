import type { ClubAccount, FootballStage, TrainingYear } from "./clubTypes";

export type StoreArea = "team" | "stats" | "journeys" | "rivals" | "boards" | "agenda";
export interface CoordinatorMatchInput {
  date: string;
  startTime: string;
  callupTime?: string;
  callupPlace?: string;
  kit?: string;
  homeLockerRoom?: string;
  awayLockerRoom?: string;
  notes: string;
  playInWhite: boolean;
  matchType: "liga" | "amistoso" | "torneo";
  home: boolean;
  rivalId: string;
  rivalName: string;
  field: string;
}
export interface CoordinatorTrainingSlotInput {
  weekday: number;
  startTime: string;
  endTime: string;
  fieldId: "campo-c" | "el-morer" | "polideportivo";
  zoneIds: string[];
  notes: string;
}
export interface CoordinatorTrainingInput {
  fromDate: string;
  toDate: string;
  slots: CoordinatorTrainingSlotInput[];
}
export interface CoordinatorTrainingExceptionInput {
  startTime: string;
  endTime: string;
  fieldId: "campo-c" | "el-morer" | "polideportivo";
  zoneIds: string[];
  notes: string;
  exceptionStatus: "scheduled" | "holiday" | "cancelled";
}
export interface CoordinatorTrainingSelection {
  accountId: string;
  eventId: string;
}
export interface StoreRow {
  account_id: string;
  area: StoreArea;
  data: unknown;
}
export interface LoginAuditEntry {
  id: string | number;
  account_id: string | null;
  account_name: string;
  account_role: ClubAccount["role"];
  logged_at: string;
}
export interface BootstrapPayload {
  accounts: ClubAccount[];
  session: ClubAccount | null;
  impersonator?: ClubAccount | null;
  stores?: StoreRow[];
  auditLogs?: LoginAuditEntry[];
}
export interface ImportedRival {
  id?: string;
  nombre: string;
  campo: string;
}

export const IS_LOCAL_DEMO = import.meta.env.DEV;
const LOCAL_ACCOUNTS_KEY = "convo_local_demo_accounts_v1";
const LOCAL_STORES_KEY = "convo_local_demo_stores_v1";
const LOCAL_SESSION_KEY = "convo_local_demo_session_v1";
const LOCAL_IMPERSONATOR_KEY = "convo_local_demo_impersonator_v1";
const SUPERADMIN_PIN = "8299";
type LocalAccount = ClubAccount & { pin: string };

const localSeedAccounts = (): LocalAccount[] => [
  {
    id: "superadmin",
    name: "Administrador local",
    role: "admin",
    teamLabel: "Administración",
    footballStage: null,
    trainingYear: null,
    active: true,
    createdAt: new Date().toISOString(),
    pin: "1946",
  },
  {
    id: "platform-superadmin",
    name: "Superadmin",
    role: "superadmin",
    teamLabel: "Control de la aplicación",
    footballStage: null,
    trainingYear: null,
    active: true,
    createdAt: new Date().toISOString(),
    pin: SUPERADMIN_PIN,
  },
  {
    id: "local-coach",
    name: "Jorge",
    role: "entrenador",
    teamLabel: "Benjamín A",
    footballStage: "benjamin",
    trainingYear: "segundo",
    active: true,
    createdAt: new Date().toISOString(),
    pin: "1111",
  },
];

function readLocalAccounts(): LocalAccount[] {
  const saved = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
  if (saved) {
    const accounts = JSON.parse(saved) as LocalAccount[];
    let changed = false;
    const existingAdmin = accounts.find((account) => account.id === "superadmin");
    if (existingAdmin && existingAdmin.role !== "admin") {
      existingAdmin.role = "admin";
      changed = true;
    }
    let superadmin = accounts.find((account) => account.id === "platform-superadmin");
    if (!superadmin) {
      superadmin = localSeedAccounts().find((account) => account.id === "platform-superadmin")!;
      accounts.push(superadmin);
      changed = true;
    }
    if (superadmin.pin !== SUPERADMIN_PIN || superadmin.role !== "superadmin") {
      superadmin.pin = SUPERADMIN_PIN;
      superadmin.role = "superadmin";
      changed = true;
    }
    if (changed) localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
    return accounts;
  }
  const seeded = localSeedAccounts();
  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(seeded));
  return seeded;
}

function publicLocalAccount(account: LocalAccount): ClubAccount {
  const { pin: _pin, ...safe } = account;
  return safe;
}

function readLocalStores(): StoreRow[] {
  const stores = JSON.parse(
    localStorage.getItem(LOCAL_STORES_KEY) || "[]",
  ) as StoreRow[];
  const existingTeam = stores.find(
    (store) => store.account_id === "local-coach" && store.area === "team",
  );
  const existingPlayers = (existingTeam?.data as { players?: unknown[] } | undefined)?.players;
  if (!existingTeam || !Array.isArray(existingPlayers) || existingPlayers.length === 0) {
    const names = [
      ["demo-1", "Hugo", "1", "portero"],
      ["demo-2", "Martín", "2", "jugador"],
      ["demo-3", "Álex", "3", "jugador"],
      ["demo-4", "Pablo", "4", "jugador"],
      ["demo-5", "Lucas", "5", "jugador"],
      ["demo-6", "Leo", "6", "jugador"],
      ["demo-7", "Mateo", "7", "jugador"],
      ["demo-8", "Daniel", "8", "jugador"],
      ["demo-9", "Adrián", "9", "jugador"],
      ["demo-10", "Bruno", "10", "jugador"],
      ["demo-11", "Iker", "11", "jugador"],
      ["demo-12", "Sergio", "12", "jugador"],
    ];
    const demoTeam: StoreRow = {
      account_id: "local-coach",
      area: "team",
      data: {
        name: "U.D. OLIVA",
        season: "2026/27",
        players: names.map(([id, name, number, role]) => ({
          id,
          name,
          number,
          role,
          group: "plantilla",
          active: true,
        })),
      },
    };
    if (existingTeam) existingTeam.data = demoTeam.data;
    else stores.push(demoTeam);
  }
  const existingRivals = stores.find(
    (store) => store.account_id === "local-coach" && store.area === "rivals",
  );
  if (!existingRivals || !Array.isArray(existingRivals.data) || existingRivals.data.length === 0) {
    const demoRivals: StoreRow = {
      account_id: "local-coach",
      area: "rivals",
      data: [
        {
          id: "demo-rival-1",
          nombre: "C.F. Gandía",
          campo: "Polideportivo Municipal de Gandía",
        },
      ],
    };
    if (existingRivals) existingRivals.data = demoRivals.data;
    else stores.push(demoRivals);
  }
  localStorage.setItem(LOCAL_STORES_KEY, JSON.stringify(stores));
  return stores;
}

async function localDemoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const url = new URL(path, location.origin);
  const method = init?.method || "GET";
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  let accounts = readLocalAccounts();
  let stores = readLocalStores();
  const sessionId = sessionStorage.getItem(LOCAL_SESSION_KEY);
  const session = accounts.find((account) => account.id === sessionId) || null;
  const impersonatorId = sessionStorage.getItem(LOCAL_IMPERSONATOR_KEY);
  const impersonator = accounts.find(
    (account) => account.id === impersonatorId && account.role === "superadmin",
  ) || null;

  if (url.pathname === "/api/bootstrap") {
    return {
      accounts: accounts.map(publicLocalAccount),
      session: session ? publicLocalAccount(session) : null,
      impersonator: impersonator ? publicLocalAccount(impersonator) : null,
      stores,
    } as T;
  }
  if (url.pathname === "/api/login" && method === "POST") {
    const account = body.accountId
      ? accounts.find((item) => item.id === body.accountId)
      : accounts.find(
          (item) => ["admin", "superadmin"].includes(item.role) && item.pin === body.pin,
        );
    if (!account || account.pin !== body.pin)
      throw new Error("El PIN no es correcto.");
    sessionStorage.setItem(LOCAL_SESSION_KEY, account.id);
    sessionStorage.removeItem(LOCAL_IMPERSONATOR_KEY);
    return { account: publicLocalAccount(account) } as T;
  }
  if (url.pathname === "/api/logout" && method === "POST") {
    sessionStorage.removeItem(LOCAL_SESSION_KEY);
    sessionStorage.removeItem(LOCAL_IMPERSONATOR_KEY);
    return { ok: true } as T;
  }
  if (url.pathname === "/api/impersonation" && method === "POST") {
    if (session?.role !== "superadmin") throw new Error("Acceso restringido.");
    const target = accounts.find(
      (account) => account.id === body.accountId && account.role !== "superadmin" && account.active,
    );
    if (!target) throw new Error("El usuario no está disponible.");
    sessionStorage.setItem(LOCAL_IMPERSONATOR_KEY, session.id);
    sessionStorage.setItem(LOCAL_SESSION_KEY, target.id);
    return { account: publicLocalAccount(target), impersonator: publicLocalAccount(session) } as T;
  }
  if (url.pathname === "/api/impersonation" && method === "DELETE") {
    if (!impersonator) throw new Error("No hay una sesión de superadmin activa.");
    sessionStorage.setItem(LOCAL_SESSION_KEY, impersonator.id);
    sessionStorage.removeItem(LOCAL_IMPERSONATOR_KEY);
    return { account: publicLocalAccount(impersonator) } as T;
  }
  if (url.pathname === "/api/accounts" && method === "POST") {
    const now = new Date().toISOString();
    accounts.push({
      id: crypto.randomUUID(),
      name: String(body.name || ""),
      role: body.role as "entrenador" | "coordinador" | "admin",
      teamLabel: body.role === "admin" ? "Administración" : String(body.teamLabel || ""),
      footballStage: (body.footballStage || null) as ClubAccount["footballStage"],
      trainingYear: (body.trainingYear || null) as ClubAccount["trainingYear"],
      active: true,
      createdAt: now,
      pin: String(body.pin || ""),
    });
  } else if (url.pathname === "/api/accounts" && method === "PATCH") {
    accounts = accounts.map((account) =>
      account.id === body.id
        ? {
            ...account,
            ...(body.name !== undefined ? { name: String(body.name) } : {}),
            ...(body.role !== undefined ? { role: body.role as ClubAccount["role"] } : {}),
            ...(body.teamLabel !== undefined ? { teamLabel: String(body.teamLabel) } : {}),
            ...(body.footballStage !== undefined
              ? { footballStage: body.footballStage as ClubAccount["footballStage"] }
              : {}),
            ...(body.trainingYear !== undefined
              ? { trainingYear: body.trainingYear as ClubAccount["trainingYear"] }
              : {}),
            ...(body.pin !== undefined ? { pin: String(body.pin) } : {}),
            ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
          }
        : account,
    );
  } else if (url.pathname === "/api/accounts" && method === "DELETE") {
    const id = url.searchParams.get("id");
    accounts = accounts.filter((account) => account.id !== id);
    stores = stores.filter((store) => store.account_id !== id);
    localStorage.setItem(LOCAL_STORES_KEY, JSON.stringify(stores));
  } else if (url.pathname === "/api/data" && method === "PUT") {
    if (!session) throw new Error("Inicia sesión de nuevo.");
    const area = body.area as StoreArea;
    stores = stores.filter(
      (store) => !(store.account_id === session.id && store.area === area),
    );
    stores.push({ account_id: session.id, area, data: body.data });
    localStorage.setItem(LOCAL_STORES_KEY, JSON.stringify(stores));
    return { ok: true } as T;
  } else if (url.pathname === "/api/coordinator-agenda" && method === "POST") {
    if (session?.role !== "coordinador")
      throw new Error("Solo coordinación puede asignar actividades.");
    const accountId = String(body.accountId || "");
    const now = new Date().toISOString();
    let newEvents: Array<Record<string, unknown>>;
    if (body.training) {
      const training = body.training as unknown as CoordinatorTrainingInput;
      const seriesId = crypto.randomUUID();
      const slots = Array.isArray(training.slots) ? training.slots : [];
      newEvents = [];
      const cursor = new Date(`${training.fromDate}T12:00:00`);
      const limit = new Date(`${training.toDate}T12:00:00`);
      while (cursor <= limit && newEvents.length < 550) {
        const date = cursor.toISOString().slice(0, 10);
        slots.filter((slot) => slot.weekday === cursor.getDay()).forEach((slot) => {
          newEvents.push({
            id: crypto.randomUUID(), type: "training", date,
            startTime: slot.startTime, endTime: slot.endTime, notes: slot.notes,
            fieldId: slot.fieldId, fieldName: ({ "campo-c": "Campo C", "el-morer": "El Morer", polideportivo: "Polideportivo" } as Record<string, string>)[slot.fieldId],
            zoneIds: slot.zoneIds, seriesId, recurrenceLabel: "Horario habitual",
            assignedByCoordinator: true, assignedByName: session.name,
            assignedAt: now, exceptionStatus: "scheduled",
          });
        });
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      const match = body.match as unknown as CoordinatorMatchInput;
      newEvents = [{ ...match, id: crypto.randomUUID(), type: "match", assignedByCoordinator: true, assignedByName: session.name, assignedAt: now, acknowledgedAt: null }];
    }
    const agendaStore = stores.find(
      (store) => store.account_id === accountId && store.area === "agenda",
    );
    if (agendaStore) agendaStore.data = [...(agendaStore.data as unknown[]), ...newEvents];
    else stores.push({ account_id: accountId, area: "agenda", data: newEvents });
    localStorage.setItem(LOCAL_STORES_KEY, JSON.stringify(stores));
    return { event: newEvents[0], events: newEvents } as T;
  } else if (url.pathname === "/api/coordinator-agenda" && method === "PATCH") {
    if (session?.role === "coordinador" && body.action === "batchTrainingStatus") {
      const selections = body.selections as unknown as CoordinatorTrainingSelection[];
      const exceptionStatus = body.exceptionStatus as CoordinatorTrainingExceptionInput["exceptionStatus"];
      selections.forEach(({ accountId, eventId }) => {
        const agendaStore = stores.find((store) => store.account_id === accountId && store.area === "agenda");
        agendaStore && (agendaStore.data = (agendaStore.data as Array<Record<string, unknown>>).map((event) =>
          event.id === eventId && event.type === "training" && event.assignedByCoordinator === true
            ? { ...event, exceptionStatus }
            : event,
        ));
      });
      localStorage.setItem(LOCAL_STORES_KEY, JSON.stringify(stores));
      return { ok: true, updated: selections.length } as T;
    }
    if (session?.role === "coordinador" && body.action === "updateMatch") {
      const accountId = String(body.accountId || "");
      const eventId = String(body.eventId || "");
      const agendaStore = stores.find((store) => store.account_id === accountId && store.area === "agenda");
      agendaStore && (agendaStore.data = (agendaStore.data as Array<Record<string, unknown>>).map((event) =>
        event.id === eventId && event.type === "match" && event.assignedByCoordinator === true
          ? { ...event, ...(body.match as object), ...(body.coordinatorStatus ? { coordinatorStatus: body.coordinatorStatus } : {}) }
          : event,
      ));
      localStorage.setItem(LOCAL_STORES_KEY, JSON.stringify(stores));
      return { ok: true } as T;
    }
    if (session?.role === "coordinador" && body.action === "updateTrainingOccurrence") {
      const accountId = String(body.accountId || "");
      const agendaStore = stores.find((store) => store.account_id === accountId && store.area === "agenda");
      const changes = body.changes as unknown as CoordinatorTrainingExceptionInput;
      agendaStore && (agendaStore.data = (agendaStore.data as Array<Record<string, unknown>>).map((event) =>
        event.id === body.eventId && event.type === "training"
          ? { ...event, ...changes, fieldName: ({ "campo-c": "Campo C", "el-morer": "El Morer", polideportivo: "Polideportivo" } as Record<string, string>)[changes.fieldId], recurrenceLabel: "Excepción para este día" }
          : event,
      ));
      localStorage.setItem(LOCAL_STORES_KEY, JSON.stringify(stores));
      return { ok: true } as T;
    }
    if (session?.role !== "entrenador") throw new Error("No autorizado.");
    const acknowledgedAt = new Date().toISOString();
    const agendaStore = stores.find(
      (store) => store.account_id === session.id && store.area === "agenda",
    );
    agendaStore && (agendaStore.data = (agendaStore.data as Array<Record<string, unknown>>).map(
      (event) => event.id === body.eventId ? { ...event, acknowledgedAt } : event,
    ));
    localStorage.setItem(LOCAL_STORES_KEY, JSON.stringify(stores));
    return { ok: true, acknowledgedAt } as T;
  } else if (url.pathname === "/api/calendar-import") {
    throw new Error("La importación de calendarios está desactivada en el modo local.");
  } else if (url.pathname !== "/api/accounts") {
    throw new Error("Esta función no está disponible en el modo local.");
  }

  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  return { accounts: accounts.map(publicLocalAccount) } as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (IS_LOCAL_DEMO) return localDemoRequest<T>(path, init);
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(payload.error || "No se pudo conectar con el servidor.");
  return payload;
}

export const clubApi = {
  bootstrap: () => request<BootstrapPayload>("/api/bootstrap"),
  login: (accountId: string | undefined, pin: string) =>
    request<{ account: ClubAccount }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ accountId, pin }),
    }),
  logout: () => request<{ ok: boolean }>("/api/logout", { method: "POST" }),
  impersonate: (accountId: string) =>
    request<{ account: ClubAccount; impersonator: ClubAccount }>("/api/impersonation", {
      method: "POST",
      body: JSON.stringify({ accountId }),
    }),
  stopImpersonating: () =>
    request<{ account: ClubAccount }>("/api/impersonation", { method: "DELETE" }),
  createAccount: (input: {
    name: string;
    role: "entrenador" | "coordinador" | "admin";
    teamLabel: string;
    footballStage: FootballStage | null;
    trainingYear: TrainingYear | null;
    pin: string;
  }) =>
    request<{ accounts: ClubAccount[] }>("/api/accounts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateAccount: (input: {
    id: string;
    name?: string;
    role?: "entrenador" | "coordinador" | "admin";
    teamLabel?: string;
    footballStage?: FootballStage | null;
    trainingYear?: TrainingYear | null;
    pin?: string;
    active?: boolean;
  }) =>
    request<{ accounts: ClubAccount[] }>("/api/accounts", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteAccount: (id: string) =>
    request<{ accounts: ClubAccount[] }>(
      `/api/accounts?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  saveData: (area: StoreArea, data: unknown) =>
    request<{ ok: boolean }>("/api/data", {
      method: "PUT",
      body: JSON.stringify({ area, data }),
    }),
  clearAllAgendas: () =>
    request<{ ok: true; removed: number; accounts: number }>("/api/data", {
      method: "DELETE",
    }),
  assignCoordinatorMatch: (accountId: string, match: CoordinatorMatchInput) =>
    request<{ event: CoordinatorMatchInput & { id: string } }>(
      "/api/coordinator-agenda",
      {
        method: "POST",
        body: JSON.stringify({ accountId, match }),
      },
    ),
  assignCoordinatorTraining: (accountId: string, training: CoordinatorTrainingInput) =>
    request<{ events: Array<{ id: string }> }>("/api/coordinator-agenda", {
      method: "POST",
      body: JSON.stringify({ accountId, training }),
    }),
  updateCoordinatorTrainingOccurrence: (accountId: string, eventId: string, changes: CoordinatorTrainingExceptionInput) =>
    request<{ ok: true }>("/api/coordinator-agenda", {
      method: "PATCH",
      body: JSON.stringify({ action: "updateTrainingOccurrence", accountId, eventId, changes }),
    }),
  updateCoordinatorTrainingStatus: (selections: CoordinatorTrainingSelection[], exceptionStatus: CoordinatorTrainingExceptionInput["exceptionStatus"]) =>
    request<{ ok: true; updated: number }>("/api/coordinator-agenda", {
      method: "PATCH",
      body: JSON.stringify({ action: "batchTrainingStatus", selections, exceptionStatus }),
    }),
  updateCoordinatorMatch: (accountId: string, eventId: string, match: CoordinatorMatchInput) =>
    request<{ ok: true }>("/api/coordinator-agenda", {
      method: "PATCH",
      body: JSON.stringify({ action: "updateMatch", accountId, eventId, match }),
    }),
  setCoordinatorMatchStatus: (accountId: string, eventId: string, coordinatorStatus: "scheduled" | "cancelled") =>
    request<{ ok: true }>("/api/coordinator-agenda", {
      method: "PATCH",
      body: JSON.stringify({ action: "updateMatch", accountId, eventId, coordinatorStatus }),
    }),
  acknowledgeCoordinatorMatch: (eventId: string) =>
    request<{ ok: true; acknowledgedAt: string }>("/api/coordinator-agenda", {
      method: "PATCH",
      body: JSON.stringify({ eventId }),
    }),
  extractCalendar: async (file: File) => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
      reader.readAsDataURL(file);
    });
    return request<{ rivals: ImportedRival[]; lines: number }>(
      "/api/calendar-import",
      {
        method: "POST",
        body: JSON.stringify({
          action: "extract",
          fileName: file.name,
          mimeType: file.type,
          base64,
        }),
      },
    );
  },
  saveImportedRivals: (accountId: string, rivals: ImportedRival[]) =>
    request<{ added: number; total: number; skipped: number }>(
      "/api/calendar-import",
      {
        method: "POST",
        body: JSON.stringify({ action: "save", accountId, rivals }),
      },
    ),
  replaceRivals: (accountId: string, rivals: ImportedRival[]) =>
    request<{ rivals: Required<ImportedRival>[] }>("/api/calendar-import", {
      method: "POST",
      body: JSON.stringify({ action: "replace", accountId, rivals }),
    }),
};

export function getStored<T>(
  stores: StoreRow[],
  accountId: string,
  area: StoreArea,
  fallback: T,
): T {
  return (
    (stores.find(
      (store) => store.account_id === accountId && store.area === area,
    )?.data as T | undefined) ?? fallback
  );
}

export function buildLegacySnapshot() {
  const accounts = JSON.parse(
    localStorage.getItem("convo_club_accounts_v1") || "[]",
  ) as ClubAccount[];
  const stores: Array<{ accountId: string; area: StoreArea; data: unknown }> =
    [];
  for (const account of accounts) {
    for (const area of ["team", "stats", "journeys", "rivals", "agenda"] as StoreArea[]) {
      const raw = localStorage.getItem(`convo_account_${account.id}_${area}`);
      if (raw)
        stores.push({ accountId: account.id, area, data: JSON.parse(raw) });
    }
    const board = localStorage.getItem(`pizarra_futbol8_pro_v1_${account.id}`);
    if (board)
      stores.push({
        accountId: account.id,
        area: "boards",
        data: JSON.parse(board),
      });
  }
  return { accounts, stores };
}
