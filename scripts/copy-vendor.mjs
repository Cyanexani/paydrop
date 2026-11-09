// Copies Bryntum Gantt's prebuilt UMD bundle, theme CSS and icon fonts to public/vendor/bryntum,
// so the browser loads it as a static file instead of the dev server re-bundling 6 MB of JS.
// Runs before `dev` and `build` (see package.json).
import { cpSync, existsSync, mkdirSync } from "node:fs";

const src = "node_modules/@bryntum/gantt";
const dest = "public/vendor/bryntum";

if (!existsSync(`${src}/gantt.umd.js`)) {
  console.warn("copy-vendor: @bryntum/gantt is not installed; the timeline will be unavailable.");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const file of ["gantt.umd.js", "gantt.css", "stockholm-light.css", "stockholm-dark.css"]) {
  cpSync(`${src}/${file}`, `${dest}/${file}`);
}
cpSync(`${src}/fontawesome`, `${dest}/fontawesome`, { recursive: true });
console.log("copy-vendor: Bryntum Gantt copied to public/vendor/bryntum");
