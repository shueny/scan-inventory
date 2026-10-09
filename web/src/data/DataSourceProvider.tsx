import { createContext, useContext, type ReactNode } from "react";
import type { ScanDataSource } from "./ScanDataSource";

const DataSourceContext = createContext<ScanDataSource | null>(null);

export function DataSourceProvider({
  source,
  children,
}: {
  source: ScanDataSource;
  children: ReactNode;
}) {
  return <DataSourceContext.Provider value={source}>{children}</DataSourceContext.Provider>;
}

export function useDataSource(): ScanDataSource {
  const source = useContext(DataSourceContext);
  if (!source) throw new Error("useDataSource must be used inside <DataSourceProvider>");
  return source;
}
