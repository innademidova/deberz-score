// Всё хранится только на устройстве (localStorage). Сервера нет.
const KEY = 'deberz.v1';
let S = null;

export const uid = () => Math.random().toString(36).slice(2, 10);

export function state() {
  if (S) return S;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { console.warn('deberz: не прочитать данные', e); }
  S = S && typeof S === 'object' ? S : {};
  S.teams ??= []; // {id,name,members[]}: сохранённые команды и игроки
  S.games ??= [];
  S.currentId ??= null;
  S.last ??= null; // последний состав для «сыграть ещё»
  return S;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state())); }
  catch (e) { console.warn('deberz: не сохранить данные', e); toast?.('Не удалось сохранить — память устройства заполнена или запрещена'); }
}

let toast = null;
export const setToast = (fn) => { toast = fn; };

export function exportJson() { return JSON.stringify(state(), null, 1); }
export function importJson(text) {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.games) || !Array.isArray(d.teams)) throw new Error('Это не файл Деберц');
  S = d; save();
}
