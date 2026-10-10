import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ScreenGate } from "./components/ScreenGate";
import { createDataSource } from "./data/createDataSource";
import { DataSourceProvider } from "./data/DataSourceProvider";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: 1 } },
});

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DataSourceProvider source={createDataSource()}>
        <ScreenGate>
          <App />
        </ScreenGate>
      </DataSourceProvider>
    </QueryClientProvider>
  </StrictMode>,
);
