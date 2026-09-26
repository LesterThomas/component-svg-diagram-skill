#!/usr/bin/env node
// Check rendered SVGs against the YAML-derived model: element counts and API ids per side.
// Usage: node verify.mjs [--components-dir components] [--diagrams-dir diagrams] [TMFCxxx ...]
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { loadComponent, listComponentIds } from './model.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const componentsDir = opt('--components-dir', 'components');
const diagramsDir = opt('--diagrams-dir', 'diagrams');
const ids = args.length ? args : listComponentIds(componentsDir);

let failures = 0, checked = 0;
for (const id of ids) {
  const model = loadComponent(componentsDir, id);
  if (!model) continue;
  const file = path.join(diagramsDir, `${id}-architecture.svg`);
  if (!fs.existsSync(file)) { console.log(`MISSING ${file}`); failures++; continue; }
  const doc = new JSDOM(fs.readFileSync(file, 'utf8'), { contentType: 'image/svg+xml' }).window.document;
  const q = (sel) => [...doc.querySelectorAll(sel)];
  const got = {
    dependent: q('.dependent-api').map((g) => g.getAttribute('data-api')).join(','),
    exposed: q('.exposed-api').map((g) => g.getAttribute('data-api')).join(','),
    etoms: q('.etom').length,
    sids: q('.sid').length,
    title: doc.querySelector('svg > text')?.textContent,
    legend: !!doc.querySelector('#legend'),
  };
  const want = {
    dependent: model.dependent.map((a) => a.id).join(','),
    exposed: model.exposed.map((a) => a.id).join(','),
    etoms: Math.max(model.etoms.length, 1), // placeholder rect when none
    sids: model.sids.length,
    title: model.title,
    legend: true,
  };
  const bad = Object.keys(want).filter((k) => got[k] !== want[k]);
  checked++;
  if (bad.length) {
    failures++;
    console.log(`FAIL ${id}: ` + bad.map((k) => `${k} got=${got[k]} want=${want[k]}`).join('; '));
  } else {
    console.log(`ok   ${id}  dep=${model.dependent.length} exp=${model.exposed.length} etom=${got.etoms} sid=${got.sids}`);
  }
}
console.log(`${checked} checked, ${failures} failed`);
process.exit(failures ? 1 : 0);
