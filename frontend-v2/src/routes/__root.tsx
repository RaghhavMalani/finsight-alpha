import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { useDataMode } from "@/replay/mode";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "@fontsource/cormorant-garamond/latin-400.css";
import "@fontsource/cormorant-garamond/latin-600.css";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-7xl text-foreground">404</h1>
        <h2 className="mono-caps mt-4 text-sm text-muted-foreground">Signal not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          That page isn't on the tape. It may have been retired or moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="mono-caps inline-flex items-center justify-center bg-primary px-4 py-2 text-xs text-primary-foreground transition-colors hover:brightness-110"
          >
            Back to landing
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-2xl text-foreground">The desk hit an exception</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your layout is untouched. Retry the panel, or head back to the landing.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="mono-caps inline-flex items-center justify-center bg-primary px-4 py-2 text-xs text-primary-foreground hover:brightness-110"
          >
            Retry
          </button>
          <a
            href="/"
            className="mono-caps inline-flex items-center justify-center border border-border px-4 py-2 text-xs text-foreground hover:bg-raised"
          >
            Landing
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "FinSight — RL evaluation for coding agents" },
      {
        name: "description",
        content:
          "An RL environment and evaluation harness for coding agents, instantiated in finance.",
      },
      { name: "author", content: "FinSight" },
      { property: "og:title", content: "FinSight — RL evaluation for coding agents" },
      {
        property: "og:description",
        content:
          "Deterministic finance research, counterfactual evaluation, and verifiable agent rewards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const mode = useDataMode();
  useEffect(() => {
    import("../lib/ripple").then((m) => m.installRipple());
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet key={mode} />
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#0A0C0E",
            border: "1px solid #252A2F",
            color: "#E7EAEC",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "12px",
            borderRadius: "2px",
          },
        }}
      />
    </QueryClientProvider>
  );
}
