# Tasks: `svg-diagram` skill

Spec: [spec-svg-diagram.md](spec-svg-diagram.md)

## Phase 1 — Scaffolding
- [x] 1.1 Create `skills/svg-diagram/` with `SKILL.md`, `scripts/`, `references/`.
- [x] 1.2 `scripts/package.json` (type: module) with `d3`, `jsdom`, `js-yaml`; `npm install`.
- [x] 1.3 Add `diagrams/` output folder.

## Phase 2 — Data model (`model.mjs`, spec §4)
- [x] 2.1 Load `component.yaml`; read optional `.md` frontmatter name.
- [x] 2.2 Title derivation (md name → CamelCase split fallback).
- [x] 2.3 API extraction: core by default, `--include security,management`; drop placeholder ids; de-dup; numeric sort; label; required flag; tooltip text.
- [x] 2.4 eTOM parsing: level from segment count, L2 + orphan L3/L4 rule, `--etom-levels all`.
- [x] 2.5 SID parsing: most-specific segment, suffix strip, CamelCase split, full-path tooltip.

## Phase 3 — Layout & rendering (`layout.mjs`, `render.mjs`, spec §5–6)
- [x] 3.1 Text-width estimator (Helvetica char-width table).
- [x] 3.2 Box sizing: eTOM stack + SID grid vs API row count.
- [x] 3.3 Draw with D3 into jsdom: title, box, eTOM rects, SID cylinders.
- [x] 3.4 Dependent-API sockets (left) and exposed-API lollipops (right), bold when required.
- [x] 3.5 Legend strip (eTOM, SID, dependent, exposed, bold = required).
- [x] 3.6 `<title>`/`<desc>` metadata, inline styles, deterministic output.
- [x] 3.7 CLI: `<TMFCxxx|all>`, `--out`, `--components-dir`, `--include`, `--etom-levels`; skip-missing-YAML handling.

## Phase 4 — TMFC001 reference render
- [x] 4.1 Render `diagrams/TMFC001-architecture.svg`.
- [x] 4.2 Visually compare against `components/TMFC001/media/product-catalog-management-architecture.png` (browser screenshot).
- [x] 4.3 Check spec §8 acceptance criteria 1–8.

## Phase 5 — Verification across all components
- [x] 5.1 `scripts/verify.mjs` (+ `gallery.mjs` review page): for each rendered SVG, count sockets/lollipops/rects/cylinders and compare against the model from YAML.
- [x] 5.2 Render `all`; eyeball the extremes: TMFC014 (0 dependent, 0 eTOM), TMFC002/TMFC007 (18 dependent), TMFC030 (23 eTOMs), TMFC035 (9 SIDs).

## Phase 6 — Skill quality (skill-creator loop)
- [x] 6.1 Write `SKILL.md` (trigger description, workflow, options, verification).
- [ ] 6.2 `evals/evals.json` with 2–3 realistic prompts; run with-skill vs baseline; review in eval viewer.
- [ ] 6.3 Iterate on feedback; optimise the description for triggering.
- [ ] 6.4 Package `.skill`.

## Phase 7 — Reference implementations (Helm charts) & function colours
- [x] 7.1 `loadChart()`: `helm template` → `kind: Component` → model; `--chart`, `--set`, `--values`, `--release`.
- [x] 7.2 Keep id-less APIs (metrics, MCP); placeholder-name filter; readable names from the published catalog.
- [x] 7.3 Colour-code APIs by function (core green, management blue, security red); group gaps; legend colour key.
- [x] 7.4 Compact box and legend when no eTOM/SID; two-line source note with helm args.
- [x] 7.5 Render `diagrams/reference/productcatalog-architecture.svg` (+ all-options variant); re-render and re-verify all 26 specs.
- [x] 7.6 Extend `verify.mjs` to cover charts (`--chart`): APIs per function, microservices, API and internal links.

## Phase 8 — Microservice internals for implementations
- [x] 8.1 `buildInternals()`: workloads, Service→workload by selector, exposed/dependent/internal links from `implementation` and env vars.
- [x] 8.2 Rounded-rect microservices in two columns (API-linked right, aligned to their APIs; others left); jobs dashed, databases marked.
- [x] 8.3 Faint function-coloured dashed links to exposed/dependent APIs; grey arrows for internal integrations; platform-services note.
- [x] 8.4 Legend: Microservice, Internal integration; wrap colour key to a second row when needed.
- [x] 8.5 Platform endpoints → management-function dependent APIs via `platform-apis.json` (TMF638 canvas info, OpenTelemetry collector).
- [x] 8.6 Route dependent-API lines level across the left column; keep left-column boxes off those rows (grow box if needed).
- [x] 8.7 Second chart: `component-reference-implementations/ProductOrderCaptureAndValidation` (TMFC002). Found dependent APIs wired via Canvas info discovery, not env names → added the `discoversDependentAPIs` rule. Verified default, `component.dependentAPIs.enabled=false` and `permissionspec.enabled=false` (TMF669 PartyRole) variants.
- [ ] 8.8 `verify.mjs --chart` compares the SVG with the same model it was drawn from; add an independent check (e.g. every `implementation` resolves, every declared dependent API has ≥1 link) and report gaps as warnings.

## Backlog (post-v1)
- [ ] Event diagram (published/subscribed events) per component.
- [ ] Multi-component wiring diagram (exposed ↔ dependent matches).
- [ ] PNG export via resvg.
