import { useState } from "react";
import { useUpdateInstance } from "../data/hooks";
import type { ClassInfo, InstanceChange, InstanceDetail } from "../data/types";

const heading = "mb-1.5 text-xs font-medium tracking-wide text-muted uppercase";
const button =
  "rounded-md border border-line px-2.5 py-1 text-sm hover:bg-canvas disabled:opacity-50";

/**
 * Review one object (PRD 8.4): confirm, reject or change its class, with an optional
 * note. Saved through the data source, so it lands in the database (api mode) or in
 * this browser (demo mode) and shows up in the history below.
 */
export function ReviewActions({
  instance,
  classes,
}: {
  instance: InstanceDetail;
  classes: ClassInfo[];
}) {
  const update = useUpdateInstance(instance.instance_id);
  const [note, setNote] = useState("");
  // Only the reviewer's pick is local state, and it belongs to the class shown when it was
  // made: once the object's class changes (here or from the review queue), the pick lapses
  // and the dropdown shows the class as it is now.
  const current = instance.current_class_id;
  const [pick, setPick] = useState<{ value: number; base: number } | null>(null);
  const classId = pick && pick.base === current ? pick.value : current;
  const [saved, setSaved] = useState<string | null>(null);

  const save = (change: InstanceChange, what: string) => {
    setSaved(null);
    update.mutate(
      { ...change, ...(note.trim() ? { note } : {}) },
      {
        onSuccess: () => {
          setNote("");
          setPick(null);
          setSaved(what);
        },
      },
    );
  };
  const busy = update.isPending;

  return (
    <section aria-labelledby="review-heading" className="flex flex-col gap-2">
      <h3 id="review-heading" className={heading}>
        Review
      </h3>
      <div className="flex gap-2">
        <button
          type="button"
          className={button}
          disabled={busy || instance.review_status === "confirmed"}
          onClick={() => save({ review_status: "confirmed" }, "Confirmed")}
        >
          ✓ Confirm
        </button>
        <button
          type="button"
          className={button}
          disabled={busy || instance.review_status === "rejected"}
          onClick={() => save({ review_status: "rejected" }, "Rejected")}
        >
          ✕ Reject
        </button>
      </div>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="class-select">
          New class
        </label>
        <select
          id="class-select"
          value={classId}
          onChange={(e) => setPick({ value: Number(e.target.value), base: current })}
          className="min-w-0 flex-1 rounded-md border border-line px-2 py-1 text-sm"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={button}
          disabled={busy || classId === instance.current_class_id}
          onClick={() => save({ current_class_id: classId }, "Class changed")}
        >
          Change class
        </button>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted">Note (optional, saved with the next action)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          rows={2}
          className="rounded-md border border-line px-2 py-1"
        />
      </label>
      <p aria-live="polite" className="text-xs">
        {busy && <span className="text-muted">Saving…</span>}
        {update.isError && <span className="text-red-700">Not saved: {update.error.message}</span>}
        {saved && !busy && !update.isError && <span className="text-muted">{saved}. Saved.</span>}
      </p>
    </section>
  );
}
