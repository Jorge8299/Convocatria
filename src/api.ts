import type { ClubAccount, FootballStage, TrainingYear } from "./clubTypes";
import { INITIAL_CLUB, OLIVA_CLUB_ID, slugifyClub, validClubEdit, type Club } from './clubs';
import { prepareBoard, validBoard, type TacticalBoard } from './tactical/model';

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
  club_id?: string;
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
  clubs?: Club[];
  fields?: Array<{club_id:string;id:string;nombre:string;zones:string[]}>;
  accounts: ClubAccount[];
  session: ClubAccount | null;
  impersonator?: ClubAccount | null;
  stores?: StoreRow[];
  auditLogs?: LoginAuditEntry[];
}
export const currentClubSlug = () => location.pathname.split('/').filter(Boolean)[0] || OLIVA_CLUB_ID;
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
  let accounts = readLocalAccounts().map(a=>({...a,club_id:a.role==='superadmin'?null:a.club_id || OLIVA_CLUB_ID}));
  let stores: StoreRow[] = readLocalStores().map(s=>({...s,club_id:accounts.find(a=>a.id===s.account_id)?.club_id || OLIVA_CLUB_ID}));
  let clubs: Club[] = JSON.parse(localStorage.getItem('convo_clubs_v1') || 'null') || [INITIAL_CLUB];
  const sessionId = sessionStorage.getItem(LOCAL_SESSION_KEY);
  const session = accounts.find((account) => account.id === sessionId) || null;
  const impersonatorId = sessionStorage.getItem(LOCAL_IMPERSONATOR_KEY);
  const impersonator = accounts.find(
    (account) => account.id === impersonatorId && account.role === "superadmin",
  ) || null;
  if (session && session.role !== 'superadmin' && ['/api/coordinator-agenda','/api/calendar-import','/api/accounts'].includes(url.pathname)) {
    const targets = [body.accountId, method==='PATCH' ? body.id : undefined, method==='DELETE' ? url.searchParams.get('id') : undefined,
      ...(Array.isArray(body.selections) ? body.selections.map((s:any)=>s.accountId) : [])].filter(Boolean);
    if (targets.some(id=>!accounts.some(a=>a.id===id && a.club_id===session.club_id))) throw new Error('No puedes acceder a otro club.');
  }

  if (url.pathname === "/api/bootstrap") {
    const requestedClub=clubs.find(c=>c.slug===(url.searchParams.get('club') || OLIVA_CLUB_ID));
    if(!requestedClub) throw new Error('Club no encontrado.');
    const clubSession=url.searchParams.get('clubAccess')==='1'
      ? (session?.club_id===requestedClub.id ? session : null) : session;
    return {
      accounts: accounts.filter(a=>clubSession ? clubSession.role==='superadmin' || a.club_id===clubSession.club_id : a.active && a.club_id===requestedClub.id).map(publicLocalAccount),
      clubs: clubSession ? clubs.filter(c=>clubSession.role==='superadmin' || c.id===clubSession.club_id) : [requestedClub],
      session: clubSession ? publicLocalAccount(clubSession) : null,
      impersonator: clubSession && impersonator ? publicLocalAccount(impersonator) : null,
      stores: stores.filter(s=>clubSession && (clubSession.role==='superadmin' || s.club_id===clubSession.club_id)),
    } as T;
  }
  if (url.pathname === '/api/clubs') {
    if (session?.role!=='superadmin') throw new Error('Acceso restringido.');
    if(method==='POST') {
      const slug=slugifyClub(String(body.nombre || ''));
      if(!slug || clubs.some(c=>c.slug===slug) || !validClubEdit(body) || !/^\d{4}$/.test(String(body.admin_pin || ''))) throw new Error('Revisa los datos del club y el administrador.');
      const now=new Date().toISOString(); const created={id:slug,nombre:String(body.nombre).trim(),slug,logo:String(body.logo),color_principal:String(body.color_principal),activo:true,created_at:now,updated_at:now};
      clubs.push(created); accounts.push({id:crypto.randomUUID(),club_id:slug,name:String(body.admin_name),role:'admin',teamLabel:'Administración',footballStage:null,trainingYear:null,pin:String(body.admin_pin),active:true,createdAt:now});
      localStorage.setItem('convo_clubs_v1',JSON.stringify(clubs)); localStorage.setItem(LOCAL_ACCOUNTS_KEY,JSON.stringify(accounts));
      return {club:created,admin:{name:body.admin_name},access_path:`/${slug}`} as T;
    }
    if(method==='PATCH') {
      if(!validClubEdit(body) || !clubs.some(c=>c.id===body.id)) throw new Error('Club no válido.');
      clubs=clubs.map(c=>c.id===body.id?{...c,nombre:String(body.nombre).trim(),logo:String(body.logo),color_principal:String(body.color_principal),updated_at:new Date().toISOString()}:c);
      localStorage.setItem('convo_clubs_v1',JSON.stringify(clubs));
    }
    return {clubs} as T;
  }
  if (url.pathname === "/api/login" && method === "POST") {
    const loginClub=clubs.find(c=>c.activo && c.slug===(body.clubSlug || OLIVA_CLUB_ID));
    if(!loginClub) throw new Error('Club no encontrado.');
    const account = body.accountId
      ? accounts.find((item) => item.active && item.id === body.accountId && item.club_id===loginClub.id)
      : accounts.find(
          (item) => item.active && (item.role==='superadmin' || (item.role==='admin' && item.club_id===loginClub.id)) && item.pin === body.pin,
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
    if (!session || !['admin','superadmin'].includes(session.role)) throw new Error('Acceso restringido.');
    const now = new Date().toISOString();
    accounts.push({
      id: crypto.randomUUID(),
      club_id: session.role==='superadmin' ? String(body.club_id || OLIVA_CLUB_ID) : session.club_id,
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
  } else if (url.pathname === "/api/data" && method === "DELETE") {
    if (session?.role !== "superadmin") throw new Error("Solo el superadmin puede borrar todas las agendas.");
    let removed = 0;
    let affectedAccounts = 0;
    stores = stores.map((store) => {
      if (store.area !== "agenda") return store;
      affectedAccounts += 1;
      removed += Array.isArray(store.data) ? store.data.length : 0;
      return { ...store, data: [] };
    });
    localStorage.setItem(LOCAL_STORES_KEY, JSON.stringify(stores));
    return { ok: true, removed, accounts: affectedAccounts } as T;
  } else if (url.pathname === "/api/data" && method === "PUT") {
    if (!session) throw new Error("Inicia sesión de nuevo.");
    const area = body.area as StoreArea;
    const teamOperation = body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? body.data as Record<string, unknown>
      : {};
    if (session.role === "admin" && area === "team" && ["addPlayer", "deletePlayer"].includes(String(teamOperation.operation))) {
      const accountId = String(teamOperation.accountId || "");
      const coach = accounts.find((account) => account.id === accountId && account.club_id === session.club_id && account.role === "entrenador" && account.active);
      if (!coach) throw new Error("El equipo seleccionado no es válido.");
      const storeIndex = stores.findIndex((store) => store.account_id === accountId && store.area === "team");
      const currentTeam = (storeIndex >= 0 ? stores[storeIndex].data : { name: coach.teamLabel, season: "", players: [] }) as {name:string;season:string;players:Record<string,unknown>[]};
      const players = Array.isArray(currentTeam.players) ? currentTeam.players : [];
      if (teamOperation.operation === "addPlayer") {
        const name = String(teamOperation.name || "").trim();
        const number = String(teamOperation.number || "").trim();
        const role = teamOperation.role === "portero" ? "portero" : teamOperation.role === "jugador" ? "jugador" : "";
        if (!name || name.length > 120 || number.length > 10 || !role) throw new Error("Revisa el nombre, el dorsal y el tipo de jugador.");
        const player = { id: crypto.randomUUID(), name, number, role, group: "plantilla", active: true, ownerCoachId: coach.id };
        const next = { ...currentTeam, players: [...players, player] };
        if (storeIndex >= 0) stores[storeIndex] = { ...stores[storeIndex], data: next };
        else stores.push({ account_id: accountId, area: "team", data: next, club_id: session.club_id });
        localStorage.setItem(LOCAL_STORES_KEY, JSON.stringify(stores));
        return { ok: true, player } as T;
      }
      const playerId = String(teamOperation.playerId || "");
      if (!players.some((player) => player.id === playerId)) throw new Error("El jugador ya no está en esta plantilla.");
      stores[storeIndex] = { ...stores[storeIndex], data: { ...currentTeam, players: players.filter((player) => player.id !== playerId) } };
      localStorage.setItem(LOCAL_STORES_KEY, JSON.stringify(stores));
      return { ok: true, player: { id: playerId } } as T;
    }
    if (area === 'boards') {
      if (session.role !== 'entrenador') throw new Error('No autorizado.');
      const current = stores.find(store => store.account_id === session.id && store.area === 'boards')?.data as Record<string, unknown> || {};
      const tacticalById = current.tacticalById as Record<string, TacticalBoard> || {};
      const boardData = body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data as Record<string, unknown> : {};
      if (boardData.operation === 'saveTacticalBoard') {
        const input = boardData.board;
        if (!validBoard(input) || input.ownerAccountId !== session.id) throw new Error('Pizarra no válida.');
        if ((tacticalById[input.id]?.revision || 0) !== input.revision) throw new Error('Esta pizarra ha cambiado en otro dispositivo. Vuelve a abrir la versión actual.');
        const board = { ...prepareBoard(input), author: session.name, revision: input.revision + 1 };
        const next = { ...current, tacticalById: { ...tacticalById, [board.id]: board } };
        stores = stores.filter(store => !(store.account_id === session.id && store.area === 'boards'));
        stores.push({ account_id: session.id, area: 'boards', data: next });
        localStorage.setItem(LOCAL_STORES_KEY, JSON.stringify(stores));
        return { ok: true, board } as T;
      }
      body.data = { ...boardData, tacticalById };
    }
    if (area === "agenda") {
      if (impersonator?.role !== "superadmin")
        throw new Error("La preparación de ejercicios todavía no está disponible.");
      const currentStore = stores.find(
        (store) => store.account_id === session.id && store.area === "agenda",
      );
      const current = Array.isArray(currentStore?.data)
        ? (currentStore.data as Array<Record<string, unknown>>)
        : [];
      const update = body.data && typeof body.data === "object" && !Array.isArray(body.data)
        ? (body.data as Record<string, unknown>)
        : {};
      const eventId = String(update.eventId || "");
      const target = current.find((event) => String(event.id) === eventId);
      if (
        !eventId ||
        !update.session ||
        typeof update.session !== "object" ||
        !target ||
        target.type !== "training" ||
        target.assignedByCoordinator !== true ||
        (target.exceptionStatus && target.exceptionStatus !== "scheduled")
      )
        throw new Error("Solo puedes preparar ejercicios en un entrenamiento vigente asignado por coordinación.");
      body.data = current.map((event) =>
        String(event.id) === eventId
          ? { ...event, session: update.session }
          : event,
      );
    }
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
  } else if (url.pathname === "/api/coordinator-agenda" && method === "DELETE") {
    if (session?.role !== "coordinador")
      throw new Error("Solo coordinación puede eliminar actividades.");
    const accountId = String(body.accountId || "");
    const eventId = String(body.eventId || "");
    const eventType = String(body.eventType || "");
    const deleteScope = String(body.deleteScope || "occurrence");
    const agendaStore = stores.find(
      (store) => store.account_id === accountId && store.area === "agenda",
    );
    if (!agendaStore) throw new Error("No se encontró la actividad.");
    const events = agendaStore.data as Array<Record<string, unknown>>;
    const target = events.find(
      (event) => event.id === eventId && event.type === eventType && event.assignedByCoordinator === true,
    );
    if (!target) throw new Error("No se encontró la actividad creada por coordinación.");
    if (deleteScope === "series" && (eventType !== "training" || !target.seriesId))
      throw new Error("No se encontró la serie de entrenamientos.");
    agendaStore.data = events.filter(
      (event) => !(event.assignedByCoordinator === true && (
        deleteScope === "series"
          ? event.type === "training" && event.seriesId === target.seriesId
          : event.id === eventId && event.type === eventType
      )),
    );
    localStorage.setItem(LOCAL_STORES_KEY, JSON.stringify(stores));
    return { ok: true } as T;
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
  } else if (url.pathname === "/api/calendar-import" && body.action === "delete") {
    if (!session || !["admin", "superadmin"].includes(session.role))
      throw new Error("Solo administración puede eliminar rivales.");
    const accountId = String(body.accountId || "");
    const rivalId = String(body.rivalId || "");
    const rivalsStore = stores.find(
      (store) => store.account_id === accountId && store.area === "rivals",
    );
    if (!rivalsStore) throw new Error("No se encontró la lista de rivales del equipo.");
    rivalsStore.data = (rivalsStore.data as ImportedRival[]).filter(
      (rival) => rival.id !== rivalId,
    );
    localStorage.setItem(LOCAL_STORES_KEY, JSON.stringify(stores));
    return { rivals: rivalsStore.data, deletedId: rivalId } as T;
  } else if (url.pathname === "/api/calendar-import") {
    throw new Error("La importación de calendarios está desactivada en el modo local.");
  } else if (url.pathname !== "/api/accounts") {
    throw new Error("Esta función no está disponible en el modo local.");
  }

  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  return { accounts: accounts.filter(a=>session?.role==='superadmin' || a.club_id===session?.club_id).map(publicLocalAccount) } as T;
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
  clubs: () => request<{clubs:Club[]}>('/api/clubs'),
  deleteClub: (id:string, confirmation:string) => request<{clubs:Club[]}>('/api/clubs',{method:'DELETE',body:JSON.stringify({id,confirmation})}),
  updateClub: (club: Club) => request<{clubs:Club[]}>('/api/clubs',{method:'PATCH',body:JSON.stringify({id:club.id,nombre:club.nombre,logo:club.logo,color_principal:club.color_principal})}),
  createClub: (input:{nombre:string;logo:string;color_principal:string;admin_name:string;admin_pin:string}) => request<{club:Club;admin:{id?:string;name:string};access_path:string}>('/api/clubs',{method:'POST',body:JSON.stringify(input)}),
  saveTacticalBoard: (board: TacticalBoard) => request<{ ok: boolean; board: TacticalBoard }>('/api/data', {
    method: 'PUT', body: JSON.stringify({ area: 'boards', data: { operation: 'saveTacticalBoard', board } }),
  }),
  bootstrap: () => request<BootstrapPayload>(`/api/bootstrap?club=${encodeURIComponent(currentClubSlug())}&clubAccess=${location.pathname.split('/').filter(Boolean).length ? '1' : '0'}`),
  login: (accountId: string | undefined, pin: string) =>
    request<{ account: ClubAccount }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ accountId, pin, clubSlug: currentClubSlug() }),
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
  deleteCoordinatorAgendaEvent: (accountId: string, eventId: string, eventType: "training" | "match", deleteScope: "occurrence" | "series" = "occurrence") =>
    request<{ ok: true }>("/api/coordinator-agenda", {
      method: "DELETE",
      body: JSON.stringify({ accountId, eventId, eventType, deleteScope }),
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
  addAdminPlayer: (accountId: string, player: {name:string;number:string;role:'jugador'|'portero'}) =>
    request<{ok:true;player:{id:string}}>("/api/data", {
      method: "PUT",
      body: JSON.stringify({area:"team",data:{operation:"addPlayer",accountId,...player}}),
    }),
  deleteAdminPlayer: (accountId: string, playerId: string) =>
    request<{ok:true;player:{id:string}}>("/api/data", {
      method: "PUT",
      body: JSON.stringify({area:"team",data:{operation:"deletePlayer",accountId,playerId}}),
    }),
  deleteRival: (accountId: string, rivalId: string) =>
    request<{ rivals: Required<ImportedRival>[]; deletedId: string }>(
      "/api/calendar-import",
      {
        method: "POST",
        body: JSON.stringify({ action: "delete", accountId, rivalId }),
      },
    ),
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
