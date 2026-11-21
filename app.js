import { computeGame, newRound, roundPoints, comboPoints, FULL_DECK_TOTAL, LAST_TRICK, DEFAULT_SETTINGS } from './scoring.js';
import * as store from './store.js';

const S = store.state();
const $ = (s) => document.querySelector(s);
const app = $('#app');
const layer = $('#layer');

// ---------- мелкие помощники ----------
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'value') e.value = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(9)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}
const sign = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0');
const fmt = (n) => (n < 0 ? '−' + Math.abs(n) : String(n));
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}
store.setToast(toast);

function sheet(build, cls = '') {
  const back = h('div', { class: 'back' });
  const panel = h('div', { class: 'sheet ' + cls });
  back.append(panel);
  const close = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  const api = { close, render: () => { panel.replaceChildren(h('div', { class: 'grab' }), ...[].concat(build(api))); } };
  api.render();
  layer.append(back);
  return api;
}
function ask(text, okLabel, danger = true) {
  return new Promise((res) => {
    sheet((s) => [
      h('h3', null, text),
      h('div', { class: 'stack' },
        h('button', { class: 'btn' + (danger ? ' danger' : ''), onclick: () => { s.close(); res(true); } }, okLabel),
        h('button', { class: 'btn secondary', onclick: () => { s.close(); res(false); } }, 'Отмена')),
    ]);
  });
}

// ---------- данные ----------
const gameById = (id) => S.games.find((g) => g.id === id);
const currentGame = () => { const g = gameById(S.currentId); return g && !computeGame(g).finished ? g : null; };
const isTeams = (g) => g.mode === 't2';
const defName = (mode, i) => (mode === 't2' ? 'Команда ' + (i + 1) : 'Игрок ' + (i + 1));
const sidesCount = (mode) => (mode === 'p3' ? 3 : 2);
const modeLabel = { p2: '2 игрока', p3: '3 игрока', t2: '2 × 2 команды' };
const find = (name) => S.teams.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());

function rememberSide(side, typed) {
  // сохраняем в списке команд/игроков, чтобы потом выбирать одним нажатием и видеть историю
  const name = side.name.trim();
  if (!name || !typed) return side;
  let t = find(name);
  const members = (side.members || []).map((m) => m.trim()).filter(Boolean);
  if (!t) { t = { id: store.uid(), name, members }; S.teams.push(t); }
  else if (members.length) t.members = members;
  return { ...side, name, members, teamId: t.id };
}

function startGame(setup) {
  const sides = setup.sides.map((s, i) => {
    const typed = !!s.name.trim();
    const side = { name: s.name.trim() || defName(setup.mode, i), members: s.members || [], teamId: s.teamId };
    return rememberSide(side, typed);
  });
  const g = {
    id: store.uid(), created: Date.now(), mode: setup.mode, target: setup.target, simple: !!setup.simple, sides, rounds: [],
    settings: { ...DEFAULT_SETTINGS, ...(S.settings || {}) },
  };
  S.games.push(g); S.currentId = g.id;
  S.last = { mode: setup.mode, target: setup.target, simple: !!setup.simple, sides: sides.map((s) => ({ name: s.name, members: s.members, teamId: s.teamId })) };
  store.save();
  location.hash = '#/game/' + g.id;
}

// ---------- роутер ----------
function route() {
  const [, page, id] = location.hash.split('/');
  layer.replaceChildren();
  window.scrollTo(0, 0);
  const view = { undefined: home, '': home, new: newGame, history, teams, game: () => gameView(id), team: () => teamView(id) }[page] || home;
  app.replaceChildren(view());
}
window.addEventListener('hashchange', route);

function tabs(active) {
  const t = (key, ico, label, href) => h('button', { class: active === key ? 'on' : '', onclick: () => (location.hash = href) }, h('span', null, ico), label);
  return h('nav', { class: 'tabs' }, h('div', { class: 'in' }, t('home', '🂡', 'Игра', '#/'), t('history', '📜', 'История', '#/history'), t('teams', '👥', 'Команды', '#/teams')));
}

// ---------- главный экран ----------
function home() {
  const cur = currentGame();
  const last = S.last;
  const wrap = h('div', { class: 'stack' }, h('div', null, h('h1', null, 'Деберц'), h('div', { class: 'muted' }, 'Харьковский · счёт без интернета')));
  if (cur) {
    const r = computeGame(cur);
    wrap.append(h('div', { class: 'card stack' },
      h('div', { class: 'row between' }, h('b', null, 'Партия идёт'), h('span', { class: 'muted small' }, `цель ${cur.target} · сдач ${r.rows.length}`)),
      h('div', { class: 'scores n' + cur.sides.length }, cur.sides.map((s, i) => miniScore(s, i, r.totals[i]))),
      h('button', { class: 'btn', onclick: () => (location.hash = '#/game/' + cur.id) }, 'Продолжить партию')));
  }
  if (last) {
    wrap.append(h('button', { class: 'btn' + (cur ? ' secondary' : ''), onclick: () => startGame({ ...last, sides: last.sides.map((s) => ({ ...s })) }) },
      h('span', null, '▶'), h('span', null, 'Ещё партию: ' + last.sides.map((s) => s.name).join(' — '))));
  }
  wrap.append(h('button', { class: 'btn' + (cur || last ? ' secondary' : ''), onclick: () => (location.hash = '#/new') }, '＋ Новая игра'));
  wrap.append(h('button', { class: 'btn ghost', onclick: rulesSheet }, 'Как считаются очки'));
  if (!S.games.length) wrap.append(h('div', { class: 'empty small' }, 'Нажмите «Новая игра», введите имена — и записывайте очки после каждой сдачи.'));
  return h('div', null, wrap, tabs('home'));
}
function miniScore(s, i, total) {
  return h('div', { class: 'sc c' + i },
    h('div', { class: 'nm' }, s.name), h('div', { class: 'big' }, fmt(total)));
}

function rulesSheet() {
  sheet((s) => [
    h('h3', null, 'Как считаются очки'),
    h('div', { class: 'rule small' },
      h('p', null, h('b', null, 'Вводите после сдачи: '), 'кто заказал игру, очки за карты во взятках каждой стороны (туз 11, десятка 10, король 4, дама 3, валет 2; козырь: валет 20, девятка 14) и комбинации. Последняя взятка (+10) отмечается кнопкой «Послед».'),
      h('ul', null,
        h('li', null, 'Терц (3 подряд) +20, берц/полтина (4 подряд) +50, бела (козырные К+Д) +20.'),
        h('li', null, h('b', null, 'Заказавший'), ' должен набрать больше каждого соперника (карты + комбинации).'),
        h('li', null, h('b', null, 'Байт'), ' — набрал меньше: заказавший пишет 0, вистующий записывает все очки сдачи. На троих очки заказавшего получает тот, у кого больше (в настройках можно «поровну»).'),
        h('li', null, h('b', null, 'Равенство'), ' — «висячий байт»: заказавший пишет 0, его очки достаются тому, кто выиграет следующую сдачу.'),
        h('li', null, h('b', null, 'Режим «Простой»'), ': выбираете «игру» (162, 182, 202, 212… — сумма очков сдачи вместе с комбинациями) и вводите очки; остальные стороны считаются сами.'),
        h('li', null, 'Штрафы: каждый байт начиная с третьего −100; сдача без взяток −50 (можно отключить).'),
        h('li', null, 'Партия до 1001 (или 301/501). Побеждает набравший больше; при равенстве — вистовавший в последней сдаче. «Деберц» — мгновенная победа.'),
        h('li', null, 'Вчетвером (2×2) играются все 32 карты, поэтому очки второй команды считаются сами: 162 минус очки первой.'))),
    h('p', { class: 'muted small' }, 'Правила в разных компаниях немного отличаются — спорные места вынесены в настройки партии (⋯).'),
    h('button', { class: 'btn secondary', onclick: s.close }, 'Понятно'),
  ]);
}

// ---------- новая игра ----------
let setup = null;
function newGame() {
  if (!setup) {
    const l = S.last;
    setup = l ? { mode: l.mode, target: l.target, simple: !!l.simple, sides: l.sides.map((s) => ({ ...s })) } : { mode: 'p2', target: 1001, simple: false, sides: [{ name: '', members: [] }, { name: '', members: [] }] };
  }
  const draw = () => app.replaceChildren(newGame());
  const setMode = (m) => {
    setup.mode = m;
    const n = sidesCount(m);
    while (setup.sides.length < n) setup.sides.push({ name: '', members: [] });
    setup.sides.length = n;
    setup.sides.forEach((s) => { if (m !== 't2') s.members = []; });
    draw();
  };
  const usedIds = () => setup.sides.map((s) => s.teamId).filter(Boolean);
  const sideCard = (s, i) => {
    const free = S.teams.filter((t) => !usedIds().includes(t.id) || t.id === s.teamId);
    return h('div', { class: 'card stack c' + i },
      h('div', { class: 'row' }, h('span', { class: 'dot' }), h('b', null, defName(setup.mode, i))),
      h('input', {
        class: 'text', placeholder: defName(setup.mode, i), value: s.name, maxlength: 24, autocomplete: 'off',
        oninput: (e) => { s.name = e.target.value; s.teamId = find(s.name)?.id; },
      }),
      setup.mode === 't2' && h('div', { class: 'row' }, [0, 1].map((k) => h('input', {
        class: 'text', placeholder: 'Игрок ' + (k + 1), value: s.members[k] || '', maxlength: 20,
        oninput: (e) => { s.members[k] = e.target.value; },
      }))),
      free.length > 0 && h('div', { class: 'chips' }, free.map((t) => h('button', {
        class: 'chip' + (s.teamId === t.id ? ' on' : ''),
        onclick: () => { s.name = t.name; s.members = [...(t.members || [])]; s.teamId = t.id; draw(); },
      }, t.name))));
  };
  return h('div', { class: 'stack' },
    h('div', { class: 'topbar' }, h('button', { class: 'iconbtn', 'aria-label': 'Назад', onclick: () => history_back() }, '‹'), h('h1', null, 'Новая игра')),
    h('div', { class: 'seg' }, ['p2', 'p3', 't2'].map((m) => h('button', { class: setup.mode === m ? 'on' : '', onclick: () => setMode(m) }, modeLabel[m]))),
    setup.sides.map(sideCard),
    h('div', null, h('label', { class: 'lbl' }, 'Играем до'),
      h('div', { class: 'seg' }, [301, 501, 1001].map((t) => h('button', { class: setup.target === t ? 'on' : '', onclick: () => { setup.target = t; draw(); } }, t)))),
    h('div', null, h('label', { class: 'lbl' }, 'Как записывать сдачи'),
      h('div', { class: 'seg' }, [[false, 'Про'], [true, 'Простой']].map(([v, t]) => h('button', { class: !!setup.simple === v ? 'on' : '', onclick: () => { setup.simple = v; draw(); } }, t))),
      h('div', { class: 'muted small', style: 'margin:6px 2px 0' }, setup.simple ? 'Простой: без терцев, бел и последа — выбираете игру (162, 182, 202…) и вводите очки. Режим можно менять прямо при записи сдачи.' : 'Про: отдельно очки за карты, послед, терцы, берцы и белу. Режим можно менять прямо при записи сдачи.')),
    h('button', { class: 'btn', onclick: () => { const s = setup; setup = null; startGame(s); } }, 'Начать игру'));
}
function history_back() { setup = null; location.hash = '#/'; }

// ---------- экран партии ----------
function gameView(id) {
  const g = gameById(id);
  if (!g) { location.hash = '#/'; return h('div'); }
  const r = computeGame(g);
  const n = g.sides.length;
  const wrap = h('div', null);
  wrap.append(h('div', { class: 'topbar' },
    h('button', { class: 'iconbtn', 'aria-label': 'Назад', onclick: () => (location.hash = '#/') }, '‹'),
    h('div', { class: 'grow' }, h('b', null, `До ${g.target}`), h('span', { class: 'muted small' }, ` · ${modeLabel[g.mode]}`)),
    h('button', { class: 'iconbtn', 'aria-label': 'Меню', onclick: () => gameMenu(g, r) }, '⋯')));
  const maxT = Math.max(...r.totals);
  const leaders = r.totals.filter((t) => t === maxT).length;
  wrap.append(h('div', { class: 'scores n' + n }, g.sides.map((s, i) => h('button', {
    class: `sc c${i}` + (r.finished && r.winner === i ? ' win' : '') + (!r.finished && g.rounds.length && r.totals[i] === maxT && leaders === 1 ? ' lead' : ''), onclick: () => editSide(g, i), 'aria-label': 'Изменить ' + s.name,
  }, h('div', { class: 'nm' }, (r.finished && r.winner === i ? '🏆 ' : '') + s.name),
    (s.members || []).filter(Boolean).length ? h('div', { class: 'mem' }, s.members.filter(Boolean).join(' · ')) : null,
    h('div', { class: 'big' }, fmt(r.totals[i])),
    h('div', { class: 'bar' }, h('i', { style: `width:${Math.max(0, Math.min(100, (r.totals[i] / g.target) * 100))}%` })),
    h('div', { class: 'left' }, r.finished ? '' : `ещё ${fmt(Math.max(0, g.target - r.totals[i]))}`)))));
  if (g.rounds.length && !r.finished) {
    const sorted = [...r.totals.keys()].sort((x, y) => r.totals[y] - r.totals[x]);
    const gap = r.totals[sorted[0]] - r.totals[sorted[1]];
    wrap.append(h('div', { class: 'lead-line' }, gap === 0 ? 'Ничья — всё решит следующая сдача' : [h('b', { class: 'c' + sorted[0] }, g.sides[sorted[0]].name), ` ведёт на ${gap}`]));
  }
  if (g.rounds.length >= 2) wrap.append(trend(g, r));
  const metas = [];
  if (r.hanging > 0 && !r.finished) metas.push(h('span', { class: 'pill warn' }, `висячий байт ${r.hanging}`));
  g.sides.forEach((s, i) => { if (r.baits[i] > 0) metas.push(h('span', { class: 'pill' + (r.baits[i] >= 2 ? ' warn' : '') }, `${s.name}: байтов ${r.baits[i]}`)); });
  if (metas.length) wrap.append(h('div', { class: 'meta' }, metas));

  const list = h('div', { class: 'rounds' });
  if (!g.rounds.length) list.append(h('div', { class: 'empty' }, h('b', null, 'Пока ни одной сдачи'), 'После каждой сдачи нажмите «＋ Сдача» и введите очки.'));
  else {
    for (let k = r.rows.length - 1; k >= 0; k--) list.append(roundRow(g, r.rows[k], k, n, k === r.rows.length - 1));
  }
  wrap.append(list);
  if (r.finished) {
    wrap.append(h('div', { class: 'stack', style: 'margin-top:12px' },
      h('div', { class: 'card', style: 'text-align:center' }, h('div', { class: 'big-ico' }, '🏆'), h('b', null, `Победа: ${g.sides[r.winner].name}`),
        h('div', { class: 'muted' }, g.sides.map((s, i) => `${s.name} ${fmt(r.totals[i])}`).join(' : '))),
      h('button', { class: 'btn', onclick: () => startGame({ mode: g.mode, target: g.target, simple: g.simple, sides: g.sides.map((s) => ({ ...s })) }) }, 'Ещё партию тем же составом'),
      h('button', { class: 'btn secondary', onclick: () => undoLast(g) }, 'Отменить последнюю сдачу')));
  } else {
    wrap.append(h('div', { class: 'fab' }, h('button', { class: 'btn', onclick: () => roundSheet(g) }, '＋ Сдача')));
    if (g.rounds.length) wrap.append(h('div', { style: 'text-align:center;margin-top:6px' }, h('button', { class: 'btn ghost sm', onclick: () => undoLast(g) }, '↶ Отменить последнюю')));
  }
  return wrap;
}

function roundRow(g, row, k, n, latest) {
  const rnd = g.rounds[k];
  const cls = 'rrow n' + n + (latest ? ' latest' : '');
  if (row.kind === 'debertz') return h('button', { class: cls, onclick: () => roundSheet(g, k) }, h('div', { class: 'no' }, k + 1), h('div', { class: 'cell', style: 'grid-column: 2 / -1' }, h('b', null, `Деберц! ${g.sides[rnd.side].name} побеждает`)));
  const cells = g.sides.map((s, i) => {
    const isL = row.loader === i;
    const tag = isL ? h('span', { class: 'tag ' + (row.kind === 'ok' ? 'load' : row.kind) }, row.kind === 'bait' ? 'БАЙТ' : row.kind === 'hang' ? 'ВИСИТ' : 'заказ') : null;
    return h('div', { class: 'cell c' + i },
      h('span', { class: 'd' + (row.delta[i] === 0 ? ' zero' : '') }, sign(row.delta[i])), tag, h('span', { class: 't' }, fmt(row.totals[i])));
  });
  const el = h('button', { class: cls, onclick: () => roundSheet(g, k) },
    h('div', { class: 'no' }, h('b', null, k + 1), rnd.total ? h('small', null, rnd.total) : null), cells);
  const combos = g.sides.map((s, i) => { const t = (comboText(rnd.combos[i]) + (rnd.last === i ? ' послед' : '')).trim(); return t && (n > 2 || isTeams(g) ? `${s.name}: ${t}` : `${s.name}: ${t}`); }).filter(Boolean);
  const notes = [...combos, ...row.notes];
  if (notes.length) el.append(h('div', { class: 'note' }, notes.join(' · ')));
  return el;
}
// график хода партии: накопленные очки по сдачам
function trend(g, r) {
  const W = 320, H = 64, P = 6, n = g.sides.length;
  const series = g.sides.map((_, i) => [0, ...r.rows.map((row) => row.totals[i])]);
  const maxY = Math.max(g.target * 0.12, ...series.flat());
  const X = (j) => P + (j / (series[0].length - 1)) * (W - 2 * P);
  const Y = (v) => H - P - (v / maxY) * (H - 2 * P);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'trend'); svg.setAttribute('aria-hidden', 'true');
  const add = (tag, at) => { const el = document.createElementNS(ns, tag); for (const k in at) el.setAttribute(k, at[k]); svg.append(el); return el; };
  if (maxY >= g.target) add('line', { x1: P, x2: W - P, y1: Y(g.target), y2: Y(g.target), class: 'goal' });
  series.forEach((s, i) => {
    add('polyline', { points: s.map((v, j) => `${X(j).toFixed(1)},${Y(v).toFixed(1)}`).join(' '), class: 'ln c' + i });
    add('circle', { cx: X(s.length - 1).toFixed(1), cy: Y(s.at(-1)).toFixed(1), r: 3.5, class: 'dot c' + i });
  });
  return h('div', { class: 'trendbox' }, svg);
}
const comboText = (c) => [c.terc ? 'терц' + (c.terc > 1 ? '×' + c.terc : '') : '', c.berc ? 'берц' + (c.berc > 1 ? '×' + c.berc : '') : '', c.bela ? 'бела' : ''].filter(Boolean).join(' ');

async function undoLast(g) {
  if (!g.rounds.length) return;
  if (!(await ask('Отменить последнюю сдачу?', 'Отменить'))) return;
  g.rounds.pop(); S.currentId = g.id; store.save(); route();
}

// ---------- лист ввода сдачи ----------
function modeSwitch(g, current, getDraft, editIndex) {
  const go = (target) => {
    if (target === current) return;
    const d = getDraft();
    const n = g.sides.length;
    const seed = target === 'simple'
      ? (() => { const cards = Array.from({ length: n }, (_, i) => roundPoints(d, i)); return { ...d, cards, last: null, combos: d.combos.map(() => ({ terc: 0, berc: 0, bela: false })), noTricks: Array(n).fill(false), total: cards.reduce((a, b) => a + b, 0) }; })()
      : { ...d, total: undefined };
    document.querySelectorAll('#layer .back').forEach((b) => b.remove());
    g.simple = target === 'simple'; if (S.last) S.last.simple = g.simple; store.save();
    roundSheet(g, editIndex, target, seed);
  };
  return h('div', { class: 'seg mode' }, [['simple', 'Простой'], ['pro', 'Про']].map(([m, t]) => h('button', { class: current === m ? 'on' : '', onclick: () => go(m) }, t)));
}

function roundSheet(g, editIndex = null, force = null, seed = null) {
  const mode = force || (editIndex != null ? (g.rounds[editIndex].total != null ? 'simple' : 'pro') : g.simple ? 'simple' : 'pro');
  if (mode === 'simple') return roundSheetSimple(g, editIndex, seed);
  const n = g.sides.length;
  const full = isTeams(g);
  const src = seed || (editIndex != null ? g.rounds[editIndex] : null);
  const prevLoader = g.rounds.filter((r) => r.type === 'round').at(-1)?.loader ?? null;
  const st = src
    ? { loader: src.loader, cards: src.cards.map(String), last: src.last, combos: src.combos.map((c) => ({ ...c })), noTricks: [...src.noTricks], active: 0, primary: 0 }
    : { loader: null, cards: Array(n).fill(''), last: null, combos: Array.from({ length: n }, () => ({ terc: 0, berc: 0, bela: false })), noTricks: Array(n).fill(false), active: 0, primary: 0 };
  const toRound = () => ({ ...newRound(n, st.loader), cards: st.cards.map((c) => Number(c) || 0), last: st.last, combos: st.combos, noTricks: st.noTricks });
  const autoFill = () => {
    if (!full) return;
    const total = FULL_DECK_TOTAL - (st.last != null ? LAST_TRICK : 0);
    const p = st.primary;
    if (st.cards[p] === '') { st.cards[1 - p] = ''; return; }
    st.cards[1 - p] = String(Math.max(0, total - Number(st.cards[p])));
  };
  const sheetApi = sheet((s) => {
    const preview = () => {
      if (st.loader == null) return h('div', { class: 'preview' }, h('div', { class: 'msg muted' }, 'Отметьте, кто заказал игру'));
      const base = { ...g, rounds: g.rounds.slice(0, editIndex ?? g.rounds.length) };
      const res = computeGame({ ...base, rounds: [...base.rounds, toRound()] });
      const row = res.rows[res.rows.length - 1];
      const msg = row.kind === 'bait' ? ['bait', `Байт: ${g.sides[st.loader].name}`] : row.kind === 'hang' ? ['hang', 'Поровну — висячий байт'] : ['ok', 'Заказ выполнен'];
      return h('div', { class: 'preview' },
        h('div', { class: 'nums n' + n }, g.sides.map((x, i) => h('div', { class: 'c' + i }, h('b', null, sign(row.delta[i])), h('span', { class: 'muted small' }, ' = ' + fmt(row.totals[i]))))),
        h('div', { class: 'msg ' + msg[0] }, msg[1] + (row.notes.length ? ' · ' + row.notes.join(' · ') : '') + (res.finished ? ' · 🏆 партия окончена' : '')));
    };
    const key = (k) => {
      const a = st.active;
      let v = st.cards[a];
      if (k === '⌫') v = v.slice(0, -1);
      else if (v.length < 3) v += k;
      v = v === '' ? '' : String(Math.min(999, Number(v)));
      st.cards[a] = v;
      if (full) { st.primary = a; autoFill(); }
      s.render();
    };
    return [
      h('div', { class: 'sbody' },
      h('div', { class: 'lrow' }, h('label', { class: 'lbl' }, `Сдача ${editIndex != null ? editIndex + 1 : g.rounds.length + 1} · кто заказал?`), modeSwitch(g, 'pro', toRound, editIndex)),
      h('div', { class: 'who' }, g.sides.map((x, i) => h('button', { class: `c${i}` + (st.loader === i ? ' on' : ''), onclick: () => { st.loader = i; s.render(); } }, x.name))),
      h('div', { class: 'rgrid n' + n }, g.sides.map((x, i) => h('div', { class: 'col c' + i },
        h('button', { class: 'pts' + (st.active === i ? ' active' : '') + (st.cards[i] === '' ? ' empty' : ''), onclick: () => { st.active = i; if (full) st.primary = i; s.render(); } },
          h('span', { class: 'who-n' }, x.name), st.cards[i] === '' ? '0' : st.cards[i], full && st.primary !== i && st.cards[i] !== '' && h('small', null, 'авто')),
        h('div', { class: 'tgs' },
          h('button', { class: 'tg' + (st.last === i ? ' on' : ''), onclick: () => { st.last = st.last === i ? null : i; autoFill(); s.render(); } }, 'Послед', h('b', null, '+10')),
          h('button', { class: 'tg' + (st.combos[i].terc ? ' on' : ''), onclick: () => { st.combos[i].terc = (st.combos[i].terc + 1) % 4; s.render(); } }, 'Терц', h('b', null, st.combos[i].terc ? `×${st.combos[i].terc}` : '20')),
          h('button', { class: 'tg' + (st.combos[i].berc ? ' on' : ''), onclick: () => { st.combos[i].berc = (st.combos[i].berc + 1) % 3; s.render(); } }, 'Берц', h('b', null, st.combos[i].berc ? `×${st.combos[i].berc}` : '50')),
          h('button', { class: 'tg' + (st.combos[i].bela ? ' on' : ''), onclick: () => { st.combos[i].bela = !st.combos[i].bela; s.render(); } }, 'Бела', h('b', null, '20'))),
        h('button', { class: 'tg neg' + (st.noTricks[i] ? ' on' : ''), onclick: () => { st.noTricks[i] = !st.noTricks[i]; s.render(); } }, 'Без взяток', h('b', null, '−50')))))),
      h('div', { class: 'sfoot' },
      preview(),
      h('div', { class: 'keys' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0'].map((k) => h('button', { onclick: () => key(k), 'aria-label': k }, k)),
        h('button', { class: 'next', onclick: () => { st.active = (st.active + 1) % n; if (full) st.primary = st.active; s.render(); } }, 'дальше ›')),
      h('div', { class: 'stack', style: 'margin-top:10px' },
        h('button', {
          class: 'btn', disabled: st.loader == null,
          onclick: () => {
            const round = toRound();
            if (editIndex != null) g.rounds[editIndex] = round; else g.rounds.push(round);
            S.currentId = g.id; store.save(); s.close();
            route();
          },
        }, editIndex != null ? 'Сохранить' : 'Записать'),
        editIndex != null && h('button', { class: 'btn danger', onclick: async () => { if (await ask('Удалить эту сдачу?', 'Удалить')) { g.rounds.splice(editIndex, 1); store.save(); s.close(); route(); } } }, 'Удалить сдачу'))),
    ];
  }, 'split');
  return sheetApi;
}

// ---------- простой ввод: выбираем «игру» (162/182/202…) и пишем очки ----------
const TOTALS = [162, 182, 202, 212, 222, 232, 252];
function roundSheetSimple(g, editIndex = null, seed = null) {
  const n = g.sides.length;
  const src = seed || (editIndex != null ? g.rounds[editIndex] : null);
  const lastTotal = [...g.rounds].reverse().find((r) => r.total)?.total ?? 162;
  const st = {
    loader: src ? src.loader : null, total: src?.total ?? lastTotal,
    cards: src ? src.cards.map(String) : Array(n).fill(''), manual: src ? [...Array(n - 1).keys()] : [],
    active: 0, fresh: true, totalStr: '',
    nt: src ? src.noTricks.map((v) => (seed && !v ? null : v)) : Array(n).fill(null), // null = авто: 0 очков → без взяток
  };
  const noTr = (i) => (st.nt[i] != null ? st.nt[i] : st.cards[i] === '0');
  const refill = () => {
    const autos = [...Array(n).keys()].filter((i) => !st.manual.includes(i));
    if (autos.length !== 1) return;
    const vals = st.manual.map((i) => st.cards[i]);
    st.cards[autos[0]] = vals.some((v) => v === '') ? '' : String(Math.max(0, st.total - vals.reduce((a, v) => a + Number(v), 0)));
  };
  const touch = (i) => { st.manual = st.manual.filter((x) => x !== i); st.manual.push(i); while (st.manual.length > n - 1) st.manual.shift(); };
  const toRound = () => ({ ...newRound(n, st.loader), cards: st.cards.map((c) => Number(c) || 0), total: st.total, noTricks: g.sides.map((_, i) => noTr(i)) });
  return sheet((s) => {
    const preview = () => {
      if (st.loader == null) return h('div', { class: 'preview' }, h('div', { class: 'msg muted' }, 'Отметьте, кто заказал игру'));
      const base = g.rounds.slice(0, editIndex ?? g.rounds.length);
      const res = computeGame({ ...g, rounds: [...base, toRound()] });
      const row = res.rows[res.rows.length - 1];
      const msg = row.kind === 'bait' ? ['bait', `Байт: ${g.sides[st.loader].name}`] : row.kind === 'hang' ? ['hang', 'Поровну — висячий байт'] : ['ok', 'Заказ выполнен'];
      const sum = toRound().cards.reduce((a, b) => a + b, 0);
      return h('div', { class: 'preview' },
        h('div', { class: 'nums n' + n }, g.sides.map((x, i) => h('div', { class: 'c' + i }, h('b', null, sign(row.delta[i])), h('span', { class: 'muted small' }, ' = ' + fmt(row.totals[i]))))),
        h('div', { class: 'msg ' + msg[0] }, msg[1] + (row.notes.length ? ' · ' + row.notes.join(' · ') : '') + (res.finished ? ' · 🏆 партия окончена' : '') + (sum !== st.total ? ` · сумма ${sum} из ${st.total}` : '')));
    };
    const key = (k) => {
      if (st.active === -1) { // своя «игра»
        st.totalStr = k === '⌫' ? st.totalStr.slice(0, -1) : (st.fresh ? '' : st.totalStr) + k;
        st.fresh = false; st.totalStr = st.totalStr.slice(0, 3);
        st.total = Number(st.totalStr) || 0; refill(); return s.render();
      }
      const a = st.active;
      let v = st.fresh ? '' : st.cards[a];
      if (k === '⌫') v = st.fresh ? '' : v.slice(0, -1); else if (v.length < 3) v += k;
      st.fresh = false;
      st.cards[a] = v === '' ? '' : String(Math.min(999, Number(v)));
      touch(a); refill(); s.render();
    };
    const pick = (i) => { st.active = i; st.fresh = true; s.render(); };
    const custom = !TOTALS.includes(st.total) || st.active === -1;
    return [
      h('div', { class: 'sbody' },
        h('div', { class: 'lrow' }, h('label', { class: 'lbl' }, `Сдача ${editIndex != null ? editIndex + 1 : g.rounds.length + 1} · кто заказал?`), modeSwitch(g, 'simple', toRound, editIndex)),
        h('div', { class: 'who' }, g.sides.map((x, i) => h('button', { class: `c${i}` + (st.loader === i ? ' on' : ''), onclick: () => { st.loader = i; s.render(); } }, x.name))),
        h('label', { class: 'lbl', style: 'margin-top:8px' }, 'Игра на (сумма очков сдачи)'),
        h('div', { class: 'chips tot' }, TOTALS.map((t) => h('button', { class: 'chip' + (st.total === t && st.active !== -1 ? ' on' : ''), onclick: () => { st.total = t; if (st.active === -1) st.active = 0; st.fresh = true; refill(); s.render(); } }, t)),
          h('button', { class: 'chip' + (custom ? ' on' : ''), onclick: () => { st.active = -1; st.fresh = true; st.totalStr = ''; s.render(); } }, custom ? `Своя: ${st.total}` : 'Своя')),
        h('div', { class: 'rgrid n' + n, style: 'margin-top:8px' }, g.sides.map((x, i) => h('div', { class: 'col c' + i },
          h('button', { class: 'pts' + (st.active === i ? ' active' : '') + (st.cards[i] === '' ? ' empty' : ''), onclick: () => pick(i) },
            h('span', { class: 'who-n' }, x.name), st.cards[i] === '' ? '0' : st.cards[i], !st.manual.includes(i) && st.cards[i] !== '' && h('small', null, 'авто')),
          h('button', { class: 'tg neg' + (noTr(i) ? ' on' : ''), style: 'margin-top:5px;width:100%', onclick: () => { st.nt[i] = !noTr(i); s.render(); } }, 'Без взяток', h('b', null, '−50')))))),
      h('div', { class: 'sfoot' },
        preview(),
        h('div', { class: 'keys' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0'].map((k) => h('button', { onclick: () => key(k), 'aria-label': k }, k)),
          h('button', { class: 'next', onclick: () => { st.active = st.active < 0 ? 0 : (st.active + 1) % n; st.fresh = true; s.render(); } }, 'дальше ›')),
        h('div', { class: 'stack', style: 'margin-top:10px' },
          h('button', {
            class: 'btn', disabled: st.loader == null,
            onclick: () => { const round = toRound(); if (editIndex != null) g.rounds[editIndex] = round; else g.rounds.push(round); S.currentId = g.id; store.save(); s.close(); route(); },
          }, editIndex != null ? 'Сохранить' : 'Записать'),
          editIndex != null && h('button', { class: 'btn danger', onclick: async () => { if (await ask('Удалить эту сдачу?', 'Удалить')) { g.rounds.splice(editIndex, 1); store.save(); s.close(); route(); } } }, 'Удалить сдачу'))),
    ];
  }, 'split');
}

// ---------- изменение сторон/настроек ----------
function editSide(g, i) {
  const side = g.sides[i];
  const draft = { name: side.name, members: [...(side.members || [])], teamId: side.teamId };
  sheet((s) => [
    h('h3', null, isTeams(g) ? 'Команда и игроки' : 'Игрок'),
    h('div', { class: 'stack' },
      h('input', { class: 'text', value: draft.name, maxlength: 24, oninput: (e) => { draft.name = e.target.value; draft.teamId = find(draft.name)?.id; } }),
      isTeams(g) && h('div', { class: 'row' }, [0, 1].map((k) => h('input', { class: 'text', placeholder: 'Игрок ' + (k + 1), value: draft.members[k] || '', maxlength: 20, oninput: (e) => { draft.members[k] = e.target.value; } }))),
      S.teams.length > 0 && h('div', { class: 'chips' }, S.teams.filter((t) => !g.sides.some((x, k) => k !== i && x.teamId === t.id)).map((t) => h('button', { class: 'chip' + (draft.teamId === t.id ? ' on' : ''), onclick: () => { Object.assign(draft, { name: t.name, members: [...(t.members || [])], teamId: t.id }); s.render(); } }, t.name))),
      h('button', {
        class: 'btn', onclick: () => {
          const upd = rememberSide({ name: draft.name.trim() || side.name, members: draft.members, teamId: draft.teamId }, !!draft.name.trim());
          g.sides[i] = upd; store.save(); s.close(); route();
        },
      }, 'Сохранить'),
      h('div', { class: 'muted small' }, 'Имена можно менять в любой момент — очки сохранятся.')),
  ]);
}

function gameMenu(g, r) {
  sheet((s) => [
    h('h3', null, 'Партия'),
    h('div', { class: 'list' },
      h('button', { onclick: () => { s.close(); settingsSheet(g); } }, h('span', null, '⚙️'), h('span', { class: 'grow' }, 'Настройки и спорные правила')),
      !r.finished && h('button', { onclick: () => { s.close(); debertzSheet(g); } }, h('span', null, '🃏'), h('span', { class: 'grow' }, 'Деберц! Мгновенная победа')),
      h('button', { onclick: () => { s.close(); rulesSheet(); } }, h('span', null, '📖'), h('span', { class: 'grow' }, 'Как считаются очки')),
      h('button', { onclick: async () => { s.close(); if (await ask('Удалить партию навсегда?', 'Удалить')) { S.games = S.games.filter((x) => x !== g); if (S.currentId === g.id) S.currentId = null; store.save(); location.hash = '#/history'; } } }, h('span', null, '🗑'), h('span', { class: 'grow' }, 'Удалить партию'))),
  ]);
}
function debertzSheet(g) {
  sheet((s) => [h('h3', null, 'Кто выложил деберц?'), h('div', { class: 'stack' }, g.sides.map((x, i) => h('button', { class: `btn secondary c${i}`, onclick: () => { g.rounds.push({ type: 'debertz', side: i }); store.save(); s.close(); route(); } }, x.name)))]);
}
function settingsSheet(g) {
  g.settings = { ...DEFAULT_SETTINGS, ...(g.settings || {}) };
  sheet((s) => {
    const set = (k, v) => { g.settings[k] = v; S.settings = { ...(S.settings || {}), [k]: v }; store.save(); s.render(); route(); };
    return [
      h('h3', null, 'Настройки партии'),
      h('div', { class: 'stack' },
        h('div', null, h('label', { class: 'lbl' }, 'Играем до'), h('div', { class: 'seg' }, [301, 501, 1001].map((t) => h('button', { class: g.target === t ? 'on' : '', onclick: () => { g.target = t; store.save(); s.render(); route(); } }, t)))),
        h('div', null, h('label', { class: 'lbl' }, 'Запись новых сдач'),
          h('div', { class: 'seg' }, [[false, 'Про'], [true, 'Простой']].map(([v, t]) => h('button', { class: !!g.simple === v ? 'on' : '', onclick: () => { g.simple = v; if (S.last) S.last.simple = v; store.save(); s.render(); route(); } }, t)))),
        h('div', null, h('label', { class: 'lbl' }, 'Штрафы (−100 за 3-й и следующие байты, −50 без взяток)'),
          h('div', { class: 'seg' }, [[true, 'Включены'], [false, 'Выключены']].map(([v, t]) => h('button', { class: g.settings.penalties === v ? 'on' : '', onclick: () => set('penalties', v) }, t)))),
        g.sides.length === 3 && h('div', null, h('label', { class: 'lbl' }, 'Байт на троих: очки заказавшего получает'),
          h('div', { class: 'seg' }, [['most', 'у кого больше'], ['split', 'поровну']].map(([v, t]) => h('button', { class: g.settings.baitMode === v ? 'on' : '', onclick: () => set('baitMode', v) }, t)))),
        h('button', { class: 'btn secondary', onclick: s.close }, 'Готово')),
    ];
  });
}

// ---------- история ----------
function winnerOf(g) { const r = computeGame(g); return { r, done: r.finished }; }
function gameCard(g) {
  const { r, done } = winnerOf(g);
  const d = new Date(g.created);
  return h('button', { class: 'hg', onclick: () => (location.hash = '#/game/' + g.id) },
    h('div', { class: 'row between small muted' }, h('span', null, d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })), h('span', null, done ? `до ${g.target}` : `идёт · до ${g.target}`)),
    h('div', { class: 'sc2' }, g.sides.map((s, i) => h('span', { class: done && r.winner === i ? 'w' : '' }, `${done && r.winner === i ? '🏆 ' : ''}${s.name} ${fmt(r.totals[i])}`))),
    isTeams(g) && g.sides.some((s) => (s.members || []).some(Boolean)) && h('div', { class: 'muted small' }, g.sides.map((s) => (s.members || []).filter(Boolean).join(' + ') || '—').join(' · ')));
}
function history() {
  const games = [...S.games].sort((a, b) => b.created - a.created).filter((g) => g.rounds.length || g.id === S.currentId);
  return h('div', null, h('h1', null, 'История'), h('div', { style: 'margin-top:12px' },
    games.length ? games.map(gameCard) : h('div', { class: 'empty' }, h('b', null, 'Пока пусто'), 'Сыгранные партии появятся здесь.')), tabs('history'));
}

// ---------- команды и игроки ----------
function teamStats(t) {
  const gs = S.games.filter((g) => g.sides.some((s) => s.teamId === t.id));
  let played = 0, wins = 0;
  gs.forEach((g) => { const r = computeGame(g); if (r.finished) { played++; if (g.sides[r.winner].teamId === t.id) wins++; } });
  return { gs, played, wins };
}
function teams() {
  const wrap = h('div', null, h('div', { class: 'row between' }, h('h1', null, 'Команды и игроки'), h('button', { class: 'btn sm', onclick: () => teamEdit(null) }, '＋')));
  wrap.append(h('div', { class: 'muted small', style: 'margin-bottom:10px' }, 'Сохраняются автоматически, когда вы начинаете игру. Нажмите, чтобы посмотреть историю.'));
  const list = h('div', { class: 'list' });
  if (!S.teams.length) list.append(h('div', { class: 'empty' }, h('b', null, 'Список пуст'), 'Добавьте команду кнопкой «＋» или просто начните игру.'));
  S.teams.forEach((t) => {
    const st = teamStats(t);
    list.append(h('button', { onclick: () => (location.hash = '#/team/' + t.id) },
      h('div', { class: 'grow' }, h('b', null, t.name), t.members?.length > 0 && h('div', { class: 'muted small' }, t.members.join(' · '))),
      h('div', { class: 'stat' }, h('span', null, `${st.played} игр`), h('span', null, `${st.wins} побед`))));
  });
  wrap.append(list);
  wrap.append(h('div', { class: 'row', style: 'margin-top:10px;gap:8px' },
    h('button', { class: 'btn secondary sm', onclick: doExport }, 'Сохранить копию'),
    h('label', { class: 'btn secondary sm', style: 'cursor:pointer' }, 'Загрузить копию', h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: doImport }))));
  wrap.append(tabs('teams'));
  return wrap;
}
function doExport() {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'deberz-backup.json' });
  document.body.append(a); a.click(); a.remove(); toast('Копия сохранена в «Загрузки»');
}
async function doImport(e) {
  const f = e.target.files[0]; if (!f) return;
  try { store.importJson(await f.text()); toast('Данные загружены'); route(); } catch (err) { console.warn('deberz: импорт', err); toast('Не получилось: ' + err.message); }
}
function teamEdit(t) {
  const d = t ? { name: t.name, members: [...(t.members || [])] } : { name: '', members: ['', ''] };
  sheet((s) => [
    h('h3', null, t ? 'Изменить' : 'Новая команда или игрок'),
    h('div', { class: 'stack' },
      h('div', null, h('label', { class: 'lbl' }, 'Название или имя'), h('input', { class: 'text', value: d.name, maxlength: 24, oninput: (e) => { d.name = e.target.value; } })),
      h('div', null, h('label', { class: 'lbl' }, 'Игроки команды (необязательно)'), h('div', { class: 'row' }, [0, 1].map((k) => h('input', { class: 'text', placeholder: 'Игрок ' + (k + 1), value: d.members[k] || '', maxlength: 20, oninput: (e) => { d.members[k] = e.target.value; } })))),
      h('button', {
        class: 'btn', onclick: () => {
          const name = d.name.trim(); if (!name) return toast('Введите название');
          const members = d.members.map((m) => m.trim()).filter(Boolean);
          if (t) { t.name = name; t.members = members; S.games.forEach((g) => g.sides.forEach((x) => { if (x.teamId === t.id) { x.name = name; x.members = members; } })); }
          else if (find(name)) return toast('Такая уже есть');
          else S.teams.push({ id: store.uid(), name, members });
          store.save(); s.close(); route();
        },
      }, 'Сохранить'),
      t && h('button', { class: 'btn danger', onclick: async () => { s.close(); if (await ask('Удалить из списка? Сыгранные партии останутся.', 'Удалить')) { S.teams = S.teams.filter((x) => x !== t); S.games.forEach((g) => g.sides.forEach((x) => { if (x.teamId === t.id) delete x.teamId; })); store.save(); location.hash = '#/teams'; } } }, 'Удалить из списка')),
  ]);
}
function teamView(id) {
  const t = S.teams.find((x) => x.id === id);
  if (!t) { location.hash = '#/teams'; return h('div'); }
  const st = teamStats(t);
  return h('div', { class: 'stack' },
    h('div', { class: 'topbar' }, h('button', { class: 'iconbtn', onclick: () => (location.hash = '#/teams') }, '‹'), h('h1', { class: 'grow' }, t.name), h('button', { class: 'btn sm secondary', onclick: () => teamEdit(t) }, 'Изменить')),
    t.members?.length > 0 && h('div', { class: 'muted' }, t.members.join(' · ')),
    h('div', { class: 'card row between' }, h('div', null, h('b', null, st.played), h('div', { class: 'muted small' }, 'партий')), h('div', null, h('b', null, st.wins), h('div', { class: 'muted small' }, 'побед')), h('div', null, h('b', null, st.played ? Math.round((st.wins / st.played) * 100) + '%' : '—'), h('div', { class: 'muted small' }, 'выигрыш'))),
    h('h2', null, 'Партии'),
    h('div', null, st.gs.length ? [...st.gs].sort((a, b) => b.created - a.created).map(gameCard) : h('div', { class: 'empty' }, 'Пока нет партий')),
    tabs('teams'));
}

// ---------- запуск ----------
if (new URLSearchParams(location.search).has('reset')) { try { localStorage.clear(); } catch (e) { console.warn(e); } }
route();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('deberz: service worker не запустился', e));
  // вышла новая версия — один раз перезагружаем страницу, чтобы сразу показать её
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !window.__reloaded) { window.__reloaded = true; location.reload(); } });
}
