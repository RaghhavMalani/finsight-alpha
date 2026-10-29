import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseLegacyCommand } from "./mnemonics";
import { useInvestigation } from "../terminal/TerminalShell";
import type { CommandResolution } from "../terminal/commands";
import { localLiveAllowed, setCurrentTicker, useDataMode } from "@/replay/mode";
import { subjectTicker } from "../terminal/context";

export function CommandLine() {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [resolution, setResolution] = useState<CommandResolution>();
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const investigation = useInvestigation();
  const mode = useDataMode();
  const navigate = useNavigate();
  const invalidate = useCallback(() => {
    request.current++;
  }, []);
  useEffect(() => {
    invalidate();
    setBusy(false);
    setResolution(undefined);
    setMessage(null);
    return invalidate;
  }, [investigation.key, investigation.navigationContext, investigation.error, mode, invalidate]);
  const submit = async () => {
    const ticket = ++request.current;
    setResolution(undefined);
    setBusy(true);
    try {
      if (investigation.error) throw new Error(investigation.error);
      const [{ terminalSearch }, { commandWorkspaces, resolveTerminalCommand }] = await Promise.all(
        [import("../terminal/search"), import("../terminal/commands")],
      );
      const catalog = await terminalSearch.load(
        commandWorkspaces(text),
        /^(?:ISSUE|RUN|DATA|FACTOR|CHANGES)\b/i.test(text.trim()),
      );
      if (ticket !== request.current) return;
      const result = resolveTerminalCommand(text, investigation.navigationContext, {
        ...catalog,
        legacyParser: parseLegacyCommand,
        environment: {
          hostname: window.location.hostname,
          localLiveFlag: localLiveAllowed(),
          mode,
        },
      });
      setResolution(result);
      if (result.status === "READY") {
        const ticker = subjectTicker(result.target.context.subject);
        if (ticker) setCurrentTicker(ticker);
        setMessage(result.note ?? result.capability.reason);
        investigation.openTarget(result.target);
      } else if (result.status === "LEGACY_READY") {
        const ticker = subjectTicker(result.navigation.context.subject);
        if (ticker) setCurrentTicker(ticker);
        setMessage(result.note);
        void navigate({ to: result.navigation.to, search: result.navigation.search as never });
      } else setMessage(`${result.reason} ${result.correction}`);
    } catch (error) {
      if (ticket === request.current)
        setMessage(error instanceof Error ? error.message : "Command unavailable.");
    } finally {
      if (ticket === request.current) setBusy(false);
    }
  };
  const failed = resolution?.status === "REJECTED" || resolution?.status === "CHOOSE";
  return (
    <form
      className="shell-command"
      aria-label="Terminal command"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="shell-command-row">
        <label htmlFor="terminal-command">Command</label>
        <input
          id="terminal-command"
          autoComplete="off"
          spellCheck={false}
          maxLength={160}
          value={text}
          onChange={(event) => {
            request.current++;
            setText(event.target.value);
            setMessage(null);
            setResolution(undefined);
            setBusy(false);
          }}
          placeholder="INDIA REG · RISK HIGH · DATA IIMA"
          aria-describedby="terminal-command-help"
          aria-invalid={failed}
        />
        <button type="submit" disabled={busy}>
          GO <span aria-hidden="true">↵</span>
        </button>
      </div>
      <p
        id="terminal-command-help"
        className={failed ? "shell-command-error" : "shell-command-help"}
        role={failed ? "alert" : "status"}
      >
        {busy
          ? "Checking admitted navigation metadata…"
          : (message ??
            "TICKER [EXCHANGE] FUNCTION · US / INDIA REG · RISK HIGH · exact ISSUE / RUN · navigation only")}
      </p>
      {failed && resolution.choices.length > 0 && (
        <ul className="terminal-command-choices" aria-label="Exact command choices">
          {resolution.choices.map((choice, index) => (
            <li key={`${choice.artifactId ?? choice.label}|${index}`}>
              {choice.target ? (
                <Link to={choice.target.to as never} search={choice.target.search as never}>
                  {choice.label}
                  {choice.cutoff ? ` · ${choice.cutoff}` : ""}
                </Link>
              ) : (
                <span>
                  {choice.label} · UNAVAILABLE: {choice.reason ?? resolution.reason}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
