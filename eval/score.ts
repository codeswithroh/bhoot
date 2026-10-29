// Scores the checker against the hand labels: re-checks every saved first attempt with the
// CURRENT checker, so a checker change can be measured on the same attempts.
// Usage: node eval/score.ts eval/express-v1.json eval/request-v1.json
import fs from 'node:fs';
import { check } from '../src/remember.ts';

const labels = JSON.parse(fs.readFileSync(new URL('./labels.json', import.meta.url), 'utf8'));
let tp = 0, fn = 0, fp = 0, tn = 0;
for (const file of process.argv.slice(2)) {
  const y = JSON.parse(fs.readFileSync(file, 'utf8'));
  const lab = labels[y.repo];
  for (const s of [...y.ghosts, ...y.graves]) {
    const first = s.remembrance.rejected[0]?.text ?? s.remembrance.text;
    const truth = lab.first[s.facts.title];
    if (truth === undefined) continue;
    const why = first.split(/\s+/).length > 55 ? 'too long' : check(first, s.facts);
    if (!truth && why) tp++;
    else if (!truth && !why) (fn++, console.log(`  missed  [${y.repo}] ${s.facts.title}: ${first}`));
    else if (truth && why) (fp++, console.log(`  false alarm [${y.repo}] ${s.facts.title} (${why}): ${first}`));
    else tn++;
  }
}
console.log(`\nfalse attempts caught: ${tp}/${tp + fn} · true attempts wrongly rejected: ${fp}/${fp + tn}`);
