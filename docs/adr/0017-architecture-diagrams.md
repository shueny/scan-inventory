# 0017 · Architecture pictures as Excalidraw and SVG

Status: accepted (owner asked for Excalidraw, 2026-11-10) · 2026-11-10 · docs, after T10

## Context

The README explained the two runtimes with a Mermaid diagram. A reader still had to reconstruct where a review is stored, and which of the three point counts a sentence meant. The owner asked for the system design, the reasons, and Excalidraw.

## Options

- Keep Mermaid in the README. GitHub renders it, and it was already there. It does not give an editable Excalidraw file.
- Draw the `.excalidraw` files by hand and export SVG separately. The two copies drift the first time a label changes.
- Use `@excalidraw/utils` to export. That package is a browser bundle, so a docs script would pull in a browser build for three pictures.
- One Node script with no dependencies, `docs/diagrams/build.mjs`, writes the `.excalidraw` and the matching `.svg` from the same boxes and arrows.

## Decision

`docs/diagrams/build.mjs` is the source. It writes `system`, `view` and `review` as both `.excalidraw` and `.svg`. The SVG is what GitHub and `docs/ARCHITECTURE.md` show. The `.excalidraw` file is what a reader opens on excalidraw.com. Text is Helvetica, roughness 0.

## Consequences

- Running the script again overwrites hand edits to those six files.
- A label change rewrites the script and the six generated files together.
- The pictures describe the built system (private R2 and a Pages Function, [ADR 0015](0015-demo-hosting-cloudflare.md)), not the PRD's first plan of a public bucket.
