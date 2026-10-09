import type { ClassInfo, InstanceDetail as Detail, LocationSource } from "../data/types";

const LOCATION_NOTE: Record<LocationSource, string | null> = {
  pnid: null,
  tagged_nearest_tag: "from the nearest tag (the P&ID row has no zone)",
  nearest_tag: "from the nearest tag",
  background: null,
};

const PCA_HELP =
  "Estimated from how the object's points spread (PCA). Good for straight pipes; " +
  "wrong for bent or branched ones.";

function metres(v: number): string {
  return `${v.toFixed(2)} m`;
}

/** Right panel: every field of the selected instance (PRD 8.4). Review actions come in T5. */
export function InstanceDetail({ instance, cls }: { instance: Detail; cls?: ClassInfo }) {
  const [sx, sy, sz] = instance.bbox_size;
  const zoneNote = LOCATION_NOTE[instance.location_source];

  return (
    <article aria-labelledby="detail-heading" className="flex flex-col gap-4">
      <header>
        <p className="text-xs text-muted">Object {instance.instance_id}</p>
        <h2 id="detail-heading" className="text-lg font-semibold">
          {instance.tag ?? "No P&ID tag"}
        </h2>
        <p className="mt-1 flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className="size-3 rounded-sm border border-black/10"
            style={{ backgroundColor: cls?.color }}
          />
          {instance.class_name}
        </p>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <Field label="Element">{instance.element ?? "—"}</Field>
        <Field label="Nominal size">
          {instance.nominal_inch !== null ? `${instance.nominal_inch}" (P&ID, inches)` : "—"}
        </Field>
        <Field label="System">{instance.system ?? "—"}</Field>
        <Field label="Zone">
          {instance.location ?? "—"}
          {zoneNote && <span className="block text-xs text-muted">{zoneNote}</span>}
        </Field>
        {instance.all_tags.length > 1 && (
          <Field label="All tags">{instance.all_tags.join(", ")}</Field>
        )}
        <Field label="Points">{instance.point_count.toLocaleString()}</Field>
        <Field label="Size (box)">
          {sx.toFixed(2)} × {sy.toFixed(2)} × {sz.toFixed(2)} m
        </Field>
        {instance.length_est_m !== null && (
          <Field label="Length">
            {metres(instance.length_est_m)} <EstimateBadge />
          </Field>
        )}
        {instance.diameter_est_m !== null && (
          <Field label="Diameter">
            {metres(instance.diameter_est_m)} <EstimateBadge />
          </Field>
        )}
        <Field label="Review">{instance.review_status}</Field>
      </dl>

      <section aria-labelledby="history-heading">
        <h3
          id="history-heading"
          className="mb-1 text-xs font-medium tracking-wide text-muted uppercase"
        >
          History
        </h3>
        {instance.history.length === 0 ? (
          <p className="text-sm text-muted">No review changes yet.</p>
        ) : (
          <ul className="text-sm">
            {instance.history.map((e) => (
              <li key={e.id}>
                {e.action}: {e.from_value} → {e.to_value}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function EstimateBadge() {
  return (
    <abbr
      title={PCA_HELP}
      className="ml-1 cursor-help rounded bg-canvas px-1 py-0.5 text-[11px] text-muted no-underline"
    >
      estimate (PCA)
    </abbr>
  );
}
