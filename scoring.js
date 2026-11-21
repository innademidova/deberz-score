// Подсчёт очков харьковского деберца. Чистая логика без DOM: легко тестировать.
// Правила: см. RULES.md (источники: gambler.ru/Deberckh, ru.wikipedia.org/wiki/Деберц, debertc.com).

export const LAST_TRICK = 10;
export const FULL_DECK_TOTAL = 162; // все 32 карты + послед (играют все карты: вчетвером 2×2)
export const COMBO = { terc: 20, berc: 50, bela: 20 };
export const PENALTY_NO_TRICKS = 50;
export const PENALTY_BAIT = 100; // за каждый байт начиная с третьего
export const BAIT_FREE = 2;

export const DEFAULT_SETTINGS = {
  baitMode: 'most', // 3 игрока: очки подсевшего → 'most' тому, у кого больше (при равенстве поровну) | 'split' поровну
  penalties: true, // штрафы: −100 за 3-й и каждый следующий байт, −50 без взяток
};

export function emptyCombo() {
  return { terc: 0, berc: 0, bela: false };
}

export function newRound(n, loader = null) {
  return {
    type: 'round',
    loader,
    cards: Array(n).fill(0), // очки за карты во взятках (без последа)
    last: null, // индекс стороны, взявшей последнюю взятку (+10)
    combos: Array.from({ length: n }, emptyCombo),
    noTricks: Array(n).fill(false),
  };
}

export function comboPoints(c) {
  return c.terc * COMBO.terc + c.berc * COMBO.berc + (c.bela ? COMBO.bela : 0);
}

export function roundPoints(round, i) {
  return (round.cards[i] || 0) + (round.last === i ? LAST_TRICK : 0) + comboPoints(round.combos[i]);
}

// Считает всю партию заново из списка раундов (так правка/удаление любого раунда безопасны).
export function computeGame(game) {
  const n = game.sides.length;
  const settings = { ...DEFAULT_SETTINGS, ...(game.settings || {}) };
  const totals = Array(n).fill(0);
  const baits = Array(n).fill(0);
  let hanging = 0;
  const rows = [];
  let finished = false;
  let winner = null;

  for (const round of game.rounds) {
    if (finished) break;
    if (round.type === 'debertz') {
      rows.push({ kind: 'debertz', delta: Array(n).fill(0), pts: Array(n).fill(0), notes: ['Деберц!'], totals: totals.slice() });
      finished = true;
      winner = round.side;
      break;
    }
    const L = round.loader;
    const pts = Array.from({ length: n }, (_, i) => roundPoints(round, i));
    const others = [...Array(n).keys()].filter((i) => i !== L);
    const maxOther = Math.max(...others.map((i) => pts[i]));
    const delta = Array(n).fill(0);
    const notes = [];
    let kind;
    let roundWinner = null;
    let newHanging = 0;

    if (pts[L] > maxOther) {
      kind = 'ok';
      for (let i = 0; i < n; i++) delta[i] = pts[i];
      roundWinner = L;
    } else if (pts[L] === maxOther) {
      kind = 'hang'; // висячий байт: свои очки пишут все, кроме загрузившегося; его очки «висят»
      for (const i of others) delta[i] = pts[i];
      newHanging = pts[L];
    } else {
      kind = 'bait';
      baits[L]++;
      if (n === 2) {
        delta[others[0]] = pts[others[0]] + pts[L];
      } else {
        for (const i of others) delta[i] = pts[i];
        const [a, b] = others;
        if (settings.baitMode === 'most' && pts[a] !== pts[b]) {
          delta[pts[a] > pts[b] ? a : b] += pts[L];
        } else {
          delta[a] += Math.floor(pts[L] / 2);
          delta[b] += Math.floor(pts[L] / 2);
        }
      }
      const top = Math.max(...others.map((i) => pts[i]));
      const tops = others.filter((i) => pts[i] === top);
      if (tops.length === 1) roundWinner = tops[0];
      if (settings.penalties && baits[L] > BAIT_FREE) {
        delta[L] -= PENALTY_BAIT;
        notes.push(`байт №${baits[L]}: −${PENALTY_BAIT}`);
      }
    }

    if (hanging > 0) {
      if (roundWinner != null) {
        delta[roundWinner] += hanging;
        notes.push(`+${hanging} висячий байт`);
      } else {
        notes.push(`висячий байт ${hanging} сгорел`);
      }
    }
    hanging = newHanging;

    if (settings.penalties) {
      for (let i = 0; i < n; i++) {
        if (round.noTricks[i]) {
          delta[i] -= PENALTY_NO_TRICKS;
          notes.push(`без взяток: −${PENALTY_NO_TRICKS}`);
        }
      }
    }

    for (let i = 0; i < n; i++) totals[i] += delta[i];

    const reached = totals.filter((t) => t >= game.target).length > 0;
    if (reached) {
      finished = true;
      const best = Math.max(...totals);
      const tied = [...Array(n).keys()].filter((i) => totals[i] === best);
      // при равенстве побеждает вистовавший в последней сдаче (не загрузившийся)
      const nonLoader = tied.filter((i) => i !== L);
      winner = (nonLoader.length ? nonLoader : tied)[0];
    }
    rows.push({ kind, delta, pts, notes, totals: totals.slice(), loader: L });
  }

  return { totals, rows, baits, hanging, finished, winner };
}
