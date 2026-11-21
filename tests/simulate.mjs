// Эмуляция настоящих партий: тасуем колоду, раздаём, играем взятки случайными (законными по масти) ходами,
// считаем очки по картам и сравниваем с движком scoring.js и с независимой "эталонной" записью очков.
// Запуск: node deberz/tests/simulate.mjs [число партий на режим] [seed]
import { computeGame, newRound } from '../scoring.js';

// ---------- детерминированный ГСЧ ----------
let seed = Number(process.argv[3] || 20261121);
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- карты ----------
const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['♠', '♥', '♦', '♣'];
const deck = () => SUITS.flatMap((s) => RANKS.map((r) => ({ r, s })));
const NON = { A: 11, 10: 10, K: 4, Q: 3, J: 2, 9: 0, 8: 0, 7: 0 };
const TR = { J: 20, 9: 14, A: 11, 10: 10, K: 4, Q: 3, 8: 0, 7: 0 };
const pts = (c, t) => (c.s === t ? TR[c.r] : NON[c.r]);
const NON_ORDER = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const TR_ORDER = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];
const power = (c, t, lead) => (c.s === t ? 100 + TR_ORDER.indexOf(c.r) : c.s === lead ? NON_ORDER.indexOf(c.r) : -1);

// ---------- розыгрыш одной сдачи ----------
// mode: p2 (2 игрока по 9 карт), p3 (3 по 9), t2 (4 игрока по 8 карт, команды 0-2 и 1-3)
function playDeal(mode) {
  const players = mode === 'p2' ? 2 : mode === 'p3' ? 3 : 4;
  const perHand = mode === 't2' ? 8 : 9;
  const cards = shuffle(deck());
  const hands = Array.from({ length: players }, (_, i) => cards.slice(i * perHand, (i + 1) * perHand));
  const trump = pick(SUITS);
  const sideOf = (p) => (mode === 't2' ? p % 2 : p);
  const nSides = mode === 't2' ? 2 : players;
  const initial = hands.map((h) => h.slice());

  const tricksBy = Array(nSides).fill(0);
  const cardPts = Array(nSides).fill(0);
  let playedPts = 0;
  let leader = Math.floor(rnd() * players);
  let lastWinnerSide = null;
  for (let t = 0; t < perHand; t++) {
    const played = [];
    for (let k = 0; k < players; k++) {
      const p = (leader + k) % players;
      const h = hands[p];
      const lead = played.length ? played[0].c.s : null;
      let legal = h;
      if (lead) {
        const follow = h.filter((c) => c.s === lead);
        if (follow.length) legal = follow;
        else { const tr = h.filter((c) => c.s === trump); if (tr.length) legal = tr; }
      }
      const c = pick(legal);
      h.splice(h.indexOf(c), 1);
      played.push({ p, c });
    }
    const lead = played[0].c.s;
    const win = played.reduce((a, b) => (power(b.c, trump, lead) > power(a.c, trump, lead) ? b : a));
    const s = sideOf(win.p);
    tricksBy[s]++;
    const sum = played.reduce((x, y) => x + pts(y.c, trump), 0);
    cardPts[s] += sum;
    playedPts += sum;
    leader = win.p;
    if (t === perHand - 1) lastWinnerSide = s;
  }

  // комбинации: каждый объявляет старшую (берц > терц; при равной длине выше старшая карта; козырь приоритета не имеет;
  // при полном равенстве — кто раньше по кругу)
  const declared = [];
  initial.forEach((h, p) => {
    let best = null;
    for (const s of SUITS) {
      const idx = h.filter((c) => c.s === s).map((c) => RANKS.indexOf(c.r)).sort((a, b) => a - b);
      let i = 0;
      while (i < idx.length) {
        let j = i;
        while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
        const len = j - i + 1;
        if (len >= 3) {
          const use = Math.min(len, 4); // 5-6 подряд = берц старшей четвёрки; 7 подряд здесь не бывает (<=9 карт, но редко)
          const top = idx[j];
          const cand = { p, len: use, top };
          if (!best || cand.len > best.len || (cand.len === best.len && cand.top > best.top)) best = cand;
        }
        i = j + 1;
      }
    }
    if (best) declared.push(best);
  });
  let winnerCombo = null;
  for (const d of declared) {
    if (!winnerCombo || d.len > winnerCombo.len || (d.len === winnerCombo.len && d.top > winnerCombo.top)) winnerCombo = d;
  }
  const combos = Array.from({ length: nSides }, () => ({ terc: 0, berc: 0, bela: false }));
  if (winnerCombo && tricksBy[sideOf(winnerCombo.p)] > 0) {
    const c = combos[sideOf(winnerCombo.p)];
    if (winnerCombo.len >= 4) c.berc = 1; else c.terc = 1;
  }
  initial.forEach((h, p) => { // бела: козырные K и Q в одной руке
    if (h.some((c) => c.s === trump && c.r === 'K') && h.some((c) => c.s === trump && c.r === 'Q')) combos[sideOf(p)].bela = true;
  });

  return { nSides, cardPts, playedPts, lastWinnerSide, combos, noTricks: tricksBy.map((t) => t === 0), tricksBy };
}

// ---------- независимая эталонная запись очков (простая, "как на бумаге") ----------
class Paper {
  constructor(n, target, baitMode, penalties) {
    Object.assign(this, { n, target, baitMode, penalties });
    this.score = Array(n).fill(0); this.bt = Array(n).fill(0); this.hang = 0; this.done = false; this.winner = null;
  }
  add(loader, d) {
    const n = this.n;
    const tot = d.cards.map((c, i) => c + (d.last === i ? 10 : 0) + d.combos[i].terc * 20 + d.combos[i].berc * 50 + (d.combos[i].bela ? 20 : 0));
    const opp = [...Array(n).keys()].filter((i) => i !== loader);
    const best = Math.max(...opp.map((i) => tot[i]));
    let win = null, hangNew = 0;
    const add = Array(n).fill(0);
    if (tot[loader] > best) { tot.forEach((v, i) => (add[i] = v)); win = loader; }
    else if (tot[loader] === best) { opp.forEach((i) => (add[i] = tot[i])); hangNew = tot[loader]; }
    else {
      this.bt[loader]++;
      if (n === 2) add[opp[0]] = tot[0] + tot[1];
      else {
        const [a, b] = opp;
        add[a] = tot[a]; add[b] = tot[b];
        if (this.baitMode === 'split' || tot[a] === tot[b]) { add[a] += Math.floor(tot[loader] / 2); add[b] += Math.floor(tot[loader] / 2); }
        else add[tot[a] > tot[b] ? a : b] += tot[loader];
      }
      const mx = Math.max(...opp.map((i) => tot[i]));
      const w = opp.filter((i) => tot[i] === mx);
      if (w.length === 1) win = w[0];
      if (this.penalties && this.bt[loader] >= 3) add[loader] -= 100;
    }
    if (this.hang && win !== null) add[win] += this.hang;
    this.hang = hangNew;
    if (this.penalties) d.noTricks.forEach((z, i) => { if (z) add[i] -= 50; });
    add.forEach((v, i) => (this.score[i] += v));
    if (this.score.some((s) => s >= this.target)) {
      this.done = true;
      const mx = Math.max(...this.score);
      const tied = this.score.map((s, i) => (s === mx ? i : -1)).filter((i) => i >= 0);
      this.winner = (tied.filter((i) => i !== loader)[0]) ?? tied[0];
    }
  }
}

// ---------- прогон ----------
const GAMES = Number(process.argv[2] || 100);
let totalRounds = 0, totalGames = 0, failures = 0;
const samples = {};
for (const mode of ['p2', 'p3', 't2']) {
  for (const baitMode of mode === 'p3' ? ['most', 'split'] : ['most']) {
    let baitsSeen = 0, hangSeen = 0, penaltiesSeen = 0, berc = 0, terc = 0, bela = 0;
    for (let g = 0; g < GAMES; g++) {
      const target = pick([301, 501, 1001]);
      const nSides = mode === 'p3' ? 3 : 2;
      const game = { sides: Array.from({ length: nSides }, (_, i) => ({ name: 'S' + i })), target, rounds: [], settings: { baitMode, penalties: true }, mode };
      const paper = new Paper(nSides, target, baitMode, true);
      let dealer = 0;
      const log = [];
      let rounds = 0;
      while (!paper.done && rounds < 400) {
        const d = playDeal(mode);
        // инвариант: все сыгранные очки карт совпадают с суммой по сторонам; вчетвером играются все 32 карты = 152 + 10 послед = 162
        const sumCards = d.cardPts.reduce((a, b) => a + b, 0);
        if (sumCards !== d.playedPts) { failures++; console.error('INVARIANT sum cards', sumCards, d.playedPts); }
        if (mode === 't2' && sumCards + 10 !== 162) { failures++; console.error('INVARIANT 162', sumCards + 10); }
        const loader = mode === 'p3' ? (dealer + 1 + Math.floor(rnd() * 2)) % 3 : Math.floor(rnd() * 2);
        // реалистичнее: загрузившийся чаще сильнее; но для проверки счёта достаточно случайного
        const round = { ...newRound(nSides, loader), cards: d.cardPts, last: d.lastWinnerSide, combos: d.combos, noTricks: d.noTricks };
        game.rounds.push(round);
        paper.add(loader, { cards: d.cardPts, last: d.lastWinnerSide, combos: d.combos, noTricks: d.noTricks });
        dealer = (dealer + 1) % nSides;
        rounds++;
        d.combos.forEach((c) => { terc += c.terc; berc += c.berc; bela += c.bela ? 1 : 0; });
        const res = computeGame(game);
        // сверка после КАЖДОЙ сдачи
        const ok = res.totals.every((t, i) => t === paper.score[i]) && res.finished === paper.done && res.winner === paper.winner && res.hanging === paper.hang;
        if (!ok) { failures++; console.error('MISMATCH', mode, baitMode, 'round', rounds, res.totals, paper.score, res.winner, paper.winner); break; }
        if (res.rows.at(-1).kind === 'bait') baitsSeen++;
        if (res.rows.at(-1).kind === 'hang') hangSeen++;
        if (res.rows.at(-1).notes.some((n) => n.includes('−'))) penaltiesSeen++;
        const lr = res.rows.at(-1);
        log.push(`#${rounds} загр:S${loader} очки[${lr.pts}] ${lr.kind}${lr.notes.length ? ' (' + lr.notes.join('; ') + ')' : ''} → [${res.totals}]`);
      }
      totalRounds += rounds; totalGames++;
      if (!paper.done) { failures++; console.error('GAME DID NOT FINISH', mode); }
      if (g === 0) samples[`${mode}/${baitMode}`] = { target, log, winner: paper.winner };
    }
    console.log(`${mode.padEnd(3)} ${baitMode.padEnd(5)}: ${GAMES} партий OK | байтов ${baitsSeen}, висячих ${hangSeen}, со штрафами ${penaltiesSeen}, терцы ${terc}, берцы ${berc}, белы ${bela}`);
  }
}
console.log(`\nВсего партий: ${totalGames}, сдач: ${totalRounds}, расхождений: ${failures}`);
for (const [k, v] of Object.entries(samples)) {
  console.log(`\n=== Пример партии ${k}, цель ${v.target}, победитель S${v.winner} ===`);
  console.log(v.log.slice(0, 12).join('\n') + (v.log.length > 12 ? `\n... всего ${v.log.length} сдач` : ''));
}
process.exit(failures ? 1 : 0);
