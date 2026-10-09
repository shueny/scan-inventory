import { useQuery } from "@tanstack/react-query";
import { SCAN_ID } from "../config";
import { useDataSource } from "./DataSourceProvider";

// Server state goes through TanStack Query: cached, shared between components,
// loading and error states for free. Query keys start with the scan id.

export function useScan() {
  const source = useDataSource();
  return useQuery({ queryKey: [SCAN_ID, "scan"], queryFn: () => source.getScan(SCAN_ID) });
}

export function useInstances() {
  const source = useDataSource();
  return useQuery({
    queryKey: [SCAN_ID, "instances"],
    queryFn: () => source.listInstances(SCAN_ID),
  });
}

export function useInstance(id: number | null) {
  const source = useDataSource();
  return useQuery({
    queryKey: [SCAN_ID, "instance", id],
    queryFn: () => {
      if (id === null) throw new Error("no instance selected"); // not reached: enabled is false
      return source.getInstance(SCAN_ID, id);
    },
    enabled: id !== null,
  });
}
