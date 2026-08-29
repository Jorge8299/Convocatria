import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Clock,
  Download,
  FileText,
  FileUp,
  Home,
  KeyRound,
  LogIn,
  LogOut,
  MapPin,
  Pencil,
  Plane,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { CoachApp } from "./App";
import type { AgendaEvent, MatchAgendaEvent } from "./AgendaView";
import {
  ClubAccount,
  ClubRole,
  FootballStage,
  TrainingYear,
} from "./clubTypes";
import {
  BootstrapPayload,
  buildLegacySnapshot,
  clubApi,
  CoordinatorMatchInput,
  getStored,
  ImportedRival,
  IS_LOCAL_DEMO,
  StoreRow,
} from "./api";
import { randomFootballPhrase } from "./motivational";
import { CoordinatorTrainingPlanner } from "./CoordinatorTrainingPlanner";
import { drawMagicPdfHeader, getClubCrestDataUrl, getDailyFootballPhrase, pdfBrand } from "./pdfBranding";

const LAST_ACCOUNT_KEY = "convo_club_last_account_v1";
const roleLabel: Record<ClubRole, string> = {
  entrenador: "Entrenador",
  coordinador: "Coordinador",
  admin: "Administrador",
  superadmin: "Superadmin",
};
const trainingYearLabel: Record<TrainingYear, string> = {
  primero: "Primer año",
  segundo: "Segundo año",
  mixto: "Primer y segundo año",
};
const footballStageLabel: Record<FootballStage, string> = {
  querubin: "Querubín",
  prebenjamin: "Prebenjamín",
  benjamin: "Benjamín",
  alevin: "Alevín",
};
const footballStageAgeOrder: Record<FootballStage, number> = {
  querubin: 0,
  prebenjamin: 1,
  benjamin: 2,
  alevin: 3,
};
const trainingYearAgeOrder: Record<TrainingYear, number> = {
  primero: 0,
  mixto: 1,
  segundo: 2,
};
const compareCoachesByAge = (first: ClubAccount, second: ClubAccount) =>
  (first.footballStage ? footballStageAgeOrder[first.footballStage] : 99) -
    (second.footballStage ? footballStageAgeOrder[second.footballStage] : 99) ||
  (first.trainingYear ? trainingYearAgeOrder[first.trainingYear] : 99) -
    (second.trainingYear ? trainingYearAgeOrder[second.trainingYear] : 99) ||
  first.teamLabel.localeCompare(second.teamLabel, "es", {
    numeric: true,
    sensitivity: "base",
  });

function LocalDemoBanner() {
  if (!IS_LOCAL_DEMO) return null;
  return (
    <div className="local-demo-banner" role="status">
      Modo local · Los cambios solo se guardan en este navegador
    </div>
  );
}

interface StoredPlayer {
  id: string;
  name: string;
  number: string;
  role: "jugador" | "portero";
  group: "plantilla" | "b";
  active: boolean;
  ownerCoachId?: string;
}
interface StoredTeam {
  name: string;
  season: string;
  players: StoredPlayer[];
}
interface StoredRival {
  id: string;
  nombre: string;
  campo: string;
}
interface StoredEntry {
  playerId: string;
  goals: number;
  assists: number;
  rating: number;
  notes: string;
}
interface StoredMatch {
  id: string;
  date: string;
  rival: string;
  home?: boolean;
  ourScore: number;
  rivalScore: number;
  notes: string;
  players: StoredEntry[];
}

const coordinatorWeekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const coordinatorMonthFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
});
const coordinatorDayFormatter = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const coordinatorIsoDate = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const normalizedMatchName = (value: string) =>
  value.trim().toLocaleLowerCase("es").replace(/\s+/g, " ");
const HOME_FIELDS = ["El Morer", "Campo C", "Polideportivo"];
const MATCH_HOURS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0"),
);

const emptyCoordinatorMatch = (date: string): CoordinatorMatchInput => ({
  date,
  startTime: "09:00",
  callupTime: "08:15",
  callupPlace: "Morer",
  kit: "",
  homeLockerRoom: "",
  awayLockerRoom: "",
  notes: "",
  playInWhite: false,
  matchType: "liga",
  home: true,
  rivalId: "",
  rivalName: "",
  field: "",
});

const subtractMatchMinutes = (time: string, minutesToSubtract: number) => {
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  const total = (hour * 60 + minute - minutesToSubtract + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const pdfTime = (time?: string) => {
  if (!time) return "";
  const [hour, minute = "00"] = time.split(":");
  return `${Number(hour)}'${minute}H`;
};

const pdfDateTime = (date: string, time?: string) => {
  const day = new Intl.DateTimeFormat("es-ES", { weekday: "long" })
    .format(new Date(`${date}T12:00:00`))
    .toUpperCase();
  return `${day} ${pdfTime(time) || "HORA PENDIENTE"}`;
};

const shortFieldName = (field?: string) => {
  const clean = (field || "").trim();
  if (/morer/i.test(clean)) return "MORER";
  if (/campo c/i.test(clean)) return "CAMPO C";
  if (/poli|polideportivo/i.test(clean)) return "POLIDEPORTIVO";
  return clean.toUpperCase();
};

function QuickTimeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [hour = "18", minute = "00"] = value.split(":");
  const [minuteDraft, setMinuteDraft] = useState(minute);
  useEffect(() => {
    setMinuteDraft(minute);
  }, [minute]);
  const commitMinutes = () => {
    const nextMinute = Math.min(59, Math.max(0, Number(minuteDraft) || 0));
    const normalizedMinute = String(nextMinute).padStart(2, "0");
    setMinuteDraft(normalizedMinute);
    onChange(`${MATCH_HOURS.includes(hour) ? hour : "09"}:${normalizedMinute}`);
  };
  const adjustMinutes = (amount: number) => {
    const currentHour = Math.min(23, Math.max(0, Number(hour) || 0));
    const currentMinute = Math.min(59, Math.max(0, Number(minuteDraft) || 0));
    const currentMinutes = currentHour * 60 + currentMinute;
    const adjusted = (currentMinutes + amount + 1440) % 1440;
    onChange(
      `${String(Math.floor(adjusted / 60)).padStart(2, "0")}:${String(adjusted % 60).padStart(2, "0")}`,
    );
  };
  return (
    <div className="quick-time-input">
      <div className="quick-time-clock">
        <Clock size={17} aria-hidden="true" />
        <label>
          <span>Hora</span>
          <select
            aria-label="Hora del partido"
            value={MATCH_HOURS.includes(hour) ? hour : "09"}
            onChange={(event) => {
              const normalizedMinute = String(
                Math.min(59, Math.max(0, Number(minuteDraft) || 0)),
              ).padStart(2, "0");
              onChange(`${event.target.value}:${normalizedMinute}`);
            }}
          >
            {MATCH_HOURS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <b aria-hidden="true">:</b>
        <label>
          <span>Minutos</span>
          <input
            aria-label="Minutos del partido"
            inputMode="numeric"
            maxLength={2}
            value={minuteDraft}
            onChange={(event) => setMinuteDraft(event.target.value.replace(/\D/g, "").slice(0, 2))}
            onBlur={commitMinutes}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          />
        </label>
      </div>
      <div className="quick-time-adjustments">
        <button type="button" onClick={() => adjustMinutes(-15)}>−15 min</button>
        <button type="button" onClick={() => adjustMinutes(15)}>+15 min</button>
      </div>
      <small>Elige la hora y escribe los minutos si necesitas un valor exacto.</small>
    </div>
  );
}

export default function ClubShell() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [loadError, setLoadError] = useState("");
  const refresh = async () => {
    try {
      setBootstrap(await clubApi.bootstrap());
      setLoadError("");
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "No se pudo conectar.",
      );
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  if (!bootstrap)
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="login-crest">
            <img src="/escudo-ud-oliva.jpg" alt="Escudo U.D. Oliva" />
          </div>
          <h1>{loadError ? "Sin conexión" : "Cargando…"}</h1>
          <p>{loadError || "Conectando con los datos del club."}</p>
          {loadError && (
            <button className="primary-button" onClick={() => void refresh()}>
              Reintentar
            </button>
          )}
        </section>
      </main>
    );
  const accounts = bootstrap.accounts;
  const session = bootstrap.session;
  const logout = async () => {
    await clubApi.logout();
    localStorage.removeItem(LAST_ACCOUNT_KEY);
    await refresh();
  };
  if (!session)
    return (
      <LoginScreen
        accounts={accounts.filter((account) => account.active)}
        onLogin={async (id, pin) => {
          try {
            await clubApi.login(id || undefined, pin);
            await refresh();
          } catch (error) {
            return error instanceof Error
              ? error.message
              : "No se pudo iniciar sesión.";
          }
        }}
      />
    );
  if (session.role === "superadmin")
    return (
      <AdminPanel
        account={session}
        platformMode
        accounts={accounts}
        stores={bootstrap.stores || []}
        onRefresh={refresh}
        onAccounts={(next) =>
          setBootstrap((current) =>
            current ? { ...current, accounts: next } : current,
          )
        }
        onImpersonate={async (accountId) => {
          await clubApi.impersonate(accountId);
          await refresh();
        }}
        onLogout={logout}
      />
    );
  const impersonationBanner = bootstrap.impersonator ? (
    <ImpersonationBanner
      account={session}
      onReturn={async () => {
        await clubApi.stopImpersonating();
        await refresh();
      }}
    />
  ) : null;
  if (session.role === "admin")
    return (
      <>
        {impersonationBanner}
        <AdminPanel
          account={session}
          accounts={accounts}
          stores={bootstrap.stores || []}
          onRefresh={refresh}
          onAccounts={(next) =>
            setBootstrap((current) =>
              current ? { ...current, accounts: next } : current,
            )
          }
          onLogout={logout}
        />
      </>
    );
  if (session.role === "coordinador")
    return (
      <>
        {impersonationBanner}
        <CoordinatorPanel
          account={session}
          accounts={accounts}
          stores={bootstrap.stores || []}
          onRefresh={refresh}
          onLogout={logout}
        />
      </>
    );
  return (
    <>
      {impersonationBanner}
      <CoachApp
        account={session}
        accounts={accounts}
        stores={bootstrap.stores || []}
        onDataChange={(area, data) => clubApi.saveData(area, data)}
        onLogout={logout}
      />
    </>
  );
}

function ImpersonationBanner({
  account,
  onReturn,
}: {
  account: ClubAccount;
  onReturn: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const returnToSuperadmin = async () => {
    setBusy(true);
    setError("");
    try {
      await onReturn();
    } catch (returnError) {
      setError(returnError instanceof Error ? returnError.message : "No se pudo volver al superadmin.");
      setBusy(false);
    }
  };
  return (
    <aside className="impersonation-banner" aria-label="Modo de revisión del superadmin">
      <ShieldCheck size={18} />
      <span>
        Modo superadmin · Estás revisando la cuenta de <strong>{account.name}</strong>
      </span>
      {error && <small role="alert">{error}</small>}
      <button type="button" disabled={busy} onClick={() => void returnToSuperadmin()}>
        <ChevronLeft size={16} /> {busy ? "Volviendo…" : "Volver al superadmin"}
      </button>
    </aside>
  );
}

function LoginScreen({
  accounts,
  onLogin,
}: {
  accounts: ClubAccount[];
  onLogin: (id: string, pin: string) => Promise<string | void>;
}) {
  const visibleAccounts = accounts.filter(
    (account) => !["admin", "superadmin"].includes(account.role),
  );
  const legacySnapshot = useMemo(() => buildLegacySnapshot(), []);
  const [selectedId, setSelectedId] = useState(() => {
    const remembered = localStorage.getItem(LAST_ACCOUNT_KEY) || "";
    return visibleAccounts.some((account) => account.id === remembered)
      ? remembered
      : "";
  });
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [migrationPin, setMigrationPin] = useState("");
  const [migrationMessage, setMigrationMessage] = useState("");
  const [migrationDone, setMigrationDone] = useState(false);
  const selected = accounts.find((account) => account.id === selectedId);
  const login = async () => {
    if (!/^\d{4}$/.test(pin)) {
      setError("Introduce un PIN de 4 números.");
      return;
    }
    const loginError = await onLogin(selected?.id || "", pin);
    if (loginError) {
      setError(loginError);
      setPin("");
      return;
    }
    if (selected) localStorage.setItem(LAST_ACCOUNT_KEY, selected.id);
    else localStorage.removeItem(LAST_ACCOUNT_KEY);
  };
  const migrateLegacy = async () => {
    if (!/^\d{4}$/.test(migrationPin)) {
      setMigrationMessage("Introduce el PIN de superadmin.");
      return;
    }
    const base =
      location.hostname === "convo-preb.vercel.app"
        ? ""
        : "https://convo-preb.vercel.app";
    try {
      const response = await fetch(`${base}/api/import-local`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: migrationPin, ...legacySnapshot }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMigrationMessage(
        `Datos subidos: ${result.accounts} usuarios y ${result.stores} bloques.`,
      );
      setMigrationPin("");
      setMigrationDone(true);
    } catch (migrationError) {
      setMigrationMessage(
        migrationError instanceof Error
          ? migrationError.message
          : "No se pudo subir la copia local.",
      );
    }
  };
  return (
    <main className="login-page">
      <LocalDemoBanner />
      <section className="login-card">
        <div className="login-crest">
          <img src="/escudo-ud-oliva.jpg" alt="Escudo de U.D. Oliva" />
        </div>
        <span className="eyebrow">U.D. OLIVA · ÁREA TÉCNICA</span>
        <h1>Hola, míster</h1>
        <p>
          Selecciona tu nombre. Este dispositivo lo recordará para las próximas
          veces.
        </p>
        <label className="field">
          <span>Usuario</span>
          <div className="select-wrap">
            <select
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                if (event.target.value)
                  localStorage.setItem(LAST_ACCOUNT_KEY, event.target.value);
                else localStorage.removeItem(LAST_ACCOUNT_KEY);
                setError("");
              }}
            >
              <option value="">Selecciona tu nombre</option>
              {visibleAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name.trim().split(/\s+/)[0]} ·{" "}
                  {roleLabel[account.role]}
                  {account.role === "entrenador" && account.teamLabel
                    ? ` · ${account.teamLabel}`
                    : ""}
                </option>
              ))}
            </select>
            <ChevronRight size={17} />
          </div>
        </label>
        <label className="field">
          <span>PIN de 4 números</span>
          <input
            className="pin-input"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(event) =>
              setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") void login();
            }}
            placeholder="••••"
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button
          className="primary-button login-button"
          onClick={() => void login()}
        >
          <KeyRound size={18} /> Entrar
        </button>
        <small>Acceso privado para entrenadores y coordinación.</small>
        <small>Administrador y superadmin: deja el usuario sin seleccionar.</small>
        {!IS_LOCAL_DEMO &&
          visibleAccounts.length === 0 &&
          legacySnapshot.accounts.length > 1 &&
          !migrationDone && (
            <section className="cloud-migration login-migration">
              <CloudUpload size={24} />
              <div>
                <strong>Datos anteriores encontrados</strong>
                <small>
                  Sube esta copia del dispositivo a la base central.
                </small>
              </div>
              <input
                aria-label="PIN de migración"
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="PIN admin"
                value={migrationPin}
                onChange={(event) =>
                  setMigrationPin(
                    event.target.value.replace(/\D/g, "").slice(0, 4),
                  )
                }
              />
              <button onClick={() => void migrateLegacy()}>
                Subir a la nube
              </button>
            </section>
          )}
        {migrationMessage && (
          <div className="admin-message">
            <Check size={16} /> {migrationMessage}
          </div>
        )}
      </section>
    </main>
  );
}

function AdminPanel({
  account,
  platformMode = false,
  accounts,
  stores,
  onRefresh,
  onAccounts,
  onImpersonate,
  onLogout,
}: {
  account: ClubAccount;
  platformMode?: boolean;
  accounts: ClubAccount[];
  stores: StoreRow[];
  onRefresh: () => Promise<void>;
  onAccounts: (accounts: ClubAccount[]) => void;
  onImpersonate?: (accountId: string) => Promise<void>;
  onLogout: () => void;
}) {
  const [draft, setDraft] = useState({
    name: "",
    role: "entrenador" as ClubRole,
    teamLabel: "",
    footballStage: "" as FootballStage | "",
    trainingYear: "" as TrainingYear | "",
    pin: "",
  });
  const [pinDrafts, setPinDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    name: "",
    role: "entrenador" as "entrenador" | "coordinador" | "admin",
    teamLabel: "",
    footballStage: "" as FootballStage | "",
    trainingYear: "" as TrainingYear | "",
  });
  const [message, setMessage] = useState("");
  const [migrationPin, setMigrationPin] = useState("");
  const legacySnapshot = useMemo(() => buildLegacySnapshot(), []);
  const managedAccounts = accounts.filter(
    (item) => item.role !== "superadmin" && (platformMode || item.role !== "admin"),
  );
  const coaches = accounts.filter(
    (item) => item.role === "entrenador" && item.active,
  );
  const [calendarCoachId, setCalendarCoachId] = useState("");
  const [calendarRows, setCalendarRows] = useState<ImportedRival[]>([]);
  const [calendarFile, setCalendarFile] = useState("");
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [overviewCoachId, setOverviewCoachId] = useState("");
  const [overviewRivals, setOverviewRivals] = useState<StoredRival[]>([]);
  const [overviewSaving, setOverviewSaving] = useState(false);
  const overviewCoach = coaches.find((coach) => coach.id === overviewCoachId);
  const overviewTeam = getStored<StoredTeam>(stores, overviewCoachId, "team", {
    name: "U.D. Oliva",
    season: "",
    players: [],
  });
  const selectOverviewCoach = (coachId: string) => {
    setOverviewCoachId(coachId);
    setOverviewRivals(
      getStored<StoredRival[]>(stores, coachId, "rivals", []).map((rival) => ({
        ...rival,
      })),
    );
    setMessage("");
  };
  const saveOverviewRivals = async () => {
    if (!overviewCoachId) return;
    if (overviewRivals.some((rival) => !rival.nombre.trim())) {
      setMessage("Todos los rivales deben tener nombre.");
      return;
    }
    setOverviewSaving(true);
    try {
      const result = await clubApi.replaceRivals(
        overviewCoachId,
        overviewRivals,
      );
      setOverviewRivals(result.rivals);
      await onRefresh();
      setMessage("Rivales y campos actualizados correctamente.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudieron actualizar.",
      );
    } finally {
      setOverviewSaving(false);
    }
  };
  const analyzeCalendar = async (file?: File) => {
    if (!file) return;
    if (!calendarCoachId) {
      setMessage("Primero selecciona el equipo que recibirá los rivales.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage("El archivo debe ocupar menos de 10 MB.");
      return;
    }
    setCalendarBusy(true);
    setMessage("");
    setCalendarRows([]);
    setCalendarFile(file.name);
    try {
      const result = await clubApi.extractCalendar(file);
      setCalendarRows(result.rivals);
      setMessage(
        `Revisa los ${result.rivals.length} rivales detectados antes de guardarlos.`,
      );
    } catch (error) {
      setCalendarFile("");
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo leer el calendario.",
      );
    } finally {
      setCalendarBusy(false);
    }
  };
  const saveCalendar = async () => {
    if (!calendarCoachId || !calendarRows.some((item) => item.nombre.trim())) {
      setMessage("Selecciona un equipo y deja al menos un rival.");
      return;
    }
    setCalendarBusy(true);
    try {
      const result = await clubApi.saveImportedRivals(
        calendarCoachId,
        calendarRows,
      );
      setMessage(
        `Importación terminada: ${result.added} rivales nuevos, ${result.skipped} ya existentes.`,
      );
      setCalendarRows([]);
      setCalendarFile("");
      await onRefresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los rivales.",
      );
    } finally {
      setCalendarBusy(false);
    }
  };
  const createAccount = async () => {
    if (
      !draft.name.trim() ||
      !/^\d{4}$/.test(draft.pin) ||
      (draft.role === "entrenador" &&
        (!draft.teamLabel.trim() ||
          !draft.footballStage ||
          !draft.trainingYear))
    ) {
      setMessage(
        "Completa el nombre, el equipo, la etapa, el año y un PIN de 4 números.",
      );
      return;
    }
    try {
      const result = await clubApi.createAccount({
        name: draft.name.trim(),
        role: draft.role as "entrenador" | "coordinador" | "admin",
        teamLabel: draft.role === "admin" ? "Administración" : draft.teamLabel.trim(),
        footballStage:
          draft.role === "entrenador" ? draft.footballStage || null : null,
        trainingYear:
          draft.role === "entrenador" ? draft.trainingYear || null : null,
        pin: draft.pin,
      });
      onAccounts(result.accounts);
      setDraft({
        name: "",
        role: "entrenador",
        teamLabel: "",
        footballStage: "",
        trainingYear: "",
        pin: "",
      });
      setMessage("Usuario creado correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear.");
    }
  };
  const changePin = async (id: string) => {
    const pin = pinDrafts[id] || "";
    if (!/^\d{4}$/.test(pin)) {
      setMessage("El nuevo PIN debe tener exactamente 4 números.");
      return;
    }
    try {
      const result = await clubApi.updateAccount({ id, pin });
      onAccounts(result.accounts);
      setPinDrafts((current) => ({ ...current, [id]: "" }));
      setMessage("PIN actualizado.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo actualizar.",
      );
    }
  };
  const startEditing = (item: ClubAccount) => {
    setEditingId(item.id);
    setEditDraft({
      name: item.name,
      role: item.role as "entrenador" | "coordinador" | "admin",
      teamLabel: item.role === "entrenador" ? item.teamLabel : "",
      footballStage:
        item.role === "entrenador" ? item.footballStage || "" : "",
      trainingYear:
        item.role === "entrenador" ? item.trainingYear || "" : "",
    });
    setMessage("");
  };
  const saveAccount = async () => {
    if (
      !editingId ||
      !editDraft.name.trim() ||
      (editDraft.role === "entrenador" &&
        (!editDraft.teamLabel.trim() ||
          !editDraft.footballStage ||
          !editDraft.trainingYear))
    ) {
      setMessage("Completa el nombre, el equipo, la etapa y el año.");
      return;
    }
    try {
      const result = await clubApi.updateAccount({
        id: editingId,
        name: editDraft.name.trim(),
        role: editDraft.role,
        teamLabel: editDraft.role === "admin" ? "Administración" : editDraft.teamLabel.trim(),
        footballStage:
          editDraft.role === "entrenador"
            ? editDraft.footballStage || null
            : null,
        trainingYear:
          editDraft.role === "entrenador"
            ? editDraft.trainingYear || null
            : null,
      });
      onAccounts(result.accounts);
      setEditingId(null);
      setMessage("Usuario actualizado correctamente.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo actualizar.",
      );
    }
  };
  const removeAccount = async (item: ClubAccount) => {
    const label = item.role === "entrenador" ? `el equipo ${item.teamLabel} y todos sus datos` : `el acceso de ${item.name}`;
    if (!window.confirm(`¿Eliminar definitivamente ${label}? Esta acción no se puede deshacer.`)) return;
    try {
      const result = await clubApi.deleteAccount(item.id);
      onAccounts(result.accounts);
      if (overviewCoachId === item.id) {
        setOverviewCoachId("");
        setOverviewRivals([]);
      }
      setMessage(item.role === "entrenador" ? "Equipo eliminado correctamente." : "Acceso eliminado correctamente.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo eliminar.",
      );
    }
  };
  const toggleAccount = async (item: ClubAccount) => {
    try {
      const result = await clubApi.updateAccount({
        id: item.id,
        active: !item.active,
      });
      onAccounts(result.accounts);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo actualizar.",
      );
    }
  };
  const impersonateAccount = async (item: ClubAccount) => {
    if (!onImpersonate || !item.active) {
      if (!item.active) setMessage("Activa primero este acceso para poder revisarlo.");
      return;
    }
    try {
      setMessage(`Abriendo la cuenta de ${item.name}…`);
      await onImpersonate(item.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo abrir la cuenta.");
    }
  };
  const migrateLegacy = async () => {
    if (!/^\d{4}$/.test(migrationPin)) {
      setMessage(
        "Introduce el PIN de superadmin para subir los datos locales.",
      );
      return;
    }
    const base =
      location.hostname === "convo-preb.vercel.app"
        ? ""
        : "https://convo-preb.vercel.app";
    try {
      const response = await fetch(`${base}/api/import-local`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: migrationPin, ...legacySnapshot }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(
        `Datos locales subidos: ${result.accounts} usuarios y ${result.stores} bloques.`,
      );
      setMigrationPin("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo subir la copia local.",
      );
    }
  };
  return (
    <div className="role-shell">
      <LocalDemoBanner />
      <RoleHeader
        title={platformMode ? "Superadministración" : "Administración"}
        subtitle={platformMode ? "Control total de la aplicación" : "U.D. Oliva"}
        onLogout={onLogout}
      />
      <main className="role-content admin-content">
        {platformMode && (
          <section className="superadmin-intro">
            <span><ShieldCheck size={20} /> NIVEL SUPERADMIN</span>
            <h2>Control y revisión de todas las cuentas</h2>
            <p>Entra como administrador, coordinador o entrenador para comprobar exactamente lo que ve cada perfil. El acceso del administrador del club permanece separado.</p>
          </section>
        )}
        <section className="form-card admin-create-section">
          <div className="form-card-header">
            <div>
              <span>
                <Plus size={16} />
              </span>
              <h2>Añadir equipo o acceso</h2>
            </div>
          </div>
          <div className="form-card-body admin-create-grid">
            <input
              placeholder="Nombre y apellidos"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
            <select
              value={draft.role}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  role: event.target.value as ClubRole,
                }))
              }
            >
              <option value="entrenador">Entrenador</option>
              <option value="coordinador">Coordinador</option>
              {platformMode && <option value="admin">Administrador</option>}
            </select>
            {draft.role === "entrenador" && (
              <>
                <input
                  aria-label="Equipo"
                  placeholder="Equipo, por ejemplo Benjamín A"
                  value={draft.teamLabel}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      teamLabel: event.target.value,
                    }))
                  }
                />
                <select
                  aria-label="Etapa formativa"
                  value={draft.footballStage}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      footballStage: event.target.value as FootballStage | "",
                    }))
                  }
                >
                  <option value="">Etapa formativa</option>
                  <option value="querubin">Querubín</option>
                  <option value="prebenjamin">Prebenjamín</option>
                  <option value="benjamin">Benjamín</option>
                  <option value="alevin">Alevín</option>
                </select>
                <select
                  aria-label="Año formativo"
                  value={draft.trainingYear}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      trainingYear: event.target.value as TrainingYear | "",
                    }))
                  }
                >
                  <option value="">Año del equipo</option>
                  <option value="primero">Primer año</option>
                  <option value="segundo">Segundo año</option>
                  <option value="mixto">Primer y segundo año</option>
                </select>
              </>
            )}
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="PIN · 4 números"
              value={draft.pin}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  pin: event.target.value.replace(/\D/g, "").slice(0, 4),
                }))
              }
            />
            <button
              className="primary-button"
              onClick={() => void createAccount()}
            >
              <Plus size={17} /> {draft.role === "entrenador" ? "Crear equipo" : draft.role === "admin" ? "Crear administrador" : "Crear coordinador"}
            </button>
          </div>
        </section>
        <section className="team-overview-card">
          <div className="team-overview-heading">
            <div>
              <span className="eyebrow">DATOS DE LOS EQUIPOS</span>
              <h2>Plantilla, rivales y campos</h2>
              <p>
                Consulta los jugadores y corrige los rivales o sus campos.
              </p>
            </div>
            <select
              aria-label="Equipo que quieres consultar"
              value={overviewCoachId}
              onChange={(event) => selectOverviewCoach(event.target.value)}
            >
              <option value="">Selecciona un equipo</option>
              {coaches.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.teamLabel} · {coach.name}
                </option>
              ))}
            </select>
          </div>
          {overviewCoach && (
            <div className="team-overview-grid">
              <div className="team-overview-panel players-overview">
                <div className="overview-panel-heading">
                  <div>
                    <span>PLANTILLA</span>
                    <strong>{overviewTeam.players.length} jugadores</strong>
                  </div>
                  <Users size={20} />
                </div>
                <div className="overview-player-list">
                  {overviewTeam.players.map((player) => (
                    <div key={`${player.group}-${player.id}`}>
                      <span className="overview-player-number">
                        {player.number || "—"}
                      </span>
                      <span>
                        <strong>{player.name}</strong>
                        <small>
                          {player.role === "portero" ? "Portero" : "Jugador"}
                          {player.group === "b" ? " · Jugador B" : ""}
                          {!player.active ? " · Inactivo" : ""}
                        </small>
                      </span>
                    </div>
                  ))}
                  {overviewTeam.players.length === 0 && (
                    <div className="inline-empty">
                      Este equipo todavía no tiene jugadores.
                    </div>
                  )}
                </div>
              </div>
              <div className="team-overview-panel rivals-overview">
                <div className="overview-panel-heading">
                  <div>
                    <span>RIVALES Y CAMPOS</span>
                    <strong>{overviewRivals.length} creados</strong>
                  </div>
                  <FileText size={20} />
                </div>
                <div className="overview-rival-list">
                  {overviewRivals.map((rival, index) => (
                    <div key={rival.id}>
                      <label>
                        <span>Rival</span>
                        <input
                          aria-label={`Rival ${index + 1}`}
                          value={rival.nombre}
                          onChange={(event) =>
                            setOverviewRivals((current) =>
                              current.map((item) =>
                                item.id === rival.id
                                  ? { ...item, nombre: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        <span>Campo</span>
                        <input
                          aria-label={`Campo de ${rival.nombre}`}
                          value={rival.campo}
                          placeholder="Campo pendiente"
                          onChange={(event) =>
                            setOverviewRivals((current) =>
                              current.map((item) =>
                                item.id === rival.id
                                  ? { ...item, campo: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                  ))}
                  {overviewRivals.length === 0 && (
                    <div className="inline-empty">
                      Este equipo todavía no tiene rivales creados.
                    </div>
                  )}
                </div>
                {overviewRivals.length > 0 && (
                  <button
                    className="primary-button save-overview-button"
                    disabled={overviewSaving}
                    onClick={() => void saveOverviewRivals()}
                  >
                    <Check size={17} />
                    {overviewSaving ? "Guardando…" : "Guardar rivales y campos"}
                  </button>
                )}
              </div>
            </div>
          )}
          {!overviewCoach && (
            <div className="team-overview-empty">
              Selecciona un equipo para consultar sus datos.
            </div>
          )}
        </section>
        <section className="calendar-import-card">
          <div className="calendar-import-heading">
            <span className="calendar-import-icon">
              <FileText size={22} />
            </span>
            <div>
              <span className="eyebrow">INICIO DE TEMPORADA</span>
              <h2>Importar rivales y campos</h2>
              <p>
                Sube el calendario oficial, revisa lo detectado y envíalo al
                equipo correspondiente. No se importan fechas ni horarios.
              </p>
            </div>
          </div>
          <div className="calendar-flow-step">
            <span className="calendar-step-number">1</span>
            <div className="calendar-step-content">
              <strong>Elige el equipo</strong>
              <small>Los rivales aparecerán únicamente a este entrenador.</small>
              <select
                aria-label="Equipo que recibirá los datos"
                value={calendarCoachId}
                onChange={(event) => {
                  setCalendarCoachId(event.target.value);
                  setCalendarRows([]);
                  setCalendarFile("");
                }}
              >
                <option value="">Selecciona entrenador y equipo</option>
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.teamLabel} · {coach.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="calendar-flow-step">
            <span className="calendar-step-number">2</span>
            <div className="calendar-step-content">
              <strong>¿Cómo quieres añadirlos?</strong>
              <small>
                Puedes leer el calendario o escribir rival y campo tú mismo.
              </small>
              <div className="calendar-method-grid">
                <label
                  className={`calendar-method upload ${!calendarCoachId || calendarBusy ? "disabled" : ""}`}
                >
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv"
                    disabled={!calendarCoachId || calendarBusy}
                    onChange={(event) => {
                      void analyzeCalendar(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                  <span className="calendar-method-icon">
                    <FileUp size={22} />
                  </span>
                  <span>
                    <strong>
                      {calendarBusy
                        ? "Leyendo calendario…"
                        : calendarFile || "Subir calendario"}
                    </strong>
                    <small>PDF, Word, TXT o CSV</small>
                  </span>
                  <ChevronRight size={19} />
                </label>
                <button
                  type="button"
                  className="calendar-method manual"
                  disabled={!calendarCoachId || calendarBusy}
                  onClick={() =>
                    setCalendarRows((rows) => [
                      ...rows,
                      { nombre: "", campo: "" },
                    ])
                  }
                >
                  <span className="calendar-method-icon">
                    <Plus size={22} />
                  </span>
                  <span>
                    <strong>Añadir manualmente</strong>
                    <small>Escribe rival y campo</small>
                  </span>
                  <ChevronRight size={19} />
                </button>
              </div>
            </div>
          </div>
          {calendarRows.length > 0 && (
            <div className="calendar-flow-step editor-step">
              <span className="calendar-step-number">3</span>
              <div className="calendar-step-content">
                <div className="calendar-preview-heading">
                  <div>
                    <strong>{calendarRows.length} rivales preparados</strong>
                    <small>
                      Todo es editable antes de enviarlo al entrenador.
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setCalendarRows((rows) => [
                        ...rows,
                        { nombre: "", campo: "" },
                      ])
                    }
                  >
                    <Plus size={16} /> Otro rival
                  </button>
                </div>
                <div className="calendar-preview-list">
                  {calendarRows.map((row, index) => (
                    <div className="calendar-preview-row" key={index}>
                      <span className="calendar-row-number">{index + 1}</span>
                      <label>
                        <span>Rival</span>
                        <input
                          autoFocus={!row.nombre && index === calendarRows.length - 1}
                          aria-label={`Rival ${index + 1}`}
                          value={row.nombre}
                          placeholder="Nombre del rival"
                          onChange={(event) =>
                            setCalendarRows((rows) =>
                              rows.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, nombre: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        <span>Campo</span>
                        <input
                          aria-label={`Campo del rival ${index + 1}`}
                          value={row.campo}
                          placeholder="Nombre del campo"
                          onChange={(event) =>
                            setCalendarRows((rows) =>
                              rows.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, campo: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        type="button"
                        aria-label={`Eliminar rival ${index + 1}`}
                        onClick={() =>
                          setCalendarRows((rows) =>
                            rows.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="calendar-import-footer">
                  <small>
                    Se añadirán los nuevos sin borrar ni duplicar los que el
                    entrenador ya tenga.
                  </small>
                  <button
                    className="primary-button"
                    disabled={
                      calendarBusy ||
                      !calendarRows.some((row) => row.nombre.trim())
                    }
                    onClick={() => void saveCalendar()}
                  >
                    <Check size={17} /> Guardar en este equipo
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
        {!IS_LOCAL_DEMO &&
          accounts.filter((item) => !["admin", "superadmin"].includes(item.role)).length === 0 &&
          legacySnapshot.accounts.length > 1 && (
            <section className="cloud-migration">
              <CloudUpload size={24} />
              <div>
                <strong>Datos guardados en este dispositivo</strong>
                <small>
                  Sube los usuarios, plantillas, convocatorias, pizarras y
                  estadísticas anteriores a la base central.
                </small>
              </div>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="PIN admin"
                value={migrationPin}
                onChange={(event) =>
                  setMigrationPin(
                    event.target.value.replace(/\D/g, "").slice(0, 4),
                  )
                }
              />
              <button onClick={() => void migrateLegacy()}>
                Subir a la nube
              </button>
            </section>
          )}
        {message && (
          <div className="admin-message">
            <Check size={16} /> {message}
          </div>
        )}
        <section className="admin-accounts-section">
          <div className="section-heading">
            <span className="eyebrow">GESTIÓN DEL CLUB</span>
            <h2>
              {managedAccounts.length}{" "}
              equipos y accesos
            </h2>
            <p>Edita el entrenador, la categoría y el nombre del equipo, o elimínalo por completo.</p>
          </div>
          <div className="account-list">
            {managedAccounts.map((item) => (
                <article
                  key={item.id}
                  className={!item.active ? "inactive" : ""}
                >
                  <span className={`role-avatar ${item.role}`}>
                    {item.role === "entrenador" ? (
                      <Users size={20} />
                    ) : item.role === "admin" ? (
                      <ShieldCheck size={20} />
                    ) : (
                      <BarChart3 size={20} />
                    )}
                  </span>
                  {editingId === item.id ? (
                    <div className="account-edit-form">
                      <input
                        aria-label="Nombre y apellidos"
                        placeholder="Nombre y apellidos"
                        value={editDraft.name}
                        onChange={(event) =>
                          setEditDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                      <select
                        aria-label="Tipo de acceso"
                        value={editDraft.role}
                        onChange={(event) =>
                          setEditDraft((current) => ({
                            ...current,
                            role: event.target.value as
                              | "entrenador"
                              | "coordinador"
                              | "admin",
                          }))
                        }
                      >
                        <option value="entrenador">Entrenador</option>
                        <option value="coordinador">Coordinador</option>
                        {platformMode && <option value="admin">Administrador</option>}
                      </select>
                      {editDraft.role === "entrenador" && (
                        <>
                          <input
                            aria-label="Equipo"
                            placeholder="Equipo, por ejemplo Benjamín A"
                            value={editDraft.teamLabel}
                            onChange={(event) =>
                              setEditDraft((current) => ({
                                ...current,
                                teamLabel: event.target.value,
                              }))
                            }
                          />
                          <select
                            aria-label="Etapa formativa"
                            value={editDraft.footballStage}
                            onChange={(event) =>
                              setEditDraft((current) => ({
                                ...current,
                                footballStage: event.target.value as
                                  | FootballStage
                                  | "",
                              }))
                            }
                          >
                            <option value="">Etapa formativa</option>
                            <option value="querubin">Querubín</option>
                            <option value="prebenjamin">Prebenjamín</option>
                            <option value="benjamin">Benjamín</option>
                            <option value="alevin">Alevín</option>
                          </select>
                          <select
                            aria-label="Año formativo"
                            value={editDraft.trainingYear}
                            onChange={(event) =>
                              setEditDraft((current) => ({
                                ...current,
                                trainingYear: event.target.value as
                                  | TrainingYear
                                  | "",
                              }))
                            }
                          >
                            <option value="">Año del equipo</option>
                            <option value="primero">Primer año</option>
                            <option value="segundo">Segundo año</option>
                            <option value="mixto">Primer y segundo año</option>
                          </select>
                        </>
                      )}
                      <div className="account-edit-actions">
                        <button
                          className="primary-button"
                          onClick={() => void saveAccount()}
                        >
                          <Check size={16} /> Guardar cambios
                        </button>
                        <button onClick={() => setEditingId(null)}>
                          <X size={16} /> Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="account-copy">
                        <strong>{item.name}</strong>
                        <small>
                          {roleLabel[item.role]} · {item.teamLabel}
                          {item.role === "entrenador" && item.trainingYear
                            ? ` · ${trainingYearLabel[item.trainingYear]}`
                            : ""}
                        </small>
                      </div>
                      <div className="account-actions">
                    {platformMode && onImpersonate && (
                      <button
                        className="impersonate-account"
                        disabled={!item.active}
                        onClick={() => void impersonateAccount(item)}
                      >
                        <LogIn size={16} /> Entrar como
                      </button>
                    )}
                    <button onClick={() => startEditing(item)}>
                      <Pencil size={16} /> Editar
                    </button>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="Nuevo PIN"
                      value={pinDrafts[item.id] || ""}
                      onChange={(event) =>
                        setPinDrafts((current) => ({
                          ...current,
                          [item.id]: event.target.value
                            .replace(/\D/g, "")
                            .slice(0, 4),
                        }))
                      }
                    />
                    <button onClick={() => void changePin(item.id)}>
                      <KeyRound size={16} /> Cambiar PIN
                    </button>
                    <button onClick={() => void toggleAccount(item)}>
                      {item.active ? "Desactivar" : "Activar"}
                    </button>
                    {item.role !== "admin" && (
                      <button
                        className="danger-icon"
                        aria-label={`Eliminar ${item.name}`}
                        onClick={() => void removeAccount(item)}
                      >
                        <Trash2 size={16} /> Eliminar
                      </button>
                    )}
                      </div>
                    </>
                  )}
                </article>
              ))}
            {managedAccounts.length === 0 && (
              <div className="inline-empty">
                Todavía no has creado entrenadores ni coordinadores.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function CoordinatorPanel({
  account,
  accounts,
  stores,
  onRefresh,
  onLogout,
}: {
  account: ClubAccount;
  accounts: ClubAccount[];
  stores: StoreRow[];
  onRefresh: () => Promise<void>;
  onLogout: () => void;
}) {
  const coaches = useMemo(
    () =>
      accounts
        .filter((item) => item.role === "entrenador" && item.active)
        .sort(compareCoachesByAge),
    [accounts],
  );
  const [coachFilter, setCoachFilter] = useState("all");
  const [tab, setTab] = useState<
    "agenda" | "resumen" | "jugadores" | "partidos"
  >(
    "resumen",
  );
  const today = new Date();
  const todayIso = coordinatorIsoDate(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const [agendaCursor, setAgendaCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedAgendaDate, setSelectedAgendaDate] = useState(todayIso);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [pendingMatchCreation, setPendingMatchCreation] = useState(false);
  const [showMatchCreator, setShowMatchCreator] = useState(false);
  const [showTrainingCreator, setShowTrainingCreator] = useState(false);
  const [matchDraft, setMatchDraft] = useState<CoordinatorMatchInput>(() =>
    emptyCoordinatorMatch(todayIso),
  );
  const [matchSaving, setMatchSaving] = useState(false);
  const [exportingMatches, setExportingMatches] = useState(false);
  const [matchMessage, setMatchMessage] = useState("");
  const [sortBy, setSortBy] = useState<
    "rating" | "goals" | "assists" | "matches"
  >("rating");
  const [phrase] = useState(randomFootballPhrase);
  const data = useMemo(
    () =>
      coaches.map((coach) => ({
        coach,
        team: getStored<StoredTeam>(stores, coach.id, "team", {
          name: "U.D. OLIVA",
          season: "",
          players: [],
        }),
        stats: getStored<StoredMatch[]>(stores, coach.id, "stats", []),
        rivals: getStored<StoredRival[]>(stores, coach.id, "rivals", []),
        agenda: getStored<AgendaEvent[]>(stores, coach.id, "agenda", []),
      })),
    [coaches, stores],
  );
  const originalTeamLabels = useMemo(
    () =>
      new Map(
        accounts
          .filter((item) => item.role === "entrenador" && item.active)
          .map((coach) => [coach.id, coach.teamLabel]),
      ),
    [accounts],
  );
  const filtered =
    coachFilter === "all"
      ? data
      : data.filter((item) => item.coach.id === coachFilter);
  const matches = filtered.flatMap((item) =>
    item.stats.map((match) => ({
      ...match,
      coach: item.coach,
      team: item.team,
    })),
  );
  const agendaMatches = filtered
    .flatMap((item) =>
      item.agenda
        .filter((event): event is MatchAgendaEvent => event.type === "match")
        .map((event) => ({
          ...event,
          coach: item.coach,
          team: item.team,
          stats: item.stats.find(
            (match) =>
              match.date === event.date &&
              normalizedMatchName(match.rival) ===
                normalizedMatchName(event.rivalName) &&
              (match.home ?? true) === event.home,
          ),
        })),
    )
    .sort(
      (first, second) =>
        first.date.localeCompare(second.date) ||
        first.startTime.localeCompare(second.startTime),
    );
  const agendaCells = useMemo(() => {
    const year = agendaCursor.getFullYear();
    const month = agendaCursor.getMonth();
    const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const totalDays = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: firstOffset }, () => null),
      ...Array.from({ length: totalDays }, (_, index) => ({
        day: index + 1,
        date: coordinatorIsoDate(year, month, index + 1),
      })),
    ];
  }, [agendaCursor]);
  const selectedAgendaMatches = agendaMatches.filter(
    (match) => match.date === selectedAgendaDate,
  );
  const selectedAgendaLabel = coordinatorDayFormatter.format(
    new Date(`${selectedAgendaDate}T12:00:00`),
  );
  const canonicalPlayers = useMemo(() => {
    const players = new Map<string, StoredPlayer>();
    data.forEach(({ coach, team }) =>
      team.players
        .filter((player) => player.group === "plantilla")
        .forEach((player) =>
          players.set(player.id, {
            ...player,
            ownerCoachId: player.ownerCoachId || coach.id,
          }),
        ),
    );
    return players;
  }, [data]);
  const playerRows = useMemo(() => {
    const rows = new Map<
      string,
      {
        id: string;
        name: string;
        number: string;
        role: string;
        owner: string;
        teams: Set<string>;
        matches: number;
        goals: number;
        assists: number;
        ratingTotal: number;
      }
    >();
    filtered.forEach(({ coach, team, stats }) => {
      team.players.forEach((storedPlayer) => {
        const player = canonicalPlayers.get(storedPlayer.id) || storedPlayer;
        const originalTeamLabel =
          originalTeamLabels.get(player.ownerCoachId || coach.id) ||
          coach.teamLabel;
        if (!rows.has(player.id))
          rows.set(player.id, {
            id: player.id,
            name: player.name,
            number: player.number,
            role: player.role,
            owner: player.ownerCoachId || coach.id,
            teams: new Set(),
            matches: 0,
            goals: 0,
            assists: 0,
            ratingTotal: 0,
          });
        rows.get(player.id)!.teams.add(originalTeamLabel);
      });
      stats.forEach((match) =>
        match.players.forEach((entry) => {
          const storedPlayer = team.players.find(
            (item) => item.id === entry.playerId,
          );
          if (!storedPlayer) return;
          const player = canonicalPlayers.get(storedPlayer.id) || storedPlayer;
          const originalTeamLabel =
            originalTeamLabels.get(player.ownerCoachId || coach.id) ||
            coach.teamLabel;
          if (!rows.has(player.id))
            rows.set(player.id, {
              id: player.id,
              name: player.name,
              number: player.number,
              role: player.role,
              owner: player.ownerCoachId || coach.id,
              teams: new Set([originalTeamLabel]),
              matches: 0,
              goals: 0,
              assists: 0,
              ratingTotal: 0,
            });
          const row = rows.get(player.id)!;
          row.matches += 1;
          row.goals += entry.goals;
          row.assists += entry.assists;
          row.ratingTotal += entry.rating;
        }),
      );
    });
    return [...rows.values()]
      .map((row) => ({
        ...row,
        rating: row.matches ? row.ratingTotal / row.matches : 0,
      }))
      .sort(
        (a, b) => b[sortBy] - a[sortBy] || a.name.localeCompare(b.name, "es"),
      );
  }, [canonicalPlayers, filtered, originalTeamLabels, sortBy]);
  const goals = playerRows.reduce((total, row) => total + row.goals, 0);
  const assists = playerRows.reduce((total, row) => total + row.assists, 0);
  const coordinatorName = account.name.trim().split(/\s+/)[0];
  const selectedCoach = coaches.find((coach) => coach.id === coachFilter);
  const selectedCoachData = data.find((item) => item.coach.id === coachFilter);
  const selectedCoachIndex = selectedCoach
    ? coaches.findIndex((coach) => coach.id === selectedCoach.id)
    : -1;
  const nextCoach =
    selectedCoachIndex >= 0 && coaches.length > 1
      ? coaches[(selectedCoachIndex + 1) % coaches.length]
      : undefined;
  const firstName = (name: string) => name.trim().split(/\s+/)[0];
  const viewTitle =
    tab === "agenda"
      ? selectedCoach
        ? `Agenda de ${selectedCoach.teamLabel}`
        : "Agenda de partidos del club"
      : tab === "resumen"
      ? selectedCoach
        ? `Resumen de ${selectedCoach.teamLabel}`
        : "Resumen general del club"
      : tab === "jugadores"
        ? selectedCoach
          ? `Jugadores de ${selectedCoach.teamLabel}`
          : "Jugadores de todo el club"
        : selectedCoach
          ? `Partidos de ${selectedCoach.teamLabel}`
          : "Partidos de todo el club";
  const chooseTeam = (id: string) => {
    setCoachFilter(id);
    setShowTeamPicker(false);
    if (pendingMatchCreation && id !== "all") {
      setMatchDraft(emptyCoordinatorMatch(selectedAgendaDate));
      setShowMatchCreator(true);
      setPendingMatchCreation(false);
      setMatchMessage("");
      setTab("agenda");
    } else if (id === "all") {
      setPendingMatchCreation(false);
    }
  };
  const openMatchCreator = () => {
    setTab("agenda");
    setMatchMessage("");
    setShowTrainingCreator(false);
    if (!selectedCoach) {
      setPendingMatchCreation(true);
      setShowTeamPicker(true);
      setMatchMessage("Selecciona el equipo que recibirá el partido.");
      return;
    }
    setMatchDraft(emptyCoordinatorMatch(selectedAgendaDate));
    setShowMatchCreator(true);
  };
  const updateCoordinatorRival = (rivalId: string) => {
    const rival = selectedCoachData?.rivals.find((item) => item.id === rivalId);
    setMatchDraft((current) => ({
      ...current,
      rivalId,
      rivalName: rival?.nombre || "",
      field: current.home ? current.field : rival?.campo || "",
    }));
  };
  const goToNextTeam = () => {
    if (!nextCoach) return;
    if (tab !== "agenda" || !showMatchCreator) {
      setCoachFilter(nextCoach.id);
      setShowTeamPicker(false);
      return;
    }
    const nextDate = matchDraft.date || selectedAgendaDate;
    setCoachFilter(nextCoach.id);
    setShowTeamPicker(false);
    setPendingMatchCreation(false);
    setMatchDraft(emptyCoordinatorMatch(nextDate));
    setShowMatchCreator(true);
    setMatchMessage("");
    setTab("agenda");
  };
  const saveCoordinatorMatch = async () => {
    if (!selectedCoach || !matchDraft.date || !matchDraft.startTime || !matchDraft.rivalId || !matchDraft.field) {
      setMatchMessage("Completa fecha, hora, rival y campo.");
      return;
    }
    setMatchSaving(true);
    try {
      await clubApi.assignCoordinatorMatch(selectedCoach.id, matchDraft);
      await onRefresh();
      const date = new Date(`${matchDraft.date}T12:00:00`);
      const savedDate = matchDraft.date;
      setAgendaCursor(new Date(date.getFullYear(), date.getMonth(), 1));
      setSelectedAgendaDate(savedDate);
      setMatchDraft(emptyCoordinatorMatch(savedDate));
      setShowMatchCreator(true);
      setMatchMessage(`Partido añadido a la agenda de ${selectedCoach.teamLabel}. Puedes pasar al siguiente equipo.`);
    } catch (error) {
      setMatchMessage(error instanceof Error ? error.message : "No se pudo añadir el partido.");
    } finally {
      setMatchSaving(false);
    }
  };
  const exportMatchQuadrantPdf = async () => {
    const monthStart = coordinatorIsoDate(agendaCursor.getFullYear(), agendaCursor.getMonth(), 1);
    const monthEnd = coordinatorIsoDate(agendaCursor.getFullYear(), agendaCursor.getMonth() + 1, 0);
    const monthMatches = agendaMatches.filter((match) => match.date >= monthStart && match.date <= monthEnd);
    const rows = filtered
      .map((item) => ({
        coach: item.coach,
        matches: monthMatches.filter((match) => match.coach.id === item.coach.id),
      }));
    if (!rows.length) {
      setMatchMessage("No hay equipos para exportar.");
      return;
    }
    setExportingMatches(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      const pageWidth = 297;
      const margin = 7;
      const tableTop = 38;
      const footerY = 203;
      const headerHeight = 9;
      const rowHeight = Math.max(4.8, Math.min(10.5, (footerY - tableTop - headerHeight - 4) / rows.length));
      const fontSize = rowHeight < 6 ? 4.6 : rowHeight < 8 ? 5.5 : 6.4;
      const columns = [
        { label: "EQUIPO", width: 42 },
        { label: "VS", width: 49 },
        { label: "EQUIP.", width: 18 },
        { label: "CAMPO", width: 39 },
        { label: "HORARIO", width: 40 },
        { label: "CITACIÓN", width: 36 },
        { label: "VESTUARIO", width: 29 },
        { label: "VEST. VISIT.", width: 30 },
      ];
      const clean = (value: string) => value.replace(/\s+/g, " ").trim();
      const fitText = (value: string, width: number, size = fontSize) => {
        const text = clean(value);
        doc.setFontSize(size);
        if (doc.getTextWidth(text) <= width) return text;
        let start = 0;
        let end = text.length;
        while (start < end) {
          const middle = Math.ceil((start + end) / 2);
          if (doc.getTextWidth(`${text.slice(0, middle)}...`) <= width) start = middle;
          else end = middle - 1;
        }
        return `${text.slice(0, Math.max(1, start)).trim()}...`;
      };
      const valueList = (matches: typeof monthMatches, getValue: (match: typeof monthMatches[number]) => string) =>
        matches.map(getValue).filter(Boolean).join(" / ");
      const isRestMatch = (match: typeof monthMatches[number]) =>
        /descans[ao]/i.test(`${match.rivalName} ${match.notes} ${match.field}`);
      const regularMatches = (row: typeof rows[number]) =>
        row.matches.filter((match) => !isRestMatch(match));
      const meetingText = (match: typeof monthMatches[number]) => {
        const place = match.callupPlace?.trim() || "Morer";
        const time = match.callupTime || subtractMatchMinutes(match.startTime, 45);
        return `${shortFieldName(place)} ${pdfTime(time)}`.trim();
      };
      const selectedDate = new Date(`${selectedAgendaDate}T12:00:00`);
      const selectedWeekStart = new Date(selectedDate);
      selectedWeekStart.setDate(selectedWeekStart.getDate() - ((selectedWeekStart.getDay() + 6) % 7));
      const selectedWeekEnd = new Date(selectedWeekStart);
      selectedWeekEnd.setDate(selectedWeekStart.getDate() + 6);
      const weekTitle = `${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" }).format(selectedWeekStart)} - ${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(selectedWeekEnd)}`;
      const monthTitle = coordinatorMonthFormatter.format(agendaCursor).toUpperCase();

      drawMagicPdfHeader(doc, {
        title: "Cuadrante de partidos",
        period: `Semana del ${weekTitle}`,
        scope: `${selectedCoach?.teamLabel || "Todo el club"} | Mes: ${monthTitle}`,
        phrase: getDailyFootballPhrase(monthStart),
        crestDataUrl: await getClubCrestDataUrl(),
        width: pageWidth,
        margin,
      });

      let x = margin;
      doc.setDrawColor(...pdfBrand.border);
      doc.setLineWidth(0.3);
      columns.forEach((column) => {
        doc.setFillColor(225, 241, 251);
        doc.rect(x, tableTop, column.width, headerHeight, "FD");
        doc.setTextColor(...pdfBrand.ink);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(column.width < 20 ? 5.7 : 8.2);
        doc.text(column.label, x + column.width / 2, tableTop + 6.1, { align: "center" });
        x += column.width;
      });

      rows.forEach((row, rowIndex) => {
        let cellX = margin;
        const y = tableTop + headerHeight + rowIndex * rowHeight;
        const matchesToShow = regularMatches(row);
        const emptyLabel = row.matches.length ? "DESCANSO" : "PENDIENTE";
        const values = [
          `${row.coach.teamLabel} ${firstName(row.coach.name)}`.toUpperCase(),
          matchesToShow.length ? valueList(matchesToShow, (match) => match.rivalName.toUpperCase()) : emptyLabel,
          matchesToShow.length ? valueList(matchesToShow, (match) => (match.kit || (match.playInWhite ? "BLANCO" : "")).toUpperCase()) : "",
          matchesToShow.length ? valueList(matchesToShow, (match) => shortFieldName(match.field)) : "",
          matchesToShow.length ? valueList(matchesToShow, (match) => pdfDateTime(match.date, match.startTime)) : "",
          matchesToShow.length ? valueList(matchesToShow, meetingText) : "",
          matchesToShow.length ? valueList(matchesToShow, (match) => (match.homeLockerRoom || "").toUpperCase()) : "",
          matchesToShow.length ? valueList(matchesToShow, (match) => (match.awayLockerRoom || "").toUpperCase()) : "",
        ];
        columns.forEach((column, columnIndex) => {
          const value = values[columnIndex] || "";
          if (columnIndex === 3 && value) doc.setFillColor(8, 150, 84);
          else if (columnIndex === 4 && /DOMINGO/.test(value)) doc.setFillColor(255, 137, 55);
          else if (columnIndex === 4 && /SÁBADO|SABADO/.test(value)) doc.setFillColor(255, 240, 0);
          else if (columnIndex === 4 && value) doc.setFillColor(210, 224, 244);
          else if (columnIndex === 2 && value) doc.setFillColor(245, 39, 172);
          else if ((columnIndex === 6 || columnIndex === 7) && /2/.test(value)) doc.setFillColor(22, 111, 170);
          else if ((columnIndex === 6 || columnIndex === 7) && value) doc.setFillColor(255, 16, 10);
          else if (columnIndex === 1 && value === "DESCANSO") doc.setFillColor(232, 247, 239);
          else if (columnIndex === 1 && value === "PENDIENTE") doc.setFillColor(255, 247, 226);
          else doc.setFillColor(rowIndex % 2 === 0 ? 255 : 248, rowIndex % 2 === 0 ? 255 : 251, rowIndex % 2 === 0 ? 255 : 254);
          doc.rect(cellX, y, column.width, rowHeight, "FD");
          if (columnIndex === 3 && value) doc.setTextColor(255, 255, 255);
          else if ((columnIndex === 6 || columnIndex === 7) && value) doc.setTextColor(255, 255, 255);
          else if (columnIndex === 1 && value === "DESCANSO") doc.setTextColor(8, 116, 82);
          else if (columnIndex === 1 && value === "PENDIENTE") doc.setTextColor(173, 112, 11);
          else doc.setTextColor(...pdfBrand.ink);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(column.width < 20 ? Math.max(4, fontSize - 0.4) : fontSize);
          doc.text(fitText(value, column.width - 2.4, column.width < 20 ? Math.max(4, fontSize - 0.4) : fontSize), cellX + column.width / 2, y + rowHeight / 2 + fontSize * 0.32, { align: "center" });
          cellX += column.width;
        });
      });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.8);
      doc.setTextColor(...pdfBrand.muted);
      doc.text("Cuadrante compacto: una fila por equipo; si un equipo tiene varios partidos en el mes, aparecen juntos en la misma línea.", margin, 207);
      doc.text("Página 1 de 1", pageWidth - margin, 207, { align: "right" });
      doc.save(`cuadrante-partidos-${monthStart}.pdf`);
    } catch (error) {
      setMatchMessage(error instanceof Error ? error.message : "No se pudo exportar el cuadrante de partidos.");
    } finally {
      setExportingMatches(false);
    }
  };

  return (
    <div className="role-shell coordinator-shell">
      <RoleHeader
        title={`Hola, ${coordinatorName}`}
        subtitle="Coordinación deportiva"
        onLogout={onLogout}
      />
      <main className="role-content coordinator-content">
        <section className="hero-card quote-card coordinator-quote">
          <div className="quote-copy">
            <span className="hero-label">FRASE DEL DÍA · COORDINACIÓN</span>
            <h2>“{phrase}”</h2>
            <p>Una idea para empezar el día con todos los equipos en mente.</p>
          </div>
          <span className="crest hero-crest">
            <img src="/escudo-ud-oliva.jpg" alt="Escudo de U.D. Oliva" />
          </span>
        </section>
        <section
          className={`coordinator-context ${selectedCoach ? "team-context" : "club-context"}`}
        >
          <div className="context-copy">
            <span className="eyebrow">VIENDO</span>
            <strong>{selectedCoach?.teamLabel || "TODO EL CLUB"}</strong>
            <small>
              {selectedCoach
                ? `Entrenador: ${firstName(selectedCoach.name)}`
                : `${coaches.length} ${coaches.length === 1 ? "equipo" : "equipos"} en conjunto`}
            </small>
          </div>
          <div className="context-actions">
            {nextCoach && (
              <button
                type="button"
                className="next-team-button"
                onClick={goToNextTeam}
              >
                Siguiente <ChevronRight size={18} />
              </button>
            )}
            <button
              className="change-team-button"
              onClick={() => setShowTeamPicker((current) => !current)}
            >
              <Users size={17} /> Cambiar equipo
            </button>
            {selectedCoach && (
              <button
                className="all-club-button"
                onClick={() => chooseTeam("all")}
              >
                Volver a todo el club
              </button>
            )}
          </div>
          {showTeamPicker && (
            <div className="team-picker">
              <button
                className={coachFilter === "all" ? "active" : ""}
                onClick={() => chooseTeam("all")}
              >
                <span>
                  <strong>Todo el club</strong>
                  <small>Ver todos los equipos juntos</small>
                </span>
                <ChevronRight size={18} />
              </button>
              {coaches.map((coach) => (
                <button
                  key={coach.id}
                  className={coachFilter === coach.id ? "active" : ""}
                  onClick={() => chooseTeam(coach.id)}
                >
                  <span>
                    <strong>{coach.teamLabel}</strong>
                    <small>
                      {coach.footballStage
                        ? `${footballStageLabel[coach.footballStage]}${coach.trainingYear ? ` · ${trainingYearLabel[coach.trainingYear]}` : ""}`
                        : "Edad pendiente"}
                      {` · ${firstName(coach.name)}`}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          )}
        </section>
        <div className="coordinator-tabs">
          {(["resumen", "agenda", "jugadores", "partidos"] as const).map((value) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <div className="coordinator-view-heading">
          <span className="eyebrow">
            {selectedCoach?.teamLabel.toUpperCase() || "TODO EL CLUB"}
          </span>
          <h2>{viewTitle}</h2>
        </div>
        {tab === "agenda" && (
          <>
          {!(showTeamPicker && pendingMatchCreation) && <section className="coordinator-match-command">
            <div>
              <span><ShieldCheck size={15} /> ORGANIZACIÓN DE LA AGENDA</span>
              <strong>{selectedCoach ? `Agenda de ${selectedCoach.teamLabel}` : "Añade una actividad a un equipo"}</strong>
              <small>Partidos y horarios habituales de entrenamiento aparecerán directamente al entrenador.</small>
            </div>
            <div className="coordinator-activity-actions">
              <button type="button" className={showMatchCreator ? "active" : ""} onClick={openMatchCreator}><Plus size={17} /> Añadir partido</button>
              <button type="button" className={showTrainingCreator ? "active training" : "training"} onClick={() => { setShowMatchCreator(false); setPendingMatchCreation(false); setShowTeamPicker(false); setMatchMessage(""); setShowTrainingCreator(true); }}><Plus size={17} /> Añadir entrenamiento</button>
            </div>
          </section>}
          {matchMessage && <div className="coordinator-match-message" role="status">{matchMessage}</div>}
          {showMatchCreator && selectedCoach && selectedCoachData && (
            <section className="coordinator-match-form">
              <header>
                <div>
                  <span>PARTIDO PARA</span>
                  <h3>{selectedCoach.teamLabel}</h3>
                  <small>{selectedCoach.name}</small>
                </div>
                <button type="button" aria-label="Cerrar formulario" onClick={() => setShowMatchCreator(false)}><X size={18} /></button>
              </header>
              <div className="coordinator-match-type">
                {(["liga", "amistoso", "torneo"] as const).map((type) => (
                  <button type="button" className={matchDraft.matchType === type ? "active" : ""} key={type} onClick={() => setMatchDraft((current) => ({ ...current, matchType: type }))}>
                    {type[0].toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
              <div className="coordinator-match-home-away">
                <button type="button" className={matchDraft.home ? "active" : ""} onClick={() => setMatchDraft((current) => ({ ...current, home: true, field: "" }))}><Home size={17} /> En casa</button>
                <button type="button" className={!matchDraft.home ? "active" : ""} onClick={() => { const rival = selectedCoachData.rivals.find((item) => item.id === matchDraft.rivalId); setMatchDraft((current) => ({ ...current, home: false, field: rival?.campo || current.field })); }}><Plane size={17} /> Fuera</button>
              </div>
              <div className="coordinator-match-grid">
                <label><span>Fecha</span><input type="date" value={matchDraft.date} onChange={(event) => setMatchDraft((current) => ({ ...current, date: event.target.value }))} /></label>
                <label><span>Rival</span><select value={matchDraft.rivalId} onChange={(event) => updateCoordinatorRival(event.target.value)}><option value="">Selecciona rival</option>{selectedCoachData.rivals.map((rival) => <option key={rival.id} value={rival.id}>{rival.nombre}</option>)}</select></label>
                <div className="coordinator-time-field"><span>Hora del partido</span><QuickTimeInput value={matchDraft.startTime} onChange={(startTime) => setMatchDraft((current) => ({ ...current, startTime, callupTime: !current.callupTime || current.callupTime === subtractMatchMinutes(current.startTime, 45) ? subtractMatchMinutes(startTime, 45) : current.callupTime }))} /></div>
                {matchDraft.home ? (
                  <label><span>Campo</span><select value={matchDraft.field} onChange={(event) => setMatchDraft((current) => ({ ...current, field: event.target.value }))}><option value="">Selecciona campo</option>{HOME_FIELDS.map((field) => <option key={field}>{field}</option>)}</select></label>
                ) : (
                  <label><span>Campo del rival</span><input value={matchDraft.field} onChange={(event) => setMatchDraft((current) => ({ ...current, field: event.target.value }))} placeholder="Se completa desde el rival, pero puedes editarlo" /></label>
                )}
                <label><span>Equipación</span><input value={matchDraft.kit || ""} onChange={(event) => setMatchDraft((current) => ({ ...current, kit: event.target.value }))} placeholder={matchDraft.playInWhite ? "Blanco" : "Opcional"} /></label>
                <label><span>Lugar citación</span><input value={matchDraft.callupPlace || ""} onChange={(event) => setMatchDraft((current) => ({ ...current, callupPlace: event.target.value }))} placeholder="Morer" /></label>
                <label><span>Hora citación</span><input type="time" value={matchDraft.callupTime || ""} onChange={(event) => setMatchDraft((current) => ({ ...current, callupTime: event.target.value }))} /></label>
                <label><span>Vestuario</span><input value={matchDraft.homeLockerRoom || ""} onChange={(event) => setMatchDraft((current) => ({ ...current, homeLockerRoom: event.target.value }))} placeholder="Oliva 1" /></label>
                <label><span>Vestuario visitante</span><input value={matchDraft.awayLockerRoom || ""} onChange={(event) => setMatchDraft((current) => ({ ...current, awayLockerRoom: event.target.value }))} placeholder="Visitante 1" /></label>
              </div>
              {!selectedCoachData.rivals.length && <p className="coordinator-no-rivals">Este equipo todavía no tiene rivales guardados.</p>}
              <div className="match-observations-group">
                <label className="coordinator-match-notes"><span>Observaciones</span><textarea rows={2} value={matchDraft.notes} onChange={(event) => setMatchDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Escribe cualquier indicación para el entrenador" /></label>
                <label className={`white-kit-toggle${matchDraft.playInWhite ? " active" : ""}`}>
                  <input type="checkbox" checked={matchDraft.playInWhite} onChange={(event) => setMatchDraft((current) => ({ ...current, playInWhite: event.target.checked, kit: event.target.checked && !current.kit ? "Blanco" : current.kit }))} />
                  <span aria-hidden="true" />
                  <strong>Añadir en observaciones: JUGAMOS DE BLANCO</strong>
                </label>
              </div>
              <footer>
                <button type="button" className="secondary-button" onClick={() => setShowMatchCreator(false)}>Cancelar</button>
                {nextCoach && <button type="button" className="next-team-button" onClick={goToNextTeam}>Siguiente equipo <ChevronRight size={17} /></button>}
                <button type="button" className="primary-button" disabled={matchSaving || !selectedCoachData.rivals.length} onClick={() => void saveCoordinatorMatch()}><Save size={17} /> {matchSaving ? "Guardando…" : "Guardar en su agenda"}</button>
              </footer>
            </section>
          )}
          <CoordinatorTrainingPlanner
            coaches={coaches}
            stores={stores}
            selectedCoachId={coachFilter}
            onSelectCoach={setCoachFilter}
            onRefresh={onRefresh}
            formOpen={showTrainingCreator}
            onFormOpenChange={setShowTrainingCreator}
            onExportMatches={() => void exportMatchQuadrantPdf()}
            exportingMatches={exportingMatches}
            hideCommand
          />
          <section className="coordinator-agenda-layout">
            <div className="coordinator-agenda-calendar">
              <header className="coordinator-agenda-toolbar">
                <button
                  type="button"
                  aria-label="Mes anterior"
                  onClick={() =>
                    setAgendaCursor(
                      (current) =>
                        new Date(
                          current.getFullYear(),
                          current.getMonth() - 1,
                          1,
                        ),
                    )
                  }
                >
                  <ChevronLeft size={18} />
                </button>
                <div>
                  <span>CALENDARIO DEL CLUB</span>
                  <h3>{coordinatorMonthFormatter.format(agendaCursor)}</h3>
                </div>
                <button
                  type="button"
                  aria-label="Mes siguiente"
                  onClick={() =>
                    setAgendaCursor(
                      (current) =>
                        new Date(
                          current.getFullYear(),
                          current.getMonth() + 1,
                          1,
                        ),
                    )
                  }
                >
                  <ChevronRight size={18} />
                </button>
              </header>
              <button
                type="button"
                className="coordinator-agenda-today"
                onClick={() => {
                  setAgendaCursor(
                    new Date(today.getFullYear(), today.getMonth(), 1),
                  );
                  setSelectedAgendaDate(todayIso);
                }}
              >
                Hoy
              </button>
              <div className="coordinator-agenda-weekdays">
                {coordinatorWeekDays.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="coordinator-agenda-grid">
                {agendaCells.map((cell, index) => {
                  if (!cell)
                    return (
                      <span
                        className="coordinator-agenda-empty-cell"
                        key={`empty-${index}`}
                      />
                    );
                  const dayMatches = agendaMatches.filter(
                    (match) => match.date === cell.date,
                  );
                  return (
                    <button
                      type="button"
                      key={cell.date}
                      className={`${
                        selectedAgendaDate === cell.date ? "selected " : ""
                      }${dayMatches.length ? "has-matches " : ""}${dayMatches.some((match) => match.assignedByCoordinator) ? "coordinator-created" : ""}`.trim()}
                      aria-label={`${cell.date}. ${dayMatches.length} ${
                        dayMatches.length === 1 ? "partido" : "partidos"
                      }`}
                      onClick={() => setSelectedAgendaDate(cell.date)}
                    >
                      <span className="coordinator-agenda-day-number">
                        {cell.day}
                      </span>
                      {dayMatches.length > 0 && (
                        <>
                          <span className="coordinator-agenda-preview">
                            <i
                              className={dayMatches[0].stats ? "completed" : "scheduled"}
                            >
                              {dayMatches[0].stats ? (
                                <Trophy size={13} />
                              ) : (
                                <Calendar size={13} />
                              )}
                            </i>
                            <span>
                              <strong>{dayMatches[0].coach.teamLabel}</strong>
                              <small>
                                {dayMatches[0].startTime || "Sin hora"} · {dayMatches[0].rivalName}
                              </small>
                            </span>
                          </span>
                          <span className="coordinator-agenda-markers">
                            {dayMatches.slice(0, 3).map((match) => (
                              <i
                                className={match.stats ? "completed" : "scheduled"}
                                key={`${match.coach.id}-${match.id}`}
                              />
                            ))}
                          </span>
                          <b className="coordinator-agenda-count">
                            {dayMatches.length}
                          </b>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
              <footer className="coordinator-agenda-legend">
                <span><i className="scheduled" /> Programado</span>
                <span><i className="completed" /> Con estadísticas</span>
                <strong>{agendaMatches.length} partidos en la agenda</strong>
              </footer>
            </div>
            <aside className="coordinator-agenda-day-panel">
              <header>
                <div>
                  <span>JORNADA SELECCIONADA</span>
                  <h3>{selectedAgendaLabel}</h3>
                </div>
                <b>{selectedAgendaMatches.length}</b>
              </header>
              {selectedAgendaMatches.length ? (
                <div className="coordinator-agenda-match-list">
                  {selectedAgendaMatches.map((match) => {
                    const stats = match.stats;
                    const isPast = match.date < todayIso;
                    const homeName = match.home ? match.team.name : match.rivalName;
                    const awayName = match.home ? match.rivalName : match.team.name;
                    const homeScore = stats
                      ? match.home
                        ? stats.ourScore
                        : stats.rivalScore
                      : null;
                    const awayScore = stats
                      ? match.home
                        ? stats.rivalScore
                        : stats.ourScore
                      : null;
                    return (
                      <article
                        className={`${stats ? "completed" : isPast ? "pending" : "scheduled"}${match.assignedByCoordinator ? " coordinator-created" : ""}`}
                        key={`${match.coach.id}-${match.id}`}
                      >
                        <div className="coordinator-agenda-match-status">
                          {stats ? <Trophy size={16} /> : <Calendar size={16} />}
                          <span>
                            {stats
                              ? "Finalizado"
                              : isPast
                                ? "Resultado pendiente"
                                : "Programado"}
                          </span>
                        </div>
                        <div className="coordinator-agenda-team-label">
                          <strong>{match.coach.teamLabel}</strong>
                          <span>{match.coach.name}</span>
                        </div>
                        <div className="coordinator-agenda-scoreline">
                          <span>{homeName}</span>
                          <b>{stats ? `${homeScore} — ${awayScore}` : "VS"}</b>
                          <span>{awayName}</span>
                        </div>
                        <div className="coordinator-agenda-match-meta">
                          <span><Clock size={14} /> {match.startTime || "Hora pendiente"}</span>
                          <span><MapPin size={14} /> {match.field || "Campo pendiente"}</span>
                        </div>
                        {stats && (
                          <details className="coordinator-agenda-statistics">
                            <summary>
                              <span><BarChart3 size={15} /> Ver estadísticas</span>
                              <small>{stats.players.length} jugadores</small>
                            </summary>
                            <div>
                              {stats.players.map((entry) => {
                                const player = match.team.players.find(
                                  (item) => item.id === entry.playerId,
                                );
                                return player ? (
                                  <span key={entry.playerId}>
                                    <strong>{player.role === "portero" ? "🧤 " : ""}{player.name}</strong>
                                    <small>⚽ {entry.goals} · 🎯 {entry.assists} · ⭐ {entry.rating}/5</small>
                                  </span>
                                ) : null;
                              })}
                            </div>
                            {stats.notes && <p>{stats.notes}</p>}
                          </details>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="coordinator-agenda-no-matches">
                  <Calendar size={24} />
                  <strong>No hay partidos este día</strong>
                  <span>Selecciona una fecha marcada para ver la jornada.</span>
                </div>
              )}
            </aside>
          </section>
          </>
        )}
        {tab === "resumen" && (
          <>
            <div className="club-metrics">
              <MetricCard label="Entrenadores" value={filtered.length} />
              <MetricCard label="Jugadores únicos" value={playerRows.length} />
              <MetricCard label="Partidos" value={matches.length} />
              <MetricCard label="Goles" value={goals} />
              <MetricCard label="Asistencias" value={assists} />
            </div>
          </>
        )}
        {tab === "jugadores" && (
          <section className="coordinator-panel">
            <div className="ranking-sort">
              <span>Ordenar por</span>
              {(
                [
                  ["rating", "Valoración"],
                  ["goals", "Goles"],
                  ["assists", "Asistencias"],
                  ["matches", "Partidos"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={sortBy === value ? "active" : ""}
                  onClick={() => setSortBy(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <CoordinatorRanking rows={playerRows} />
          </section>
        )}
        {tab === "partidos" && (
          <div className="coordinator-matches">
            {matches
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((match) => (
                <article key={`${match.coach.id}-${match.id}`}>
                  <div className="match-result">
                    <strong>
                      {match.home !== false
                        ? match.ourScore
                        : match.rivalScore}
                    </strong>
                    <span>—</span>
                    <strong>
                      {match.home !== false
                        ? match.rivalScore
                        : match.ourScore}
                    </strong>
                  </div>
                  <div className="match-club-copy">
                    <span>
                      {match.coach.teamLabel} · {match.coach.name}
                    </span>
                    <h3>
                      {match.home !== false
                        ? `U.D. OLIVA vs ${match.rival}`
                        : `${match.rival} vs U.D. OLIVA`}
                    </h3>
                    <small>
                      {match.date || "Sin fecha"} · {match.players.length}{" "}
                      jugadores
                    </small>
                  </div>
                  <div className="coordinator-player-stats">
                    {match.players.map((entry) => {
                      const player = match.team.players.find(
                        (item) => item.id === entry.playerId,
                      );
                      return (
                        player && (
                          <span key={entry.playerId}>
                            <strong>
                              {player.role === "portero" ? "🧤 " : ""}
                              {player.name}
                            </strong>
                            <small>
                              ⚽ {entry.goals} · 🎯 {entry.assists} · ⭐{" "}
                              {entry.rating}/5
                            </small>
                          </span>
                        )
                      );
                    })}
                  </div>
                  {(match.notes || match.playInWhite) && (
                    <p>
                      <strong>Observaciones generales:</strong>{match.playInWhite ? " JUGAMOS DE BLANCO." : ""}{match.notes ? ` ${match.notes}` : ""}
                    </p>
                  )}
                </article>
              ))}
            {!matches.length && (
              <div className="inline-empty">No hay partidos registrados.</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function CoordinatorRanking({
  rows,
}: {
  rows: Array<{
    id: string;
    name: string;
    number: string;
    role: string;
    teams: Set<string>;
    matches: number;
    goals: number;
    assists: number;
    rating: number;
  }>;
}) {
  return (
    <div className="coordinator-ranking">
      <div className="ranking-head">
        <span>Jugador</span>
        <span>PJ</span>
        <span>G</span>
        <span>A</span>
        <span>Media</span>
      </div>
      {rows.map((row, index) => (
        <div className="coordinator-ranking-row" key={row.id}>
          <span className="ranking-player-cell">
            <span className="ranking-position">{index + 1}</span>
            <span className="player-avatar">
              {row.number || row.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="ranking-player">
              <strong>
                {row.role === "portero" ? "🧤 " : ""}
                {row.name}
              </strong>
              <small>{[...row.teams].join(" · ")}</small>
            </span>
          </span>
          <span>{row.matches}</span>
          <span>{row.goals}</span>
          <span>{row.assists}</span>
          <strong className="ranking-rating">
            {row.matches ? row.rating.toFixed(1) : "—"}
          </strong>
        </div>
      ))}
      {!rows.length && (
        <div className="inline-empty">No hay jugadores con datos.</div>
      )}
    </div>
  );
}
function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="club-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
function RoleHeader({
  title,
  subtitle,
  onLogout,
}: {
  title: string;
  subtitle: string;
  onLogout: () => void;
}) {
  return (
    <header className="role-header">
      <div className="role-brand">
        <div className="role-brand-crest">
          <img src="/escudo-ud-oliva.jpg" alt="Escudo U.D. Oliva" />
        </div>
        <div>
          <span>{subtitle}</span>
          <strong>{title}</strong>
        </div>
      </div>
      <button onClick={onLogout}>
        <LogOut size={17} /> Cambiar usuario
      </button>
    </header>
  );
}
