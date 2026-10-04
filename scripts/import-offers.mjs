#!/usr/bin/env node
// Parse existing hand-built offer HTML files into seed/seed.sql + seed/images/*.jpg
// Usage: node scripts/import-offers.mjs file1.html file2.html ...
// Then:  node scripts/load-seed.mjs   (loads seed into the local D1 + R2)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse } from 'node-html-parser';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: import-offers.mjs <offer.html>...'); process.exit(1); }
mkdirSync('seed/images', { recursive: true });

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const iso = (d) => { const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(d); return `${m[3]}-${m[2]}-${m[1]}`; };
const MONTH = { Januar:1, Februar:2, 'März':3, April:4, Mai:5, Juni:6, Juli:7, August:8, September:9, Oktober:10, November:11, Dezember:12 };
const dec = (s) => s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/&middot;/g,'·');
const text = (n) => dec(n.innerHTML.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')).trim();
const norm = (s) => dec(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

let imgId = 0, docId = 0, artId = 0;
const sql = [];
const images = [];   // {id, file}
const clientIds = new Map();

function saveImage(src, docNumber) {
  const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(src);
  const ext = m[1] === 'png' ? 'png' : 'jpg';
  const id = ++imgId;
  const file = `seed/images/${id}.${ext}`;
  writeFileSync(file, Buffer.from(m[2], 'base64'));
  images.push({ id, file, mime: `image/${m[1]}`, key: `images/${id}.${ext}`, docNumber });
  return id;
}

for (const f of files) {
  const root = parse(readFileSync(f, 'utf8'));
  const pages = root.querySelectorAll('.page');
  const first = pages[0];
  const metaRows = Object.fromEntries(first.querySelectorAll('.doc-meta .row').map((r) => [text(r.querySelector('.label')), text(r.querySelectorAll('span')[1])]));
  const number = metaRows['Angebot Nr.'];
  const docNumber = number;
  const thisDocId = ++docId;

  // --- artwork + client
  const [objCol, cliCol] = first.querySelectorAll('.info-col');
  const artwork = objCol.querySelectorAll('.info-line').map((l) => ({ k: text(l.querySelector('.k')), v: text(l.querySelector('.v')) }));
  const cli = Object.fromEntries(cliCol.querySelectorAll('.info-line').map((l) => [text(l.querySelector('.k')), text(l.querySelector('.v'))]));
  const clientKey = cli['Name'];
  if (!clientIds.has(clientKey)) {
    const cid = clientIds.size + 1; clientIds.set(clientKey, cid);
    sql.push(`INSERT INTO clients (id,name,address,contact,phone,email) VALUES (${cid},${q(cli['Name'])},${q(cli['Adresse'])},${q(cli['Kontakt'])},${q(cli['Telefon'])},${q(cli['E-Mail'])});`);
  }
  const clientId = clientIds.get(clientKey);

  // --- overview
  const ov = first.querySelector('.overview-fig');
  const caps = ov.querySelectorAll('.cap');
  const overview = { imageId: saveImage(ov.querySelector('img').getAttribute('src'), docNumber), caption: text(caps[0]) };
  if (caps[1]) overview.note = text(caps[1]);

  // --- body blocks, across pages
  const blocks = [];
  let rate = 100, costText = '';
  let pendingProse = null;
  const flush = () => { if (pendingProse) { blocks.push(pendingProse); pendingProse = null; } };

  for (const page of pages) {
    const kids = page.childNodes.filter((n) => n.tagName);
    for (let i = 0; i < kids.length; i++) {
      const el = kids[i];
      const cls = el.classList?.value ?? [];
      if (cls.includes('section-heading') && text(el) === 'Kostenaufstellung') {
        flush(); costText = kids[i + 1].innerHTML.trim(); i++; continue;
      }
      if (cls.includes('section-heading')) { flush(); pendingProse = { type: 'prose', heading: text(el), paragraphs: [] }; continue; }
      if (cls.includes('section-body')) {
        const m = /^<em>(Hinweis|Fazit|Empfehlung):<\/em>\s*(.*)$/s.exec(el.innerHTML.trim());
        if (m) { flush(); blocks.push({ type: 'note', label: m[1].toLowerCase(), html: m[2] }); continue; }
        if (!pendingProse) pendingProse = { type: 'prose', paragraphs: [] };
        pendingProse.paragraphs.push(el.innerHTML.trim()); continue;
      }
      if (cls.includes('section-heading-row')) {
        flush();
        const kind = /Optional/.test(text(el.querySelector('.section-heading'))) ? 'optional' : 'main';
        const rm = /CHF\s*([\d.]+)/.exec(text(el.querySelector('.rate-note'))); if (rm) rate = Number(rm[1].replace(/\.$/, ''));
        const table = kids[i + 1];
        const rows = table.querySelectorAll('tbody tr').map((tr) => {
          const tds = tr.querySelectorAll('td');
          const imgs = (tds[1].querySelectorAll('.row-fig')).map((rf) => ({ imageId: saveImage(rf.querySelector('img').getAttribute('src'), docNumber), caption: text(rf.querySelector('.cap')) }));
          const [min, max] = text(tds[2]).split('–').map(Number);
          const row = { title: text(tds[1].querySelector('.table-title')), desc: text(tds[1].querySelector('.table-desc')), hoursMin: min };
          if (max != null && max !== min) row.hoursMax = max;
          if (imgs.length) row.images = imgs;
          return row;
        });
        blocks.push({ type: 'measures', kind, rows }); i += 2; // table + totals
        continue;
      }
    }
  }
  flush();

  // --- cost options
  const cm = /ab dem (.+?) möglich(?:; die Abholung kann voraussichtlich ab (.+?) erfolgen)?\./.exec(costText);
  const longToIso = (s) => { const m = /^(\d+)\. (\w+) (\d{4})$/.exec(s); return m ? `${m[3]}-${String(MONTH[m[2]]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}` : s; };
  const cost = { materials: /Materialkosten sind darin nicht enthalten/.test(costText) };
  if (cm) { cost.deliveryFrom = longToIso(cm[1]); if (cm[2]) cost.pickupFrom = longToIso(cm[2]); }

  const data = { meta: { date: iso(metaRows['Datum']), validUntil: iso(metaRows['Gültig bis']) }, overview, blocks, cost, rate };

  // Check generated paragraph == original; otherwise keep original wording as override
  data.__origCost = costText;
  const art = ++artId;
  const title = artwork.find((a) => a.k.startsWith('Künstler'))?.v ?? number;

  sql.push(`INSERT INTO artworks (id,client_id,fields,overview_image_id) VALUES (${art},${clientId},${q(JSON.stringify(artwork))},${overview.imageId});`);
  sql.push(`INSERT INTO documents (id,type,number,lang,status,client_id,artwork_id,title,data) VALUES (${thisDocId},'offer',${q(number)},'de','sent',${clientId},${art},${q(title)},${q(JSON.stringify(data))});`);
  console.log(number, '·', blocks.map((b) => b.type + (b.kind ? ':' + b.kind : '')).join(' '), '· rate', rate, '· cost', JSON.stringify(cost));
}

for (const im of images) sql.push(`INSERT INTO images (id,document_id,r2_key,mime) VALUES (${im.id},(SELECT id FROM documents WHERE number=${q(im.docNumber)}),${q(im.key)},${q(im.mime)});`);
writeFileSync('seed/seed.sql', sql.join('\n'));
writeFileSync('seed/images.json', JSON.stringify(images, null, 1));
console.log(`wrote seed/seed.sql (${sql.length} statements), ${images.length} images`);
