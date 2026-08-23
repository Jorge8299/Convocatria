import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Check,
  ChevronRight,
  CloudUpload,
  FileText,
  FileUp,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { CoachApp } from "./App";
import { ClubAccount, ClubRole } from "./clubTypes";
import {
  BootstrapPayload,
  buildLegacySnapshot,
  clubApi,
  getStored,
  ImportedRival,
  StoreRow,
} from "./api";
import { randomFootballPhrase } from "./motivational";

const LAST_ACCOUNT_KEY = "convo_club_last_account_v1";
const roleLabel: Record<ClubRole, string> = {
  entrenador: "Entrenador",
  coordinador: "Coordinador",
  superadmin: "Superadmin",
};

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
  ourScore: number;
  rivalScore: number;
  notes: string;
  players: StoredEntry[];
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
    );
  if (session.role === "coordinador")
    return (
      <CoordinatorPanel
        account={session}
        accounts={accounts}
        stores={bootstrap.stores || []}
        onLogout={logout}
      />
    );
  return (
    <CoachApp
      account={session}
      accounts={accounts}
      stores={bootstrap.stores || []}
      onDataChange={(area, data) => clubApi.saveData(area, data)}
      onLogout={logout}
    />
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
    (account) => account.role !== "superadmin",
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
        {visibleAccounts.length === 0 &&
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
  account: _account,
  accounts,
  stores,
  onRefresh,
  onAccounts,
  onLogout,
}: {
  account: ClubAccount;
  accounts: ClubAccount[];
  stores: StoreRow[];
  onRefresh: () => Promise<void>;
  onAccounts: (accounts: ClubAccount[]) => void;
  onLogout: () => void;
}) {
  const [draft, setDraft] = useState({
    name: "",
    role: "entrenador" as ClubRole,
    teamLabel: "",
    pin: "",
  });
  const [pinDrafts, setPinDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    name: "",
    role: "entrenador" as "entrenador" | "coordinador",
    teamLabel: "",
  });
  const [message, setMessage] = useState("");
  const [migrationPin, setMigrationPin] = useState("");
  const legacySnapshot = useMemo(() => buildLegacySnapshot(), []);
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
      (draft.role === "entrenador" && !draft.teamLabel.trim())
    ) {
      setMessage("Completa el nombre, el equipo y un PIN de 4 números.");
      return;
    }
    try {
      const result = await clubApi.createAccount({
        name: draft.name.trim(),
        role: draft.role as "entrenador" | "coordinador",
        teamLabel: draft.teamLabel.trim(),
        pin: draft.pin,
      });
      onAccounts(result.accounts);
      setDraft({ name: "", role: "entrenador", teamLabel: "", pin: "" });
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
      role: item.role as "entrenador" | "coordinador",
      teamLabel: item.role === "entrenador" ? item.teamLabel : "",
    });
    setMessage("");
  };
  const saveAccount = async () => {
    if (
      !editingId ||
      !editDraft.name.trim() ||
      (editDraft.role === "entrenador" && !editDraft.teamLabel.trim())
    ) {
      setMessage("Completa el nombre y el equipo del entrenador.");
      return;
    }
    try {
      const result = await clubApi.updateAccount({
        id: editingId,
        name: editDraft.name.trim(),
        role: editDraft.role,
        teamLabel: editDraft.teamLabel.trim(),
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
  const removeAccount = async (id: string) => {
    try {
      const result = await clubApi.deleteAccount(id);
      onAccounts(result.accounts);
      setMessage("Usuario eliminado.");
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
      <RoleHeader
        title="Administración"
        subtitle="U.D. Oliva"
        onLogout={onLogout}
      />
      <main className="role-content">
        <section className="form-card">
          <div className="form-card-header">
            <div>
              <span>
                <Plus size={16} />
              </span>
              <h2>Nuevo acceso</h2>
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
            </select>
            {draft.role === "entrenador" && (
              <input
                placeholder="Equipo, por ejemplo Benjamín A"
                value={draft.teamLabel}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    teamLabel: event.target.value,
                  }))
                }
              />
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
              <Plus size={17} /> Crear usuario
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
        {accounts.filter((item) => item.role !== "superadmin").length === 0 &&
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
        <section>
          <div className="section-heading">
            <span className="eyebrow">USUARIOS</span>
            <h2>
              {accounts.filter((item) => item.role !== "superadmin").length}{" "}
              accesos
            </h2>
          </div>
          <div className="account-list">
            {accounts
              .filter((item) => item.role !== "superadmin")
              .map((item) => (
                <article
                  key={item.id}
                  className={!item.active ? "inactive" : ""}
                >
                  <span className={`role-avatar ${item.role}`}>
                    {item.role === "entrenador" ? (
                      <Users size={20} />
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
                              | "coordinador",
                          }))
                        }
                      >
                        <option value="entrenador">Entrenador</option>
                        <option value="coordinador">Coordinador</option>
                      </select>
                      {editDraft.role === "entrenador" && (
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
                        </small>
                      </div>
                      <div className="account-actions">
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
                    <button
                      className="danger-icon"
                      aria-label={`Eliminar ${item.name}`}
                      onClick={() => void removeAccount(item.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            {accounts.filter((item) => item.role !== "superadmin").length ===
              0 && (
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
  onLogout,
}: {
  account: ClubAccount;
  accounts: ClubAccount[];
  stores: StoreRow[];
  onLogout: () => void;
}) {
  const coaches = accounts.filter(
    (item) => item.role === "entrenador" && item.active,
  );
  const [coachFilter, setCoachFilter] = useState("all");
  const [tab, setTab] = useState<"resumen" | "jugadores" | "partidos">(
    "resumen",
  );
  const [showTeamPicker, setShowTeamPicker] = useState(false);
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
      })),
    [accounts, stores],
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
        rows.get(player.id)!.teams.add(coach.teamLabel);
      });
      stats.forEach((match) =>
        match.players.forEach((entry) => {
          const storedPlayer = team.players.find(
            (item) => item.id === entry.playerId,
          );
          if (!storedPlayer) return;
          const player = canonicalPlayers.get(storedPlayer.id) || storedPlayer;
          if (!rows.has(player.id))
            rows.set(player.id, {
              id: player.id,
              name: player.name,
              number: player.number,
              role: player.role,
              owner: player.ownerCoachId || coach.id,
              teams: new Set([coach.teamLabel]),
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
  }, [canonicalPlayers, filtered, sortBy]);
  const goals = playerRows.reduce((total, row) => total + row.goals, 0);
  const assists = playerRows.reduce((total, row) => total + row.assists, 0);
  const coordinatorName = account.name.trim().split(/\s+/)[0];
  const selectedCoach = coaches.find((coach) => coach.id === coachFilter);
  const firstName = (name: string) => name.trim().split(/\s+/)[0];
  const viewTitle =
    tab === "resumen"
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
  };

  return (
    <div className="role-shell">
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
                    <small>{firstName(coach.name)} · Entrenador</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          )}
        </section>
        <div className="coordinator-tabs">
          {(["resumen", "jugadores", "partidos"] as const).map((value) => (
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
        {tab === "resumen" && (
          <>
            <div className="club-metrics">
              <MetricCard label="Entrenadores" value={filtered.length} />
              <MetricCard label="Jugadores únicos" value={playerRows.length} />
              <MetricCard label="Partidos" value={matches.length} />
              <MetricCard label="Goles" value={goals} />
              <MetricCard label="Asistencias" value={assists} />
            </div>
            <section className="coordinator-panel">
              <div className="section-heading">
                <span className="eyebrow">DESTACADOS</span>
                <h2>Mejor valoración</h2>
              </div>
              <CoordinatorRanking rows={playerRows.slice(0, 8)} />
            </section>
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
                    <strong>{match.ourScore}</strong>
                    <span>—</span>
                    <strong>{match.rivalScore}</strong>
                  </div>
                  <div className="match-club-copy">
                    <span>
                      {match.coach.teamLabel} · {match.coach.name}
                    </span>
                    <h3>U.D. OLIVA vs {match.rival}</h3>
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
                  {match.notes && (
                    <p>
                      <strong>Observaciones generales:</strong> {match.notes}
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
