// Builds the architecture pictures from one description.
// Run from the repo root: node docs/diagrams/build.mjs
// Writes a .excalidraw file (open it on excalidraw.com) and an .svg next to it.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const INK = "#1e1e1e";
const MUTED = "#495057";
const FONT = "Helvetica, Arial, sans-serif";
const LINE = 18;

function scene() {
  const elements = [];
  let n = 0;
  const boxes = [];

  const add = (el) => {
    n += 1;
    elements.push({
      id: el.id,
      type: el.type,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      angle: 0,
      strokeColor: el.strokeColor ?? INK,
      backgroundColor: el.backgroundColor ?? "transparent",
      fillStyle: "solid",
      strokeWidth: el.strokeWidth ?? 2,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: `a${String(n).padStart(4, "0")}`,
      roundness: el.type === "rectangle" ? { type: 3 } : null,
      seed: hash(el.id),
      version: 1,
      versionNonce: hash(el.id + "n"),
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
      ...el.extra,
    });
  };

  function text(id, x, y, body, size, color, align) {
    const lines = body.split("\n");
    const width = Math.max(...lines.map((l) => l.length)) * size * 0.62;
    const height = lines.length * size * 1.25;
    add({
      id,
      type: "text",
      x,
      y,
      width,
      height,
      strokeColor: color,
      backgroundColor: "transparent",
      strokeWidth: 1,
      extra: {
        text: body,
        fontSize: size,
        fontFamily: 2,
        textAlign: align,
        verticalAlign: "top",
        containerId: null,
        originalText: body,
        autoResize: true,
        lineHeight: 1.25,
      },
    });
    return { width, height };
  }

  function box(id, x, y, w, h, body, fill) {
    add({
      id,
      type: "rectangle",
      x,
      y,
      width: w,
      height: h,
      backgroundColor: fill,
    });
    const lines = body.split("\n");
    const longest = Math.max(...lines.map((l) => l.length));
    const need = 24 + longest * 8.2;
    if (need > w) console.warn(`tight: ${id} needs ${Math.ceil(need)} has ${w}`);
    const blockH = lines.length * LINE;
    text(`${id}-label`, x + 12, y + (h - blockH) / 2, body, 15, INK, "left");
    const b = { id, x, y, w, h };
    boxes.push(b);
    return b;
  }

  function title(id, x, y, body) {
    text(id, x, y, body, 20, INK, "left");
  }

  function caption(id, x, y, body) {
    text(id, x, y, body, 14, MUTED, "left");
  }

  function arrow(id, x1, y1, x2, y2) {
    add({
      id,
      type: "arrow",
      x: x1,
      y: y1,
      width: Math.abs(x2 - x1) || 1,
      height: Math.abs(y2 - y1) || 1,
      backgroundColor: "transparent",
      extra: {
        points: [
          [0, 0],
          [x2 - x1, y2 - y1],
        ],
        lastCommittedPoint: null,
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: "arrow",
        elbowed: false,
      },
    });
  }

  function hArrow(id, from, to) {
    const x1 = from.x + from.w;
    const y1 = from.y + from.h / 2;
    const x2 = to.x;
    const y2 = to.y + to.h / 2;
    arrow(id, x1, y1, x2, y2);
  }

  return { elements, boxes, box, title, caption, hArrow, arrow, text };
}

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function check(name, boxes) {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlaps(boxes[i], boxes[j])) {
        throw new Error(`${name}: ${boxes[i].id} overlaps ${boxes[j].id}`);
      }
    }
  }
}

function system() {
  const s = scene();
  s.title("title", 28, 16, "One pipeline, two runtimes");
  s.caption(
    "subtitle",
    28,
    46,
    "The scan is processed once. Both runtimes only read the files it wrote.",
  );

  const source = s.box(
    "source",
    28,
    88,
    210,
    132,
    "Source scan\nnora.ply, 3.25 GB\n151.9M source points\nclasses and P&ID",
    "#ffec99",
  );
  const pipeline = s.box(
    "pipeline",
    292,
    88,
    250,
    132,
    "Offline pipeline\nPython, chunked reads\ninstances, issues, scan\nLAS, then PotreeConverter",
    "#a5d8ff",
  );
  const json = s.box(
    "json",
    596,
    80,
    270,
    68,
    "Inventory JSON\ninstances, issues, scan",
    "#d3f9d8",
  );
  const tiles = s.box(
    "tiles",
    596,
    164,
    270,
    68,
    "Potree tiles\nmetadata + octree.bin",
    "#d3f9d8",
  );
  const note = s.box(
    "note",
    900,
    100,
    240,
    112,
    "Points stay files.\nPostgres stores the\ninventory and the\nreview log only.",
    "#fff4e6",
  );

  s.hArrow("a-source", source, pipeline);
  s.hArrow("a-json", pipeline, json);
  s.hArrow("a-tiles", pipeline, tiles);

  s.caption("local-h", 28, 252, "Local full mode");
  const browser = s.box("browser", 28, 284, 150, 56, "Browser\none origin", "#e7f5ff");
  const nginx = s.box(
    "nginx",
    230,
    276,
    210,
    88,
    "nginx :8088\napp, /api proxy\n/potree with Range",
    "#a5d8ff",
  );
  const api = s.box("api", 492, 268, 180, 52, "FastAPI\none transaction", "#a5d8ff");
  const db = s.box(
    "db",
    724,
    252,
    230,
    84,
    "PostgreSQL 16\nseeded inventory\nappend-only review_event",
    "#ffd8a8",
  );
  s.hArrow("a-browser", browser, nginx);
  s.hArrow("a-nginx", nginx, api);
  s.hArrow("a-api", api, db);

  s.caption("demo-h", 28, 400, "Invitation demo");
  const dbrowser = s.box("dbrowser", 28, 436, 150, 72, "Browser\nAccess email", "#e7f5ff");
  const pages = s.box(
    "pages",
    230,
    428,
    210,
    88,
    "Cloudflare Pages\nstatic app\n/r2 Function",
    "#a5d8ff",
  );
  const r2 = s.box(
    "r2",
    492,
    428,
    200,
    88,
    "Private R2\ntiles and JSON\nunder v1/",
    "#d3f9d8",
  );
  const local = s.box(
    "local",
    744,
    436,
    250,
    72,
    "Review events\nstay in this browser\nsame event shape",
    "#ffd8a8",
  );
  s.hArrow("a-dbr", dbrowser, pages);
  s.hArrow("a-pages", pages, r2);
  s.hArrow("a-local", r2, local);

  s.caption(
    "foot",
    28,
    540,
    "CI deploys the app. The owner uploads the tiles and JSON. The demo has no API and no database.",
  );

  check("system", s.boxes);
  return s.elements;
}

function view() {
  const s = scene();
  s.title("title", 28, 16, "What a view loads");
  s.caption(
    "subtitle",
    28,
    46,
    "The loader walks the octree. It does not take every source point.",
  );

  const source = s.box(
    "source",
    28,
    96,
    180,
    88,
    "Source points\n151.9M in the ply\nabout 20M in the\ndemo tiles",
    "#ffec99",
  );
  const octree = s.box(
    "octree",
    260,
    108,
    190,
    64,
    "Potree octree\nroot, then children",
    "#d3f9d8",
  );
  const refine = s.box(
    "refine",
    502,
    96,
    210,
    88,
    "Refine a child when\nits sphere projects\nto at least 50 px",
    "#a5d8ff",
  );
  const budget = s.box(
    "budget",
    764,
    96,
    210,
    88,
    "Stop at the point\nbudget: 3M points\nselected for the view",
    "#a5d8ff",
  );
  s.hArrow("a1", source, octree);
  s.hArrow("a2", octree, refine);
  s.hArrow("a3", refine, budget);

  const click = s.box("click", 28, 248, 170, 52, "Click in the view", "#e7f5ff");
  const pick = s.box(
    "pick",
    250,
    228,
    250,
    92,
    "GPU pick\nreads point source id\nthat point's object",
    "#d0bfff",
  );
  const select = s.box("select", 552, 240, 190, 68, "Object selected\ncamera flies to it", "#e7f5ff");
  const miss = s.box(
    "miss",
    250,
    360,
    280,
    72,
    "If no point is hit\nsmallest box on the ray",
    "#ffd8a8",
  );
  s.hArrow("a4", click, pick);
  s.hArrow("a5", pick, select);
  s.arrow("a6", pick.x + pick.w / 2, pick.y + pick.h, miss.x + miss.w / 2, miss.y);

  s.caption(
    "foot",
    28,
    456,
    "Hiding structure still counts those points in the budget. The shader discards them afterwards.",
  );

  check("view", s.boxes);
  return s.elements;
}

function review() {
  const s = scene();
  s.title("title", 28, 16, "What a review writes");
  s.caption(
    "subtitle",
    28,
    46,
    "The panels talk to one interface. The build picks which side runs.",
  );

  const panels = s.box("panels", 28, 168, 160, 72, "React panels\nno direct fetch", "#e7f5ff");
  const iface = s.box(
    "iface",
    240,
    156,
    200,
    96,
    "ScanDataSource\nsame methods\n404, 422 and 409",
    "#d0bfff",
  );
  const api = s.box(
    "api",
    500,
    92,
    250,
    96,
    "ApiDataSource\nFastAPI, one transaction\nappend review_event\nsecond close is 409",
    "#a5d8ff",
  );
  const stat = s.box(
    "static",
    500,
    220,
    270,
    96,
    "StaticDataSource\nappend the same event\nin this browser\nreplay it onto the JSON",
    "#ffd8a8",
  );
  s.hArrow("a1", panels, iface);
  s.hArrow("a2", iface, api);
  s.hArrow("a3", iface, stat);

  s.caption("check", 28, 352, "Checked the same way on both sides");
  s.box(
    "types",
    28,
    384,
    250,
    72,
    "OpenAPI schema\ngenerated TypeScript\na test if they drift",
    "#d3f9d8",
  );
  s.box(
    "contract",
    310,
    384,
    250,
    72,
    "One contract suite\nboth adapters\nthe same fixture data",
    "#d3f9d8",
  );

  s.caption(
    "foot",
    28,
    480,
    "A class correction updates the inventory record. The point colour lives in the tiles and is not rewritten.",
  );

  check("review", s.boxes);
  return s.elements;
}

function bounds(elements) {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = 0;
  let y2 = 0;
  for (const el of elements) {
    if (el.type === "arrow") {
      for (const [px, py] of el.points) {
        x1 = Math.min(x1, el.x + px);
        y1 = Math.min(y1, el.y + py);
        x2 = Math.max(x2, el.x + px);
        y2 = Math.max(y2, el.y + py);
      }
    } else {
      x1 = Math.min(x1, el.x);
      y1 = Math.min(y1, el.y);
      x2 = Math.max(x2, el.x + el.width);
      y2 = Math.max(y2, el.y + el.height);
    }
  }
  return { x1: x1 - 24, y1: y1 - 16, x2: x2 + 24, y2: y2 + 28 };
}

function esc(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toSvg(elements) {
  const b = bounds(elements);
  const w = Math.ceil(b.x2 - b.x1);
  const h = Math.ceil(b.y2 - b.y1);
  const ox = -b.x1;
  const oy = -b.y1;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 1.2 L 9 5 L 0 8.8 z" fill="${INK}"/></marker></defs>`,
  ];
  for (const el of elements) {
    if (el.type === "rectangle") {
      parts.push(
        `<rect x="${el.x + ox}" y="${el.y + oy}" width="${el.width}" height="${el.height}" rx="8" fill="${el.backgroundColor}" stroke="${el.strokeColor}" stroke-width="1.5"/>`,
      );
    } else if (el.type === "arrow") {
      const [p0, p1] = el.points;
      parts.push(
        `<line x1="${el.x + p0[0] + ox}" y1="${el.y + p0[1] + oy}" x2="${el.x + p1[0] + ox}" y2="${el.y + p1[1] + oy}" stroke="${INK}" stroke-width="1.5" marker-end="url(#arrow)"/>`,
      );
    } else if (el.type === "text") {
      const lines = el.text.split("\n");
      const size = el.fontSize;
      const x = el.x + ox;
      const y = el.y + oy + size;
      const tspans = lines
        .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : LINE}">${esc(line)}</tspan>`)
        .join("");
      const weight = lines.length > 1 ? ` font-weight="600"` : "";
      parts.push(
        `<text x="${x}" y="${y}" fill="${el.strokeColor}" font-family="${FONT}" font-size="${size}"${weight}>${tspans}</text>`,
      );
      if (lines.length > 1) {
        // First line is the name. Later lines go back to normal weight via a second text node.
        // The single text node above is all semibold. Replace with two weights below.
        parts.pop();
        const rest = lines
          .slice(1)
          .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? LINE : LINE}">${esc(line)}</tspan>`)
          .join("");
        parts.push(
          `<text x="${x}" y="${y}" fill="${el.strokeColor}" font-family="${FONT}" font-size="${size}" font-weight="600">${esc(lines[0])}</text>`,
        );
        if (rest) {
          parts.push(
            `<text x="${x}" y="${y}" fill="${MUTED}" font-family="${FONT}" font-size="${size}">${rest}</text>`,
          );
        }
      }
    }
  }
  parts.push("</svg>");
  return parts.join("\n");
}

function toExcalidraw(elements) {
  return {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements,
    appState: {
      gridSize: null,
      viewBackgroundColor: "#ffffff",
    },
    files: {},
  };
}

const pictures = [
  ["system", system],
  ["view", view],
  ["review", review],
];

for (const [name, build] of pictures) {
  const elements = build();
  writeFileSync(join(dir, `${name}.excalidraw`), `${JSON.stringify(toExcalidraw(elements), null, 2)}\n`);
  writeFileSync(join(dir, `${name}.svg`), `${toSvg(elements)}\n`);
  console.log(`wrote ${name}`);
}
