/* ============================================================
   Interactive Checklist — application logic
   Vanilla JS, no build step. State persists in localStorage.
   ============================================================ */
(() => {
  "use strict";

  const K = {
    sets: "icl.sets.v1",
    active: "icl.active.v1",
    progress: "icl.progress.v1",
    settings: "icl.settings.v1",
    scratch: "icl.scratch.v1",
  };

  const RING_CIRC = 2 * Math.PI * 19; // r=19 in the SVG

  /* ---------- state ---------- */
  const state = {
    sets: [],
    activeSetId: null,
    activeChecklistId: null,
    progress: {},   // { setId: { checklistId: [checkedIdx...] } }
    settings: { autoAdvance: false },
    scratch: { mode: "notes", fields: { atis: "", squawk: "", altimeter: "", runway: "", freqActive: "", freqNext: "" }, text: "", sketch: "" },
  };

  /* ---------- tiny helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = (p = "id") => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const load = (key, fallback) => {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  };
  const store = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

  const saveSets = () => store(K.sets, state.sets);
  const saveActive = () => { store(K.active, { setId: state.activeSetId, clId: state.activeChecklistId }); };
  const saveProgress = () => store(K.progress, state.progress);
  const saveSettings = () => store(K.settings, state.settings);

  /* ---------- lookups ---------- */
  const activeSet = () => state.sets.find((s) => s.id === state.activeSetId) || null;

  function flatten(set) {
    const out = [];
    if (!set) return out;
    for (const g of set.groups) for (const c of g.checklists) out.push({ group: g, checklist: c });
    return out;
  }
  function findChecklist(set, clId) {
    if (!set) return null;
    for (const g of set.groups) {
      const c = g.checklists.find((x) => x.id === clId);
      if (c) return { group: g, checklist: c };
    }
    return null;
  }

  /* ---------- progress ---------- */
  function checkedSet(setId, clId) {
    const s = state.progress[setId] || (state.progress[setId] = {});
    return s[clId] || (s[clId] = []);
  }
  function isChecked(setId, clId, idx) {
    return checkedSet(setId, clId).includes(idx);
  }
  function checkableCount(checklist) {
    return checklist.items.filter((it) => (it.type || "item") === "item").length;
  }
  function progressOf(setId, checklist) {
    const total = checkableCount(checklist);
    const checked = checkedSet(setId, checklist.id).length;
    return { checked: Math.min(checked, total), total };
  }
  function clearProgress(setId, clId) {
    if (state.progress[setId]) delete state.progress[setId][clId];
    saveProgress();
  }

  /* ============================================================ INIT */
  function init() {
    const savedSets = load(K.sets, null);
    state.sets = Array.isArray(savedSets) && savedSets.length ? savedSets : clone(window.DEFAULT_SETS || []);
    state.progress = load(K.progress, {}) || {};
    state.settings = Object.assign({ autoAdvance: false }, load(K.settings, {}));
    if (state.settings.theme !== "light" && state.settings.theme !== "dark") {
      state.settings.theme = (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
    }
    const sc = load(K.scratch, {}) || {};
    state.scratch = {
      mode: sc.mode === "sketch" ? "sketch" : "notes",
      fields: Object.assign({ atis: "", squawk: "", altimeter: "", runway: "", freqActive: "", freqNext: "" }, sc.fields || {}),
      text: typeof sc.text === "string" ? sc.text : "",
      sketch: typeof sc.sketch === "string" ? sc.sketch : "",
    };

    const active = load(K.active, {});
    state.activeSetId = (active && active.setId && state.sets.some((s) => s.id === active.setId))
      ? active.setId : (state.sets[0] && state.sets[0].id) || null;

    const set = activeSet();
    const flat = flatten(set);
    state.activeChecklistId = (active && active.clId && flat.some((f) => f.checklist.id === active.clId))
      ? active.clId : (flat[0] && flat[0].checklist.id) || null;

    saveSets();
    applyTheme(state.settings.theme, false);
    hydrateScratch();   // must run before wireEvents (it populates scratchEls used during wiring)
    wireEvents();
    render();
    registerSW();
  }

  /* ---------- theme ---------- */
  function applyTheme(theme, persist) {
    const t = theme === "light" ? "light" : "dark";
    state.settings.theme = t;
    document.documentElement.setAttribute("data-theme", t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "light" ? "#e9eef4" : "#070b12");
    const btn = document.getElementById("themeBtn");
    if (btn) btn.setAttribute("aria-label", t === "light" ? "Switch to dark mode" : "Switch to light mode");
    if (persist) saveSettings();
  }
  function toggleTheme() {
    const next = state.settings.theme === "light" ? "dark" : "light";
    applyTheme(next, true);
    toast(next === "light" ? "Light mode" : "Dark mode");
  }

  /* ============================================================ RENDER */
  function render() {
    renderSetSelect();
    renderNav();
    renderChecklist();
  }

  function renderSetSelect() {
    const sel = $("#setSelect");
    sel.innerHTML = state.sets.map((s) =>
      `<option value="${esc(s.id)}" ${s.id === state.activeSetId ? "selected" : ""}>${esc(s.name)}</option>`
    ).join("");
    const set = activeSet();
    $("#setLabel").textContent = set ? (set.tail ? `${set.name} · ${set.tail}` : set.name) : "—";
  }

  function renderNav() {
    const set = activeSet();
    const list = $("#navList");
    if (!set || !set.groups.length) {
      list.innerHTML = `<div style="padding:20px;color:var(--txt-faint);font-size:14px">No checklists yet. Tap the ✎ builder to add some.</div>`;
      return;
    }
    list.innerHTML = set.groups.map((g) => {
      const rows = g.checklists.map((c) => {
        const { checked, total } = progressOf(set.id, c);
        const done = total > 0 && checked === total;
        const active = c.id === state.activeChecklistId;
        return `
          <button class="nav-item ${active ? "active" : ""} ${done ? "done" : ""}" data-cl="${esc(c.id)}">
            <span class="ni-check">
              <svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12l4 4 10-10" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <span class="ni-name">${esc(c.name)}</span>
            <span class="ni-badge">${checked}/${total}</span>
          </button>`;
      }).join("");
      return `
        <div class="nav-group type-${esc(g.type || "normal")}">
          <div class="nav-group-head"><span class="dot"></span>${esc(g.name)}</div>
          ${rows}
        </div>`;
    }).join("");
  }

  function typeLabel(t) {
    return ({ normal: "NORMAL", abnormal: "ABNORMAL", emergency: "EMERGENCY", briefing: "BRIEFING" }[t] || "NORMAL");
  }

  function renderChecklist() {
    const set = activeSet();
    const found = set ? findChecklist(set, state.activeChecklistId) : null;
    const items = $("#items");
    const banner = $("#completeBanner");
    banner.hidden = true; banner.classList.remove("show");

    if (!found) {
      $("#chTitle").textContent = "Select a checklist";
      $("#chBadge").textContent = "—";
      $("#chBadge").className = "ch-badge";
      items.innerHTML = `<div class="empty-state"><div class="empty-icon">
        <svg viewBox="0 0 24 24" width="46" height="46"><rect x="4" y="3" width="16" height="18" rx="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </div><p>Pick a checklist from the menu to begin.</p></div>`;
      updateRing(0, 0);
      setNavDisabled(true);
      return;
    }
    setNavDisabled(false);

    const { group, checklist } = found;
    const gtype = group.type || "normal";
    $("#chTitle").textContent = checklist.name;
    const badge = $("#chBadge");
    badge.textContent = typeLabel(gtype);
    badge.className = "ch-badge" + (gtype === "emergency" ? " emergency" : gtype === "abnormal" ? " abnormal" : gtype === "briefing" ? " briefing" : "");

    items.innerHTML = checklist.items.map((it, idx) => renderItemRow(set.id, checklist.id, it, idx)).join("") ||
      `<div class="empty-state"><p>This checklist has no items yet.</p></div>`;

    const { checked, total } = progressOf(set.id, checklist);
    updateRing(checked, total);
    maybeComplete(checked, total, false);
  }

  function renderItemRow(setId, clId, it, idx) {
    const type = it.type || "item";
    if (type === "item") {
      const on = isChecked(setId, clId, idx);
      return `
        <div class="item ${on ? "checked" : ""}" data-idx="${idx}" role="button" tabindex="0">
          <span class="check">
            <svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" stroke="currentColor" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span class="item-body">
            <span class="challenge">${esc(it.challenge || "")}</span>
            <span class="leader"></span>
            <span class="response">${esc(it.response || "")}</span>
          </span>
        </div>`;
    }
    const icon = type === "note"
      ? `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`
      : `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3l9 16H3L12 3z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    const label = type === "note" ? "Note" : type === "caution" ? "Caution" : "Warning";
    return `
      <div class="advisory ${type}">
        <span class="adv-icon">${icon}</span>
        <span><span class="adv-label">${label}</span>${esc(it.text || "")}</span>
      </div>`;
  }

  function updateRing(checked, total) {
    const pct = total > 0 ? checked / total : 0;
    $("#ringFill").style.strokeDashoffset = String(RING_CIRC * (1 - pct));
    $("#ringFill").style.stroke = (total > 0 && checked === total) ? "var(--go)" : "var(--accent)";
    $("#progressCount").textContent = `${checked}/${total}`;
  }

  function setNavDisabled(disabled) {
    $("#resetBtn").disabled = disabled;
    const flat = flatten(activeSet());
    const i = flat.findIndex((f) => f.checklist.id === state.activeChecklistId);
    $("#prevBtn").disabled = disabled || i <= 0;
    $("#nextBtn").disabled = disabled || i < 0 || i >= flat.length - 1;
  }

  /* ============================================================ interactions */
  function selectChecklist(clId) {
    state.activeChecklistId = clId;
    saveActive();
    renderNav();
    renderChecklist();
    $("#items").scrollTop = 0;
    document.getElementById("app").classList.remove("nav-open");
  }

  function toggleItem(idx) {
    const set = activeSet();
    const found = findChecklist(set, state.activeChecklistId);
    if (!found) return;
    const it = found.checklist.items[idx];
    if (!it || (it.type || "item") !== "item") return;

    const arr = checkedSet(set.id, found.checklist.id);
    const pos = arr.indexOf(idx);
    if (pos >= 0) arr.splice(pos, 1); else arr.push(idx);
    saveProgress();

    const row = $(`.item[data-idx="${idx}"]`);
    if (row) row.classList.toggle("checked", pos < 0);

    const { checked, total } = progressOf(set.id, found.checklist);
    updateRing(checked, total);
    updateNavBadge(set.id, found.checklist.id, checked, total);
    maybeComplete(checked, total, true);
  }

  function updateNavBadge(setId, clId, checked, total) {
    const btn = $(`.nav-item[data-cl="${clId}"]`);
    if (!btn) return;
    const badge = btn.querySelector(".ni-badge");
    if (badge) badge.textContent = `${checked}/${total}`;
    btn.classList.toggle("done", total > 0 && checked === total);
  }

  let completeTimer = null;
  function maybeComplete(checked, total, animate) {
    const banner = $("#completeBanner");
    const nextBtn = $("#nextBtn");
    const complete = total > 0 && checked === total;
    clearTimeout(completeTimer);

    if (complete) {
      banner.hidden = false;
      if (animate) requestAnimationFrame(() => banner.classList.add("show"));
      else banner.classList.add("show");
      nextBtn.classList.add("pulse");
      completeTimer = setTimeout(() => banner.classList.remove("show"), 2600);
      if (animate && state.settings.autoAdvance) {
        setTimeout(() => { if (!$("#nextBtn").disabled) gotoAdjacent(1); }, 1400);
      }
    } else {
      banner.classList.remove("show");
      nextBtn.classList.remove("pulse");
    }
  }

  function resetChecklist() {
    const set = activeSet();
    if (!set || !state.activeChecklistId) return;
    clearProgress(set.id, state.activeChecklistId);
    renderChecklist();
    renderNav();
    toast("Checklist reset");
  }

  function gotoAdjacent(dir) {
    const flat = flatten(activeSet());
    const i = flat.findIndex((f) => f.checklist.id === state.activeChecklistId);
    const ni = i + dir;
    if (ni < 0 || ni >= flat.length) return;
    selectChecklist(flat[ni].checklist.id);
  }

  /* ============================================================ set-level actions */
  function switchSet(setId) {
    state.activeSetId = setId;
    const flat = flatten(activeSet());
    state.activeChecklistId = (flat[0] && flat[0].checklist.id) || null;
    saveActive();
    render();
  }

  function newSet() {
    const s = { id: uid("set"), name: "New Aircraft", tail: "", groups: [
      { id: uid("grp"), name: "Normal Procedures", type: "normal", checklists: [
        { id: uid("cl"), name: "New Checklist", items: [] },
      ] },
    ] };
    state.sets.push(s);
    saveSets();
    switchSet(s.id);
    openBuilder();
    toast("New set created");
  }

  function duplicateSet() {
    const set = activeSet();
    if (!set) return;
    const copy = clone(set);
    copy.id = uid("set");
    copy.name = set.name + " (copy)";
    reassignIds(copy);
    state.sets.push(copy);
    saveSets();
    switchSet(copy.id);
    toast("Set duplicated");
  }

  function deleteSet() {
    const set = activeSet();
    if (!set) return;
    if (state.sets.length <= 1) { toast("Keep at least one set"); return; }
    if (!confirm(`Delete checklist set "${set.name}"? This cannot be undone.`)) return;
    state.sets = state.sets.filter((s) => s.id !== set.id);
    delete state.progress[set.id];
    saveSets(); saveProgress();
    switchSet(state.sets[0].id);
    toast("Set deleted");
  }

  function reassignIds(set) {
    for (const g of set.groups) {
      g.id = uid("grp");
      for (const c of g.checklists) c.id = uid("cl");
    }
  }

  /* ============================================================ import / export */
  function exportSet() {
    const set = activeSet();
    if (!set) return;
    const payload = { app: "interactive-checklist", version: 1, set };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (set.name || "checklist").replace(/[^a-z0-9._-]+/gi, "_").toLowerCase() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Exported " + a.download);
  }

  function importFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const sets = normalizeImport(data);
        if (!sets.length) throw new Error("No checklist sets found");
        let firstId = null;
        for (const s of sets) {
          if (!s.id || state.sets.some((x) => x.id === s.id)) s.id = uid("set");
          reassignIds(s);
          state.sets.push(s);
          if (!firstId) firstId = s.id;
        }
        saveSets();
        switchSet(firstId);
        toast(`Imported ${sets.length} set${sets.length > 1 ? "s" : ""}`);
      } catch (e) {
        toast("Import failed: " + e.message);
      }
    };
    reader.onerror = () => toast("Could not read file");
    reader.readAsText(file);
  }

  // Accepts: {set}, {sets:[...]}, a bare set {name,groups}, or an array of sets.
  function normalizeImport(data) {
    let candidates = [];
    if (Array.isArray(data)) candidates = data;
    else if (data && Array.isArray(data.sets)) candidates = data.sets;
    else if (data && data.set) candidates = [data.set];
    else if (data && Array.isArray(data.groups)) candidates = [data];
    else if (data && Array.isArray(data.checklists)) {
      // a single group -> wrap in a set
      candidates = [{ name: data.name || "Imported", groups: [data] }];
    }
    return candidates.map(validateSet).filter(Boolean);
  }

  function validateSet(raw) {
    if (!raw || typeof raw !== "object") return null;
    const set = { id: raw.id, name: String(raw.name || "Imported Set"), tail: String(raw.tail || ""), groups: [] };
    const groups = Array.isArray(raw.groups) ? raw.groups : [];
    for (const g of groups) {
      if (!g || !Array.isArray(g.checklists)) continue;
      const grp = { id: g.id || uid("grp"), name: String(g.name || "Group"),
        type: ["normal", "abnormal", "emergency", "briefing"].includes(g.type) ? g.type : "normal", checklists: [] };
      for (const c of g.checklists) {
        if (!c) continue;
        const cl = { id: c.id || uid("cl"), name: String(c.name || "Checklist"), items: [] };
        const items = Array.isArray(c.items) ? c.items : [];
        for (const it of items) {
          if (!it || typeof it !== "object") continue;
          const t = ["item", "note", "caution", "warning"].includes(it.type) ? it.type : "item";
          if (t === "item") cl.items.push({ type: "item", challenge: String(it.challenge || ""), response: String(it.response || "") });
          else cl.items.push({ type: t, text: String(it.text || it.challenge || "") });
        }
        grp.checklists.push(cl);
      }
      set.groups.push(grp);
    }
    return set.groups.length ? set : null;
  }

  /* ============================================================ BUILDER */
  const builderScrim = () => $("#builderScrim");

  function openBuilder() {
    renderBuilder();
    builderScrim().hidden = false;
    closePopover();
  }
  function closeBuilder() {
    builderScrim().hidden = true;
    render(); // reflect any structural changes
  }

  function renderBuilder() {
    const set = activeSet();
    const body = $("#builderBody");
    if (!set) { body.innerHTML = ""; return; }

    body.innerHTML = `
      <div class="b-set-meta">
        <input type="text" class="field-inline" data-edit="set-name" value="${esc(set.name)}" placeholder="Set / aircraft name" />
        <input type="text" class="field-inline" data-edit="set-tail" value="${esc(set.tail || "")}" placeholder="Tail #" style="max-width:120px" />
      </div>
      ${set.groups.map((g, gi) => renderBuilderGroup(g, gi, set.groups.length)).join("")}
      <div class="b-add-row">
        <button class="btn" data-action="add-group">＋ Add Group</button>
      </div>`;

    // style the inline meta inputs like fields
    $$("#builderBody input.field-inline").forEach((el) => {
      el.style.height = "44px"; el.style.padding = "0 14px"; el.style.background = "var(--panel)";
      el.style.border = "1px solid var(--line)"; el.style.borderRadius = "11px";
      el.style.color = "var(--txt)"; el.style.fontSize = "15px"; el.style.fontWeight = "600"; el.style.outline = "none";
      el.style.flex = "1";
    });
  }

  function renderBuilderGroup(g, gi, groupCount) {
    return `
      <div class="b-group">
        <div class="b-group-head ${esc(g.type || "normal")}">
          <span class="b-type-dot"></span>
          <input class="b-title" data-edit="group-name" data-g="${esc(g.id)}" value="${esc(g.name)}" placeholder="Group name" />
          <select data-edit="group-type" data-g="${esc(g.id)}">
            <option value="normal" ${g.type === "normal" || !g.type ? "selected" : ""}>Normal</option>
            <option value="abnormal" ${g.type === "abnormal" ? "selected" : ""}>Abnormal</option>
            <option value="emergency" ${g.type === "emergency" ? "selected" : ""}>Emergency</option>
            <option value="briefing" ${g.type === "briefing" ? "selected" : ""}>Briefing</option>
          </select>
          <button class="mini-btn" data-action="move-group" data-g="${esc(g.id)}" data-dir="-1" ${gi === 0 ? "disabled style=opacity:.3" : ""}>↑</button>
          <button class="mini-btn" data-action="move-group" data-g="${esc(g.id)}" data-dir="1" ${gi === groupCount - 1 ? "disabled style=opacity:.3" : ""}>↓</button>
          <button class="mini-btn danger" data-action="del-group" data-g="${esc(g.id)}">✕</button>
        </div>
        <div class="b-checklists">
          ${g.checklists.map((c, ci) => renderBuilderChecklist(g, c, ci)).join("")}
          <div class="b-add-row">
            <button class="btn small" data-action="add-cl" data-g="${esc(g.id)}">＋ Add Checklist</button>
          </div>
        </div>
      </div>`;
  }

  function renderBuilderChecklist(g, c, ci) {
    return `
      <div class="b-checklist">
        <div class="b-cl-head">
          <input data-edit="cl-name" data-g="${esc(g.id)}" data-c="${esc(c.id)}" value="${esc(c.name)}" placeholder="Checklist name" />
          <button class="mini-btn" data-action="move-cl" data-g="${esc(g.id)}" data-c="${esc(c.id)}" data-dir="-1" ${ci === 0 ? "disabled style=opacity:.3" : ""}>↑</button>
          <button class="mini-btn" data-action="move-cl" data-g="${esc(g.id)}" data-c="${esc(c.id)}" data-dir="1" ${ci === g.checklists.length - 1 ? "disabled style=opacity:.3" : ""}>↓</button>
          <button class="mini-btn danger" data-action="del-cl" data-g="${esc(g.id)}" data-c="${esc(c.id)}">✕</button>
        </div>
        <div class="b-items">
          ${c.items.map((it, ii) => renderBuilderItem(g, c, it, ii)).join("")}
          <div class="b-add-row">
            <button class="btn small" data-action="add-item" data-g="${esc(g.id)}" data-c="${esc(c.id)}">＋ Add Item</button>
          </div>
        </div>
      </div>`;
  }

  function renderBuilderItem(g, c, it, ii) {
    const type = it.type || "item";
    const text = type === "item"
      ? `<span class="bi-text">${esc(it.challenge || "")}</span><span class="bi-resp">${esc(it.response || "")}</span>`
      : `<span class="bi-text">${esc(it.text || "")}</span>`;
    return `
      <div class="b-item">
        <span class="bi-tag ${type}">${type}</span>
        ${text}
        <button class="mini-btn" data-action="move-item" data-g="${esc(g.id)}" data-c="${esc(c.id)}" data-i="${ii}" data-dir="-1">↑</button>
        <button class="mini-btn" data-action="move-item" data-g="${esc(g.id)}" data-c="${esc(c.id)}" data-i="${ii}" data-dir="1">↓</button>
        <button class="mini-btn" data-action="edit-item" data-g="${esc(g.id)}" data-c="${esc(c.id)}" data-i="${ii}">✎</button>
        <button class="mini-btn danger" data-action="del-item" data-g="${esc(g.id)}" data-c="${esc(c.id)}" data-i="${ii}">✕</button>
      </div>`;
  }

  function getGroup(gId) { return activeSet().groups.find((g) => g.id === gId); }
  function getCl(gId, cId) { const g = getGroup(gId); return g && g.checklists.find((c) => c.id === cId); }
  function move(arr, idx, dir) {
    const ni = idx + dir;
    if (ni < 0 || ni >= arr.length) return;
    const [x] = arr.splice(idx, 1); arr.splice(ni, 0, x);
  }

  function handleBuilderClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const set = activeSet();
    const gId = btn.dataset.g, cId = btn.dataset.c;
    const i = btn.dataset.i != null ? Number(btn.dataset.i) : null;
    const dir = btn.dataset.dir != null ? Number(btn.dataset.dir) : 0;

    switch (action) {
      case "add-group":
        set.groups.push({ id: uid("grp"), name: "New Group", type: "normal",
          checklists: [{ id: uid("cl"), name: "New Checklist", items: [] }] });
        break;
      case "del-group":
        if (!confirm("Delete this group and all its checklists?")) return;
        set.groups = set.groups.filter((g) => g.id !== gId);
        break;
      case "move-group":
        move(set.groups, set.groups.findIndex((g) => g.id === gId), dir);
        break;
      case "add-cl":
        getGroup(gId).checklists.push({ id: uid("cl"), name: "New Checklist", items: [] });
        break;
      case "del-cl": {
        if (!confirm("Delete this checklist?")) return;
        const g = getGroup(gId);
        g.checklists = g.checklists.filter((c) => c.id !== cId);
        clearProgress(set.id, cId);
        break;
      }
      case "move-cl": {
        const g = getGroup(gId);
        move(g.checklists, g.checklists.findIndex((c) => c.id === cId), dir);
        break;
      }
      case "add-item":
        openItemEditor(gId, cId, null);
        return;
      case "edit-item":
        openItemEditor(gId, cId, i);
        return;
      case "del-item": {
        const c = getCl(gId, cId);
        c.items.splice(i, 1);
        clearProgress(set.id, cId);
        break;
      }
      case "move-item": {
        const c = getCl(gId, cId);
        move(c.items, i, dir);
        clearProgress(set.id, cId);
        break;
      }
      default: return;
    }
    saveSets();
    renderBuilder();
  }

  function handleBuilderInput(e) {
    const el = e.target;
    const edit = el.dataset.edit;
    if (!edit) return;
    const set = activeSet();
    if (edit === "set-name") { set.name = el.value; $("#setLabel").textContent = set.tail ? `${set.name} · ${set.tail}` : set.name; }
    else if (edit === "set-tail") { set.tail = el.value; }
    else if (edit === "group-name") { getGroup(el.dataset.g).name = el.value; }
    else if (edit === "group-type") {
      getGroup(el.dataset.g).type = el.value;
      const head = el.closest(".b-group-head");
      if (head) head.className = "b-group-head " + el.value;
    }
    else if (edit === "cl-name") { getCl(el.dataset.g, el.dataset.c).name = el.value; }
    saveSets();
  }

  /* ---------- item editor ---------- */
  let itemCtx = null; // { gId, cId, index|null }
  function openItemEditor(gId, cId, index) {
    itemCtx = { gId, cId, index };
    const editing = index != null;
    const it = editing ? getCl(gId, cId).items[index] : { type: "item", challenge: "", response: "" };
    $("#itemModalTitle").textContent = editing ? "Edit Item" : "Add Item";
    setItemType(it.type || "item");
    $("#inChallenge").value = it.challenge || "";
    $("#inResponse").value = it.response || "";
    $("#inText").value = it.text || "";
    $("#itemScrim").hidden = false;
    setTimeout(() => { const f = (it.type && it.type !== "item") ? $("#inText") : $("#inChallenge"); f.focus(); }, 50);
  }
  function setItemType(t) {
    $$("#itemType button").forEach((b) => b.classList.toggle("active", b.dataset.type === t));
    const isItem = t === "item";
    $("#fieldChallenge").hidden = !isItem;
    $("#fieldResponse").hidden = !isItem;
    $("#fieldText").hidden = isItem;
  }
  function currentItemType() {
    const b = $("#itemType button.active");
    return b ? b.dataset.type : "item";
  }
  function saveItem() {
    if (!itemCtx) return;
    const t = currentItemType();
    const c = getCl(itemCtx.gId, itemCtx.cId);
    let obj;
    if (t === "item") {
      const ch = $("#inChallenge").value.trim();
      if (!ch) { toast("Enter a challenge"); return; }
      obj = { type: "item", challenge: ch, response: $("#inResponse").value.trim() };
    } else {
      const tx = $("#inText").value.trim();
      if (!tx) { toast("Enter text"); return; }
      obj = { type: t, text: tx };
    }
    if (itemCtx.index != null) c.items[itemCtx.index] = obj;
    else c.items.push(obj);
    clearProgress(activeSet().id, itemCtx.cId);
    saveSets();
    $("#itemScrim").hidden = true;
    itemCtx = null;
    renderBuilder();
  }

  /* ============================================================ SCRATCHPAD */
  const scratchEls = {};
  let sketch = { ctx: null, drawing: false, tool: "pen", color: "#22e3c8", lastX: 0, lastY: 0, dpr: 1, dirty: false };
  let scratchSaveTimer = null;

  function hydrateScratch() {
    scratchEls.panel = $("#scratch");
    scratchEls.scrim = $("#scratchScrim");
    scratchEls.text = $("#scratchText");
    scratchEls.fields = {
      atis: $("#qf-atis"), squawk: $("#qf-squawk"),
      altimeter: $("#qf-altimeter"), runway: $("#qf-runway"),
      freqActive: $("#qf-freq-active"), freqNext: $("#qf-freq-next"),
    };
    scratchEls.canvas = $("#sketchCanvas");
    scratchEls.hint = $("#canvasHint");
    scratchEls.status = $("#scratchStatus");

    // populate persisted values
    scratchEls.text.value = state.scratch.text;
    for (const k in scratchEls.fields) scratchEls.fields[k].value = state.scratch.fields[k] || "";
    setScratchMode(state.scratch.mode, false);
    updateScratchDot();
  }

  function openScratch() {
    closePopover();
    scratchEls.panel.classList.add("open");
    scratchEls.scrim.classList.add("open");
    if (state.scratch.mode === "sketch") requestAnimationFrame(setupCanvas);
  }
  function closeScratch() {
    scratchEls.panel.classList.remove("open");
    scratchEls.scrim.classList.remove("open");
  }
  function scratchOpen() { return scratchEls.panel && scratchEls.panel.classList.contains("open"); }

  function setScratchMode(mode, persist = true) {
    state.scratch.mode = mode;
    $$("#scratchSeg button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    $("#scratchNotes").hidden = mode !== "notes";
    $("#scratchSketch").hidden = mode !== "sketch";
    if (persist) saveScratch();
    if (mode === "sketch" && scratchOpen()) requestAnimationFrame(setupCanvas);
  }

  function flushScratchFromInputs() {
    state.scratch.text = scratchEls.text.value;
    for (const k in scratchEls.fields) state.scratch.fields[k] = scratchEls.fields[k].value;
  }

  function saveScratch(immediate) {
    setScratchStatus("Saving…", true);
    clearTimeout(scratchSaveTimer);
    const commit = () => {
      store(K.scratch, state.scratch);
      setScratchStatus("Saved locally", false);
      updateScratchDot();
    };
    if (immediate) commit();
    else scratchSaveTimer = setTimeout(commit, 350);
  }

  function setScratchStatus(msg, saving) {
    if (!scratchEls.status) return;
    scratchEls.status.textContent = msg;
    scratchEls.status.classList.toggle("saving", !!saving);
  }

  function updateScratchDot() {
    const s = state.scratch;
    const has = !!(s.text.trim() || s.sketch || Object.values(s.fields).some((v) => v && v.trim()));
    $("#scratchDot").hidden = !has;
  }

  function clearNotes() {
    if (!confirm("Clear the notes and quick fields? (The sketch is kept.)")) return;
    state.scratch.text = "";
    for (const k in state.scratch.fields) state.scratch.fields[k] = "";
    scratchEls.text.value = "";
    for (const k in scratchEls.fields) scratchEls.fields[k].value = "";
    saveScratch(true);
    toast("Notes cleared");
  }

  /* ---------- sketch canvas ---------- */
  function setupCanvas() {
    const c = scratchEls.canvas;
    const wrap = $("#canvasWrap");
    if (!c || !wrap) return;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (w === 0 || h === 0) return; // not visible yet
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    sketch.dpr = dpr;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    sketch.ctx = ctx;
    // restore saved drawing
    if (state.scratch.sketch) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, w, h); };
      img.src = state.scratch.sketch;
      scratchEls.hint.style.opacity = "0";
    } else {
      ctx.clearRect(0, 0, w, h);
      scratchEls.hint.style.opacity = "1";
    }
  }

  function canvasPoint(e) {
    const r = scratchEls.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function strokeBegin(e) {
    if (!sketch.ctx) setupCanvas();
    if (!sketch.ctx) return;
    sketch.drawing = true;
    scratchEls.hint.style.opacity = "0";
    try { scratchEls.canvas.setPointerCapture(e.pointerId); } catch {}
    const p = canvasPoint(e);
    sketch.lastX = p.x; sketch.lastY = p.y;
    // draw a dot for taps
    const ctx = sketch.ctx;
    applyStroke(ctx);
    ctx.beginPath();
    ctx.arc(p.x, p.y, (sketch.tool === "eraser" ? 11 : 1.6), 0, Math.PI * 2);
    ctx.fillStyle = sketch.tool === "eraser" ? "rgba(0,0,0,1)" : sketch.color;
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = sketch.tool === "eraser" ? "destination-out" : "source-over";
    ctx.fill();
    ctx.globalCompositeOperation = prevOp;
  }

  function applyStroke(ctx) {
    if (sketch.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = 22;
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = 3;
      ctx.strokeStyle = sketch.color;
    }
  }

  function strokeMove(e) {
    if (!sketch.drawing || !sketch.ctx) return;
    const ctx = sketch.ctx;
    // coalesced events for smoother lines on capable devices
    const events = (typeof e.getCoalescedEvents === "function") ? e.getCoalescedEvents() : null;
    const pts = (events && events.length) ? events.map(canvasPoint) : [canvasPoint(e)];
    applyStroke(ctx);
    for (const p of pts) {
      ctx.beginPath();
      ctx.moveTo(sketch.lastX, sketch.lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      sketch.lastX = p.x; sketch.lastY = p.y;
    }
    ctx.globalCompositeOperation = "source-over";
    sketch.dirty = true;
  }

  function strokeEnd(e) {
    if (!sketch.drawing) return;
    sketch.drawing = false;
    try { scratchEls.canvas.releasePointerCapture(e.pointerId); } catch {}
    if (sketch.dirty) { saveSketch(); sketch.dirty = false; }
  }

  function saveSketch() {
    try { state.scratch.sketch = scratchEls.canvas.toDataURL("image/png"); } catch {}
    saveScratch();
  }

  function clearSketch() {
    if (!confirm("Clear the sketch?")) return;
    if (sketch.ctx) {
      const wrap = $("#canvasWrap");
      sketch.ctx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
    }
    state.scratch.sketch = "";
    scratchEls.hint.style.opacity = "1";
    saveScratch(true);
  }

  function setPen(color) {
    sketch.tool = "pen"; sketch.color = color;
    $$("#sketchTools .pen").forEach((b) => b.classList.toggle("active", b.dataset.color === color));
    $("#eraserBtn").classList.remove("active");
  }
  function setEraser() {
    sketch.tool = "eraser";
    $$("#sketchTools .pen").forEach((b) => b.classList.remove("active"));
    $("#eraserBtn").classList.add("active");
  }

  /* ============================================================ popover + toast */
  function togglePopover() {
    const p = $("#popover");
    if (p.hidden) { $("#autoAdvance").checked = !!state.settings.autoAdvance; p.hidden = false; }
    else p.hidden = true;
  }
  function closePopover() { $("#popover").hidden = true; }

  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => { t.hidden = true; }, 260);
    }, 2000);
  }

  /* ============================================================ events */
  function wireEvents() {
    // nav item selection (delegated)
    $("#navList").addEventListener("click", (e) => {
      const btn = e.target.closest(".nav-item");
      if (btn) selectChecklist(btn.dataset.cl);
    });

    // item toggling (delegated)
    $("#items").addEventListener("click", (e) => {
      const row = e.target.closest(".item");
      if (row) toggleItem(Number(row.dataset.idx));
    });
    $("#items").addEventListener("keydown", (e) => {
      const row = e.target.closest(".item");
      if (row && (e.key === " " || e.key === "Enter")) { e.preventDefault(); toggleItem(Number(row.dataset.idx)); }
    });

    // action bar
    $("#prevBtn").addEventListener("click", () => gotoAdjacent(-1));
    $("#nextBtn").addEventListener("click", () => gotoAdjacent(1));
    $("#resetBtn").addEventListener("click", resetChecklist);

    // set select
    $("#setSelect").addEventListener("change", (e) => switchSet(e.target.value));

    // theme toggle
    $("#themeBtn").addEventListener("click", toggleTheme);

    // nav drawer (mobile)
    const app = $("#app");
    $("#navToggle").addEventListener("click", () => app.classList.toggle("nav-open"));
    $("#navScrim").addEventListener("click", () => app.classList.remove("nav-open"));

    // popover
    $("#menuBtn").addEventListener("click", (e) => { e.stopPropagation(); togglePopover(); });
    $("#popover").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      closePopover();
      const a = btn.dataset.action;
      if (a === "new-set") newSet();
      else if (a === "import") $("#fileInput").click();
      else if (a === "export") exportSet();
      else if (a === "duplicate") duplicateSet();
      else if (a === "delete-set") deleteSet();
    });
    $("#autoAdvance").addEventListener("change", (e) => {
      state.settings.autoAdvance = e.target.checked; saveSettings();
      toast(e.target.checked ? "Auto-advance on" : "Auto-advance off");
    });
    document.addEventListener("click", (e) => {
      if (!$("#popover").hidden && !e.target.closest("#popover") && !e.target.closest("#menuBtn")) closePopover();
    });

    // import file
    $("#fileInput").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importFromFile(f);
      e.target.value = "";
    });

    // builder
    $("#editBtn").addEventListener("click", openBuilder);
    $("#builderClose").addEventListener("click", closeBuilder);
    $("#builderDone").addEventListener("click", closeBuilder);
    $("#builderBody").addEventListener("click", handleBuilderClick);
    $("#builderBody").addEventListener("input", handleBuilderInput);
    $("#builderScrim").addEventListener("mousedown", (e) => { if (e.target === $("#builderScrim")) closeBuilder(); });

    // item editor
    $("#itemType").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-type]");
      if (b) setItemType(b.dataset.type);
    });
    $("#itemSave").addEventListener("click", saveItem);
    $("#itemCancel").addEventListener("click", () => { $("#itemScrim").hidden = true; itemCtx = null; });
    $("#itemClose").addEventListener("click", () => { $("#itemScrim").hidden = true; itemCtx = null; });
    $("#itemScrim").addEventListener("mousedown", (e) => { if (e.target === $("#itemScrim")) { $("#itemScrim").hidden = true; itemCtx = null; } });
    ["#inChallenge", "#inResponse", "#inText"].forEach((s) =>
      $(s).addEventListener("keydown", (e) => { if (e.key === "Enter") saveItem(); }));

    // scratchpad
    $("#scratchBtn").addEventListener("click", openScratch);
    $("#scratchClose").addEventListener("click", closeScratch);
    $("#scratchScrim").addEventListener("click", closeScratch);
    $("#scratchSeg").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-mode]");
      if (b) setScratchMode(b.dataset.mode);
    });
    $("#scratchText").addEventListener("input", () => { flushScratchFromInputs(); saveScratch(); });
    Object.entries(scratchEls.fields).forEach(([key, el]) => {
      el.addEventListener("input", () => {
        if (key === "squawk") el.value = el.value.replace(/\D/g, "").slice(0, 4);
        else if (key === "atis" || key === "runway") el.value = el.value.toUpperCase();
        flushScratchFromInputs();
        saveScratch();
      });
    });
    $("#scratchClearNotes").addEventListener("click", clearNotes);

    // sketch tools
    $("#sketchTools").addEventListener("click", (e) => {
      const pen = e.target.closest(".pen");
      if (pen) { setPen(pen.dataset.color); return; }
      const tool = e.target.closest("[data-tool]");
      if (!tool) return;
      if (tool.dataset.tool === "eraser") setEraser();
      else if (tool.dataset.tool === "clear-sketch") clearSketch();
    });

    // canvas drawing
    const cv = scratchEls.canvas;
    cv.addEventListener("pointerdown", (e) => { e.preventDefault(); strokeBegin(e); });
    cv.addEventListener("pointermove", (e) => { e.preventDefault(); strokeMove(e); });
    cv.addEventListener("pointerup", strokeEnd);
    cv.addEventListener("pointercancel", strokeEnd);
    cv.addEventListener("pointerleave", strokeEnd);

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      if (!scratchOpen() || state.scratch.mode !== "sketch") return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (sketch.ctx) saveSketch(); setupCanvas(); }, 150);
    });

    // keyboard: Esc closes topmost overlay; arrows switch checklists
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!$("#itemScrim").hidden) { $("#itemScrim").hidden = true; itemCtx = null; }
        else if (!$("#builderScrim").hidden) closeBuilder();
        else if (scratchOpen()) closeScratch();
        else if (!$("#popover").hidden) closePopover();
        else if ($("#app").classList.contains("nav-open")) $("#app").classList.remove("nav-open");
        return;
      }
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
      const overlayOpen = !$("#builderScrim").hidden || !$("#itemScrim").hidden || scratchOpen();
      if (typing || overlayOpen) return;
      if (e.key === "ArrowRight" && !$("#nextBtn").disabled) gotoAdjacent(1);
      else if (e.key === "ArrowLeft" && !$("#prevBtn").disabled) gotoAdjacent(-1);
    });
  }

  function registerSW() {
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  /* ---------- go ---------- */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
