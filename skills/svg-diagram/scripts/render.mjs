#!/usr/bin/env node
// CLI: node render.mjs <TMFCxxx|all> [--components-dir DIR] [--out PATH] [--include security,management] [--etom-levels 2|all]
import fs from 'node:fs';
import path from 'node:path';
import { loadComponent, listComponentIds } from './model.mjs';
import { renderSvg } from './layout.mjs';

function parseArgs(argv) {
  const opts = { target: null, componentsDir: 'components', out: null, include: [], etomLevels: '2' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--components-dir') opts.componentsDir = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--include') opts.include = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--etom-levels') opts.etomLevels = argv[++i];
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (!opts.target) opts.target = a;
    else throw new Error(`Unexpected argument: ${a}`);
  }
  return opts;
}

const usage = 'Usage: node render.mjs <TMFCxxx|all> [--components-dir components] [--out diagrams/X.svg|dir] [--include security,management] [--etom-levels 2|all]';

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.target) { console.log(usage); process.exit(opts.help ? 0 : 1); }
  for (const f of opts.include) {
    if (!['security', 'management'].includes(f)) throw new Error(`--include accepts security,management (got ${f})`);
  }
  if (!fs.existsSync(opts.componentsDir)) throw new Error(`Components dir not found: ${opts.componentsDir}`);

  const batch = opts.target.toLowerCase() === 'all';
  const ids = batch ? listComponentIds(opts.componentsDir) : [opts.target.toUpperCase()];
  // In batch mode --out is a directory; for a single id it may be a file or directory.
  const outFor = (id) => {
    const def = `${id}-architecture.svg`;
    if (!opts.out) return path.join('diagrams', def);
    return batch || !opts.out.toLowerCase().endsWith('.svg') ? path.join(opts.out, def) : opts.out;
  };

  let ok = 0, skipped = 0, failed = 0;
  for (const id of ids) {
    try {
      const model = loadComponent(opts.componentsDir, id, opts);
      if (!model) {
        console.warn(`skip ${id}: no component.yaml`);
        skipped++;
        if (!batch) process.exit(2);
        continue;
      }
      const file = outFor(id);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, renderSvg(model), 'utf8');
      console.log(`wrote ${file}  (dependent ${model.dependent.length}, exposed ${model.exposed.length}, eTOM ${model.etoms.length}, SID ${model.sids.length})`);
      ok++;
    } catch (e) {
      console.error(`fail ${id}: ${e.message}`);
      failed++;
      if (!batch) process.exit(1);
    }
  }
  if (batch) console.log(`done: ${ok} rendered, ${skipped} skipped, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
