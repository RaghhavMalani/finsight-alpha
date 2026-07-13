// Reactive paper book. The authenticated API is authoritative; localStorage is
// retained only as an offline cache while the server is unavailable.

import { api } from "./api";

export type DemoPosition = { symbol: string; qty: number; entry: number };
export type DemoBookSync = { state: "loading" | "saving" | "synced" | "offline"; message?: string };
type PaperBookPayload = { positions: DemoPosition[] };

const KEY = "finsight.demoBook.v1";


function load(): DemoPosition[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (p: unknown): p is DemoPosition =>
        !!p && typeof (p as DemoPosition).symbol === "string" &&
        typeof (p as DemoPosition).qty === "number" &&
        typeof (p as DemoPosition).entry === "number",
    );
  } catch { return []; }
}

let positions: DemoPosition[] = load();
const subs = new Set<(p: DemoPosition[]) => void>();
const statusSubs = new Set<(status: DemoBookSync) => void>();
let syncStatus: DemoBookSync = { state: "loading" };
let revision = 0;
let hydratePromise: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function validPositions(value: unknown): DemoPosition[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (p: unknown): p is DemoPosition =>
      !!p &&
      typeof (p as DemoPosition).symbol === "string" &&
      typeof (p as DemoPosition).qty === "number" &&
      Number.isFinite((p as DemoPosition).qty) &&
      (p as DemoPosition).qty !== 0 &&
      typeof (p as DemoPosition).entry === "number" &&
      Number.isFinite((p as DemoPosition).entry) &&
      (p as DemoPosition).entry > 0,
  );
}

function persistCache() {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(positions)); } catch { /* offline cache only */ }
}

function setSyncStatus(next: DemoBookSync) {
  syncStatus = next;
  statusSubs.forEach((fn) => fn(syncStatus));
}

function emitLocal() {
  persistCache();
  subs.forEach((fn) => fn(positions));
}

async function saveToServer(snapshotRevision: number) {
  const snapshot = positions.map((position) => ({ ...position }));
  setSyncStatus({ state: "saving" });
  try {
    const response = await api<PaperBookPayload>("/paper/positions", {
      method: "PUT",
      body: JSON.stringify({ positions: snapshot }),
    });
    if (revision === snapshotRevision) {
      positions = validPositions(response.positions);
      emitLocal();
      setSyncStatus({ state: "synced" });
    } else {
      scheduleSave();
    }
  } catch (error) {
    setSyncStatus({
      state: "offline",
      message: error instanceof Error ? error.message : "Paper-book sync failed.",
    });
  }
}

function scheduleSave() {
  if (typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);
  const snapshotRevision = revision;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveToServer(snapshotRevision);
  }, 350);
}

async function hydrateFromServer() {
  const startingRevision = revision;
  setSyncStatus({ state: "loading" });
  try {
    const response = await api<PaperBookPayload>("/paper/positions");
    if (revision === startingRevision) {
      positions = validPositions(response.positions);
      emitLocal();
      setSyncStatus({ state: "synced" });
    } else {
      scheduleSave();
    }
  } catch (error) {
    setSyncStatus({
      state: "offline",
      message: error instanceof Error ? error.message : "Using the local offline cache.",
    });
  }
}

function ensureHydrated() {
  if (!hydratePromise) hydratePromise = hydrateFromServer();
  return hydratePromise;
}

function commit(next: DemoPosition[]) {
  positions = validPositions(next);
  revision += 1;
  emitLocal();
  scheduleSave();
}

export function getDemoBook() { return positions; }
export function subscribeDemoBook(fn: (p: DemoPosition[]) => void) {
  subs.add(fn);
  fn(positions);
  void ensureHydrated();
  return () => { subs.delete(fn); };
}
export function subscribeDemoBookStatus(fn: (status: DemoBookSync) => void) {
  statusSubs.add(fn);
  fn(syncStatus);
  void ensureHydrated();
  return () => { statusSubs.delete(fn); };
}
export function addDemoPosition(position: DemoPosition) {
  const symbol = position.symbol.trim().toUpperCase();
  const existing = positions.find((item) => item.symbol === symbol);
  if (existing) {
    const qty = existing.qty + position.qty;
    commit(qty === 0
      ? positions.filter((item) => item.symbol !== symbol)
      : positions.map((item) => item.symbol === symbol ? { ...item, qty } : item));
  } else {
    commit([...positions, { ...position, symbol }]);
  }
}
export function removeDemoPosition(symbol: string) {
  commit(positions.filter((position) => position.symbol !== symbol));
}
export function updateDemoPosition(symbol: string, patch: Partial<DemoPosition>) {
  commit(positions.map((position) => position.symbol === symbol ? { ...position, ...patch } : position));
}
export function clearDemoBook() { commit([]); }
