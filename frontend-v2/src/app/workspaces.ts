/**
 * Sections are the typed destinations that commands, search and investigation links address.
 * Their ids are part of the terminal investigation contract and do not change.
 */
export const SECTIONS = [
  { id: "market", label: "MARKET", command: "DES", to: "/markets", workspace: "market" },
  { id: "world", label: "WORLD", command: "GE", to: "/globe", workspace: "world" },
  { id: "risk", label: "RISK", command: "RISK", to: "/risk", workspace: "risk" },
  { id: "regimes", label: "REGIMES", command: "REG", to: "/dynamics", workspace: "dynamics" },
  { id: "factors", label: "FACTORS", command: "FACT", to: "/factors", workspace: "market" },
  {
    id: "research",
    label: "RESEARCH",
    command: "RES",
    to: "/research",
    workspace: "research",
    future: "Research OS and the US–India momentum study arrive in Phase 4.",
  },
  {
    id: "execution",
    label: "EXECUTION",
    command: "EXEC",
    to: "/execution",
    workspace: "market",
    future: "Execution sweeps and simulator comparisons arrive in Phase 9.",
  },
  {
    id: "observatory",
    label: "OBSERVATORY",
    command: "OBS",
    to: "/observatory",
    workspace: "dynamics",
  },
  { id: "agents", label: "AGENTS", command: "AGENTS", to: "/forge", workspace: "agents" },
  { id: "data", label: "DATA", command: "DATA", to: "/data", workspace: "risk" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

/**
 * Seven workspaces. F5 (reload) and F7 (caret browsing) stay with the browser, so workspaces 5
 * and 7 are labelled and reached with Alt 5 / Alt 7. Every workspace also answers to Alt 1–7.
 */
export const WORKSPACES = [
  { id: "command", slot: 1, label: "COMMAND", key: "F1", command: "CMD", to: "/", section: null },
  {
    id: "research",
    slot: 2,
    label: "RESEARCH",
    key: "F2",
    command: "RES",
    to: "/research",
    section: "research",
  },
  {
    id: "world",
    slot: 3,
    label: "GLOBAL EYE",
    key: "F3",
    command: "GE",
    to: "/globe",
    section: "world",
  },
  {
    id: "agents",
    slot: 4,
    label: "FORGE",
    key: "F4",
    command: "AGENTS",
    to: "/forge",
    section: "agents",
  },
  {
    id: "dynamics",
    slot: 5,
    label: "DYNAMICS",
    key: "Alt 5",
    command: "REG",
    to: "/dynamics",
    section: "regimes",
  },
  {
    id: "market",
    slot: 6,
    label: "MARKETS",
    key: "F6",
    command: "DES",
    to: "/markets",
    section: "market",
  },
  {
    id: "risk",
    slot: 7,
    label: "RISK",
    key: "Alt 7",
    command: "RISK",
    to: "/risk",
    section: "risk",
  },
] as const;

export type WorkspaceId = (typeof WORKSPACES)[number]["id"];
export type Workspace = (typeof WORKSPACES)[number];

/** Function keys the browser keeps: F5 reloads, F7 toggles caret browsing. */
export const RESERVED_KEYS = ["F5", "F7"] as const;
/** The key label shown for each workspace, in order (F-keys, or Alt N where the F-key is reserved). */
export const FUNCTION_KEYS: string[] = WORKSPACES.map((w) => w.key);
/** Function keys the shell actually captures. */
export const CAPTURED_FUNCTION_KEYS: string[] = WORKSPACES.map((w) => w.key).filter((k) =>
  /^F\d+$/.test(k),
);

/** Sub-navigation inside a workspace, in the thin mono style. Paths only; context is added by the caller. */
export const SUBNAV: Partial<Record<WorkspaceId, readonly (readonly [string, string])[]>> = {
  agents: [
    ["Center", "/forge"],
    ["Runs", "/runs"],
    ["Bench", "/bench"],
    ["Worlds", "/worlds"],
    ["Artifacts", "/artifacts"],
  ],
  dynamics: [
    ["Lab", "/dynamics"],
    ["Observatory", "/observatory"],
  ],
  market: [
    ["Market", "/markets"],
    ["Factors", "/factors"],
    ["Regimes", "/regimes"],
    ["Execution", "/execution"],
  ],
  risk: [
    ["Risk", "/risk"],
    ["Data / feed health", "/data"],
  ],
};

const under = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const PATHS: [string, WorkspaceId][] = [
  ["/command", "command"],
  ["/research", "research"],
  ["/globe", "world"],
  ["/forge", "agents"],
  ["/runs", "agents"],
  ["/bench", "agents"],
  ["/worlds", "agents"],
  ["/reality", "agents"],
  ["/artifacts", "agents"],
  ["/dynamics", "dynamics"],
  ["/observatory", "dynamics"],
  ["/markets", "market"],
  ["/factors", "market"],
  ["/regimes", "market"],
  ["/execution", "market"],
  ["/risk", "risk"],
  ["/data", "risk"],
];

export function activeWorkspace(pathname: string): WorkspaceId {
  if (pathname === "/" || pathname === "") return "command";
  return PATHS.find(([prefix]) => under(pathname, prefix))?.[1] ?? "command";
}

export function workspaceOfSection(section: SectionId): WorkspaceId {
  return SECTIONS.find((s) => s.id === section)!.workspace;
}

export function workspaceById(id: WorkspaceId): Workspace {
  return WORKSPACES.find((w) => w.id === id)!;
}

/** The key label of the workspace a section belongs to, for palette and search labels. */
export function sectionKey(section: SectionId): string {
  return workspaceById(workspaceOfSection(section)).key;
}

/** A single command word naming a section: its mnemonic, its label, or its workspace's label. */
export function findSection(token: string) {
  const word = token.trim().toUpperCase();
  return (
    SECTIONS.find((s) => s.command === word || s.label === word) ??
    SECTIONS.find(
      (s) =>
        s.id === WORKSPACES.find((w) => w.section && w.label.replace(/\s+/g, "") === word)?.section,
    )
  );
}

/** Alt+1…Alt+7 (by physical digit, so macOS Option characters do not matter). */
export function workspaceForAltDigit(event: KeyboardEvent): Workspace | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat)
    return null;
  const match = /^Digit([1-7])$/.exec(event.code) ?? /^Numpad([1-7])$/.exec(event.code);
  if (!match) return null;
  return WORKSPACES.find((w) => w.slot === Number(match[1])) ?? null;
}

export function isTextField(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest(
      'input,textarea,select,[role="textbox"],[contenteditable]:not([contenteditable="false"])',
    )
  );
}
