// Запуск: node --test deberz/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeGame, newRound, roundPoints, comboPoints } from '../scoring.js';

const game = (n, rounds, extra = {}) => ({
  sides: Array.from({ length: n }, (_, i) => ({ name: 'S' + i })),
  target: 1001,
  rounds,
  settings: {},
  ...extra,
});
const R = (n, loader, cards, o = {}) => ({ ...newRound(n, loader), cards, ...o });

test('очки за комбинации и послед', () => {
  assert.equal(comboPoints({ terc: 2, berc: 1, bela: true }), 40 + 50 + 20);
  const r = R(2, 0, [50, 40], { last: 1, combos: [{ terc: 1, berc: 0, bela: true }, { terc: 0, berc: 0, bela: false }] });
  assert.equal(roundPoints(r, 0), 50 + 20 + 20);
  assert.equal(roundPoints(r, 1), 40 + 10);
});

test('2 игрока: загрузившийся набрал больше — каждый пишет своё', () => {
  const g = computeGame(game(2, [R(2, 0, [90, 62])]));
  assert.deepEqual(g.totals, [90, 62]);
  assert.equal(g.rows[0].kind, 'ok');
});

test('2 игрока: байт — вистующий пишет ВСЕ очки сдачи, загрузившийся 0', () => {
  const g = computeGame(game(2, [R(2, 0, [60, 80], { combos: [{ terc: 1, berc: 0, bela: false }, { terc: 0, berc: 0, bela: false }] })]));
  // загрузившийся: 60+20=80 vs 80 -> это равенство, не байт; поправим числа
  assert.equal(g.rows[0].kind, 'hang');
  const g2 = computeGame(game(2, [R(2, 0, [60, 85])]));
  assert.equal(g2.rows[0].kind, 'bait');
  assert.deepEqual(g2.totals, [0, 145]);
  assert.deepEqual(g2.baits, [1, 0]);
});

test('висячий байт: очки висят и достаются победителю следующей сдачи, не накапливаются', () => {
  const g = computeGame(game(2, [R(2, 0, [70, 70]), R(2, 1, [50, 80])]));
  assert.equal(g.rows[0].kind, 'hang');
  assert.deepEqual(g.rows[0].delta, [0, 70]);
  // 2-я сдача: загрузился 1 с 80 > 50 -> победитель сдачи сторона 1, получает 70 висящих
  assert.deepEqual(g.rows[1].delta, [50, 80 + 70]);
  assert.equal(g.hanging, 0);
  // два равенства подряд: старый висячий сгорает
  const g2 = computeGame(game(2, [R(2, 0, [70, 70]), R(2, 1, [60, 60])]));
  assert.equal(g2.hanging, 60);
  assert.deepEqual(g2.totals, [60, 70]); // 2-я сдача — снова равенство, прошлый висячий сгорел
});

test('3 игрока: байт, очки подсевшего тому, у кого больше', () => {
  const g = computeGame(game(3, [R(3, 0, [30, 50, 40])]));
  assert.equal(g.rows[0].kind, 'bait');
  assert.deepEqual(g.totals, [0, 50 + 30, 40]);
});

test('3 игрока: при равенстве вистующих очки подсевшего делятся поровну', () => {
  const g = computeGame(game(3, [R(3, 0, [31, 45, 45])]));
  assert.deepEqual(g.totals, [0, 45 + 15, 45 + 15]);
});

test('3 игрока: режим «поровну»', () => {
  const g = computeGame(game(3, [R(3, 0, [30, 50, 40])], { settings: { baitMode: 'split' } }));
  assert.deepEqual(g.totals, [0, 65, 55]);
});

test('штраф −100 за третий и каждый следующий байт', () => {
  const bait = () => R(2, 0, [10, 100]);
  const g = computeGame(game(2, [bait(), bait(), bait(), bait()]));
  assert.deepEqual(g.rows.map((r) => r.delta[0]), [0, 0, -100, -100]);
  assert.deepEqual(g.totals, [-200, 440]);
  const off = computeGame(game(2, [bait(), bait(), bait()], { settings: { penalties: false } }));
  assert.deepEqual(off.totals, [0, 330]);
});

test('без взяток: −50', () => {
  const g = computeGame(game(2, [R(2, 0, [152, 0], { noTricks: [false, true] })]));
  assert.deepEqual(g.totals, [152, -50]);
});

test('конец партии: набрал цель; побеждает у кого больше', () => {
  const g = computeGame(game(2, [R(2, 0, [100, 50]), R(2, 0, [100, 50]), R(2, 0, [100, 50])], { target: 300 }));
  assert.equal(g.finished, true);
  assert.equal(g.winner, 0);
  assert.equal(g.rows.length, 3);
  // раунды после конца не учитываются
  const g2 = computeGame(game(2, [R(2, 0, [100, 50]), R(2, 0, [100, 50]), R(2, 0, [101, 50]), R(2, 1, [1, 150])], { target: 301 }));
  assert.equal(g2.rows.length, 3);
});

test('конец партии: оба ≥ цели, побеждает у кого больше', () => {
  const g = computeGame(game(2, [R(2, 0, [120, 100]), R(2, 1, [100, 121])], { target: 200 }));
  assert.deepEqual(g.totals, [220, 221]);
  assert.equal(g.winner, 1);
});

test('конец партии: при равенстве выигрывает вистовавший в последней сдаче', () => {
  // сторона 0 загрузилась, набрала 100 и (до этого 200) -> 300; сторона 1: 100 + 200 = 300
  const g = computeGame(game(2, [R(2, 1, [60, 100]), R(2, 0, [100, 60])], { target: 160 }));
  // раунд1: загрузился 1 (100 vs 60) -> [60,100]; раунд2: загрузился 0 -> [100,60] => [160,160], цель 160
  assert.deepEqual(g.totals, [160, 160]);
  assert.equal(g.winner, 1); // 0 был загрузившимся в последней сдаче
});

test('деберц: мгновенная победа', () => {
  const g = computeGame(game(2, [R(2, 0, [90, 62]), { type: 'debertz', side: 1 }]));
  assert.equal(g.finished, true);
  assert.equal(g.winner, 1);
});
