// Every case here is something Gemma actually wrote on the Express graveyard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, type Facts } from '../src/remember.ts';

const tj: Facts = {
  kind: 'ghost',
  title: 'TJ Holowaychuk',
  lines: ['name: TJ Holowaychuk', 'first commit: 2009-06-26 ("Initial commit")', 'last commit: 2014-02-19 ("bump")', 'commits: 3,527', 'silent for: 12 years', 'lines still running today: 6,483', 'files those lines live in: 120', 'most of them are in: History.md (2,104 lines)'],
  code: '',
  counts: [[3527, 'commits'], [12, 'years'], [6483, 'lines'], [120, 'files'], [2104, 'lines'], [4, 'years']],
  bornYear: 2009,
  goneYear: 2014,
  makers: ['tj holowaychuk', 'visionmedia'],
  breaker: '',
};

const contributing: Facts = {
  kind: 'grave',
  title: 'Contributing.md',
  lines: ['file: Contributing.md', 'born: 2014-06-04, written by Roman Shtylman ("add contributing")', 'died: 2025-02-11, removed by Sebastian Beltran', 'lived: 11 years', 'size at death: 246 lines', 'commits in its life: 32', 'people who changed it: Roman Shtylman, Douglas Christopher Wilson'],
  code: '# Contributing',
  counts: [[11, 'years'], [246, 'lines'], [32, 'commits'], [2, 'people']],
  bornYear: 2014,
  goneYear: 2025,
  makers: ['roman shtylman', 'douglas christopher wilson'],
  breaker: 'sebastian beltran',
};

test('a real number on the wrong thing is caught', () => {
  assert.ok(check("TJ's spirit persists, 3,527 silent years woven into 6,483 lines of code.", tj));
  assert.ok(check('Crafted by Roman, it offered clarity to 32 contributors.', contributing));
});

test('true counts pass', () => {
  assert.equal(check('Silent for 12 years, yet 6,483 of his lines still run.', tj), null);
  assert.equal(check('It lived eleven years and grew to 246 lines across 32 commits.', contributing), null);
});

test('years must belong to the right event', () => {
  assert.equal(check('Born in 2014, it rests now.', contributing), null);
  assert.ok(check('Born in 2012, it rests now.', contributing));
  assert.ok(check('Removed in 2021, quietly.', contributing));
});

test('who wrote it and who removed it', () => {
  assert.equal(check('Written by Roman, laid to rest by Sebastian.', contributing), null);
  assert.ok(check('Written by Sebastian, it guided many.', contributing));
  assert.ok(check('Removed by Douglas, it guided many.', contributing));
});

test('invented numbers, months and names', () => {
  assert.ok(check('Born in twenty-eleven, with eighty-four commits.', contributing));
  assert.ok(check('It was written in March by Roman.', contributing));
  assert.ok(check('Roman and Priya tended it for years.', contributing));
  assert.ok(check('Its `renderTemplate()` call guided every view.', contributing));
});

test('compound and spoken numbers are read whole', async () => {
  const { wordsToNumber } = await import('../src/remember.ts');
  assert.equal(wordsToNumber('eighty-four'), 84);
  assert.equal(wordsToNumber('two hundred and forty-six'), 246);
  assert.equal(wordsToNumber('twenty-eleven'), 2011);
  assert.equal(wordsToNumber('three thousand'), 3000);
});

test('"eighty-four commits" is eighty-four, not four', () => {
  const travis: Facts = { ...contributing, lines: ['file: .travis.yml', 'lived: 9 years', 'size at death: 78 lines', 'commits in its life: 84'], counts: [[9, 'years'], [78, 'lines'], [84, 'commits'], [3, 'people']] };
  assert.equal(check('Through eighty-four commits it guided every build.', travis), null);
  assert.ok(check('Through ninety-four commits it guided every build.', travis));
});

test('a month that matches a real date is fine; one that does not is caught', () => {
  assert.equal(check('Born in June of 2014, it rests now.', contributing), null); // born 2014-06-04
  assert.ok(check('Born in July of 2014, it rests now.', contributing));
});
