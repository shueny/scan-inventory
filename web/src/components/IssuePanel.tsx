import { useState } from "react";
import { useResolveIssue } from "../data/hooks";
import type { ClassInfo, Instance, Issue, Resolution } from "../data/types";
import { closingEvent, DISMISS_LABEL, issueActions, TYPE_LABEL } from "../domain/issues";
import { useViewStore } from "../state/viewStore";
import { SeverityBadge } from "./SeverityBadge";
import { describeEvent } from "./ReviewHistory";

const heading = "mb-1.5 text-xs font-medium tracking-wide text-muted uppercase";
const button =
  "rounded-md border border-line px-2.5 py-1 text-left text-sm hover:bg-canvas disabled:opacity-50";

/**
 * One issue: what is wrong, the objects it is about, and the actions that fit its type
 * (domain/issues.ts). A closed issue shows who closed it, when, and what changed.
 */
export function IssuePanel({
  issue,
  instances,
  classes,
}: {
  issue: Issue;
  instances: Instance[];
  classes: ClassInfo[];
}) {
  const select = useViewStore((s) => s.select);
  const byId = new Map(instances.map((i) => [i.instance_id, i]));
  const className = (id: number | null) => classes.find((c) => c.id === id)?.name ?? String(id);

  return (
    <article aria-labelledby="issue-heading" className="flex flex-col gap-3 text-sm">
      <header>
        <p className="flex items-center gap-2 text-xs text-muted">
          <SeverityBadge severity={issue.severity} /> {TYPE_LABEL[issue.type]}
        </p>
        <h2 id="issue-heading" className="mt-1 font-semibold">
          {issue.title}
        </h2>
        <p className="mt-1 text-muted">{issue.detail}</p>
      </header>

      {issue.instance_ids.length > 0 && (
        <section aria-labelledby="issue-objects">
          <h3 id="issue-objects" className={heading}>
            Objects
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {issue.instance_ids.map((id) => {
              const inst = byId.get(id);
              return (
                <li key={id}>
                  <button type="button" className={button} onClick={() => select(id)}>
                    {inst?.tag ?? `#${id}`} · {className(inst?.current_class_id ?? null)}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {issue.status === "open" ? (
        <Resolve issue={issue} classes={classes} className={className} />
      ) : (
        <Closed issue={issue} classes={classes} />
      )}
    </article>
  );
}

function Resolve({
  issue,
  classes,
  className,
}: {
  issue: Issue;
  classes: ClassInfo[];
  className: (id: number | null) => string;
}) {
  const resolve = useResolveIssue();
  const [note, setNote] = useState("");
  const firstCandidate = issue.candidate_tags[0]?.tag ?? "";
  const [tag, setTag] = useState(firstCandidate);
  const [classId, setClassId] = useState(issue.suggested_class_id ?? classes[0]?.id ?? 0);
  const actions = issueActions(issue);
  const busy = resolve.isPending;

  const send = (resolution: Resolution) =>
    resolve.mutate({
      issueId: issue.issue_id,
      resolution: { ...resolution, ...(note.trim() ? { note } : {}) },
    });

  return (
    <section aria-labelledby="resolve-heading" className="flex flex-col gap-2">
      <h3 id="resolve-heading" className={heading}>
        Resolve
      </h3>

      {actions.includes("accept_suggestion") && (
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => send({ action: "accept_suggestion" })}
        >
          ✓ Accept: change class to {className(issue.suggested_class_id)}
        </button>
      )}

      {actions.includes("assign_tag") && (
        <fieldset className="flex flex-col gap-1 rounded-md border border-line p-2">
          <legend className="px-1 text-xs text-muted">Assign a P&amp;ID tag</legend>
          {issue.candidate_tags.map((c) => (
            <label key={c.tag} className="flex items-center gap-2">
              <input
                type="radio"
                name="candidate"
                checked={tag === c.tag}
                onChange={() => setTag(c.tag)}
                className="accent-ink"
              />
              <span className="font-medium">{c.tag}</span>
              <span className="text-xs text-muted">
                {c.system ?? "no system"}
                {c.distance_m !== null && ` · ${c.distance_m.toFixed(2)} m away`}
              </span>
            </label>
          ))}
          {issue.candidate_tags.length > 0 && (
            <p className="text-xs text-muted">
              Suggestions only: unlinked P&amp;ID tags of the same kind, nearest first.
            </p>
          )}
          <label className="flex items-center gap-2">
            <span className="text-xs text-muted">Tag</span>
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              maxLength={64}
              className="min-w-0 flex-1 rounded-md border border-line px-2 py-1"
            />
          </label>
          <button
            type="button"
            className={button}
            disabled={busy || !tag.trim()}
            onClick={() => send({ action: "assign_tag", tag })}
          >
            Assign tag
          </button>
        </fieldset>
      )}

      {actions.includes("change_class") && (
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="issue-class">
            Class for the object
          </label>
          <select
            id="issue-class"
            value={classId}
            onChange={(e) => setClassId(Number(e.target.value))}
            className="min-w-0 flex-1 rounded-md border border-line px-2 py-1"
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
            disabled={busy}
            onClick={() => send({ action: "change_class", class_id: classId })}
          >
            Change class
          </button>
        </div>
      )}

      <button
        type="button"
        className={button}
        disabled={busy}
        onClick={() => send({ action: "dismiss" })}
      >
        ✕ {DISMISS_LABEL[issue.type]}
      </button>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Note (optional, saved with the action)</span>
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
        {resolve.isError && (
          <span className="text-red-700">Not saved: {resolve.error.message}</span>
        )}
      </p>
    </section>
  );
}

function Closed({ issue, classes }: { issue: Issue; classes: ClassInfo[] }) {
  const closing = closingEvent(issue);
  const changes = issue.history.filter((e) => e.action !== "close_issue");
  return (
    <section aria-labelledby="closed-heading" className="flex flex-col gap-2">
      <h3 id="closed-heading" className={heading}>
        {issue.status === "dismissed" ? "Dismissed" : "Resolved"}
      </h3>
      {closing && (
        <p>
          By {closing.actor},{" "}
          <time dateTime={closing.created_at}>{new Date(closing.created_at).toLocaleString()}</time>
        </p>
      )}
      {changes.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {changes.map((e) => (
            <li key={e.id} className="border-l-2 border-line pl-2">
              {e.instance_id !== null && <span className="text-muted">#{e.instance_id} </span>}
              {describeEvent(e, classes)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">No object was changed.</p>
      )}
      {closing?.note && <p className="text-muted">“{closing.note}”</p>}
    </section>
  );
}
