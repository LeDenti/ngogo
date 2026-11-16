// Copies the Ferret engine (TypeScript, zero dependencies) into src/engine as plain JavaScript.
// Types are erased with Node's own stripTypeScriptTypes, the same erasure Node 24 applies when it runs ferret on Render.
// Usage: node tools/import-ferret.mjs [path-to-ferret]   (default ~/ferret)
import { stripTypeScriptTypes } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const ferret = process.argv[2] ?? join(homedir(), "ferret");
const commit = execSync("git rev-parse --short HEAD", { cwd: ferret }).toString().trim();
const head =
  `// Copied from LeDenti/ferret src/engine at commit ${commit}, types erased with Node stripTypeScriptTypes.\n` +
  `// Do not edit by hand: edit ferret, then re-run tools/import-ferret.mjs.\n`;
for (const f of ["types", "mood", "invoices"]) {
  const src = readFileSync(join(ferret, "src/engine", `${f}.ts`), "utf8");
  const js = stripTypeScriptTypes(src, { mode: "strip" }).replace(/from "\.\/(types|mood)\.ts"/g, 'from "./$1.js"');
  writeFileSync(join("src/engine", `${f}.js`), head + js);
}
console.log(`engine imported from ferret ${commit}`);
