import type { ClassInfo, InstanceDetail as Detail, LocationSource } from "../data/types";
import { ReviewActions } from "./ReviewActions";
import { ReviewHistory } from "./ReviewHistory";
import { ReviewStatusBadge } from "./ReviewStatusBadge";

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

/**
 * Right panel (PRD 8.4): every field of the selected object, the review actions and the
 * history of changes.
 */
export function InstanceDetail({ instance, classes }: { instance: Detail; classes: ClassInfo[] }) {
  const [sx, sy, sz] = instance.bbox_size;
  const zoneNote = LOCATION_NOTE[instance.location_source];
  const current = classes.find((c) => c.id === instance.current_class_id);
  const corrected = instance.current_class_id !== instance.class_id;

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
            style={{ backgroundColor: current?.color }}
          />
          {current?.name ?? instance.class_name}
        </p>
        {corrected && <p className="text-xs text-muted">Annotated as {instance.class_name}</p>}
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
        <Field label="Review">
          <ReviewStatusBadge status={instance.review_status} />
        </Field>
      </dl>

      <ReviewActions key={instance.instance_id} instance={instance} classes={classes} />
      <ReviewHistory events={instance.history} classes={classes} />
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
