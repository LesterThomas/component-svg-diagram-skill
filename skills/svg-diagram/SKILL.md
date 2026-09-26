---
name: svg-diagram
description: Generate SVG architecture diagrams for TM Forum ODA Components (TMFCxxx) from their component.yaml — or from a component's Helm chart / reference implementation, compiled with helm template — rendered with D3 — a component box with its eTOM business activities and SID data entities, dependent APIs as sockets on the left and exposed APIs as lollipops on the right, plus a legend. Use this whenever the user asks for an architecture diagram, component diagram, API diagram, "exposed and dependent APIs" picture, or an SVG/vector version of a component's architecture PNG for any TMFC component or ODA component Helm chart (e.g. "draw TMFC001", "diagram for Product Catalog Management", "regenerate all component diagrams", "diagram the ProductCatalog reference implementation", "show which APIs TMFC007 depends on as a picture") — even if they don't say "SVG" or "D3".
---

# svg-diagram

Turns `components/{TMFCxxx}/component.yaml` into a standalone, deterministic
SVG in the style of the ODA Component Specification PDFs
(`components/TMFC001/media/product-catalog-management-architecture.png` is the
style reference). Full design: `spec/spec-svg-diagram.md` in the repo.

The rendering is done by bundled Node scripts, so don't hand-write SVG or
re-implement the layout — run the scripts, then check the result. Hand-built
diagrams drift from the YAML and from each other; the script keeps every
component consistent and re-runnable.

## Workflow

1. **Install once** (if `skills/svg-diagram/scripts/node_modules` is missing):
   ```bash
   npm install --prefix skills/svg-diagram/scripts
   ```
2. **Render** from the repo root (the folder that contains `components/`):
   ```bash
   node skills/svg-diagram/scripts/render.mjs TMFC001
   node skills/svg-diagram/scripts/render.mjs all
   ```
   Output goes to `diagrams/{id}-architecture.svg`. The script prints the
   counts it drew (dependent / exposed / eTOM / SID) — mention these to the user.
   For a **Helm chart** (a reference implementation — any folder with a
   `Chart.yaml` whose templates produce a `kind: Component`):
   ```bash
   node skills/svg-diagram/scripts/render.mjs --chart component-reference-implementations/ProductCatalog
   ```
   This runs `helm template` (Helm 3 must be on PATH), picks out the Component
   document and writes `diagrams/reference/{chart}-architecture.svg`. Charts
   often gate APIs behind values (MCP servers, dependent APIs, alternative
   security APIs); the default render shows what deploys with default values.
   Read `values.yaml` and the component template for `if .Values…` switches,
   tell the user which optional APIs exist, and render a variant with
   `--set key=value` (repeatable) or `--values file.yaml` when that's useful.
3. **Verify** the SVG matches the YAML (published components):
   ```bash
   node skills/svg-diagram/scripts/verify.mjs TMFC001     # or no ids = all
   ```
4. **Look at it** when a browser is available (open the `.svg` directly; for
   many diagrams build `diagrams/index.html` with
   `node skills/svg-diagram/scripts/gallery.mjs`). Check that labels don't
   collide and nothing spills outside the box.

## Options (`render.mjs`)

| Option | Default | Use when |
| --- | --- | --- |
| `--out PATH` | `diagrams/` | user wants a different file or folder. Only write into `components/*/media/` if they explicitly ask. |
| `--include security,management` | core only | user wants security/management-function APIs too (e.g. TMF669 on the security side). Placeholder ids like `exposedAPI_id` are always dropped. |
| `--etom-levels all` | `2` | user wants L3/L4 activities listed individually instead of rolled up under their L2. |
| `--components-dir DIR` | `components` | components live elsewhere. Also used to borrow readable API names and the component title for charts. |
| `--chart DIR` | — | render a Helm chart instead of a published component. |
| `--set k=v`, `--values F`, `--release R` | chart defaults, `r1` | passed to `helm template`. |

For charts, `--include` defaults to **all three functions** — an implementation
deploys its management and security APIs and they're part of what the user
wants to see. Pass `--include none` for core only. For published specs the
default is core only, matching the PDF diagrams.

## What gets drawn — and why it may differ from the PDF image

Content always comes from `component.yaml`; the PNG/.puml in `media/` are only
a style reference. They often disagree (TMFC001's YAML has L2 eTOMs 1.1.19 and
1.2.8 that the PNG omits) because TM Forum publishes the YAML and PDF on
separate schedules — `components/AGENTS.md` forbids reconciling them. So draw
the YAML and, if the user compares against the PNG, explain the difference
rather than "fixing" it.

Mapping rules (details in `references/data-mapping.md`):

- Dependent APIs ← `*Function.dependentAPIs`, left side; exposed ← `*Function.exposedAPIs`, right side. Grouped by function and **colour-coded: core = subtle green, management = subtle blue, security = subtle red**; within a group sorted by TMF number. **Bold = `required: true`**. An API can legitimately appear on both sides (TMF620 in TMFC001).
- APIs without a TMF id (Prometheus `metrics`, MCP servers) are drawn as `Name (apiType)`. Terse implementation names (`productcatalogmanagement`) get the readable name for that TMF id from the published components.
- eTOMs: every L2; an L3/L4 is shown only if no ancestor is listed. None → an italic placeholder row for a spec; implementations carry no eTOM/SID mapping, so their box is left compact and says so.
- SIDs: most specific ABE/BE name, 3-column cylinder grid; full path in the tooltip.
- Hover tooltips (`<title>`) carry API versions/resources and full eTOM/SID ids.

Components without a `component.yaml` (TMFC013, 015, 032, 033, 051) are
unpublished — say so; don't invent a diagram from the `.md`.

## Changing the look

Layout constants (spacing, colours, font) are the `L` and `C` objects at the
top of `scripts/layout.mjs`; data rules live in `scripts/model.mjs`. After any
change, re-run `render.mjs all` and `verify.mjs` so every component is checked,
not just the one being looked at.
