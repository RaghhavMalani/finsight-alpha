import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/bench")({ component: Outlet });
