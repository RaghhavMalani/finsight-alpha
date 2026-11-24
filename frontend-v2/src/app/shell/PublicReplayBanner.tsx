import { useEffect, useState } from "react";
import { loadReplayManifest } from "@/replay/client";
import "./public-replay-banner.css";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

type Recording = { state: "loading" } | { state: "ok"; asOf: string } | { state: "unavailable" };

/**
 * On a public host the app can only replay checked artifacts. This says so, with the date the
 * artifacts were recorded (the Replay manifest's as_of), so no one mistakes the demo for live data.
 * Not shown on a local host, where Local Live may be enabled.
 */
export function PublicReplayBanner() {
  const [isPublic, setIsPublic] = useState(false);
  const [recording, setRecording] = useState<Recording>({ state: "loading" });
  useEffect(() => {
    if (LOCAL_HOSTS.includes(window.location.hostname)) return;
    setIsPublic(true);
    let alive = true;
    loadReplayManifest()
      .then((m) => alive && setRecording({ state: "ok", asOf: m.as_of }))
      .catch(() => alive && setRecording({ state: "unavailable" }));
    return () => {
      alive = false;
    };
  }, []);
  if (!isPublic) return null;
  const date =
    recording.state === "ok"
      ? `${recording.asOf.slice(0, 10)} ${recording.asOf.slice(11, 16)} UTC`
      : recording.state === "loading"
        ? "loading…"
        : "unavailable";
  return (
    <div className="public-replay" role="note" data-public-replay>
      <b>Public demo · Replay</b>
      <span>
        checked artifacts recorded{" "}
        <time
          dateTime={recording.state === "ok" ? recording.asOf : undefined}
          data-num-exempt="date"
        >
          {date}
        </time>
      </span>
      <span>no live feeds · no backend · nothing is executed</span>
      <a href="https://github.com/RaghhavMalani/finsight-alpha" rel="noreferrer" target="_blank">
        Source
      </a>
    </div>
  );
}
