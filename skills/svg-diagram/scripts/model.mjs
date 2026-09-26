// Component YAML → diagram model. Pure data; no DOM. See spec/spec-svg-diagram.md §4.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

const API_ID = /^TMF\d+$/;
// Template placeholders left in published YAML (e.g. managementFunction.dependentAPIs[].id: dependentAPI_id)
const PLACEHOLDER = /^(exposed|dependent)API_/;
export const FUNCTIONS = ['core', 'management', 'security'];

export const splitCamel = (s) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

const titleCase = (s) =>
  s.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

const numId = (id) => parseInt(String(id).replace(/\D/g, ''), 10) || Infinity;

// Compare dotted eTOM ids numerically: 1.2.7 < 1.2.19
const cmpDotted = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d) return d;
  }
  return 0;
};

function readMdName(dir, id) {
  const md = path.join(dir, `${id}.md`);
  if (!fs.existsSync(md)) return null;
  const m = fs.readFileSync(md, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  try { return yaml.load(m[1])?.name ?? null; } catch { return null; }
}

// TMF id → hyphenated API name ("TMF620" → "product-catalog-management-api"), harvested from
// every published component.yaml. Lets implementations with terse names ("productcatalogmanagement")
// get the same readable labels as the specs.
const catalogCache = new Map();
export function apiNameCatalog(componentsDir) {
  if (!componentsDir || !fs.existsSync(componentsDir)) return new Map();
  if (catalogCache.has(componentsDir)) return catalogCache.get(componentsDir);
  const names = new Map();
  for (const id of listComponentIds(componentsDir)) {
    const file = path.join(componentsDir, id, 'component.yaml');
    if (!fs.existsSync(file)) continue;
    const spec = yaml.load(fs.readFileSync(file, 'utf8'))?.spec ?? {};
    for (const fn of FUNCTIONS) {
      for (const key of ['exposedAPIs', 'dependentAPIs']) {
        for (const a of spec[`${fn}Function`]?.[key] ?? []) {
          if (API_ID.test(String(a.id ?? '')) && String(a.name ?? '').includes('-')) names.set(a.id, a.name);
        }
      }
    }
  }
  catalogCache.set(componentsDir, names);
  return names;
}

function apiLabel(api, catalog) {
  const hasId = API_ID.test(String(api.id ?? ''));
  let name = String(api.name ?? '');
  if (hasId && !name.includes('-') && catalog.has(api.id)) name = catalog.get(api.id);
  name = titleCase(name.replace(/-api$/i, '').replace(/[-_]+/g, ' '));
  if (hasId) return `${api.id} ${name}`.trim();
  const TYPE = { mcp: 'MCP', prometheus: 'Prometheus', openapi: 'OpenAPI', openmetrics: 'OpenMetrics' };
  return api.apiType ? `${name} (${TYPE[api.apiType] ?? api.apiType})` : name;
}

function apiTooltip(api, label) {
  const ver = api.specification?.[0]?.version ?? '';
  const res = (api.resources ?? [])
    .map((r) => Object.entries(r).map(([k, ops]) => `${k}: ${(ops ?? []).join(', ')}`).join('; '))
    .filter(Boolean);
  const extra = [api.apiType && `apiType: ${api.apiType}`, api.path && `path: ${api.path}`,
    api.implementation && `implementation: ${api.implementation}`].filter(Boolean);
  return [`${label} ${ver}`.trim(), `required: ${!!api.required}`, ...extra, ...res].join('\n');
}

function collectApis(spec, key, include, catalog) {
  const out = [];
  for (const fn of ['core', ...include]) {
    const byKey = new Map();
    for (let api of spec[`${fn}Function`]?.[key] ?? []) {
      // A placeholder name means a template stub (drop it); a placeholder id on a real API
      // (published `metrics` has id: exposedAPI_id) just means it has no TMF id.
      const name = String(api.name ?? '');
      if (PLACEHOLDER.test(name)) continue;
      const id = PLACEHOLDER.test(String(api.id ?? '')) ? '' : String(api.id ?? '');
      api = { ...api, id };
      if (!API_ID.test(id) && !name) continue;
      const k = API_ID.test(id) ? id : `${name}:${api.apiType ?? ''}`;
      const prev = byKey.get(k);
      if (prev) { prev.required ||= !!api.required; continue; }
      const label = apiLabel(api, catalog);
      byKey.set(k, {
        id: API_ID.test(id) ? id : name,
        label,
        required: !!api.required,
        fn,
        tooltip: `[${fn}] ${apiTooltip(api, label)}`,
      });
    }
    // within a function: TMF APIs by number, then id-less APIs (metrics, MCP…) by name
    out.push(...[...byKey.values()].sort((a, b) => numId(a.id) - numId(b.id) || a.label.localeCompare(b.label)));
  }
  return out;
}

function parseEtoms(list, levels) {
  const all = (list ?? []).map((s) => {
    const [id, name = '', version = ''] = String(s).split('|');
    return { id, level: id.split('.').length - 1, name: name.replace(/_/g, ' '), version };
  });
  const ids = new Set(all.map((e) => e.id));
  const hasAncestor = (id) => {
    const p = id.split('.');
    for (let i = p.length - 1; i >= 3; i--) if (ids.has(p.slice(0, i).join('.'))) return true;
    return false;
  };
  const shown = levels === 'all' ? all : all.filter((e) => e.level <= 2 || !hasAncestor(e.id));
  return shown
    .sort((a, b) => cmpDotted(a.id, b.id))
    .map((e) => ({ ...e, label: `L${e.level} - ${e.name}`, tooltip: `${e.id} ${e.name} (${e.version})` }));
}

function parseSids(list) {
  return (list ?? []).map((s) => {
    const parts = String(s).split('|');
    const entities = parts.slice(1, -1);
    const leaf = entities[entities.length - 1] ?? parts[0];
    const label = splitCamel(leaf.replace(/_?A?BE$/, '')).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return { label, tooltip: parts.join(' › ') };
  });
}

// doc = a parsed `kind: Component` document. opts.kind: 'specification' | 'implementation'.
export function buildModel(doc, { include = [], etomLevels = '2', componentsDir, kind = 'specification', name, source, sourceDetail } = {}) {
  const spec = doc?.spec ?? {};
  const meta = spec.componentMetadata ?? {};
  const id = meta.id ?? doc?.metadata?.name ?? 'component';
  const catalog = apiNameCatalog(componentsDir);
  const title = name ?? splitCamel(String(meta.name ?? id));
  return {
    id,
    kind,
    source: source ?? `component.yaml v${meta.version ?? ''}`,
    sourceDetail: sourceDetail ?? null,
    name: title,
    title: `${id}: ${title.toUpperCase()}`,
    version: meta.version ?? '',
    status: meta.status ?? '',
    functionalBlock: meta.functionalBlock ?? '',
    functions: ['core', ...include],
    exposed: collectApis(spec, 'exposedAPIs', include, catalog),
    dependent: collectApis(spec, 'dependentAPIs', include, catalog),
    etoms: parseEtoms(meta.eTOMs, etomLevels),
    sids: parseSids(meta.SIDs),
  };
}

export function loadComponent(componentsDir, id, opts = {}) {
  const dir = path.join(componentsDir, id);
  const file = path.join(dir, 'component.yaml');
  if (!fs.existsSync(file)) return null;
  const doc = yaml.load(fs.readFileSync(file, 'utf8'));
  return buildModel(doc, { ...opts, componentsDir, name: readMdName(dir, id) ?? undefined });
}

// Compile a Helm chart (`helm template`) and model the `kind: Component` it produces.
export function loadChart(chartDir, { release = 'r1', set = [], values = [], componentsDir, ...opts } = {}) {
  const chart = yaml.load(fs.readFileSync(path.join(chartDir, 'Chart.yaml'), 'utf8'));
  const args = ['template', release, chartDir, ...set.flatMap((s) => ['--set', s]), ...values.flatMap((v) => ['-f', v])];
  let out;
  try {
    out = execFileSync('helm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('helm not found on PATH — install Helm 3 to render charts');
    throw new Error(`helm template failed: ${(e.stderr || e.message).trim()}`);
  }
  const docs = yaml.loadAll(out).filter(Boolean);
  const comp = docs.find((d) => d.kind === 'Component');
  if (!comp) throw new Error(`chart ${chart.name} renders no 'kind: Component' document`);
  const id = comp.spec?.componentMetadata?.id;
  // Borrow the published spec's human name when this implements a known TMFC id.
  const specName = id && componentsDir ? readMdName(path.join(componentsDir, id), id) : null;
  return {
    chart,
    model: buildModel(comp, {
      ...opts,
      componentsDir,
      kind: 'implementation',
      name: specName ?? undefined,
      source: `Helm chart ${chart.name} v${chart.version}`,
      sourceDetail: `helm template ${release} ${[...set.map((x) => `--set ${x}`), ...values.map((v) => `-f ${v}`)].join(' ') || '(default values)'}`,
    }),
  };
}

export function listComponentIds(componentsDir) {
  return fs.readdirSync(componentsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^TMFC\d+$/.test(d.name))
    .map((d) => d.name)
    .sort();
}
