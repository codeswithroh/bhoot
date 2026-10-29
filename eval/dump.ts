// Lists every first attempt Gemma made, with the facts it was given and the checker's verdict,
// so a person can label each one by hand. Usage: node eval/dump.ts site/express > eval/express-attempts.md
import fs from 'node:fs';

const dir = process.argv[2];
const y = JSON.parse(fs.readFileSync(`${dir}/graveyard.json`, 'utf8'));
let i = 0;
for (const s of [...y.ghosts, ...y.graves]) {
  const r = s.remembrance;
  const first = r.rejected[0]?.text ?? r.text;
  const verdict = r.rejected[0] ? `REJECTED: ${r.rejected[0].why}` : 'ACCEPTED';
  console.log(`### ${++i}. ${s.facts.title}\n`);
  console.log(s.facts.lines.map((l: string) => `- ${l}`).join('\n'));
  console.log(`\n> ${first}\n\nchecker: ${verdict}\n`);
  if (r.rejected[0]) console.log(`final (${r.by}):\n> ${r.text}\n`);
}
