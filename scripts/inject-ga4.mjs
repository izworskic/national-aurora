#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'public');
const MEASUREMENT_ID = 'G-Y5D2V2W7HN';
const TAG = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${MEASUREMENT_ID}');
</script>`;

let scanned = 0;
let injected = 0;
let alreadyTagged = 0;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.html')) continue;
    scanned += 1;
    const html = await readFile(fullPath, 'utf8');
    if (html.includes(MEASUREMENT_ID)) {
      alreadyTagged += 1;
      continue;
    }
    if (!/<\/head>/i.test(html)) throw new Error(`Missing </head> in ${path.relative(ROOT, fullPath)}`);
    await writeFile(fullPath, html.replace(/<\/head>/i, `${TAG}\n</head>`));
    injected += 1;
  }
}

await walk(ROOT);
console.log(JSON.stringify({ measurementId: MEASUREMENT_ID, scanned, injected, alreadyTagged, root: 'public' }));
