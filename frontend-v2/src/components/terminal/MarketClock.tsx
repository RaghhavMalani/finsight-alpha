import { useEffect, useState } from "react";

type State = "PRE" | "OPEN" | "CLOSE";

function getMarketState(): { state: State; label: string } {
  // Get ET (New York) hh:mm:ss
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  parts.forEach((p) => (map[p.type] = p.value));
  const h = parseInt(map.hour || "0", 10) % 24;
  const m = parseInt(map.minute || "0", 10);
  const s = parseInt(map.second || "0", 10);
  const wd = map.weekday || "Mon";
  const sec = h * 3600 + m * 60 + s;
  const open = 9 * 3600 + 30 * 60;
  const close = 16 * 3600;
  const isWeekend = wd === "Sat" || wd === "Sun";
  let state: State;
  let until: number;
  if (isWeekend) {
    state = "CLOSE";
    // seconds to Monday 09:30 (rough — treats Sat/Sun the same)
    const daysToMon = wd === "Sat" ? 2 : 1;
    until = daysToMon * 24 * 3600 - sec + open;
  } else if (sec < open) {
    state = "PRE";
    until = open - sec;
  } else if (sec < close) {
    state = "OPEN";
    until = close - sec;
  } else {
    state = "CLOSE";
    until = 24 * 3600 - sec + open;
  }
  const hh = Math.floor(until / 3600);
  const mm = Math.floor((until % 3600) / 60);
  const ss = until % 60;
  const t = `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const label =
    state === "OPEN"
      ? `closes in ${t}`
      : state === "PRE"
        ? `opens in ${t}`
        : `opens in ${t}`;
  return { state, label };
}

export function MarketClock() {
  const [mounted, setMounted] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;
  if (!mounted) {
    return (
      <span className="mono-caps flex items-center gap-2 text-[10px] text-faint">
        <span className="h-1.5 w-1.5 rounded-full bg-faint" />
        <span>—</span>
      </span>
    );
  }
  const { state, label } = getMarketState();
  const color =
    state === "OPEN" ? "text-up" : state === "PRE" ? "text-primary" : "text-faint";
  const dot =
    state === "OPEN" ? "bg-up" : state === "PRE" ? "bg-primary" : "bg-faint";
  return (
    <span className="mono-caps flex items-center gap-2 text-[10px]" title="NYSE session · ET">
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${state === "OPEN" ? "animate-pulse-live" : ""}`} />
      <span className={color}>{state}</span>
      <span className="text-muted-foreground">· {label}</span>
    </span>
  );
}

