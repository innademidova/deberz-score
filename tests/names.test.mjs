import test from 'node:test';
import assert from 'node:assert/strict';
import { teamNames, randomTeamName } from '../names.js';

test('харьковских названий — тысячи, все разные и влезают в поле (24 символа)', () => {
  const a = teamNames();
  assert.ok(a.length > 3000, 'вариантов: ' + a.length);
  assert.equal(new Set(a.map((s) => s.toLowerCase())).size, a.length);
  assert.ok(a.every((s) => s.length > 3 && s.length <= 24 && s === s.trim() && !/\s{2}/.test(s)));
  assert.ok(a.some((s) => /Салтовк/.test(s)) && a.some((s) => /Холодной Горы/.test(s)));
});

test('случайное название не повторяет занятое', () => {
  const taken = teamNames().slice(0, teamNames().length - 1);
  const last = teamNames()[teamNames().length - 1];
  let k = 0;
  const rnd = () => (k++ < 49 ? 0 : 0.999999);
  assert.equal(randomTeamName(taken, rnd), last);
});
