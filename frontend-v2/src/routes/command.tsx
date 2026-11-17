import { createFileRoute, redirect } from "@tanstack/react-router";

// F1 Command lives at "/". This alias keeps any query (e.g. ?focus=) when it redirects.
export const Route = createFileRoute("/command")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/", search: search as never, replace: true });
  },
});
