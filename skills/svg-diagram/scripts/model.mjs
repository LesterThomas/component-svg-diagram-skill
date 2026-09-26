// YAML → diagram model. Pure data; no DOM. See spec/spec-svg-diagram.md §4.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const API_ID = /^TMF\d+$/;

export const splitCamel = (s) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

const titleCase = (s) =>
  s.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

const numId = (id) => parseInt(String(id).replace(/\D/g, ''), 10) || 0;

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

function apiLabel(api) {
  const name = String(api.name ?? '').replace(/-api$/i, '').replace(/[-_]+/g, ' ');
  return `${api.id} ${titleCase(name)}`.trim();
}

function apiTooltip(api) {
  const ver = api.specification?.[0]?.version ?? '';
  const res = (api.resources ?? [])
    .map((r) => Object.entries(r).map(([k, ops]) => `${k}: ${(ops ?? []).join(', ')}`).join('; '))
    .filter(Boolean);
  return [`${apiLabel(api)} ${ver}`.trim(), `required: ${!!api.required}`, ...res].join('\n');
}

function collectApis(spec, key, include) {
  const fns = ['coreFunction', ...include.map((f) => `${f}Function`)];
  const byId = new Map();
  for (const fn of fns) {
    for (const api of spec[fn]?.[key] ?? []) {
      if (!API_ID.test(String(api.id ?? ''))) continue; // template placeholders
      const prev = byId.get(api.id);
      if (prev) { prev.required ||= !!api.required; continue; }
      byId.set(api.id, {
        id: api.id,
        label: apiLabel(api),
        required: !!api.required,
        fn: fn.replace('Function', ''),
        tooltip: apiTooltip(api),
      });
    }
  }
  return [...byId.values()].sort((a, b) => numId(a.id) - numId(b.id));
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

export function loadComponent(componentsDir, id, { include = [], etomLevels = '2' } = {}) {
  const dir = path.join(componentsDir, id);
  const file = path.join(dir, 'component.yaml');
  if (!fs.existsSync(file)) return null;
  const doc = yaml.load(fs.readFileSync(file, 'utf8'));
  const spec = doc?.spec ?? {};
  const meta = spec.componentMetadata ?? {};
  const name = readMdName(dir, id) ?? splitCamel(String(meta.name ?? id));
  return {
    id: meta.id ?? id,
    name,
    title: `${meta.id ?? id}: ${name.toUpperCase()}`,
    version: meta.version ?? '',
    status: meta.status ?? '',
    functionalBlock: meta.functionalBlock ?? '',
    exposed: collectApis(spec, 'exposedAPIs', include),
    dependent: collectApis(spec, 'dependentAPIs', include),
    etoms: parseEtoms(meta.eTOMs, etomLevels),
    sids: parseSids(meta.SIDs),
  };
}

export function listComponentIds(componentsDir) {
  return fs.readdirSync(componentsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^TMFC\d+$/.test(d.name))
    .map((d) => d.name)
    .sort();
}
