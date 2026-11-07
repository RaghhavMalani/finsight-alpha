import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { parseTerminalSearch, stringifyTerminalSearch } from "./app/terminal/context";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    parseSearch: parseTerminalSearch,
    stringifySearch: stringifyTerminalSearch,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
