// Replays every step of ferret's oracle case file against the JavaScript engine embedded in this app.
// Usage: node test/replay-all.mjs [path-to-cases.json]   (default ~/ferret/reference/cases.json)
import { readFileSync } from "node:fs";
import { deepStrictEqual } from "node:assert/strict";
import { join } from "node:path";
import { homedir } from "node:os";
import { InvoicePool } from "../src/engine/invoices.js";

const path = process.argv[2] ?? join(homedir(), "ferret/reference/cases.json");
const file = JSON.parse(readFileSync(path, "utf8"));
let steps = 0;
for (const sc of file.scenarios) {
  const pool = new InvoicePool(sc.pool_policy, sc.mood_policy);
  for (const st of sc.steps) {
    const d = pool.apply(st.op, st.t, st.args);
    const got = d.decision === "refuse" ? { decision: "refuse", family: d.family } : { decision: "ok" };
    const want = st.expect.decision === "refuse" ? { decision: "refuse", family: st.expect.family } : { decision: "ok" };
    deepStrictEqual(got, want, `${sc.id} step ${st.i}`);
    deepStrictEqual(pool.snapshot(), st.after, `${sc.id} step ${st.i} snapshot`);
    steps++;
  }
}
console.log(`${file.scenarios.length} scenarios, ${steps} steps, 0 mismatch`);
