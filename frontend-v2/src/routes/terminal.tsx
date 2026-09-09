import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/terminal")({
  beforeLoad: () => {
    throw redirect({ to: "/legacy-terminal" });
  },
  component: TerminalRedirect,
});

function TerminalRedirect() {
  return null;
}
