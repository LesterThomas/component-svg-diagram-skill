# Spec: `svg-diagram` skill — ODA Component architecture diagrams as SVG

Status: draft v0.2 · 2026-09-26 (v0.2: Helm-chart input, function colour coding)

## 1. Purpose

Give Claude a repeatable, deterministic way to turn a TM Forum ODA Component
definition (`components/{TMFCxxx}/component.yaml`) into a **standalone SVG
architecture diagram**, rendered with **D3**, in the visual language of the
Component Specification PDFs (see the reference
`components/TMFC001/media/product-catalog-management-architecture.png`):

- a dark component box titled `TMFCxxx: COMPONENT NAME`
- eTOM business activities as white rectangles inside the box
- SID data entities (ABEs) as cylinders inside the box
- **dependent APIs** entering on the **left** as socket (half-circle) connectors
- **exposed APIs** leaving on the **right** as lollipop (circle) connectors
- a legend strip along the bottom

The PNG is a *style* reference, not a *content* reference: content always
comes from the YAML (§4.4).

## 2. Scope

In scope (v1)

- One diagram per component, for any of the 26 components that have a `component.yaml`.
- Batch mode: render every component in `components/`.
- Core-function exposed/dependent APIs (default), with opt-in inclusion of
  security- and management-function APIs.
- Deterministic output: same YAML in → byte-identical SVG out.

Out of scope (v1, candidates for later — see tasks Phase 6)

- Event (published/subscribed) diagrams.
- Multi-component interaction diagrams (wiring exposed → dependent across components).
- PNG/PDF rasterisation.
- Editing any file under `components/` (the skill is read-only on source data).

## 3. Inputs

| Source | Used for | Required |
| --- | --- | --- |
| `components/{id}/component.yaml` | everything drawn | yes |
| `components/{id}/{id}.md` frontmatter `name:` | human title ("Product Catalog Management") | no — falls back to splitting `componentMetadata.name` CamelCase |
| `components/{id}/component.meta.json` | not used for drawing; version shown in footer | no |
| `components/{id}/media/*-architecture.puml/png` | visual comparison only (never parsed for content) | no |

Components with no `component.yaml` (TMFC013/015/032/033/051) are skipped
with a clear message, never an error in batch mode.

### 3.1 Helm chart input (reference implementations)

A chart directory (e.g. `component-reference-implementations/ProductCatalog`)
is compiled with `helm template r1 <dir> [--set …] [-f …]`; the one
`kind: Component` document in the output is modelled exactly like a
published `component.yaml`, with these differences:

- `managementFunction`/`securityFunction` APIs are shown by default (`--include none` hides them).
- APIs without a TMF id (`metrics`/prometheus, MCP servers) are kept, labelled `Name (apiType)`.
- Terse names (`productcatalogmanagement`) take the readable name for that TMF id from the published components.
- No eTOM/SID → compact box noting the implementation has no eTOM/SID mapping.
- Values-gated APIs (`if .Values…`) follow the chosen values; the note under the box records the exact `helm template` arguments.

Output: `diagrams/reference/{chart}-architecture.svg`.

## 4. Data mapping

YAML paths are relative to `spec:`.

### 4.1 Title

`{componentMetadata.id}: {NAME}` upper-cased. Name comes from `.md`
frontmatter if present, else `componentMetadata.name` with CamelCase split
(`ProductCatalogManagement` → `Product Catalog Management`).

### 4.2 APIs

| Diagram element | YAML source |
| --- | --- |
| Exposed (right, lollipop) | `coreFunction.exposedAPIs[]` |
| Dependent (left, socket) | `coreFunction.dependentAPIs[]` |
| + with `--include security` | `securityFunction.exposedAPIs[]` / `.dependentAPIs[]` |
| + with `--include management` | `managementFunction.exposedAPIs[]` / `.dependentAPIs[]` |

Rules:

- **Label** = `{id} {Title Name}` where Title Name is `name` minus a trailing
  `-api`, hyphens → spaces, title-cased
  (`party-role-management-api` → `TMF669 Party Role Management`).
- **Placeholder entries are dropped**: an API whose `id` does not match
  `^TMF\d+$` (e.g. `exposedAPI_id`, `dependentAPI_id` in management
  templates) is not drawn.
- **De-duplicate** by `id` within each side; **sort** by numeric id.
- The same API may appear on both sides (TMF620 in TMFC001) — draw it on both.
- **`required: true`** → label rendered bold; optional → regular. The legend
  explains this.
- **Function colour coding**: connector, glyph and a label pill are tinted by
  function — core subtle green, management subtle blue, security subtle red.
  Each side is grouped core → management → security with a small gap between
  groups. The legend adds a colour key when more than one function is shown
  (always for implementations).
- Every connector group carries a `<title>` tooltip listing version and
  resources (e.g. `catalog: GET, GET /id, POST…`).

### 4.3 eTOM business activities

Source: `componentMetadata.eTOMs[]`, format `id|Name_With_Underscores|version`.

- Level = number of id segments − 1 (`1.2.20` → L2, `1.2.8.7` → L3).
- **Show every L2**. Show an L3/L4 only if none of its ancestors is listed
  (so nothing silently disappears, but the box stays at the PDF's L2 grain).
- Label `L{n} - {Name}`, underscores → spaces. Sort by numeric id.
- Zero eTOMs (e.g. TMFC014) → a single muted placeholder "No eTOM business activities assigned".

### 4.4 SID data entities

Source: `componentMetadata.SIDs[]`, format
`Domain|ABE[|SubABE_or_BE]|version`.

- Label = most specific entity segment, with `_ABE`/`_BE` suffix removed,
  underscores → spaces, CamelCase split
  (`ProductConfigSpec_BE` → `Product Config Spec`).
- Full path goes in a `<title>` tooltip.
- Laid out in a 3-column grid of cylinders, YAML order preserved.
- Zero SIDs → the SID row is omitted.

### 4.5 Source-of-truth rule

If YAML and the reference PNG/PDF disagree (they do for TMFC001: YAML lists
L2 `1.1.19` Loyalty Program Management and `1.2.8` Product Capacity
Management which the PNG omits), **draw the YAML**. Never reconcile, never
hand-copy content from the PNG/.puml. (Matches `components/AGENTS.md` rule 2/4.)

## 5. Layout

All measurements in px; SVG `viewBox` sized to content.

```
┌ title ───────────────────────────────────────────────┐
│              ┌──── component box (#404040) ────┐      │
│ label        │  [ L2 - eTOM activity        ]  │  label
│ ──────)──────┤  [ L2 - …                    ]  ├──────○
│ label        │                                  │  label
│ ──────)──────┤  (SID)   (SID)   (SID)            ├──────○
│              └──────────────────────────────────┘      │
│ ( LEGEND  ▭ eTOM   ⛁ SID   )─ Dependent   ─○ Exposed ) │
└───────────────────────────────────────────────────────┘
```

- **Box height** = max(eTOM stack + SID grid + padding, API rows × row pitch).
- **API rows** evenly spaced down the box's height on each side, independently
  (left and right sides may have different counts).
- **Label widths** estimated from a per-character Helvetica width table
  (no browser text-metrics in Node); side gutters sized to the longest label.
- Colours: box `#404040`, activity/cylinder fill `#fff` stroke `#000`, connectors
  `#000`, labels `#000` on a white page. Font `Arial, Helvetica, sans-serif`, 12px.
- Styles are **inline attributes** (not CSS classes) so the SVG renders the same
  when embedded in Markdown, Confluence, PowerPoint or converted by rsvg/Inkscape.

## 6. Output

- Default path: `diagrams/{id}-architecture.svg` (repo root). Override with `--out`.
- Standalone SVG 1.1 with `xmlns`, `viewBox`, `width`, `height`, `<title>` and
  `<desc>` (component id, YAML version, generator).
- Never written into `components/` unless `--out` explicitly points there.

## 7. Implementation

```
skills/svg-diagram/
├── SKILL.md                     when/how to use, options, verification steps
├── scripts/
│   ├── package.json             deps: d3, jsdom, js-yaml
│   ├── render.mjs               CLI: node render.mjs <TMFCxxx|all> [opts]
│   ├── model.mjs                YAML → diagram model (pure, testable)
│   ├── layout.mjs               model → positioned shapes; D3 draws them
│   ├── verify.mjs               SVG ↔ YAML count/id check (§8)
│   └── gallery.mjs              diagrams/index.html with every SVG inlined
└── references/
    └── data-mapping.md          §4 of this spec, for the agent to consult
```

- Runtime: Node ≥ 18 (repo has 22). D3 draws into a `jsdom` document; the
  serialised `<svg>` is written to disk.
- CLI options: `--components-dir` (default `components`), `--out`,
  `--include security,management`, `--etom-levels all|2`.
- Exit non-zero on a malformed YAML for a single id; in `all` mode, log and continue.

## 8. Acceptance criteria

For TMFC001:

1. `diagrams/TMFC001-architecture.svg` exists, parses as XML, root is `<svg>` with a `viewBox`.
2. Title text is `TMFC001: PRODUCT CATALOG MANAGEMENT`.
3. Exactly 10 dependent-API sockets on the left: TMF620, 632, 633, 634, 651, 662, 669, 673, 674, 675.
4. Exactly 3 exposed-API lollipops on the right: TMF620 (bold, required), TMF671, TMF701.
5. 9 L2 eTOM rectangles (incl. 1.1.19 and 1.2.8); no L3/L4 rectangles.
6. 6 SID cylinders.
7. Legend with the four element types plus the required/optional note.
8. No text overflows the component box or overlaps another label.

For all components: every component with a YAML renders without error, and
the counts in the SVG match the YAML (checked by a script, tasks Phase 5).
