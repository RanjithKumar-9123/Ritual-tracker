const KEY = "habit-tracker-v1", PREF = "habit-prefs-v1";   // KEY = old v1 data, read once for migration
let habits = [], popKey = "";
const vstate = new Map();   // remembers each habit's scroll state so re-renders don't replay it
let openCat = 0, chartMode = "week", lastLv = 0, dropId = 0;
const io = ("IntersectionObserver" in window) ? new IntersectionObserver(es => es.forEach(en => {
  const el = en.target, id = el.dataset.hid;
  const ns = en.isIntersecting ? "in" : (en.boundingClientRect.top < 0 ? "out-up" : "out-down");
  if (vstate.get(id) === ns) return;
  vstate.set(id, ns);
  el.classList.remove("in", "out-up", "out-down"); el.classList.add(ns);
}), {threshold: 0, rootMargin: "0px 0px -8% 0px"}) : null;
const quotes = ["Small steps every day lead to big summits.","Show up today. Future you is watching.","Motivation starts it. Habits finish it.","One star at a time.","Progress, not perfection.","Your streak is a promise you keep to yourself.","Make today count, then do it again."];
const tips = ["Small steps, big results.","Show up today.","Consistency beats intensity.","One more star to earn.","Building momentum..."];
function setQuote(){
  const n = new Date(), day = Math.floor((n - new Date(n.getFullYear(), 0, 0)) / 864e5);
  document.getElementById("quote").textContent = quotes[day % quotes.length];
}
const DEFAULT_PREFS = {theme: "system", user: null, font: "inter", size: "m", accent: "blue", sound: true, haptics: true, remind: false, nview: "list"};
let prefs = Object.assign({}, DEFAULT_PREFS);

function rd(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } }
function wr(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
function savePrefs(){ wr(PREF, prefs); }

function applyTheme(){
  const r = document.documentElement;
  r.setAttribute("data-theme", prefs.theme);
  r.style.setProperty("--font", (FONTS[prefs.font] || FONTS.inter)[1]);
  r.style.fontSize = (SIZES[prefs.size] || SIZES.m)[1];
  const a = ACCENTS[prefs.accent] && ACCENTS[prefs.accent][1];
  ["--blue","--blue-d","--blue-soft"].forEach(v => r.style.removeProperty(v));
  if (a) { r.style.setProperty("--blue", a[0]); r.style.setProperty("--blue-d", a[1]); r.style.setProperty("--blue-soft", a[0] + "24"); }
}

function key(d){
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function moveTrail(p){
  const hero = document.querySelector(".hero"), path = hero.querySelector(".trail"), pg = hero.querySelector(".prog"), mk = hero.querySelector(".mk");
  const L = path.getTotalLength(), pt = path.getPointAtLength(L * p / 100);
  pg.style.strokeDasharray = L; pg.style.strokeDashoffset = L * (1 - p / 100);
  mk.style.transform = "translate(" + pt.x + "px," + pt.y + "px)";
  hero.classList.toggle("complete", p === 100);
}
function observeStatic(){
  document.querySelectorAll("#home .rv").forEach(el => { if (io) io.observe(el); else { el.classList.remove("out-down", "out-up"); el.classList.add("in"); } });
}
function moveSky(p){   // p = this week's completion (0-100): moon rises and fills, birds fly left to right
  const hero = document.querySelector(".hero"), f = p / 100, r = 13;
  const moon = hero.querySelector(".moon"), lit = hero.querySelector(".moonlit"), birds = hero.querySelector(".birds");
  moon.style.transform = "translate(430px," + (62 - 36 * f) + "px)";
  lit.setAttribute("d", "M0 " + -r + "A" + r + " " + r + " 0 0 1 0 " + r + "A" + Math.max(.01, r * f) + " " + r + " 0 0 1 0 " + -r + "Z");
  moon.classList.toggle("full", p >= 100);
  birds.style.transform = "translate(" + (135 + 330 * f) + "px," + (18 + 10 * Math.sin(f * Math.PI)) + "px)";
}
function buildGrass(){
  const hero = document.querySelector(".hero");
  const mk = (step, hmin, hmax, seed) => {
    let d = "";
    for (let x = -4, i = 0; x < 604; x += step, i++) {
      const h = hmin + (hmax - hmin) * (.5 + .5 * Math.sin(i * 12.9898 + seed)), lean = Math.sin(i * 4.1 + seed) * 3;
      d += "M" + x + " 110Q" + (x + 1 + lean / 2) + " " + (110 - h * .6) + " " + (x + 3 + lean) + " " + (110 - h) + "Q" + (x + 4) + " " + (110 - h * .5) + " " + (x + 7) + " 110Z";
    }
    return d;
  };
  hero.querySelector(".gr1").setAttribute("d", mk(7, 10, 22, 1));
  hero.querySelector(".gr2").setAttribute("d", mk(6, 6, 15, 7));
}
function weekStart(d){ const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function daysAgo(n){ const d = new Date(); d.setDate(d.getDate() - n); return d; }
function toast(msg, act){
  const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  if (act) { const b = document.createElement("button"); b.textContent = act.label; b.addEventListener("click", () => { act.fn(); t.remove(); }); t.appendChild(b); }
  document.body.appendChild(t); setTimeout(() => t.remove(), act ? 7000 : 2400);
}
function openModal(html, setup){   // shared dialog: Escape and outside-click close it, focus returns afterwards
  const ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = '<div class="modal wide" role="dialog" aria-modal="true">' + html + '</div>';
  const prev = document.activeElement, close = () => { ov.remove(); if (prev && prev.focus) prev.focus(); };
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  document.body.appendChild(ov); setup(ov.firstChild, close);
}
function confirmModal(msg, label, fn){
  openModal('<p class="cmsg"></p><div class="btns"><button class="btn ghost" id="cno">Cancel</button><button class="btn" id="cyes"></button></div>', (m, close) => {
    m.querySelector(".cmsg").textContent = msg; m.querySelector("#cyes").textContent = label;
    m.querySelector("#cno").addEventListener("click", close);
    m.querySelector("#cyes").addEventListener("click", () => { close(); fn(); });
    m.querySelector("#cno").focus();
  });
}

/* ---------- data model, schedule and streak logic ---------- */
const KEY2 = "habit-tracker-v2";
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], DAYS7 = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const XP = {easy: 5, medium: 10, hard: 15}, RPRE = {morning: "08:00", afternoon: "14:00", evening: "19:00"};
const EMPTY_FREQ = () => ({mode: "daily", days: [], times: 3});
function newHabit(o){ return Object.assign({id: Date.now() + Math.floor(Math.random() * 1000), name: "", cat: "General", sub: "", type: "binary", target: 1, unit: "", freq: EMPTY_FREQ(), diff: "medium", start: key(new Date()), remind: "", notes: {}, log: {}}, o); }
function norm(h){ return Object.assign(newHabit({}), h, {freq: Object.assign(EMPTY_FREQ(), h.freq || {}), log: h.log || {}, notes: h.notes || {}}); }
function migrate(h){   // v1 habit {name, log:{date:true}} -> v2; ticks on future dates are dropped
  const tk = key(new Date()), log = {};
  Object.keys(h.log || {}).forEach(k => { if (h.log[k] && k <= tk) log[k] = 1; });
  return newHabit({id: h.id, name: h.name, cat: h.cat || catOf(h.name), sub: h.sub || "", notes: h.notes || {}, log, start: Object.keys(log).sort()[0] || tk});
}
function load(){
  let d = rd(KEY2);
  if (!d || !Array.isArray(d.habits)) {
    const old = rd(KEY);   // first launch after the upgrade: convert v1 data once (the v1 key is left untouched)
    d = {v: 2, habits: Array.isArray(old) ? old.map(migrate) : [
      newHabit({id: 1, name: "Study", cat: "Learning", type: "duration", target: 120, unit: "min"}),
      newHabit({id: 2, name: "Workout", cat: "Fitness"}),
      newHabit({id: 3, name: "Drink water", cat: "Health", type: "quantity", target: 3, unit: "L"})]};
    wr(KEY2, d);
  }
  habits = d.habits.map(norm);
  const p = rd(PREF); if (p) prefs = Object.assign({}, DEFAULT_PREFS, p);
  applyTheme();
}
function save(){ wr(KEY2, {v: 2, habits}); }

const tkey = () => key(new Date());
const tgt = h => h.type === "binary" ? 1 : Math.max(1, +h.target || 1);
const val = (h, k) => +h.log[k] || 0;
const isDone = (h, k) => val(h, k) >= tgt(h);
const parseKey = k => new Date(k + "T00:00:00");
function sched(h, d){
  const f = h.freq;
  if (f.mode === "weekdays") return d.getDay() > 0 && d.getDay() < 6;
  if (f.mode === "days") return f.days.indexOf(d.getDay()) > -1;
  return true;
}
function weekCount(h, d){   // completions in d's Monday-Sunday week, never counting the future
  const ws = weekStart(d), tk = tkey(); let c = 0;
  for (let i = 0; i < 7; i++) { const x = new Date(ws); x.setDate(ws.getDate() + i); const k = key(x); if (k <= tk && isDone(h, k)) c++; }
  return c;
}
function dueOn(h, d){   // was / is the habit required that day? (false for future days and days before it started)
  const k = key(d); if (k < h.start || k > tkey()) return false;
  return h.freq.mode === "times" ? (isDone(h, k) || weekCount(h, d) < h.freq.times) : sched(h, d);
}
function stats(h){
  const tk = tkey(), end = parseKey(tk), runs = []; let c = 0, total = 0, req = 0, hit = 0;
  Object.keys(h.log).forEach(k => { if (k <= tk && isDone(h, k)) total++; });
  if (h.freq.mode === "times") {   // weekly quota: a streak is consecutive weeks that met the quota
    const thisWk = key(weekStart(end));
    for (let w = weekStart(parseKey(h.start)); w <= end; w.setDate(w.getDate() + 7)) {
      if (weekCount(h, w) >= h.freq.times) { c++; hit++; req++; }
      else if (key(w) !== thisWk) { if (c) runs.push(c); c = 0; req++; }
    }
  } else {   // days that are not scheduled never break a streak; today stays open until the day ends
    for (let d = parseKey(h.start); d <= end; d.setDate(d.getDate() + 1)) {
      if (!sched(h, d)) continue;
      const k = key(d);
      if (isDone(h, k)) { c++; hit++; req++; }
      else if (k !== tk) { if (c) runs.push(c); c = 0; req++; }
    }
  }
  runs.push(c);
  return {cur: c, best: Math.max(...runs), total, rate: req ? Math.round(hit / req * 100) : 0, unit: h.freq.mode === "times" ? "week" : "day"};
}
function dayInfo(d){ let due = 0, done = 0; habits.forEach(h => { if (dueOn(h, d)) { due++; if (isDone(h, key(d))) done++; } }); return {due, done}; }
function rangeStat(from, to){   // required vs completed, counting only days that have already happened
  const tk = tkey(); let req = 0, comp = 0;
  habits.forEach(h => {
    let r = 0, c = 0, days = 0;
    for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d <= to; d.setDate(d.getDate() + 1)) {
      const k = key(d); if (k > tk || k < h.start) continue;
      days++;
      if (h.freq.mode === "times") { if (isDone(h, k)) c++; }
      else if (sched(h, d)) { r++; if (isDone(h, k)) c++; }
    }
    if (h.freq.mode === "times") r = Math.ceil(h.freq.times * days / 7);
    req += r; comp += Math.min(c, r);
  });
  return {req, comp, pct: req ? Math.round(comp / req * 100) : 0};
}
function xpTotal(){ const tk = tkey(); return habits.reduce((a, h) => a + Object.keys(h.log).filter(k => k <= tk && isDone(h, k)).length * (XP[h.diff] || 10), 0); }
const xpLevel = () => Math.floor(xpTotal() / 100);

function fmt(h, x){
  if (h.type === "duration") { const m = Math.round(x), hh = Math.floor(m / 60), mm = m % 60; return (hh ? hh + "h" : "") + (hh && mm ? " " : "") + (mm || !hh ? mm + "m" : ""); }
  return +(+x).toFixed(2) + (h.unit ? " " + h.unit : "");
}
function schedText(h){
  const f = h.freq;
  return f.mode === "weekdays" ? "Mon–Fri" : f.mode === "days" ? [1,2,3,4,5,6,0].filter(n => f.days.indexOf(n) > -1).map(n => DAYS[n]).join(" ") : f.mode === "times" ? f.times + "× per week" : "";
}

/* ---------- sound, haptics, reminders ---------- */
let ac, remindT = null;
const TONES = {win: [660, 880, 1320], level: [523, 659, 784, 1047], soft: [330], add: [494]};
function beep(kind){
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const long = kind === "win" || kind === "level";
    (TONES[kind] || []).forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * .12, d = long ? .3 : .08;
      o.frequency.value = f; g.gain.setValueAtTime(.08, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d);
    });
  } catch(e){}
}
function fx(kind){   // only called for meaningful actions: complete, undo-complete, add, level up
  const pat = {win: [30, 40, 60], level: [40, 50, 40, 50, 90], soft: 8, add: 10}[kind];
  if (prefs.haptics && navigator.vibrate && pat) { try { navigator.vibrate(pat); } catch(e){} }
  if (prefs.sound) beep(kind);
}
const fired = new Set();
function setRemind(){
  clearInterval(remindT);
  if (!prefs.remind) return;
  try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch(e){}
  remindT = setInterval(checkReminders, 30000); checkReminders();
}
function checkReminders(){   // runs only while this page is open
  const now = new Date(), tk = key(now), hm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  habits.forEach(h => {
    const id = h.id + "|" + tk + "|" + hm;
    if (!h.remind || h.remind !== hm || fired.has(id) || !dueOn(h, now) || isDone(h, tk)) return;
    fired.add(id);
    const m = h.name + " is due today.";
    toast(m);
    try { if ("Notification" in window && Notification.permission === "granted") new Notification("Habit reminder", {body: m}); } catch(e){}
  });
}

/* ---------- habits: complete, log, add / edit / delete ---------- */
function setVal(h, k, v){
  if (k > tkey()) return;   // the future can never be completed
  const was = isDone(h, k), xb = xpLevel();
  if (v > 0) h.log[k] = v; else delete h.log[k];
  const now = isDone(h, k);
  if (now && !was) popKey = h.id + "|" + k;
  save(); render();
  if (now && !was) {
    const up = xpLevel() > xb ? xpLevel() + 1 : 0, td = dayInfo(new Date());
    if (up) levelUp(up); else if (k === tkey() && td.due > 0 && td.done === td.due) celebrate(); else fx("win");
  } else fx("soft");
}
function tap(id, k){
  const h = habits.find(x => x.id === id); if (!h || k > tkey()) return;
  if (h.type === "binary") setVal(h, k, isDone(h, k) ? 0 : 1); else logModal(id, k);
}
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function remove(id){   // the card zooms out first, then it is removed (Undo stays available)
  if (habits.findIndex(x => x.id === id) < 0) return;
  const el = document.querySelector('#list .habit[data-hid="' + id + '"]');
  const finish = () => {
    const i = habits.findIndex(x => x.id === id); if (i < 0) return;
    const h = habits.splice(i, 1)[0]; save(); render();
    toast(h.name + " deleted", {label: "Undo", fn: () => { habits.splice(Math.min(i, habits.length), 0, h); save(); render(); }});
  };
  if (el && !reduced()) { if (el.classList.contains("zoom-out")) return; el.classList.add("zoom-out"); setTimeout(finish, 450); } else finish();
}
function quickAdd(){   // type a name, press the button: the habit blurs in from above over one second
  const i = document.getElementById("newName"), name = i.value.trim();
  if (!name) { i.focus(); return; }
  i.value = "";
  const nh = newHabit({name, cat: catOf(name)});
  habits.unshift(nh); vstate.set(String(nh.id), "in"); dropId = nh.id;
  save(); render(); fx("add");
}
function logModal(id, k){
  const h = habits.find(x => x.id === id), t = tgt(h), v = val(h, k), dur = h.type === "duration";
  openModal('<h3 style="margin:0 0 4px" id="lt"></h3><p class="note" id="ld" style="margin:0 0 12px"></p><div class="fields">' +
    (dur ? '<div class="trow2"><input id="lh" type="number" min="0" aria-label="Hours"><span>h</span><input id="lm" type="number" min="0" max="59" aria-label="Minutes"><span>min</span></div>'
         : '<input id="lv" type="number" min="0" step="any" aria-label="Progress">') +
    '</div><div class="btns"><button class="btn" id="lsave">Save</button><button class="btn ghost" id="lfull">Target reached</button><button class="btn ghost" id="lclear">Clear</button></div>', (m, close) => {
    const $ = s => m.querySelector(s);
    $("#lt").textContent = h.name;
    $("#ld").textContent = parseKey(k).toLocaleDateString(undefined, {weekday: "long", day: "numeric", month: "long"}) + " · target " + fmt(h, t);
    if (dur) { $("#lh").value = Math.floor(v / 60) || ""; $("#lm").value = v % 60 || ""; } else $("#lv").value = v || "";
    const amount = () => dur ? (+$("#lh").value || 0) * 60 + (+$("#lm").value || 0) : +$("#lv").value || 0;
    $("#lsave").addEventListener("click", () => { close(); setVal(h, k, Math.max(0, amount())); });
    $("#lfull").addEventListener("click", () => { close(); setVal(h, k, Math.max(v, t)); });
    $("#lclear").addEventListener("click", () => { close(); setVal(h, k, 0); });
    $(dur ? "#lh" : "#lv").focus();
  });
}
function habitEditor(id, preset){
  const old = habits.find(x => x.id === id), h = old ? JSON.parse(JSON.stringify(old)) : newHabit({name: preset || ""});
  const opt = (v, t, sel) => '<option value="' + v + '"' + (sel ? " selected" : "") + '>' + t + '</option>';
  const pick = (list, cur) => list.map(x => opt(x[0], x[1], cur === x[0])).join("");
  const remKey = !h.remind ? "none" : Object.keys(RPRE).find(k => RPRE[k] === h.remind) || "custom";
  const durH = h.type === "duration" && h.target % 60 === 0;
  openModal('<h3 style="margin:0 0 12px">' + (old ? "Edit habit" : "Add habit") + '</h3><div class="fields">' +
    '<input id="hn" maxlength="60" placeholder="Habit name, e.g. Study" aria-label="Habit name">' +
    '<label class="fl">Type<select id="ht">' + pick([["binary","Done / not done"],["count","Count (reps, pages…)"],["duration","Duration"],["quantity","Quantity (litres, km…)"]], h.type) + '</select></label>' +
    '<div class="trow2" id="htg" hidden><input id="htn" type="number" min="0" step="any" aria-label="Target"><input id="hu" maxlength="12" placeholder="unit" aria-label="Unit"><select id="hdu" aria-label="Duration unit">' + opt(1, "min", !durH) + opt(60, "hours", durH) + '</select></div></div>' +
    '<details id="hmore"><summary>More options</summary><div class="fields">' +
    '<label class="fl">Schedule<select id="hf">' + pick([["daily","Every day"],["weekdays","Weekdays (Mon–Fri)"],["days","Specific days"],["times","X times per week"]], h.freq.mode) + '</select></label>' +
    '<div class="dpick" id="hdays" hidden>' + [1,2,3,4,5,6,0].map(n => '<label class="dp"><input type="checkbox" value="' + n + '"' + (h.freq.days.indexOf(n) > -1 ? " checked" : "") + '><span>' + DAYS[n] + '</span></label>').join("") + '</div>' +
    '<label class="fl" id="htimes" hidden>Times per week<input id="hq" type="number" min="1" max="7"></label>' +
    '<label class="fl">Category<select id="hc">' + opt("auto", "Auto-detect", !old) + Object.keys(CATS).map(c => opt(c, c, !!old && h.cat === c)).join("") + '</select></label>' +
    '<label class="fl">Sub-category<select id="hs"></select></label>' +
    '<label class="fl">Difficulty<select id="hd">' + pick([["easy","Easy · 5 XP"],["medium","Medium · 10 XP"],["hard","Hard · 15 XP"]], h.diff) + '</select></label>' +
    '<label class="fl">Reminder<select id="hr">' + pick([["none","None"],["morning","Morning · 8:00"],["afternoon","Afternoon · 14:00"],["evening","Evening · 19:00"],["custom","Custom time"]], remKey) + '</select></label>' +
    '<input id="hrt" type="time" aria-label="Reminder time" hidden>' +
    '<label class="fl">Start date<input id="hst" type="date"></label></div></details>' +
    '<p class="note" id="herr" role="alert" style="color:var(--gold)"></p>' +
    '<div class="btns"><button class="btn" id="hsave">Save habit</button><button class="btn ghost" id="hcancel">Cancel</button></div>', (m, close) => {
    const $ = s => m.querySelector(s);
    $("#hn").value = h.name; $("#hu").value = h.unit && h.type !== "duration" ? h.unit : ""; $("#hq").value = h.freq.times;
    $("#htn").value = h.type === "binary" ? "" : (h.type === "duration" && durH ? h.target / 60 : h.target);
    $("#hst").value = h.start; $("#hst").max = tkey(); if (remKey === "custom") $("#hrt").value = h.remind;
    $("#hmore").open = !!old;
    const subs = () => { const c = $("#hc").value; $("#hs").innerHTML = opt("", "None", !h.sub) + (c === "auto" ? "" : CATS[c].subs.map(x => opt(x, x, h.sub === x)).join("")); $("#hs").disabled = c === "auto"; };
    const sync = () => {
      const t = $("#ht").value;
      $("#htg").hidden = t === "binary"; $("#hu").hidden = t === "duration"; $("#hdu").hidden = t !== "duration";
      $("#hdays").hidden = $("#hf").value !== "days"; $("#htimes").hidden = $("#hf").value !== "times"; $("#hrt").hidden = $("#hr").value !== "custom";
    };
    ["#ht", "#hf", "#hr"].forEach(s => $(s).addEventListener("change", sync));
    $("#hc").addEventListener("change", () => { h.sub = ""; subs(); });
    sync(); subs();
    $("#hcancel").addEventListener("click", close);
    $("#hn").addEventListener("keydown", e => { if (e.key === "Enter") $("#hsave").click(); });
    $("#hsave").addEventListener("click", () => {
      const err = t => { $("#herr").textContent = t; }, name = $("#hn").value.trim(), type = $("#ht").value;
      if (!name) { err("Give your habit a name."); $("#hn").focus(); return; }
      let target = 1, unit = "";
      if (type !== "binary") {
        target = parseFloat($("#htn").value) * (type === "duration" ? parseFloat($("#hdu").value) : 1);
        if (!(target > 0)) { err("Enter a target above zero."); $("#htn").focus(); return; }
        target = type === "duration" ? Math.round(target) : +target.toFixed(2);
        unit = type === "duration" ? "min" : $("#hu").value.trim();
      }
      const mode = $("#hf").value, days = [...m.querySelectorAll("#hdays input:checked")].map(i => +i.value);
      if (mode === "days" && !days.length) { err("Pick at least one day."); return; }
      const st = $("#hst").value || tkey(); if (st > tkey()) { err("The start date cannot be in the future."); return; }
      const rs = $("#hr").value, remind = rs === "none" ? "" : rs === "custom" ? $("#hrt").value : RPRE[rs];
      if (rs === "custom" && !remind) { err("Choose a reminder time."); return; }
      const c = $("#hc").value, f = {name, type, target, unit, cat: c === "auto" ? catOf(name) : c, sub: $("#hs").value, diff: $("#hd").value, remind, start: st,
        freq: {mode, days, times: Math.min(7, Math.max(1, parseInt($("#hq").value, 10) || 1))}};
      if (old) Object.assign(old, f);
      else { const nh = newHabit(f); habits.unshift(nh); vstate.set(String(nh.id), "out-up"); fx("add"); }
      save(); render(); close();
    });
    $("#hn").focus();
  });
}

function celebrate(){   // shown only when everything due today is done
  const top = Math.max(0, ...habits.map(h => stats(h).cur));
  openModal('<div style="text-align:center"><div class="big">★</div><h3>Everything done today. Nice.</h3><p></p><button class="btn" id="cok">Close</button></div>', (m, close) => {
    m.querySelector("p").textContent = top >= 3 ? top + " in a row on your longest current streak." : "That is everything due today.";
    m.querySelector("#cok").addEventListener("click", close); m.querySelector("#cok").focus();
  });
  fx("win"); confetti();
}

function renderWeekRow(tk){
  const ws = weekStart(new Date()); let h = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws); d.setDate(ws.getDate() + i);
    const k = key(d), fut = k > tk, di = dayInfo(d);
    const cls = fut ? "fut" : !di.due ? "" : di.done === di.due ? "full" : di.done ? "part" : "miss";
    h += '<div class="wd ' + cls + (k === tk ? " now" : "") + '"' + (fut ? ' aria-disabled="true"' : "") + '><span>' + DAYS7[i] + '</span><i title="' + (fut ? "upcoming" : cls === "full" ? "all done" : cls === "part" ? "partly done" : cls === "miss" ? "missed" : "nothing due") + '">' + ({full: "✓", part: "◐", miss: "–"}[cls] || "") + '</i></div>';
  }
  document.getElementById("wkrow").innerHTML = h;
}
function renderCharts(){
  const el = document.getElementById("charts"), now = new Date(), ws = weekStart(now), tk = key(now), days = [];
  if (chartMode === "week") for (let i = 0; i < 7; i++) { const d = new Date(ws); d.setDate(ws.getDate() + i); days.push(d); }
  else { const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); for (let i = 1; i <= last; i++) days.push(new Date(now.getFullYear(), now.getMonth(), i)); }
  const W = 560, H = 150, bw = W / days.length;
  let svg = '<svg class="bars" viewBox="0 0 ' + W + ' ' + (H + 22) + '" role="img" aria-label="Completion chart for the ' + chartMode + '">';
  days.forEach((d, i) => {
    const k = key(d), di = dayInfo(d), fr = di.due ? di.done / di.due : 0, bh = fr ? Math.max(6, fr * H) : 0, x = i * bw + bw * .15, w = bw * .7;
    svg += '<rect class="barbg' + (k > tk ? " fut" : "") + '" x="' + x + '" y="0" width="' + w + '" height="' + H + '" rx="5"/>' +
      '<rect class="barfg' + (k === tk ? " tod" : "") + '" x="' + x + '" y="' + (H - bh) + '" width="' + w + '" height="' + bh + '" rx="5" style="animation-delay:' + (i * .03) + 's"><title>' + k + ': ' + di.done + ' of ' + di.due + ' done</title></rect>';
    if (chartMode === "week" || d.getDate() % 5 === 0 || d.getDate() === 1) svg += '<text x="' + (x + w / 2) + '" y="' + (H + 16) + '" text-anchor="middle">' + (chartMode === "week" ? DAYS7[i] : d.getDate()) + '</text>';
  });
  const td = dayInfo(now), wk = rangeStat(ws, new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6)), mo = rangeStat(new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const total = habits.reduce((a, h) => a + stats(h).total, 0);
  el.innerHTML = '<div class="ctop"><h2 style="margin:0">Progress</h2><div class="seg" style="flex:none"><button data-mode="week" aria-pressed="' + (chartMode === "week") + '">Weekly</button><button data-mode="month" aria-pressed="' + (chartMode === "month") + '">Monthly</button></div></div>' + svg + '</svg>' +
    '<p class="note">Today ' + (td.due ? Math.round(td.done / td.due * 100) : 0) + '% · Week ' + wk.pct + '% · Month ' + mo.pct + '% · ' + total + ' completed. Today is gold.</p>';
}

function render(){
  const now = new Date(), tk = key(now), ws = weekStart(now);
  document.getElementById("date").innerHTML = '<span class="dd-day">' + now.toLocaleDateString(undefined, {weekday: "long"}) +
    '</span> <span class="dd-num">' + now.getDate() + '</span> <span class="dd-mon">' + now.toLocaleDateString(undefined, {month: "long"}) + '</span>';
  const td = dayInfo(now), left = td.due - td.done, S = {}; let best = 0, weekDone = 0;
  habits.forEach(h => {
    const st = S[h.id] = stats(h); best = Math.max(best, st.best);
    Object.keys(h.log).forEach(k => { if (k >= key(ws) && k <= tk && isDone(h, k)) weekDone++; });
  });
  const wk = rangeStat(ws, new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6));
  const pct = td.due ? Math.round(td.done / td.due * 100) : 0, fg = document.getElementById("ringfg");
  fg.style.strokeDashoffset = 213.63 * (1 - pct / 100);
  fg.classList.toggle("full", td.due > 0 && pct === 100);
  document.getElementById("pct").textContent = pct + "%";
  moveTrail(pct);
  moveSky(wk.pct);
  document.getElementById("count").textContent = td.done + " of " + td.due;
  document.getElementById("remain").textContent = !habits.length ? "Start with one." : !td.due ? "Nothing due today."
    : !left ? "Everything done today. Nice." : left + (left === 1 ? " habit left." : " habits left.");
  document.getElementById("st1").textContent = best;
  document.getElementById("st2").textContent = weekDone;
  const xp = xpTotal();
  const lvNow = Math.floor(xp / 100) + 1, fillEl = document.getElementById("xpfill"), lvEl = document.getElementById("lvl");
  if (lastLv && lvNow > lastLv) {   // bar fills to the top, flashes, then restarts for the next level
    fillEl.style.width = "100%"; fillEl.classList.add("full");
    setTimeout(() => {
      fillEl.classList.remove("full"); fillEl.style.width = (xp % 100) + "%";
      lvEl.textContent = "Level " + lvNow; lvEl.classList.remove("bump"); void lvEl.offsetWidth; lvEl.classList.add("bump");
    }, 900);
  } else { lvEl.textContent = "Level " + lvNow; fillEl.style.width = (xp % 100) + "%"; }
  lastLv = lvNow;
  document.getElementById("xptxt").textContent = (xp % 100) + " / 100 XP";
  renderCharts(); renderWeekRow(tk); renderHomeNotes();

  const list = document.getElementById("list");
  if (io) io.disconnect();
  observeStatic();
  list.innerHTML = "";
  if (!habits.length) { list.innerHTML = '<div class="empty"><b>No habits yet</b><p>Add your first habit to start tracking.</p><button class="btn" data-add="1">Add habit</button></div>'; return; }

  habits.forEach(h => {
    const st = S[h.id], t = tgt(h), v = val(h, tk), done = v >= t, meas = h.type !== "binary", nm = esc(h.name);
    const el = document.createElement("div");
    el.className = "habit" + (done ? " done" : "") + (h.id === dropId ? " drop" : "") + " " + (vstate.get(String(h.id)) || "out-down");
    el.dataset.hid = h.id;
    const sk = st.cur ? '<span class="streak">🔥 ' + st.cur + (st.unit === "week" ? "-week" : "-day") + ' streak' + (st.best > st.cur ? " · best " + st.best : "") + '</span>'
      : st.best ? '<span class="streak">Best ' + st.best + (st.unit === "week" ? " wk" : " d") + '</span>' : "";
    let week = "";
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws); d.setDate(ws.getDate() + i);
      const k = key(d), fut = k > tk, dv = val(h, k), dn = dv >= t, part = dv > 0 && !dn, off = !fut && !dn && !part && !dueOn(h, d);
      week += '<div class="day' + (dn ? " on" : part ? " part" : "") + (k === tk ? " today" : "") + (fut ? " fut" : "") + (off ? " off" : "") + '">' + DAYS7[i] +
        '<button' + (popKey === h.id + "|" + k ? ' class="pop"' : "") + ' data-id="' + h.id + '" data-k="' + k + '"' + (fut ? ' disabled aria-disabled="true"' : "") +
        ' aria-label="' + DAYS7[i] + " " + k + ": " + (fut ? "upcoming, unavailable" : dn ? "completed" : part ? "partly done" : off ? "not scheduled" : "not done") + '">' + (part ? "◐" : "★") + '</button></div>';
    }
    const meta = [meas ? fmt(h, v) + " / " + fmt(h, t) : "", schedText(h)].filter(Boolean).join(" · ");
    el.innerHTML =
      '<div class="row"><button class="check' + (popKey === h.id + "|" + tk ? " pop" : "") + '" data-id="' + h.id + '" data-k="' + tk + '"' + (meas ? "" : ' aria-pressed="' + done + '"') +
      ' aria-label="' + (meas ? "Log progress: " : done ? "Mark not done: " : "Mark done: ") + nm + '">★</button>' +
      '<div class="nm"><span class="name"></span>' + (meta ? '<small class="pv">' + meta + '</small>' : "") +
      (meas ? '<span class="pbar"><i style="width:' + Math.min(100, v / t * 100) + '%"></i></span>' : "") + '<span class="tw" aria-hidden="true"></span></div>' +
      (done ? '<span class="tick' + (popKey === h.id + "|" + tk ? " pop" : "") + '" role="img" aria-label="Completed today">✓</span>' : "") +
      '<button class="del" data-note="' + h.id + '" aria-label="Notes for ' + nm + '">' + (h.notes && h.notes[tk] ? "📝" : "🗒") + '</button>' +
      '<button class="del" data-edit="' + h.id + '" aria-label="Edit ' + nm + '">✎</button>' +
      '<button class="del" data-del="' + h.id + '" aria-label="Delete ' + nm + '">✕</button></div><div class="week">' + week + '</div>' + catRow(h, sk);
    el.querySelector(".name").textContent = h.name;
    const tip = tips[Math.abs(h.id) % tips.length], tw = el.querySelector(".tw");
    tw.textContent = tip; tw.style.setProperty("--n", tip.length);
    list.appendChild(el);
    if (io) io.observe(el); else { el.classList.remove("out-down", "out-up"); el.classList.add("in"); }
  });
  popKey = ""; dropId = 0;
}

/* ---------- congrats + confetti ---------- */
const LVL_MSG = ["Every level is proof that showing up works.","You are not the same person who started. Keep climbing.","Small stars build a big sky. Rise again tomorrow.","Discipline is quietly becoming your superpower.","Look how far you have come. The summit is closer than ever.","Consistency made you unstoppable. Do not stop now."];
function levelUp(n){   // n = the level just reached; the level just completed is n - 1
  const done = n - 1, msg = LVL_MSG[(done - 1) % LVL_MSG.length];
  const ov = document.createElement("div"); ov.className = "overlay lv";
  ov.innerHTML = '<div class="lvl-card" role="dialog" aria-modal="true" aria-label="Level completed"><div class="lvl-badge"><small>LEVEL</small><b></b></div><h3></h3><p class="lvl-sub"></p><p class="lvl-msg"></p><button class="btn">Keep climbing</button></div>';
  ov.querySelector("b").textContent = done;
  ov.querySelector("h3").textContent = "Level " + done + " completed!";
  ov.querySelector(".lvl-sub").textContent = "Welcome to Level " + n;
  const p = ov.querySelector(".lvl-msg"); let i = 0, closing = false, auto;
  const tm = setInterval(() => { p.textContent = msg.slice(0, ++i); if (i >= msg.length) clearInterval(tm); }, 28);
  const esc = e => { if (e.key === "Escape") close(); };
  const close = () => {
    if (closing) return; closing = true;
    clearInterval(tm); clearTimeout(auto); document.removeEventListener("keydown", esc);
    ov.classList.add("leave"); ov.querySelector(".lvl-card").classList.add("leave");   // zooms away and fades
    setTimeout(() => ov.remove(), 750);
  };
  ov.querySelector("button").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  document.addEventListener("keydown", esc);
  document.body.appendChild(ov); ov.querySelector("button").focus();
  fx("level"); confetti(); auto = setTimeout(close, 6500);
}
function confetti(){
  const box = document.createElement("div"); box.className = "confetti";
  const cols = ["#ffc83d","#3d8bff","#ff5d8f","#2bd4a0","#ff8a3d","#b58cff"];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement("i");
    p.style.cssText = "left:" + Math.random()*100 + "%;background:" + cols[i % cols.length] +
      ";width:" + (6 + Math.random()*6) + "px;height:" + (10 + Math.random()*8) +
      "px;animation-duration:" + (2.4 + Math.random()*2) + "s;animation-delay:" + Math.random()*.8 +
      "s;--dx:" + (Math.random()*160 - 80) + "px;--r:" + (360 + Math.random()*720) + "deg";
    box.appendChild(p);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 5400);
}

/* ---------- settings ---------- */
function showView(v){
  ["home", "notes", "settings"].forEach(x => { document.getElementById(x).hidden = x !== v; });
  if (v === "settings") renderSettings(true); else if (v === "notes") renderNotes(true); else render();
  window.scrollTo(0, 0);
  const sh = document.getElementById(v); sh.classList.remove("view-in"); void sh.offsetWidth; sh.classList.add("view-in");
  document.querySelectorAll("#dock button").forEach(b => b.classList.toggle("on", b.dataset.view === v));
  moveBlob();
}
function moveBlob(){   // the glass "liquid" bubble slides under the active tab
  const dock = document.getElementById("dock"), on = dock.querySelector("button.on"), blob = dock.querySelector(".blob");
  if (!on) return;
  blob.style.width = on.offsetWidth + "px";
  blob.style.transform = "translateX(" + (on.offsetLeft - 5) + "px)";
  blob.classList.remove("move"); void blob.offsetWidth; blob.classList.add("move");
}
const THEMES = {dark: ["Dark"], light: ["Light"], system: ["Device default"]};
const FONTS = {inter: ["Inter", '"Inter",system-ui,sans-serif'], serif: ["Serif", '"Merriweather",Georgia,serif'], round: ["Rounded", '"Nunito",system-ui,sans-serif'], mono: ["Mono", '"JetBrains Mono",ui-monospace,Menlo,monospace']};
const SIZES = {s: ["Small", "14.5px"], m: ["Medium", "16px"], l: ["Large", "18px"]};
const ACCENTS = {blue: ["Blue", null], violet: ["Violet", ["#8b5cf6", "#7c3aed"]], teal: ["Teal", ["#14b8a6", "#0d9488"]], rose: ["Rose", ["#f43f5e", "#e11d48"]]};
const CATS = {
  Fitness: {k: /workout|gym|run|exercise|walk|yoga|cardio|pushup|train/i, e: "💪", subs: ["Chest","Back","Legs","Arms","Cardio","Abs"]},
  Learning: {k: /study|read|learn|course|class|revise|practice/i, e: "📚", subs: ["Reading","Notes","Practice","Revision"]},
  Health: {k: /water|sleep|eat|diet|meal|protein|meditat|vitamin/i, e: "🥗", subs: ["Water","Sleep","Meals","Mindfulness"]},
  Work: {k: /code|project|work|task|email|assign|interview/i, e: "💼", subs: ["Coding","Meetings","Planning","Review"]},
  General: {k: /./, e: "✨", subs: ["Morning","Afternoon","Evening"]}
};
function catOf(n){ for (const c in CATS) if (CATS[c].k.test(n)) return c; return "General"; }
function catRow(h, badge){
  const c = h.cat || catOf(h.name), C = CATS[c], open = openCat === h.id;
  let r = '<div class="catrow"><button class="chip" data-cat="' + h.id + '" aria-expanded="' + open + '">' + C.e + " " + c + (h.sub ? " · " + h.sub : "") + (open ? " ▴" : " ▾") + '</button>' + (badge || "") + '</div>';
  if (open) {
    r += '<div class="subs open">';
    C.subs.forEach((x, i) => { r += '<button class="sub' + (h.sub === x ? " on" : "") + '" data-sub="' + h.id + '" data-v="' + x + '" style="--d:' + (i * .12) + 's"><span class="ty" style="--n:' + x.length + '">' + x + '</span></button>'; });
    r += '</div>';
  }
  return r;
}

/* notes */
function noteModal(id){
  const h = habits.find(x => x.id === id); h.notes = h.notes || {};
  const ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = '<div class="modal" style="text-align:left" role="dialog" aria-modal="true"><h3 style="margin-top:0"></h3><div class="fields"><input type="date" id="nd"><textarea id="nt" rows="3" maxlength="300" placeholder="Why did you skip, or how did it go?"></textarea></div><div class="btns"><button class="btn" id="ns">Save note</button><button class="btn ghost" id="nc">Close</button></div></div>';
  ov.querySelector("h3").textContent = "Note: " + h.name;
  const d = ov.querySelector("#nd"), t = ov.querySelector("#nt"), today = key(new Date());
  d.value = today; d.max = today; t.value = h.notes[today] || "";
  d.addEventListener("change", () => { t.value = h.notes[d.value] || ""; });
  ov.querySelector("#nc").addEventListener("click", () => ov.remove());
  ov.querySelector("#ns").addEventListener("click", () => {
    const v = t.value.trim(); if (v) h.notes[d.value] = v; else delete h.notes[d.value];
    save(); render(); ov.remove(); toast("Note saved");
  });
  ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov); t.focus();
}


/* settings */
const T = t => '<span class="ty" style="--n:' + t.length + '">' + t + '</span>';
function segs(map, cur, attr){
  let h = '<div class="seg">';
  for (const k in map) h += '<button data-' + attr + '="' + k + '" aria-pressed="' + (cur === k) + '">' + T(map[k][0]) + '</button>';
  return h + '</div>';
}
function tg(label, k){ return '<div class="trow"><span>' + label + '</span><button class="tgl" data-tg="' + k + '" aria-pressed="' + !!prefs[k] + '">' + T(prefs[k] ? "On" : "Off") + '</button></div>'; }

function renderSettings(anim){
  if (anim) ["s0","s1","s2","s3","s4","s5"].forEach(k => vstate.delete(k));
  const u = prefs.user, el = document.getElementById("settings-body");
  let h = '<section class="card"><h2>Profile</h2>';
  if (u) h += '<div class="prof"><div class="avatar" id="av"></div><div><b id="pn"></b><span id="pe"></span></div></div><p class="note">Stored on this device only.</p><div class="btns"><button class="btn ghost" id="logout">' + T("Remove profile") + '</button></div>';
  else h += '<div class="fields"><input id="ln" placeholder="Your name" maxlength="40" aria-label="Name"><input id="le" type="email" placeholder="Email (optional)" maxlength="80" aria-label="Email"></div><button class="btn" id="login">' + T("Create local profile") + '</button><p class="note">Your profile is currently stored on this device. Signing in with Google needs a backend, which a standalone file does not have.</p>';
  h += '</section><section class="card"><h2>Appearance</h2>' + segs(THEMES, prefs.theme, "theme") +
    '<p class="note">Font</p>' + segs(FONTS, prefs.font, "font") + '<p class="note">Text size</p>' + segs(SIZES, prefs.size, "size") +
    '<p class="note">Accent colour</p>' + segs(ACCENTS, prefs.accent, "accent") + '</section>' +
    '<section class="card"><h2>Feedback &amp; reminders</h2>' + tg("Sound", "sound") + tg("Haptics (vibration)", "haptics") + tg("Habit reminders", "remind") +
    '<p class="note">Set a reminder time on each habit (edit a habit, then More options). Reminders show in the app and as browser notifications, but only while this page is open. Reminders in the background need an installed app (PWA) with a service worker and a push server.</p></section>' +
    '<section class="card"><h2>Your data</h2><p class="note" style="margin-top:0">Everything is stored in this browser. Export a copy to keep it safe or move it to another device.</p><div class="btns"><button class="btn" id="exp">' + T("Export data") + '</button><button class="btn ghost" id="imp">' + T("Import data") + '</button></div>' +
    '<input type="file" id="impfile" accept="application/json,.json" hidden aria-label="Import file"><div class="danger"><button class="btn ghost" id="reset">' + T("Reset all data") + '</button></div></section>' +
    '<section class="card"><h2>Help</h2><p class="note" style="margin-top:0">Have a question about the app? Ask Claude.</p><div class="btns">' +
    '<a class="btn" target="_blank" rel="noopener" href="https://claude.ai/new?q=' + encodeURIComponent("I need help with my habit tracker app. My doubt: ") + '">' + T("Ask Claude") + '</a></div></section>';
  el.innerHTML = h;
  if (u) {
    document.getElementById("av").textContent = (u.name[0] || "?").toUpperCase();
    document.getElementById("pn").textContent = u.name; document.getElementById("pe").textContent = u.email || "";
  }
  el.querySelectorAll(".card").forEach((c, i) => {
    const id = "s" + i; c.dataset.hid = id; c.classList.add("rv", vstate.get(id) || "out-down");
    if (anim) c.style.transitionDelay = (i * .08) + "s";
    if (io) io.observe(c); else { c.classList.remove("out-down", "out-up"); c.classList.add("in"); }
  });
  if (anim) setTimeout(() => el.querySelectorAll(".card").forEach(c => { c.style.transitionDelay = ""; }), 1200);
}

function exportData(){
  const data = {app: "habit-tracker", version: 2, exportedAt: new Date().toISOString(), habits, rituals: notes, prefs, xp: xpTotal(),
    streaks: habits.map(h => Object.assign({id: h.id, name: h.name}, stats(h)))};
  const a = document.createElement("a");
  a.href = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
  a.download = "habit-tracker-" + tkey() + ".json"; document.body.appendChild(a); a.click(); a.remove();
  toast("Data exported");
}
function importData(text){
  let d; try { d = JSON.parse(text); } catch(e) { toast("That file is not valid JSON. Nothing was changed."); return; }
  const arr = Array.isArray(d) ? d : d && d.habits;
  if (!Array.isArray(arr) || !arr.every(h => h && typeof h.name === "string" && h.log && typeof h.log === "object")) { toast("That is not a habit tracker export. Nothing was changed."); return; }
  const list = arr.map(h => h.type ? norm(h) : migrate(h)), rit = d && Array.isArray(d.rituals) ? d.rituals.filter(n => n && typeof n.text === "string") : null;
  confirmModal("Replace your current data with " + list.length + " habit" + (list.length === 1 ? "" : "s") + " from this file?", "Replace data", () => {
    habits = list; if (rit) notes = rit;
    if (d.prefs && typeof d.prefs === "object") prefs = Object.assign({}, DEFAULT_PREFS, d.prefs);
    save(); saveNotes(); savePrefs(); applyTheme(); setRemind(); render(); renderNotes(); renderSettings(); toast("Data imported");
  });
}
function resetAll(){
  confirmModal("Delete all habits, history, notes and settings on this device? This cannot be undone. Export first if you want a copy.", "Reset all data", () => {
    habits = []; notes = []; prefs = Object.assign({}, DEFAULT_PREFS);
    save(); saveNotes(); savePrefs(); applyTheme(); setRemind(); render(); renderNotes(); renderSettings(); toast("All data reset");
  });
}

document.getElementById("settings-body").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const d = b.dataset;
  if (d.theme) prefs.theme = d.theme; else if (d.font) prefs.font = d.font; else if (d.size) prefs.size = d.size; else if (d.accent) prefs.accent = d.accent;
  else if (d.tg) { prefs[d.tg] = !prefs[d.tg]; if (d.tg === "remind") setRemind(); }
  else switch (b.id) {
    case "login": {
      const n = document.getElementById("ln").value.trim(), m = document.getElementById("le").value.trim();
      if (!n) { toast("Enter a name for your profile"); return; }
      prefs.user = {name: n, email: m}; break;
    }
    case "logout": prefs.user = null; break;
    case "exp": exportData(); return;
    case "imp": document.getElementById("impfile").click(); return;
    case "reset": resetAll(); return;
    default: return;
  }
  savePrefs(); applyTheme(); renderSettings();
});
document.getElementById("settings-body").addEventListener("change", e => {
  if (e.target.id !== "impfile" || !e.target.files[0]) return;
  const f = e.target.files[0]; e.target.value = ""; f.text().then(importData);
});

/* ---------- notes (rituals) ---------- */
const NK = "habit-rituals-v1";
let notes = rd(NK) || [];
function saveNotes(){ wr(NK, notes); renderHomeNotes(); }
const esc = t => String(t).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
function renderHomeNotes(){   // only notes that are still to do; finished notes leave this page (they stay in the Notes tab)
  const el = document.getElementById("homeNotes"), table = prefs.nview === "table";
  const list = notes.filter(n => !n.done).sort((a, b) => (!!b.pin - !!a.pin) || (b.updated - a.updated));
  let h = '<div class="ctop"><h2 style="margin:0">Notes</h2><div class="seg" style="flex:none"><button data-nview="list" aria-pressed="' + !table + '">List</button><button data-nview="table" aria-pressed="' + table + '">Table</button></div></div>';
  if (!list.length) { el.innerHTML = h + '<p class="note" style="margin:0">' + (notes.length ? "Everything on your list is done. New notes you write will show up here." : "Write rituals in the Notes tab and they will show up here to tick off.") + '</p>'; return; }
  const tick = n => '<button class="ntick" data-ntick="' + n.id + '" aria-label="Mark ' + esc(n.title || "note") + ' as done">✓</button>';
  const date = n => new Date(n.updated).toLocaleDateString(undefined, {day: "numeric", month: "short"});
  if (table) {
    h += '<div class="tscroll"><table class="ntable"><thead><tr><th></th><th>Title</th><th>Details</th><th>Added</th></tr></thead><tbody>';
    list.forEach(n => { h += '<tr data-nopen="' + n.id + '"><td>' + tick(n) + '</td><td>' + esc(n.title || "Untitled ritual") + '</td><td class="c-d">' + esc(n.text.slice(0, 80)) + '</td><td>' + date(n) + '</td></tr>'; });
    h += '</tbody></table></div>';
  } else {
    list.forEach(n => { h += '<div class="nrow" data-nopen="' + n.id + '">' + tick(n) + '<div class="nbody"><b>' + esc(n.title || "Untitled ritual") + '</b><span>' + esc(n.text.slice(0, 100)) + '</span></div></div>'; });
  }
  el.innerHTML = h;
}
function renderNotes(anim){
  const q = document.getElementById("nsearch").value.trim().toLowerCase(), el = document.getElementById("nlist");
  const list = notes.filter(n => !q || (n.title + " " + n.text).toLowerCase().indexOf(q) > -1)
    .sort((a, b) => (!!b.pin - !!a.pin) || (b.updated - a.updated));   // pinned first, then newest
  el.innerHTML = "";
  if (!list.length) { el.innerHTML = '<div class="empty">' + (notes.length ? "No notes match your search." : "No rituals yet. Tap + New to write your first one.") + '</div>'; return; }
  list.forEach((n, i) => {
    const c = document.createElement("div");
    c.className = "ncard" + (anim ? " enter" : ""); c.dataset.id = n.id;
    if (anim) c.style.animationDelay = (i * .05) + "s";
    c.innerHTML = '<div class="nh"><button class="ntick' + (n.done ? " on" : "") + '" data-ntick="' + n.id + '" aria-label="' + (n.done ? "Mark as not done" : "Mark as done") + '">✓</button><b class="nt"></b><button class="pin' + (n.pin ? " on" : "") + '" data-pin="' + n.id + '" aria-label="Pin note">📌</button></div><p class="np"></p><span class="nd"></span>';
    c.querySelector(".nt").textContent = n.title || "Untitled ritual";
    c.querySelector(".np").textContent = n.text.slice(0, 160);
    c.querySelector(".nd").textContent = (n.done ? "✓ Done · " : "") + new Date(n.updated).toLocaleDateString(undefined, {day: "numeric", month: "short"});
    el.appendChild(c);
  });
}
function ritualEditor(id){
  const n = notes.find(x => x.id === id) || {id: Date.now(), title: "", text: "", pin: false, done: false, updated: 0, isNew: true};
  const ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = '<div class="modal" style="text-align:left;max-width:440px" role="dialog" aria-modal="true"><div class="fields"><input id="rtitle" maxlength="80" placeholder="Title, e.g. Morning ritual"><textarea id="rtext" rows="9" maxlength="3000" placeholder="Write your ritual, steps or ideas..."></textarea></div><div class="btns"><button class="btn" id="rsave">Save</button><button class="btn ghost" id="rcancel">Cancel</button>' + (n.isNew ? "" : '<button class="btn ghost" id="rdel" style="margin-left:auto">Delete</button>') + '</div></div>';
  const t = ov.querySelector("#rtitle"), x = ov.querySelector("#rtext"); t.value = n.title; x.value = n.text;
  const close = () => ov.remove();
  ov.querySelector("#rcancel").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  ov.querySelector("#rsave").addEventListener("click", () => {
    const title = t.value.trim(), text = x.value.trim();
    if (!title && !text) { close(); return; }
    n.title = title; n.text = text; n.updated = Date.now();
    if (n.isNew) { delete n.isNew; notes.push(n); }
    saveNotes(); renderNotes(); close(); toast("Note saved");
  });
  const del = ov.querySelector("#rdel");
  if (del) del.addEventListener("click", () => { notes = notes.filter(y => y.id !== n.id); saveNotes(); renderNotes(); close(); toast("Note deleted"); });
  document.body.appendChild(ov); t.focus();
}

/* ---------- wiring ---------- */
document.getElementById("list").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const d = b.dataset;
  if (d.add) habitEditor(0);
  else if (d.cat) { const i = Number(d.cat); openCat = openCat === i ? 0 : i; render(); }
  else if (d.sub) { const h = habits.find(x => x.id === Number(d.sub)); h.sub = h.sub === d.v ? "" : d.v; save(); render(); }
  else if (d.note) noteModal(Number(d.note));
  else if (d.edit) habitEditor(Number(d.edit));
  else if (d.del) remove(Number(d.del));
  else if (d.k) tap(Number(d.id), d.k);
});
const openAdd = () => { const i = document.getElementById("newName"), n = i.value.trim(); i.value = ""; habitEditor(0, n); };
document.getElementById("addBtn").addEventListener("click", quickAdd);
document.getElementById("moreBtn").addEventListener("click", openAdd);
document.getElementById("newName").addEventListener("keydown", e => { if (e.key === "Enter") quickAdd(); });
document.getElementById("dock").addEventListener("click", e => { const b = e.target.closest("button[data-view]"); if (b) showView(b.dataset.view); });
document.getElementById("nlist").addEventListener("click", e => {
  const pin = e.target.closest("[data-pin]");
  if (pin) { const n = notes.find(x => x.id === Number(pin.dataset.pin)); n.pin = !n.pin; saveNotes(); renderNotes(); return; }
  const tk = e.target.closest("[data-ntick]");
  if (tk) { const n = notes.find(x => x.id === Number(tk.dataset.ntick)); n.done = !n.done; saveNotes(); renderNotes(); if (n.done) fx("soft"); return; }
  const c = e.target.closest(".ncard"); if (c) ritualEditor(Number(c.dataset.id));
});
document.getElementById("nsearch").addEventListener("input", () => renderNotes());
document.getElementById("newNote").addEventListener("click", () => ritualEditor(0));
window.addEventListener("resize", moveBlob);
document.getElementById("homeNotes").addEventListener("click", e => {
  const v = e.target.closest("[data-nview]");
  if (v) { prefs.nview = v.dataset.nview; savePrefs(); renderHomeNotes(); return; }
  const t = e.target.closest("[data-ntick]");
  if (t) {   // finishing a note: it zooms out of the home page, then moves to "done"
    const id = Number(t.dataset.ntick), row = t.closest("[data-nopen]");
    const finish = () => { const n = notes.find(x => x.id === id); if (n) { n.done = true; saveNotes(); renderNotes(); } };
    fx("soft");
    if (row && !reduced()) { if (row.classList.contains("zoom-out")) return; row.classList.add("zoom-out"); setTimeout(finish, 450); } else finish();
    return;
  }
  const o = e.target.closest("[data-nopen]"); if (o) ritualEditor(Number(o.dataset.nopen));
});
const dk = document.getElementById("dock");   // small light that follows the cursor, glass bar only
dk.addEventListener("mousemove", e => {
  const r = dk.getBoundingClientRect();
  dk.style.setProperty("--mx", (e.clientX - r.left) + "px"); dk.style.setProperty("--my", (e.clientY - r.top) + "px");
  dk.classList.add("lit");
});
dk.addEventListener("mouseleave", () => dk.classList.remove("lit"));

const sb = document.getElementById("settings-body");
sb.addEventListener("mouseover", e => {   // Dark: dim glow. Light: one soft blink. Device default: follows the device
  const b = e.target.closest("button[data-theme]");
  if (!b || b.contains(e.relatedTarget)) return;
  let kind = b.dataset.theme;
  if (kind === "system") kind = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  b.classList.remove("fx-dim", "fx-blink"); void b.offsetWidth;
  b.classList.add(kind === "dark" ? "fx-dim" : "fx-blink");
});
sb.addEventListener("mouseout", e => {
  const b = e.target.closest("button[data-theme]");
  if (b && !b.contains(e.relatedTarget)) b.classList.remove("fx-dim");
});
sb.addEventListener("animationend", e => { if (e.target.classList) e.target.classList.remove("fx-blink"); });
document.getElementById("charts").addEventListener("click", e => { const b = e.target.closest("button[data-mode]"); if (b) { chartMode = b.dataset.mode; renderCharts(); } });
document.addEventListener("keydown", e => { if (e.key === "Escape") { const o = document.querySelectorAll(".overlay"); if (o.length) o[o.length - 1].click(); } });
const sp = document.getElementById("splash");
function hideSplash(){ sp.classList.add("out"); setTimeout(() => sp.remove(), 700); }
document.getElementById("go").addEventListener("click", hideSplash); setTimeout(hideSplash, 3800);
buildGrass();
load(); setQuote(); setRemind(); render(); renderNotes(); moveBlob();
sp.querySelector(".art").innerHTML = document.querySelector(".hero svg").outerHTML;
