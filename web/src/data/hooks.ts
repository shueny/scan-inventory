import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SCAN_ID } from "../config";
import { useDataSource } from "./DataSourceProvider";
import type {
  Instance,
  InstanceChange,
  InstanceDetail,
  Issue,
  Resolution,
  ResolveResult,
} from "./types";

// Server state goes through TanStack Query: cached, shared between components,
// loading and error states for free. Query keys start with the scan id.

export const keys = {
  scan: [SCAN_ID, "scan"] as const,
  instances: [SCAN_ID, "instances"] as const,
  instance: (id: number | null) => [SCAN_ID, "instance", id] as const,
  issues: [SCAN_ID, "issues"] as const,
};

export function useScan() {
  const source = useDataSource();
  return useQuery({ queryKey: keys.scan, queryFn: () => source.getScan(SCAN_ID) });
}

export function useInstances() {
  const source = useDataSource();
  return useQuery({ queryKey: keys.instances, queryFn: () => source.listInstances(SCAN_ID) });
}

export function useInstance(id: number | null) {
  const source = useDataSource();
  return useQuery({
    queryKey: keys.instance(id),
    queryFn: () => {
      if (id === null) throw new Error("no instance selected"); // not reached: enabled is false
      return source.getInstance(SCAN_ID, id);
    },
    enabled: id !== null,
  });
}

export function useIssues() {
  const source = useDataSource();
  return useQuery({ queryKey: keys.issues, queryFn: () => source.listIssues(SCAN_ID) });
}

/**
 * Confirm, reject or reclassify one object (PATCH). On success the answer replaces the
 * cached detail and its row in the list, so table, panel and 3D update at once without
 * a refetch. Issues are refetched: the API decides whether any of them changed.
 */
export function useUpdateInstance(id: number) {
  const source = useDataSource();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: InstanceChange) => source.updateInstance(SCAN_ID, id, change),
    onSuccess: (detail: InstanceDetail) => {
      client.setQueryData(keys.instance(id), detail);
      client.setQueryData<Instance[]>(keys.instances, (list) =>
        list?.map((i) => (i.instance_id === id ? withoutHistory(detail) : i)),
      );
      void client.invalidateQueries({ queryKey: keys.issues });
    },
  });
}

/**
 * Resolve or dismiss an issue (PRD 8.5). The answer holds the closed issue and every
 * object it changed; both replace their cached copies, so the queue, the table, the
 * detail panel and the 3D view update together.
 */
export function useResolveIssue() {
  const source = useDataSource();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, resolution }: { issueId: string; resolution: Resolution }) =>
      source.resolveIssue(SCAN_ID, issueId, resolution),
    onSuccess: ({ issue, instances }: ResolveResult) => {
      client.setQueryData<Issue[]>(keys.issues, (list) =>
        list?.map((i) => (i.issue_id === issue.issue_id ? issue : i)),
      );
      const changed = new Map(instances.map((d) => [d.instance_id, d]));
      for (const detail of instances)
        client.setQueryData(keys.instance(detail.instance_id), detail);
      client.setQueryData<Instance[]>(keys.instances, (list) =>
        list?.map((i) => {
          const detail = changed.get(i.instance_id);
          return detail ? withoutHistory(detail) : i;
        }),
      );
    },
  });
}

function withoutHistory({ history: _history, ...instance }: InstanceDetail): Instance {
  return instance;
}
