import type { ClassInfo } from "../data/types";
import { useViewStore, type ColorMode } from "../state/viewStore";

const MODES: { value: ColorMode; label: string }[] = [
  { value: "class", label: "Class" },
  { value: "rgb", label: "Scan colour" },
];

/** Left panel in T3: colour mode, background toggle and the class legend with counts. */
export function ClassLegend({ classes }: { classes: ClassInfo[] }) {
  const colorMode = useViewStore((s) => s.colorMode);
  const setColorMode = useViewStore((s) => s.setColorMode);
  const backgroundVisible = useViewStore((s) => s.backgroundVisible);
  const setBackgroundVisible = useViewStore((s) => s.setBackgroundVisible);

  const objects = classes.filter((c) => !c.is_background);
  const background = classes.filter((c) => c.is_background);

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
          Colour by
        </legend>
        <div className="inline-flex rounded-md border border-line p-0.5" role="radiogroup">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={colorMode === m.value}
              onClick={() => setColorMode(m.value)}
              className={`rounded px-2.5 py-1 text-sm ${
                colorMode === m.value ? "bg-ink text-white" : "text-ink hover:bg-canvas"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={backgroundVisible}
          onChange={(e) => setBackgroundVisible(e.target.checked)}
          className="size-4 accent-ink"
        />
        Show structure and floor
      </label>

      <section aria-labelledby="classes-heading">
        <h2
          id="classes-heading"
          className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase"
        >
          Classes
        </h2>
        <ul className="flex flex-col">
          {objects.map((c) => (
            <ClassRow key={c.id} cls={c} />
          ))}
        </ul>
        <ul className="mt-2 flex flex-col border-t border-line pt-2">
          {background.map((c) => (
            <ClassRow key={c.id} cls={c} dimmed={!backgroundVisible} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function ClassRow({ cls, dimmed = false }: { cls: ClassInfo; dimmed?: boolean }) {
  return (
    <li className={`flex items-center gap-2 py-0.5 text-sm ${dimmed ? "opacity-40" : ""}`}>
      <span
        aria-hidden
        className="size-3 shrink-0 rounded-sm border border-black/10"
        style={{ backgroundColor: cls.color }}
      />
      <span className="flex-1 truncate">{cls.name}</span>
      <span className="text-xs text-muted tabular-nums">{cls.instance_count}</span>
    </li>
  );
}
