import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { parseCommand } from "./mnemonics";
import { setCurrentTicker, useCurrentTicker } from "@/replay/mode";

export function CommandLine() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const current = useCurrentTicker();
  const navigate = useNavigate();
  return (
    <form
      className="shell-command"
      aria-label="Terminal command"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const target = parseCommand(text, current);
          if (target.instrument) setCurrentTicker(target.instrument.providerSymbol);
          setError(null);
          void navigate({ to: target.to, search: target.search as never });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Command unavailable.");
        }
      }}
    >
      <div className="shell-command-row">
        <label htmlFor="terminal-command">Command</label>
        <input
          id="terminal-command"
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder="RELIANCE IN DES · SPY GP · TSM GE"
          aria-describedby="terminal-command-help"
          aria-invalid={!!error}
        />
        <button type="submit">
          GO <span aria-hidden="true">↵</span>
        </button>
      </div>
      <p
        id="terminal-command-help"
        className={error ? "shell-command-error" : "shell-command-help"}
        role={error ? "alert" : undefined}
      >
        {error ??
          "Ticker · exchange · function. DES  GP  OMON  FA  REG  GE  RISK · FACT and EXEC open future workspaces."}
      </p>
    </form>
  );
}
