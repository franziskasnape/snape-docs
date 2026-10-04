// Runs after `npm install`: copy the Paged.js page-layout script into public/ (it is not stored in git).
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const from = new URL('../node_modules/pagedjs/dist/paged.polyfill.min.js', import.meta.url);
const to = new URL('../public/paged.polyfill.js', import.meta.url);
if (existsSync(fileURLToPath(from))) { copyFileSync(from, to); console.log('postinstall: public/paged.polyfill.js ready'); }
else console.warn('postinstall: pagedjs not installed yet; run npm install again');
