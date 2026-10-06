import { useEffect, useState } from "react";
import { validateTrace, type ModelTrace, type TraceRequest } from "./types";

export async function artifactHash(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** JSON/JSONL snapshots for production; optional complete snapshot envelopes over local WS. */
export function useTrainingStream(
  url: string | null,
  request: TraceRequest,
  expectedSha?: string,
  expectedInputHash?: string,
) {
  const { kind, ticker, asOf } = request;
  const identity = JSON.stringify([url, kind, ticker, asOf, expectedSha, expectedInputHash]);
  const [state, setState] = useState<{
    identity: string;
    data: ModelTrace | null;
    hash: string | null;
    error: string | null;
    loading: boolean;
  }>({ identity: "", data: null, hash: null, error: null, loading: true });
  useEffect(() => {
    const abort = new AbortController();
    const bound = { kind, ticker, asOf };
    let socket: WebSocket | undefined;
    setState({ identity, data: null, hash: null, error: null, loading: !!url });
    if (!url) return;
    const accept = (value: unknown, hash: string | null) => {
      const data = validateTrace(value, bound);
      if (expectedInputHash && data.provenance.input_hash !== expectedInputHash)
        throw new Error("Replay input hash does not match the manifest");
      if (!abort.signal.aborted) setState({ identity, data, hash, error: null, loading: false });
    };
    const reject = (error: unknown) => {
      if (!abort.signal.aborted)
        setState({
          identity,
          data: null,
          hash: null,
          error: error instanceof Error ? error.message : "Training trace unavailable",
          loading: false,
        });
    };
    if (/^wss?:/.test(url)) {
      if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
        reject(new Error("WebSocket traces are supported only on local installations"));
      } else {
        socket = new WebSocket(url);
        socket.onmessage = (event) => {
          try {
            accept(JSON.parse(event.data).trace, null);
          } catch (error) {
            reject(error);
            socket?.close();
          }
        };
        socket.onerror = () => reject(new Error("Local model stream unavailable"));
        socket.onclose = () => {
          if (!abort.signal.aborted)
            setState((s) =>
              s.data ? s : { ...s, loading: false, error: "Local model stream closed" },
            );
        };
      }
    } else {
      void (async () => {
        const response = await fetch(url, { signal: abort.signal, credentials: "include" });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.detail || `Trace unavailable (${response.status})`);
        }
        const bytes = await response.arrayBuffer();
        const hash = expectedSha ? await artifactHash(bytes) : null;
        if (expectedSha && hash !== expectedSha)
          throw new Error("Replay artifact SHA-256 mismatch");
        const text = new TextDecoder().decode(bytes);
        const rows = url.split("?")[0].endsWith(".jsonl")
          ? text
              .trim()
              .split(/\r?\n/)
              .map((line) => JSON.parse(line).trace)
          : [JSON.parse(text)];
        rows.forEach((value) => validateTrace(value, bound));
        accept(rows.at(-1), hash);
      })().catch(reject);
    }
    return () => {
      abort.abort();
      socket?.close();
    };
  }, [url, kind, ticker, asOf, expectedSha, expectedInputHash, identity]);
  // Hide the previous request synchronously, before effect cleanup/fetch begins.
  return state.identity === identity
    ? state
    : { identity, data: null, hash: null, error: null, loading: !!url };
}
