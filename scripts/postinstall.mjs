// Runs after `npm install`: build public/vivliostyle.js, the page-layout engine used in the browser (not stored in git).
// @vivliostyle/core ships as a CommonJS module; wrap it so it defines a browser global `vivliostyle`.
// Vivliostyle is licensed under the GNU AGPL-3.0 (https://vivliostyle.org).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../node_modules/@vivliostyle/core/lib/vivliostyle.js', import.meta.url));
const to = fileURLToPath(new URL('../public/vivliostyle.js', import.meta.url));
if (!existsSync(from)) { console.warn('postinstall: @vivliostyle/core not installed yet; run npm install again'); process.exit(0); }

const code = readFileSync(from, 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '');
writeFileSync(to, `/* Vivliostyle Core - GNU AGPL-3.0 - https://vivliostyle.org */\n(function(){var module={exports:{}};var exports=module.exports;${code}\n;window.vivliostyle=module.exports;})();\n`);
console.log('postinstall: public/vivliostyle.js ready');
