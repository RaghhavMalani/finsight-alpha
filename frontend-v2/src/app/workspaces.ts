export const WORKSPACES = [
  { id: "market", label: "MARKET", key: "F1", command: "DES", to: "/markets" },
  { id: "world", label: "WORLD", key: "F2", command: "GE", to: "/globe" },
  {
    id: "risk",
    label: "RISK",
    key: "F3",
    command: "RISK",
    to: "/risk",
    phase: 7,
    future: "Risk Manager issues and portfolio monitoring arrive in Phase 7.",
  },
  { id: "regimes", label: "REGIMES", key: "F4", command: "REG", to: "/dynamics" },
  {
    id: "factors",
    label: "FACTORS",
    key: "F5",
    command: "FACT",
    to: "/factors",
    phase: 6,
    future: "Factor library and neutrality checks arrive in Phase 6.",
  },
  {
    id: "research",
    label: "RESEARCH",
    key: "F6",
    command: "RES",
    to: "/research",
    phase: 4,
    future: "Research OS and the US–India momentum study arrive in Phase 4.",
  },
  {
    id: "execution",
    label: "EXECUTION",
    key: "F7",
    command: "EXEC",
    to: "/execution",
    phase: 9,
    future: "Execution sweeps and simulator comparisons arrive in Phase 9.",
  },
  { id: "observatory", label: "OBSERVATORY", key: "F8", command: "OBS", to: "/observatory" },
  { id: "agents", label: "AGENTS", key: "F9", command: "AGENTS", to: "/forge" },
  {
    id: "data",
    label: "DATA",
    key: "F10",
    command: "DATA",
    to: "/data",
  },
] as const;

export type WorkspaceId = (typeof WORKSPACES)[number]["id"];
export const RESERVED_KEYS = ["F5", "F7"] as const;
export const FUNCTION_KEYS: string[] = WORKSPACES.map((w) => w.key).filter(
  (k) => !RESERVED_KEYS.includes(k as "F5" | "F7"),
);

export function activeWorkspace(pathname: string): WorkspaceId {
  if (
    ["/forge", "/runs", "/bench", "/worlds", "/artifacts", "/reality"].some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    )
  )
    return "agents";
  return (
    WORKSPACES.find((w) => pathname === w.to || pathname.startsWith(`${w.to}/`))?.id ?? "market"
  );
}

export function isTextField(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest(
      'input,textarea,select,[role="textbox"],[contenteditable]:not([contenteditable="false"])',
    )
  );
}
