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
    scratch: { mode: "notes", fields: [], text: "", sketch: "" },
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
      fields: migrateQuickFields(sc.fields),
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
    hydratePdf();
    wirePdf();
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

  // The active checklist gates the Next control: any unchecked item blocks advancing.
  // A checklist with no checkable rows (e.g. a briefing / notes-only) never blocks.
  function currentIsComplete() {
    const set = activeSet();
    const found = set ? findChecklist(set, state.activeChecklistId) : null;
    if (!found) return true;
    const { checked, total } = progressOf(set.id, found.checklist);
    return total === 0 || checked >= total;
  }

  function setNavDisabled(disabled) {
    $("#resetBtn").disabled = disabled;
    const flat = flatten(activeSet());
    const i = flat.findIndex((f) => f.checklist.id === state.activeChecklistId);
    $("#prevBtn").disabled = disabled || i <= 0;
    const nextBtn = $("#nextBtn");
    const atLast = i < 0 || i >= flat.length - 1;
    const blockedIncomplete = !disabled && !atLast && !currentIsComplete();
    nextBtn.disabled = disabled || atLast || blockedIncomplete;
    nextBtn.title = blockedIncomplete ? "Cochez tous les éléments pour passer à la suivante" : "";
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
    setNavDisabled(false);   // re-gate Next now that completion may have changed
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

  /* ---- quick fields: a user-editable list of avionics inputs ---- */
  const DEFAULT_QF = [
    { key: "atis", label: "ATIS" },
    { key: "squawk", label: "Squawk" },
    { key: "altimeter", label: "Altimeter" },
    { key: "runway", label: "Active RWY" },
    { key: "freqActive", label: "Active Freq" },
    { key: "freqNext", label: "Next Freq" },
  ];
  // Accepts the legacy object form ({atis:"",...}) or the new array form and
  // always returns an ordered [{key,label,value}] list.
  function migrateQuickFields(raw) {
    if (Array.isArray(raw)) {
      const arr = raw.filter((f) => f && f.key).map((f) => ({
        key: String(f.key),
        label: String(f.label || f.key),
        value: typeof f.value === "string" ? f.value : "",
      }));
      if (arr.length) return arr;
    }
    const obj = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
    return DEFAULT_QF.map((d) => ({ key: d.key, label: d.label, value: typeof obj[d.key] === "string" ? obj[d.key] : "" }));
  }
  // Presentation hints (placeholder / keypad / maxlength) for the built-in keys.
  function qfAttrs(key) {
    switch (key) {
      case "squawk":     return { ph: "1200", im: "numeric", ml: 4 };
      case "altimeter":  return { ph: "29.92", im: "decimal", ml: 8 };
      case "runway":     return { ph: "27", im: "", ml: 6 };
      case "atis":       return { ph: "Info / —", im: "", ml: 24 };
      case "freqActive": return { ph: "118.30", im: "decimal", ml: 7 };
      case "freqNext":   return { ph: "121.90", im: "decimal", ml: 7 };
      default:           return { ph: "", im: "", ml: 24 };
    }
  }
  function renderQuickFields() {
    const grid = $("#qfGrid");
    if (!grid) return;
    grid.innerHTML = state.scratch.fields.map((f) => {
      const a = qfAttrs(f.key);
      const im = a.im ? ` inputmode="${a.im}"` : "";
      return `<div class="qf" data-key="${esc(f.key)}">
          <div class="qf-top">
            <span class="qf-label">${esc(f.label)}</span>
            <button class="qf-del" data-key="${esc(f.key)}" aria-label="Remove field" title="Remove">×</button>
          </div>
          <input class="qf-input" data-key="${esc(f.key)}" type="text" value="${esc(f.value)}"${im} maxlength="${a.ml}" placeholder="${esc(a.ph)}" autocomplete="off" />
        </div>`;
    }).join("") +
      `<button class="qf-add" id="qfAdd" type="button" aria-label="Add field">＋<span>Field</span></button>`;
  }
  function onQfInput(e) {
    const inp = e.target.closest(".qf-input");
    if (!inp) return;
    const key = inp.dataset.key;
    if (key === "squawk") inp.value = inp.value.replace(/\D/g, "").slice(0, 4);
    else if (key === "atis" || key === "runway") inp.value = inp.value.toUpperCase();
    const f = state.scratch.fields.find((x) => x.key === key);
    if (f) f.value = inp.value;
    saveScratch();
  }
  function onQfClick(e) {
    const del = e.target.closest(".qf-del");
    if (del) { removeQuickField(del.dataset.key); return; }
    if (e.target.closest("#qfAdd")) addQuickField();
  }
  function addQuickField() {
    const label = prompt("New field name:", "");
    if (label === null) return;
    const name = label.trim();
    if (!name) return;
    state.scratch.fields.push({ key: uid("qf"), label: name.slice(0, 18), value: "" });
    renderQuickFields();
    saveScratch(true);
  }
  function removeQuickField(key) {
    const f = state.scratch.fields.find((x) => x.key === key);
    if (!f) return;
    if (f.value && f.value.trim() && !confirm(`Remove field "${f.label}" and its value?`)) return;
    state.scratch.fields = state.scratch.fields.filter((x) => x.key !== key);
    renderQuickFields();
    saveScratch(true);
  }

  function hydrateScratch() {
    scratchEls.panel = $("#scratch");
    scratchEls.scrim = $("#scratchScrim");
    scratchEls.text = $("#scratchText");
    scratchEls.canvas = $("#sketchCanvas");
    scratchEls.hint = $("#canvasHint");
    scratchEls.status = $("#scratchStatus");

    // populate persisted values
    scratchEls.text.value = state.scratch.text;
    renderQuickFields();
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
    const has = !!(s.text.trim() || s.sketch || s.fields.some((f) => f.value && f.value.trim()));
    $("#scratchDot").hidden = !has;
  }

  function clearNotes() {
    if (!confirm("Clear the notes and quick fields? (The sketch is kept.)")) return;
    state.scratch.text = "";
    state.scratch.fields.forEach((f) => { f.value = ""; });
    scratchEls.text.value = "";
    renderQuickFields();
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
    const qfGrid = $("#qfGrid");
    qfGrid.addEventListener("input", onQfInput);
    qfGrid.addEventListener("click", onQfClick);
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
        else if (pdfPanelOpen()) closePdf();
        else if (scratchOpen()) closeScratch();
        else if (!$("#popover").hidden) closePopover();
        else if ($("#app").classList.contains("nav-open")) $("#app").classList.remove("nav-open");
        return;
      }
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
      const overlayOpen = !$("#builderScrim").hidden || !$("#itemScrim").hidden || scratchOpen() || pdfPanelOpen();
      if (typing || overlayOpen) return;
      if (e.key === "ArrowRight" && !$("#nextBtn").disabled) gotoAdjacent(1);
      else if (e.key === "ArrowLeft" && !$("#prevBtn").disabled) gotoAdjacent(-1);
    });
  }

  /* ============================================================ PDF DOCUMENTS
     Import PDFs, store them in IndexedDB (binary — localStorage can't), and
     read them full-screen with PDF.js. Pages render lazily (IntersectionObserver)
     so a 200-page POH stays responsive on an iPad. */
  const PDF_DB = "icl-pdfs";
  const PDF_DOC_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M13 3v5h5M8.5 13h7M8.5 16.5h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const pdfEls = {};
  let pdfDoc = null;         // active PDF.js document
  let pdfObserver = null;    // lazy-render observer
  let pdfRenderTasks = [];   // in-flight render tasks (cancel on teardown)
  let pdfRatio = 1.414;      // page height/width estimate for placeholders
  let pdfZoom = 1;
  let pdfScrollRaf = 0;

  /* ---- IndexedDB: two stores keep the list light (blob loaded only to read) ---- */
  function pdfDBOpen() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) { reject(new Error("no-idb")); return; }
      const req = indexedDB.open(PDF_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
        if (!db.objectStoreNames.contains("blob")) db.createObjectStore("blob", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function pdfReq(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function pdfAdd(file) {
    const db = await pdfDBOpen();
    const meta = { id: uid("pdf"), name: file.name || "document.pdf", size: file.size || 0, addedAt: Date.now() };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["meta", "blob"], "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("abort"));
      tx.objectStore("meta").put(meta);
      tx.objectStore("blob").put({ id: meta.id, blob: file });
    });
    db.close();
    return meta;
  }
  async function pdfListMeta() {
    const db = await pdfDBOpen();
    const list = await pdfReq(db.transaction("meta", "readonly").objectStore("meta").getAll());
    db.close();
    return (list || []).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }
  async function pdfGetBlob(id) {
    const db = await pdfDBOpen();
    const rec = await pdfReq(db.transaction("blob", "readonly").objectStore("blob").get(id));
    db.close();
    return rec ? rec.blob : null;
  }
  async function pdfRename(id, name) {
    const db = await pdfDBOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("meta", "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const metaStore = tx.objectStore("meta");
      const g = metaStore.get(id);
      g.onsuccess = () => { const rec = g.result; if (rec) { rec.name = name; metaStore.put(rec); } };
    });
    db.close();
  }
  async function pdfDelete(id) {
    const db = await pdfDBOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["meta", "blob"], "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore("meta").delete(id);
      tx.objectStore("blob").delete(id);
    });
    db.close();
  }

  /* ---- formatting ---- */
  function fmtBytes(n) {
    n = n || 0;
    if (n < 1024) return n + " o";
    if (n < 1048576) return Math.round(n / 1024) + " Ko";
    return (n / 1048576).toFixed(1) + " Mo";
  }
  function fmtDate(ts) {
    if (!ts) return "";
    try { return new Date(ts).toLocaleDateString(); } catch (e) { return ""; }
  }

  /* ---- element cache + setup ---- */
  function hydratePdf() {
    pdfEls.panel = $("#pdfPanel");
    if (!pdfEls.panel) return;
    pdfEls.scrim = $("#pdfScrim");
    pdfEls.library = $("#pdfLibrary");
    pdfEls.list = $("#pdfList");
    pdfEls.empty = $("#pdfEmpty");
    pdfEls.viewer = $("#pdfViewer");
    pdfEls.pages = $("#pdfPages");
    pdfEls.docName = $("#pdfDocName");
    pdfEls.pageInfo = $("#pdfPageInfo");
    pdfEls.fileInput = $("#pdfFileInput");
    pdfEls.dot = $("#pdfDot");
    if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.min.js";
    refreshPdfDot();
  }

  function pdfPanelOpen() { return !!(pdfEls.panel && pdfEls.panel.classList.contains("open")); }

  function openPdf() {
    if (!pdfEls.panel) return;
    showPdfLibrary();
    pdfEls.panel.classList.add("open");
    pdfEls.scrim.classList.add("open");
    renderPdfList();
  }
  function closePdf() {
    if (!pdfEls.panel) return;
    pdfEls.panel.classList.remove("open");
    pdfEls.scrim.classList.remove("open");
    teardownPdfDoc();
    pdfEls.pages.innerHTML = "";
  }
  function showPdfLibrary() { pdfEls.library.hidden = false; pdfEls.viewer.hidden = true; }
  function showPdfViewer() { pdfEls.library.hidden = true; pdfEls.viewer.hidden = false; }

  /* ---- library ---- */
  async function renderPdfList() {
    let metas = [];
    try { metas = await pdfListMeta(); }
    catch (e) { pdfEls.list.innerHTML = `<div class="pdf-msg">Stockage indisponible sur cet appareil.</div>`; pdfEls.empty.hidden = true; return; }
    refreshPdfDot(metas.length);
    pdfEls.empty.hidden = metas.length > 0;
    pdfEls.list.innerHTML = metas.map((m) => `
      <div class="pdf-row" data-id="${esc(m.id)}">
        <button class="pdf-open" data-id="${esc(m.id)}">
          <span class="pdf-ic">${PDF_DOC_SVG}</span>
          <span class="pdf-info">
            <span class="pdf-name">${esc(m.name)}</span>
            <span class="pdf-sub">${esc(fmtBytes(m.size))} · ${esc(fmtDate(m.addedAt))}</span>
          </span>
        </button>
        <button class="pdf-mini" data-action="rename" data-id="${esc(m.id)}" aria-label="Renommer" title="Renommer">✎</button>
        <button class="pdf-mini danger" data-action="delete" data-id="${esc(m.id)}" aria-label="Supprimer" title="Supprimer">✕</button>
      </div>`).join("");
  }

  async function refreshPdfDot(count) {
    if (!pdfEls.dot) return;
    let n = count;
    if (typeof n !== "number") { try { n = (await pdfListMeta()).length; } catch (e) { n = 0; } }
    pdfEls.dot.hidden = !(n > 0);
  }

  function pdfPickFiles() { pdfEls.fileInput.value = ""; pdfEls.fileInput.click(); }

  async function pdfOnFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (!files.length) { toast("Aucun PDF sélectionné"); return; }
    let ok = 0;
    for (const f of files) { try { await pdfAdd(f); ok++; } catch (e) { console.error("pdf add failed", e); } }
    await renderPdfList();
    toast(ok ? (ok === 1 ? "1 PDF ajouté" : ok + " PDF ajoutés") : "Échec de l'import");
  }

  async function onPdfListClick(e) {
    const actBtn = e.target.closest("[data-action]");
    if (actBtn) {
      const id = actBtn.dataset.id;
      if (actBtn.dataset.action === "delete") {
        if (!confirm("Supprimer ce document ?")) return;
        try { await pdfDelete(id); } catch (e2) {}
        await renderPdfList();
        toast("Document supprimé");
      } else if (actBtn.dataset.action === "rename") {
        const row = actBtn.closest(".pdf-row");
        const cur = row ? row.querySelector(".pdf-name").textContent : "";
        const name = prompt("Nouveau nom :", cur);
        if (name && name.trim()) { try { await pdfRename(id, name.trim()); } catch (e2) {} await renderPdfList(); }
      }
      return;
    }
    const openBtn = e.target.closest(".pdf-open");
    if (openBtn) openPdfDoc(openBtn.dataset.id, openBtn.querySelector(".pdf-name").textContent);
  }

  /* ---- viewer (PDF.js) ---- */
  function pdfPageWidth() {
    const w = (pdfEls.pages && pdfEls.pages.clientWidth) || 800;
    return Math.max(220, w - 24) * pdfZoom;
  }

  function teardownPdfDoc() {
    if (pdfObserver) { pdfObserver.disconnect(); pdfObserver = null; }
    if (pdfEls.pages) pdfEls.pages.onscroll = null;
    pdfRenderTasks.forEach((t) => { try { t.cancel(); } catch (e) {} });
    pdfRenderTasks = [];
    if (pdfDoc) { try { pdfDoc.destroy(); } catch (e) {} pdfDoc = null; }
  }

  async function openPdfDoc(id, name) {
    showPdfViewer();
    pdfEls.docName.textContent = name || "";
    pdfEls.pageInfo.textContent = "…";
    pdfZoom = 1;
    pdfEls.pages.innerHTML = `<div class="pdf-msg">Chargement…</div>`;
    if (!window.pdfjsLib) { pdfEls.pages.innerHTML = `<div class="pdf-msg">Lecteur PDF indisponible — rechargez l'app une fois en ligne.</div>`; return; }
    let blob = null;
    try { blob = await pdfGetBlob(id); } catch (e) {}
    if (!blob) { pdfEls.pages.innerHTML = `<div class="pdf-msg">Document introuvable.</div>`; return; }
    let buf;
    try { buf = await blob.arrayBuffer(); } catch (e) { pdfEls.pages.innerHTML = `<div class="pdf-msg">Lecture impossible.</div>`; return; }
    teardownPdfDoc();
    try { pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise; }
    catch (e) { pdfEls.pages.innerHTML = `<div class="pdf-msg">Impossible d'ouvrir ce PDF.</div>`; return; }
    await buildPdfPages();
  }

  async function buildPdfPages() {
    const n = pdfDoc.numPages;
    try {
      const p1 = await pdfDoc.getPage(1);
      const vp = p1.getViewport({ scale: 1 });
      pdfRatio = vp.height / vp.width;
    } catch (e) { pdfRatio = 1.414; }
    const w = pdfPageWidth();
    pdfEls.pages.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= n; i++) {
      const el = document.createElement("div");
      el.className = "pdf-page";
      el.dataset.page = String(i);
      el.style.width = w + "px";
      el.style.height = Math.round(w * pdfRatio) + "px";
      frag.appendChild(el);
    }
    const inner = document.createElement("div");
    inner.className = "pdf-pages-inner";
    inner.appendChild(frag);
    pdfEls.pages.appendChild(inner);
    pdfEls.inner = inner;
    setupPdfObserver();
    pdfEls.pageInfo.textContent = "1 / " + n;
  }

  function setupPdfObserver() {
    if (pdfObserver) pdfObserver.disconnect();
    pdfObserver = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) renderPdfPage(en.target); });
    }, { root: pdfEls.pages, rootMargin: "400px 0px" });
    $$(".pdf-page", pdfEls.pages).forEach((el) => pdfObserver.observe(el));
    pdfEls.pages.onscroll = pdfOnScroll;
  }

  async function renderPdfPage(el) {
    if (!pdfDoc || el.dataset.rendered === "1" || el.dataset.rendering === "1") return;
    el.dataset.rendering = "1";
    const num = parseInt(el.dataset.page, 10);
    let page;
    try { page = await pdfDoc.getPage(num); } catch (e) { el.dataset.rendering = ""; return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = pdfPageWidth();
    const base = cssW / page.getViewport({ scale: 1 }).width;
    const viewport = page.getViewport({ scale: base * dpr });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = cssW + "px";
    canvas.style.height = Math.floor(viewport.height / dpr) + "px";
    el.style.height = canvas.style.height;
    const task = page.render({ canvasContext: canvas.getContext("2d"), viewport });
    pdfRenderTasks.push(task);
    try { await task.promise; el.innerHTML = ""; el.appendChild(canvas); el.dataset.rendered = "1"; }
    catch (e) { /* cancelled */ }
    el.dataset.rendering = "";
    pdfRenderTasks = pdfRenderTasks.filter((t) => t !== task);
  }

  function clampZoom(z) { return Math.min(4, Math.max(0.5, z)); }

  function relayoutPdfPages() {
    const w = pdfPageWidth();
    $$(".pdf-page", pdfEls.pages).forEach((el) => {
      el.dataset.rendered = ""; el.dataset.rendering = "";
      el.innerHTML = "";
      el.style.width = w + "px";
      el.style.height = Math.round(w * pdfRatio) + "px";
    });
    setupPdfObserver();
  }

  function pdfSetZoom(delta) {
    if (!pdfDoc) return;
    const next = clampZoom(Math.round((pdfZoom + delta) * 100) / 100);
    if (next === pdfZoom) return;
    pdfZoom = next;
    relayoutPdfPages();
  }

  // Pinch-to-zoom inside the viewer: during the gesture we scale the pages with a
  // cheap CSS transform (smooth, GPU); when the fingers lift we commit the new zoom
  // and re-rasterize the pages at full resolution so they stay crisp.
  let pdfPinch = null;
  function pdfTouchDist(t) {
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  }
  function pdfTouchStart(e) {
    if (!pdfDoc || !pdfEls.inner || e.touches.length !== 2) return;
    const rect = pdfEls.inner.getBoundingClientRect();
    const ox = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
    const oy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
    pdfPinch = { dist: pdfTouchDist(e.touches) || 1, zoom: pdfZoom, live: pdfZoom };
    pdfEls.inner.style.transformOrigin = ox + "px " + oy + "px";
    e.preventDefault();
  }
  function pdfTouchMove(e) {
    if (!pdfPinch || e.touches.length !== 2) return;
    e.preventDefault();
    pdfPinch.live = clampZoom(pdfPinch.zoom * (pdfTouchDist(e.touches) / pdfPinch.dist));
    pdfEls.inner.style.transform = "scale(" + (pdfPinch.live / pdfPinch.zoom) + ")";
  }
  function pdfTouchEnd(e) {
    if (!pdfPinch || e.touches.length >= 2) return;
    const finalZoom = pdfPinch.live;
    pdfPinch = null;
    if (pdfEls.inner) { pdfEls.inner.style.transform = ""; pdfEls.inner.style.transformOrigin = ""; }
    if (Math.abs(finalZoom - pdfZoom) > 0.001) { pdfZoom = finalZoom; relayoutPdfPages(); }
  }

  function pdfOnScroll() {
    if (pdfScrollRaf) return;
    pdfScrollRaf = requestAnimationFrame(() => {
      pdfScrollRaf = 0;
      if (!pdfDoc) return;
      const pages = $$(".pdf-page", pdfEls.pages);
      if (!pages.length) return;
      const mid = pdfEls.pages.scrollTop + pdfEls.pages.clientHeight / 2;
      let cur = 1;
      for (const el of pages) { if (el.offsetTop <= mid) cur = parseInt(el.dataset.page, 10); else break; }
      pdfEls.pageInfo.textContent = cur + " / " + pdfDoc.numPages;
    });
  }

  function wirePdf() {
    if (!pdfEls.panel) return;
    $("#pdfBtn").addEventListener("click", openPdf);
    $("#pdfClose").addEventListener("click", closePdf);
    pdfEls.scrim.addEventListener("click", closePdf);
    $("#pdfImportBtn").addEventListener("click", pdfPickFiles);
    const emptyImport = $("#pdfEmptyImport");
    if (emptyImport) emptyImport.addEventListener("click", pdfPickFiles);
    pdfEls.fileInput.addEventListener("change", (e) => pdfOnFiles(e.target.files));
    $("#pdfBack").addEventListener("click", () => { teardownPdfDoc(); pdfEls.pages.innerHTML = ""; showPdfLibrary(); });
    $("#pdfZoomIn").addEventListener("click", () => pdfSetZoom(0.25));
    $("#pdfZoomOut").addEventListener("click", () => pdfSetZoom(-0.25));
    pdfEls.pages.addEventListener("touchstart", pdfTouchStart, { passive: false });
    pdfEls.pages.addEventListener("touchmove", pdfTouchMove, { passive: false });
    pdfEls.pages.addEventListener("touchend", pdfTouchEnd);
    pdfEls.pages.addEventListener("touchcancel", pdfTouchEnd);
    pdfEls.list.addEventListener("click", onPdfListClick);
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
