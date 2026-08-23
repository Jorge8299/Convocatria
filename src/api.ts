import type { ClubAccount } from "./clubTypes";

export type StoreArea = "team" | "stats" | "journeys" | "rivals" | "boards";
export interface StoreRow {
  account_id: string;
  area: StoreArea;
  data: unknown;
}
export interface BootstrapPayload {
  accounts: ClubAccount[];
  session: ClubAccount | null;
  stores?: StoreRow[];
}
export interface ImportedRival {
  nombre: string;
  campo: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
  createAccount: (input: {
    name: string;
    role: "entrenador" | "coordinador";
    teamLabel: string;
    pin: string;
  }) =>
    request<{ accounts: ClubAccount[] }>("/api/accounts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateAccount: (input: {
    id: string;
    name?: string;
    role?: "entrenador" | "coordinador";
    teamLabel?: string;
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
    for (const area of ["team", "stats", "journeys", "rivals"] as StoreArea[]) {
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
