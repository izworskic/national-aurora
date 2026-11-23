#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, 'public/national-tools/aurora/index.html');
const mark = '2026-10-01';

const states = [
  ['Alaska', '/national-tools/aurora/alaska/', 'Fairbanks, Anchorage and Denali with Alaska-specific aurora thresholds.'],
  ['Minnesota', '/national-tools/aurora/minnesota/', 'Duluth, Grand Marais, Ely and Voyageurs with local cloud and darkness context.'],
  ['North Dakota', '/national-tools/aurora/north-dakota/', 'Fargo, Bismarck and Grand Forks with northern-plains viewing thresholds.'],
  ['Montana', '/national-tools/aurora/montana/', 'Compare Glacier, Flathead Lake and the Hi-Line, then open a local viewing guide.'],
  ['Maine', '/national-tools/aurora/maine/', 'Presque Isle, Bangor and Acadia with Northeast-specific viewing context.'],
  ['Michigan', '/northern-lights-michigan/', 'Compare skies across Michigan and find a viewing spot with an open northern horizon.'],
];

let html = await readFile(file, 'utf8');
if (!html.includes(`data-aurora-state-network="${mark}"`)) {
  if (!html.includes('</main>')) throw new Error('Aurora network pass: </main> anchor missing');
  const cards = states.map(([name, href, copy]) => `
    <article class="source-box"><h3><a href="${href}">Northern Lights ${name} Tonight</a></h3><p>${copy}</p></article>`).join('');
  const section = `
<section class="section" data-aurora-state-network="${mark}" aria-labelledby="state-aurora-heading"><div class="wrap">
  <div class="tool-kicker">State aurora network</div>
  <h2 id="state-aurora-heading">Northern lights tonight across the U.S.</h2>
  <p>The live locator above works for any U.S. location. These deeper state tools add regional viewing thresholds, local cloud context and place-specific guidance for the places you might visit.</p>
  <nav class="grid" aria-label="State northern lights tools">${cards}
  </nav>
  <div class="handoff"><strong>Anywhere else in the United States?</strong><p>Use the national location search above. It combines NOAA aurora signals with darkness, moonlight and local NWS cloud cover instead of relying on Kp alone.</p></div>
</div></section>
`;
  html = html.replace('</main>', `${section}</main>`);
}

if (html.includes('"dateModified":"2026-09-03"')) {
  html = html.replace('"dateModified":"2026-09-03"', '"dateModified":"2026-10-01"');
}

await writeFile(file, html);
console.log(JSON.stringify({ linkedStates: states.length, mark }));
