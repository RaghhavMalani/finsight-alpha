import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { isTextField, workspaceForAltDigit } from "@/app/workspaces";
import { useCurrentTicker } from "@/replay/mode";

/**
 * Alt+1…Alt+7 open the seven workspaces from any page. F5 and F7 stay with the browser, so
 * Alt 5 and Alt 7 are the keyboard path to Dynamics and Risk. Text fields keep Alt+digit.
 */
export function WorkspaceHotkeys() {
  const navigate = useNavigate();
  const ticker = useCurrentTicker();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isTextField(event.target)) return;
      const target = workspaceForAltDigit(event);
      if (!target) return;
      event.preventDefault();
      void navigate({
        to: target.to as never,
        search: (target.id === "command" ? {} : { ticker }) as never,
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, ticker]);
  return null;
}
