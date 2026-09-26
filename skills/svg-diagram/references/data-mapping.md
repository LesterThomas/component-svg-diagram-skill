# component.yaml → diagram mapping

Paths are relative to `spec:`. Implemented in `scripts/model.mjs`.

## Title
`{componentMetadata.id}: {NAME}` upper-case. NAME = `{id}.md` frontmatter
`name:` if that file exists, else `componentMetadata.name` with CamelCase split.

## APIs
| Side | Source | Glyph |
| --- | --- | --- |
| Left | `coreFunction.dependentAPIs[]` (+ `securityFunction`/`managementFunction` with `--include`) | socket `)──` |
| Right | `coreFunction.exposedAPIs[]` (+ same) | lollipop `──○` |

- Label: `{id} {name without -api, hyphens→spaces, Title Case}` — `party-role-management-api` → `TMF669 Party Role Management`.
- Drop entries whose id isn't `TMF<digits>` (template placeholders in management/security blocks).
- De-dup by id per side (required = OR of duplicates); sort by TMF number.
- `required: true` → bold label.
- Tooltip: label + spec version, `required`, one line per resource with its operations.

## eTOM business activities
Entry: `1.2.20|Product_Catalog_Lifecycle_Management|v24.0`.
- Level = segments − 1 (`1.2.20` = L2, `1.2.8.7` = L3, `1.2.8.7.1` = L4).
- Default: all L2, plus any L3/L4 with no listed ancestor. `--etom-levels all` shows everything.
- Label `L{n} - {Name with spaces}`; numeric dotted sort; tooltip = id, name, version.
- Empty list → one italic "No eTOM business activities assigned" row.

## SID ABEs
Entry: `Domain|ABE[|Sub_ABE or BE]|version`.
- Label = last entity segment, `_ABE`/`_BE` removed, underscores→spaces, CamelCase split (`ProductConfigSpec_BE` → `Product Config Spec`).
- YAML order, 3 columns, labels wrap to 2 lines. Tooltip = full path joined with ` › `.
- Some SID paths in the source look swapped (TMFC001: `Loyalty_ABE|Product_Usage_Spec_ABE`) — reproduce as-is.

## Known source quirks (reproduce, don't fix)
- YAML vs PDF version numbers and content differ (see `components/AGENTS.md`).
- Management-function blocks contain template placeholders (`dependentAPI_id`) — filtered, not drawn.
- `status` may be `Pre-production` (TMFC011) rather than `specified` — shown in `<desc>` only.
