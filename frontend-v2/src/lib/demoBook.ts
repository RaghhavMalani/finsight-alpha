// Private paper positions are activated only by the explicitly selected local lab.
// The server remains authoritative; offline caches belong to a verified user.
import { api, ApiError, subscribeSessionBoundary, type User } from "./api";
import { getDataMode, localLiveAllowed } from "@/replay/mode";

export type DemoPosition = { symbol: string; qty: number; entry: number };
export type DemoBookSync = {
  state: "loading" | "saving" | "synced" | "offline" | "auth_required";
  message?: string;
};
type PaperBookPayload = { positions: DemoPosition[] };
const KEY = "finsight.paperBook.v2:";
const subs = new Set<(p: DemoPosition[]) => void>();
const boundarySubs = new Set<() => void>();
export function subscribePaperBookBoundary(callback: () => void) {
  boundarySubs.add(callback);
  return () => {
    boundarySubs.delete(callback);
  };
}
const statusSubs = new Set<(status: DemoBookSync) => void>();
let positions: DemoPosition[] = [];
let syncStatus: DemoBookSync = {
  state: "auth_required",
  message: "Authenticate to open the local paper book.",
};
let owner: number | null = null;
let active = false;
let revision = 0;
let generation = 0;
let hydratePromise: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let controller = new AbortController();

function validPositions(value: unknown): DemoPosition[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (p: unknown): p is DemoPosition =>
        !!p &&
        typeof (p as DemoPosition).symbol === "string" &&
        /^[A-Za-z0-9.^=/-]{1,40}$/.test((p as DemoPosition).symbol) &&
        typeof (p as DemoPosition).qty === "number" &&
        Number.isFinite((p as DemoPosition).qty) &&
        (p as DemoPosition).qty !== 0 &&
        typeof (p as DemoPosition).entry === "number" &&
        Number.isFinite((p as DemoPosition).entry) &&
        (p as DemoPosition).entry > 0,
    )
    .map((p) => ({ symbol: p.symbol.toUpperCase(), qty: p.qty, entry: p.entry }));
}
function allowed() {
  return active && typeof window !== "undefined" && getDataMode() === "live" && localLiveAllowed();
}
function loadCache(user: number): DemoPosition[] {
  try {
    return validPositions(JSON.parse(localStorage.getItem(KEY + user) ?? "[]"));
  } catch {
    return [];
  }
}
function persistCache() {
  if (!allowed() || owner === null) return;
  try {
    localStorage.setItem(KEY + owner, JSON.stringify(positions));
  } catch {
    /* cache only */
  }
}
function setSyncStatus(next: DemoBookSync) {
  syncStatus = next;
  statusSubs.forEach((fn) => fn(next));
}
function emitLocal(cache = true) {
  if (cache) persistCache();
  subs.forEach((fn) => fn(positions));
}
export function resetPaperBookBoundary() {
  generation += 1;
  revision += 1;
  active = false;
  owner = null;
  controller.abort();
  controller = new AbortController();
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = null;
  hydratePromise = null;
  positions = [];
  emitLocal(false);
  boundarySubs.forEach((callback) => callback());
  setSyncStatus({
    state: "auth_required",
    message: "Local paper session ended. Authenticate again to continue.",
  });
}
subscribeSessionBoundary(resetPaperBookBoundary);

async function hydrateFromServer() {
  const epoch = generation;
  const signal = controller.signal;
  setSyncStatus({ state: "loading" });
  try {
    const user = await api<User>("/auth/me", { signal });
    if (!allowed() || generation !== epoch || signal.aborted) return;
    if (!Number.isSafeInteger(user.id) || user.id <= 0)
      throw new ApiError("Authenticated identity unavailable.", 401);
    owner = user.id;
    // Display only this authenticated account's cache, and only on server failure.
    const startingRevision = revision;
    try {
      const response = await api<PaperBookPayload>("/paper/positions", { signal });
      if (!allowed() || generation !== epoch || signal.aborted || owner !== user.id) return;
      if (revision === startingRevision) {
        positions = validPositions(response.positions);
        emitLocal();
        setSyncStatus({ state: "synced" });
      } else scheduleSave();
    } catch (error) {
      if (!allowed() || generation !== epoch || signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) {
        resetPaperBookBoundary();
        return;
      }
      positions = loadCache(user.id);
      emitLocal(false);
      setSyncStatus({
        state: "offline",
        message: "Verified account's offline paper cache; server unavailable. Estimates are local.",
      });
    }
  } catch (error) {
    if (generation !== epoch || signal.aborted) return;
    resetPaperBookBoundary();
    setSyncStatus({
      state: "auth_required",
      message: error instanceof Error ? error.message : "Authentication required.",
    });
  }
}
export function activatePaperBookBoundary() {
  if (typeof window === "undefined" || getDataMode() !== "live" || !localLiveAllowed())
    return Promise.resolve();
  active = true;
  if (!hydratePromise) hydratePromise = hydrateFromServer();
  return hydratePromise;
}
async function saveToServer(snapshotRevision: number) {
  if (!allowed() || owner === null) return;
  const expectedOwner = owner,
    epoch = generation,
    signal = controller.signal;
  const snapshot = positions.map((p) => ({ ...p }));
  setSyncStatus({ state: "saving" });
  try {
    // Reverify before a delayed write so a changed account receives no old book.
    const user = await api<User>("/auth/me", { signal });
    if (!allowed() || generation !== epoch || signal.aborted) return;
    if (user.id !== expectedOwner) {
      resetPaperBookBoundary();
      return;
    }
    const response = await api<PaperBookPayload>("/paper/positions", {
      method: "PUT",
      body: JSON.stringify({ positions: snapshot }),
      signal,
    });
    if (!allowed() || generation !== epoch || signal.aborted || owner !== expectedOwner) return;
    if (revision === snapshotRevision) {
      positions = validPositions(response.positions);
      emitLocal();
      setSyncStatus({ state: "synced" });
    } else scheduleSave();
  } catch (error) {
    if (!allowed() || generation !== epoch || signal.aborted) return;
    if (error instanceof ApiError && error.status === 401) {
      resetPaperBookBoundary();
      return;
    }
    setSyncStatus({
      state: "offline",
      message: error instanceof Error ? error.message : "Paper-book sync unavailable.",
    });
  }
}
function scheduleSave() {
  if (!allowed() || owner === null) return;
  if (saveTimer !== null) clearTimeout(saveTimer);
  const snapshotRevision = revision;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveToServer(snapshotRevision);
  }, 350);
}
function commit(next: DemoPosition[]) {
  if (!allowed() || owner === null || syncStatus.state === "loading") return;
  positions = validPositions(next);
  revision += 1;
  emitLocal();
  scheduleSave();
}
export function getDemoBook() {
  return positions;
}
export function subscribeDemoBook(fn: (p: DemoPosition[]) => void) {
  subs.add(fn);
  fn(positions);
  return () => {
    subs.delete(fn);
  };
}
export function subscribeDemoBookStatus(fn: (s: DemoBookSync) => void) {
  statusSubs.add(fn);
  fn(syncStatus);
  return () => {
    statusSubs.delete(fn);
  };
}
export function addDemoPosition(position: DemoPosition) {
  const symbol = position.symbol.trim().toUpperCase(),
    existing = positions.find((p) => p.symbol === symbol);
  if (existing) {
    const qty = existing.qty + position.qty;
    commit(
      qty === 0
        ? positions.filter((p) => p.symbol !== symbol)
        : positions.map((p) => (p.symbol === symbol ? { ...p, qty } : p)),
    );
  } else commit([...positions, { ...position, symbol }]);
}
export function removeDemoPosition(symbol: string) {
  commit(positions.filter((p) => p.symbol !== symbol));
}
export function updateDemoPosition(symbol: string, patch: Partial<DemoPosition>) {
  commit(positions.map((p) => (p.symbol === symbol ? { ...p, ...patch } : p)));
}
export function clearDemoBook() {
  commit([]);
}
