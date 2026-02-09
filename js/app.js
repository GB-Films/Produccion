(function(){
  const el = (id)=>document.getElementById(id);
  const views = ["breakdown","shooting","dayplan","schedule","shotlist","elements","crew","reports","callsheet"];

  const cats = ["cast","props","wardrobe","art","makeup","sound","sfx","vfx","vehicles","animals","extras"];
  const catNames = {
    cast:"Cast", props:"Props", wardrobe:"Vestuario", art:"Arte", makeup:"Maquillaje",
    sound:"Sonido", sfx:"SFX", vfx:"Post VFX", vehicles:"Vehículos", animals:"Animales", extras:"Extras"
  };
  const catColors = {

    cast:"var(--cat-cast)",
    props:"var(--cat-props)",
    wardrobe:"var(--cat-wardrobe)",
    art:"var(--cat-art)",
    makeup:"var(--cat-makeup)",
    sound:"var(--cat-sound)",
    sfx:"var(--cat-sfx)",
    vfx:"var(--cat-vfx)",
    vehicles:"var(--cat-vehicles)",
    animals:"var(--cat-animals)",
    extras:"var(--cat-extras)"
  };

  const shotTypes = [
    "Gran plano general",
    "Plano general",
    "Plano conjunto",
    "Plano americano",
    "Plano medio",
    "Primer plano",
    "Primerísimo primer plano",
    "Plano detalle",
    "Insert",
    "Plano secuencia"
  ];

  // Back-compat: abreviaturas viejas → nombres completos
  const shotTypeAliases = {
    "GPG": "Gran plano general",
    "PG": "Plano general",
    "PC": "Plano conjunto",
    "PA": "Plano americano",
    "PM": "Plano medio",
    "PP": "Primer plano",
    "PPP": "Primerísimo primer plano",
    "PD": "Plano detalle",
    "INS": "Insert",
    "PS": "Plano secuencia"
  };

  function normalizeShotType(v){
    const s = String(v||"").trim();
    if(!s) return "";
    const u = s.toUpperCase();
    if(shotTypeAliases[u]) return shotTypeAliases[u];
    const found = shotTypes.find(t=>t.toLowerCase()===s.toLowerCase());
    return found || s;
  }

  const MAX_SCRIPT_VERSIONS = 1; // Solo V1 (un único guion)

// Guion: el texto crudo NO se guarda en JSONBin (solo local)
const SCRIPT_RAW_LOCAL_PREFIX = "gb_script_raw_local_v1__";
function getScriptRawLocalKey(){
  try{
    const cfg = (typeof StorageLayer!=="undefined" && StorageLayer.loadCfg) ? StorageLayer.loadCfg() : null;
    const k = cfg?.scriptBinId || cfg?.binId || cfg?.projectId || "default";
    return SCRIPT_RAW_LOCAL_PREFIX + String(k);
  }catch(_e){
    return SCRIPT_RAW_LOCAL_PREFIX + "default";
  }
}
function loadScriptRawLocal(){
  try{ return localStorage.getItem(getScriptRawLocalKey()) || ""; }catch(_e){ return ""; }
}
function saveScriptRawLocal(txt){
  try{ localStorage.setItem(getScriptRawLocalKey(), String(txt||"")); }catch(_e){}
}

function sanitizeScriptState(opts={}){
  const migrateRawToLocal = !!opts.migrateRawToLocal;
  ensureScriptState();

  let changed = false;

  // Si hay varias versiones viejas, nos quedamos con la más nueva (solo V1)
  try{
    if(Array.isArray(state.script.versions) && state.script.versions.length > MAX_SCRIPT_VERSIONS){
      state.script.versions = state.script.versions
        .slice()
        .sort((a,b)=>{
          const ta = Date.parse(a?.updatedAt || a?.createdAt || "") || 0;
          const tb = Date.parse(b?.updatedAt || b?.createdAt || "") || 0;
          return ta - tb;
        })
        .slice(-MAX_SCRIPT_VERSIONS);
      changed = true;
    }
  }catch(_e){}

  // Asegurar que exista una versión
  if(!Array.isArray(state.script.versions) || !state.script.versions.length){
    const now = new Date().toISOString();
    state.script.versions = [{
      id: uid("scrVer"),
      name: "V1",
      createdAt: now,
      updatedAt: now,
      keywords: "",
      scenes: [],
      draft: true
    }];
    changed = true;
  }

  // Forzar V1 y versión activa única
  const v0 = state.script.versions[0];
  if(v0 && v0.name !== "V1"){ v0.name = "V1"; changed = true; }
  if(state.script.activeVersionId !== (v0?.id || null)){
    state.script.activeVersionId = v0?.id || null;
    changed = true;
  }

  // Nunca guardar rawText en el estado (lo migramos a local si hace falta)
  for(const v of (state.script.versions||[])){
    if(v && Object.prototype.hasOwnProperty.call(v,"rawText")){
      if(migrateRawToLocal){
        const cur = loadScriptRawLocal();
        if(!cur && v.rawText) saveScriptRawLocal(v.rawText);
      }
      try{ delete v.rawText; }catch(_e){}
      changed = true;
    }
  }

  // Si migramos algo, lo empujamos una sola vez para limpiar el BIN (sin texto crudo)
  if(changed && !sanitizeScriptState._autoTouched){
    sanitizeScriptState._autoTouched = true;
    try{ state.meta.updatedAt = new Date().toISOString(); }catch(_e){}
    try{
      if(!syncReady) sanitizeScriptState._needsRemoteClean = true;
      touch();
    }catch(_e){}
  }
}


  const crewAreas = [
    "Direccion",
    "Cast",
    "Produccion",
    "Foto",
    "Electrica/Grip",
    "Sonido",
    "Arte",
    "Vestuario",
    "Maquillaje",
    "Post VFX",
    "Otros"
  ];

  let state = null;


  // ======= Permisos de edición (password 6868) =======
  const EDIT_PASSWORD = "6868";
  let editUnlocked = false;
  try{ editUnlocked = sessionStorage.getItem("gb_edit_unlocked") === "1"; }catch(_e){ editUnlocked = false; }

  function isReadOnly(){ return !editUnlocked; }

  function updateModeBanner(){
    const pill = document.getElementById("modeBanner");
    if(!pill) return;
    pill.innerHTML = editUnlocked ? "✏️ Edición (click para bloquear)" : "🔒 Lector (click para editar)";
  }

  function setEditUnlocked(v){
    editUnlocked = !!v;
    try{ sessionStorage.setItem("gb_edit_unlocked", editUnlocked ? "1" : "0"); }catch(_e){}
    try{ document.body.classList.toggle("readOnly", !editUnlocked); }catch(_e){}
    updateModeBanner();
  }

  function mountModeBanner(){
    let pill = document.getElementById("modeBanner");
    if(pill) { updateModeBanner(); return pill; }
    pill = document.createElement("div");
    pill.id = "modeBanner";
    pill.className = "modeBanner";
    try{ pill.dataset.roAllow = "1"; }catch(_e){}
    pill.title = "Click para alternar edición";
    pill.addEventListener("click", ()=>{
      if(editUnlocked){
        const ok = confirm("¿Volver a modo lector?");
        if(ok) setEditUnlocked(false);
        return;
      }
      const pass = prompt("Contraseña para editar:");
      if(pass === EDIT_PASSWORD){
        setEditUnlocked(true);
        toast("Edición habilitada ✏️");
      }else if(pass !== null){
        toast("Contraseña incorrecta 🔒");
      }
    });
    document.body.appendChild(pill);
    updateModeBanner();
    return pill;
  }
  let selectedSceneId = null;
  let selectedDayId = null;
  let callSheetDayId = null;

  // Elements explorer: último ítem seleccionado
  let elxSelectedKey = null;

  // Mantener el "día foco" sincronizado entre Call Diario / Plan de Rodaje / Shotlist / Reportes.
  function syncAllDaySelections(id){
    if(!id) return;
    selectedDayId = id;
    selectedDayplanDayId = id;
    selectedShotlistDayId = id;
    callSheetDayId = id;

    // Sync selects if present
    try{
      const a = el("shootDaySelect"); if(a) a.value = id;
      const b = el("dayplanSelect"); if(b) b.value = id;
      const c = el("shotDaySelect"); if(c) c.value = id;
    }catch(_e){}
  }

  let selectedShotlistDayId = null;
let selectedShotlistSceneId = null;
const shotlistCollapsedSceneIds = new Set();
  let selectedDayplanDayId = null;
  let dayDetailOpenSceneKeys = new Set();
  let reportsTab = (localStorage.getItem("gb_reports_tab") || "callsheet");

  let navCollapsedKey = "gb_nav_collapsed_v1";

  const DEFAULT_SHOT_MIN = 15;

  // Guion versionado (Breakdown)
  let selectedScriptSceneId = null;

  // Sync safety:
  // - We do an initial pull from JSONBin when possible (especially on first run)
  // - We avoid pushing until that initial sync decision is made
  let syncReady = false;
  let bootHadLocal = false;
  let bootAppliedRemote = false;
  let sessionPulledRemote = false;
  let lastRemoteStamp = "";
  let lastScriptRemoteStamp = "";

  // Crew table: which rows are expanded to show assigned shoot days
  let expandedCrewIds = new Set();

  let calCursor = { year: new Date().getFullYear(), month: new Date().getMonth() };

  function loadCallSheetCursor(){
    const raw = localStorage.getItem("gb_callsheet_month");
    if(!raw) return;
    const m = String(raw).match(/^(\d{4})-(\d{2})$/);
    if(!m) return;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    if(Number.isFinite(y) && mo>=0 && mo<=11){
      calCursor.year = y;
      calCursor.month = mo;
    }
  }
  function saveCallSheetCursor(){
    try{
      localStorage.setItem("gb_callsheet_month", `${calCursor.year}-${String(calCursor.month+1).padStart(2,"0")}`);
    }catch{}
  }
  let schedDrag = null;
  let schedTap = null; // fallback doble click (Plan General)

  function uid(p="id"){ return `${p}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`; }
  function esc(s){
    return String(s||"")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  // Compat: algunas partes usan escapeHtml() en vez de esc()
  function escapeHtml(s){ return esc(s); }

  function firstWords(txt, maxWords){
    const s = String(txt||"").trim();
    if(!s) return "";
    const words = s.split(/\s+/).filter(Boolean);
    if(words.length <= maxWords) return words.join(" " );
    return words.slice(0, maxWords).join(" " ) + "…";
  }

  function notesOrShortSummary(notes, summary){
    const n = String(notes||"").trim();
    if(n) return n;
    return firstWords(summary, 60);
  }

  function toast(msg){
    const t = el("toast");
    if(!t) return;
    t.textContent = msg;
    t.style.display="block";
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>t.style.display="none", 2200);
  }



  // ===== Read-only hard guard (Lector) =====
  const RO_EDIT_MSG = "Modo lector 🔒 (desbloqueá con el candado para editar)";
  let _roLastToast = 0;
  function roToast(){
    const now = Date.now();
    if(now - _roLastToast < 900) return;
    _roLastToast = now;
    try{ toast(RO_EDIT_MSG); }catch(_e){}
  }

  function markReadOnlyAllowList(){
    const ids = [
      "modeBanner",
      "btnNavCollapse","projectSwitch",
      "sceneSearch","sceneFilterTOD",
      "dpBankSearch","shootDaySelect","dayplanSelect","shotDaySelect",
      "dayplanSnap","dayplanZoom",
      "schedSearch","schedZoom","schedSnap","btnSchedDays","btnSchedPrint","schedDayPicker","schedDayPickerClose","schedCalPrev","schedCalNext","schedCalAll","schedCalNone","schedCalDone","schedCalGrid",
      "elxSearch","crewSearch","reportsSearch",
      "btnOpenCallSheet","btnDayplanPrint","btnShotPrint","btnPrintCallSheet",
      "btnBDTemplateWide","btnBDTemplateLong",
      "btnToggleScriptImport","btnCancelScriptImport",
      "calPrev","calNext","btnShotSceneGoBreakdown",
      "dpBtnToggleBank","dpBtnToggleBankDock"
    ];
    for(const id of ids){
      try{ const n = document.getElementById(id); if(n) n.dataset.roAllow="1"; }catch(_e){}
    }
    try{ document.querySelectorAll(".navBtn").forEach(n=>{ try{ n.dataset.roAllow="1"; }catch(_e){} }); }catch(_e){}
    try{ document.querySelectorAll(".reportTabBtn").forEach(n=>{ try{ n.dataset.roAllow="1"; }catch(_e){} }); }catch(_e){}
  }

  function installReadOnlyGuards(){
    if(installReadOnlyGuards._done) return;
    installReadOnlyGuards._done = true;

    const isAllowed = (t)=>{
      try{
        if(!t) return false;
        if(t.closest && t.closest('[data-ro-allow="1"]')) return true;
        if(t.closest && t.closest("#modeBanner")) return true;
        if(t.closest && t.closest(".navBtn")) return true;
        return false;
      }catch(_e){ return false; }
    };

    // Store original value on focus, so we can restore it if someone types in Lector mode.
    document.addEventListener("focusin", (e)=>{
      if(!isReadOnly()) return;
      const t = e.target;
      if(isAllowed(t)) return;
      const ctrl = t?.closest?.('input, textarea, select, [contenteditable="true"]');
      if(!ctrl) return;
      try{
        if(ctrl.matches?.('[contenteditable="true"]')){
          ctrl.dataset.roRestore = ctrl.textContent ?? "";
        }else if(ctrl.type==="checkbox" || ctrl.type==="radio"){
          ctrl.dataset.roRestore = ctrl.checked ? "1":"0";
        }else{
          ctrl.dataset.roRestore = ctrl.value ?? "";
        }
      }catch(_e){}
    }, true);

    const restoreCtrl = (ctrl)=>{
      try{
        const v = ctrl?.dataset?.roRestore;
        if(v==null) return;
        if(ctrl.matches?.('[contenteditable="true"]')){
          ctrl.textContent = v;
        }else if(ctrl.type==="checkbox" || ctrl.type==="radio"){
          ctrl.checked = (v==="1");
        }else{
          ctrl.value = v;
        }
      }catch(_e){}
    };

    const guardFormEvent = (e)=>{
      if(!isReadOnly()) return;
      const t = e.target;
      if(isAllowed(t)) return;
      const ctrl = t?.closest?.('input, textarea, select, [contenteditable="true"]');
      if(!ctrl) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      restoreCtrl(ctrl);
      try{ ctrl.blur?.(); }catch(_e){}
      roToast();
    };

    document.addEventListener("input", guardFormEvent, true);
    document.addEventListener("change", guardFormEvent, true);
    document.addEventListener("paste", guardFormEvent, true);

    document.addEventListener("keydown", (e)=>{
      if(!isReadOnly()) return;
      const t = e.target;
      if(isAllowed(t)) return;
      const ctrl = t?.closest?.('input, textarea, select, [contenteditable="true"]');
      if(!ctrl) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      roToast();
    }, true);

    const clickGuard = (e)=>{
      if(!isReadOnly()) return;
      const t = e.target;
      if(isAllowed(t)) return;

      // Block common edit controls (buttons, action icons).
      const btn = t?.closest?.('button, [role="button"], [data-action], .dpMiniBtn, .dpSwatchBtn, .btn, .resize, .dpResize');
      if(!btn) return;

      // Nav is always allowed
      if(btn.classList?.contains("navBtn") || btn.closest?.(".navBtn")) return;
      if(btn.closest?.('[data-ro-allow="1"]')) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      roToast();
    };
    document.addEventListener("click", clickGuard, true);

    const dragGuard = (e)=>{
      if(!isReadOnly()) return;
      const t = e.target;
      if(isAllowed(t)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      roToast();
    };
    document.addEventListener("drop", dragGuard, true);
    document.addEventListener("dragstart", dragGuard, true);
  }

  function projectInitials(txt){
    const s = String(txt||"").trim();
    if(!s) return "GB";
    const parts = s.split(/\s+/).filter(Boolean);
    const a = (parts[0]?.[0]||"").toUpperCase();
    const b = (parts[1]?.[0] || parts[0]?.[1] || "").toUpperCase();
    const out = (a + b).trim();
    return out ? out.slice(0,2) : "GB";
  }

  function initSidebarUI(cfg){
    try{ navCollapsedKey = "gb_nav_collapsed_v1__" + String(cfg?.binId||""); }catch{}
    const shell = document.querySelector(".shell");
    const btn = el("btnNavCollapse");
    const pill = el("projPill");

    const iconMap = {
      breakdown:"🧩",
      shooting:"🕒",
      dayplan:"📋",
      schedule:"🗓️",
      shotlist:"🎬",
      elements:"🧰",
      crew:"👥",
      reports:"⚙️",
      callsheet:"🧾"
    };

    // Ensure icon + label structure
    document.querySelectorAll(".navBtn").forEach(nb=>{
      const view = nb.dataset.view || "";
      let lbl = nb.querySelector(".navLbl");
      let ico = nb.querySelector(".navIco");
      const rawText = (lbl ? lbl.textContent : nb.textContent).trim();
      if(!ico){
        ico = document.createElement("span");
        ico.className = "navIco";
        nb.prepend(ico);
      }
      if(!lbl){
        lbl = document.createElement("span");
        lbl.className = "navLbl";
        lbl.textContent = rawText;
        nb.appendChild(lbl);
      }
      let glyph = iconMap[view];
      if(!glyph){
        const t = rawText.replace(/\s+/g,"");
        glyph = ((t[0]||"") + (t[1]||"")).toUpperCase();
      }
      ico.textContent = glyph;
    });

    function apply(collapsed){
      if(shell) shell.classList.toggle("navCollapsed", !!collapsed);
      const title = el("projectTitle")?.value || state?.meta?.title || cfg?.projectName || "Proyecto";
      if(pill) pill.textContent = projectInitials(title);
      if(btn) btn.textContent = collapsed ? "⟩" : "⟨";
      try{ localStorage.setItem(navCollapsedKey, collapsed ? "1" : "0"); }catch{}
    }

    let collapsed = false;
    try{ collapsed = localStorage.getItem(navCollapsedKey)==="1"; }catch{}
    apply(collapsed);

    btn?.addEventListener("click", ()=>{
      collapsed = !collapsed;
      apply(collapsed);
    });

    // En modo colapsado: se expande clickeando las iniciales del proyecto (sin flechita)
    try{
      if(pill){
        pill.setAttribute("role","button");
        pill.setAttribute("tabindex","0");
        const toggle = ()=>{ collapsed = !collapsed; apply(collapsed); };
        pill.addEventListener("click", toggle);
        pill.addEventListener("keydown", (e)=>{
          if(e.key==="Enter" || e.key===" "){
            e.preventDefault();
            toggle();
          }
        });
      }
    }catch(_e){}
  }



  function saveConflictBackup(binId, snapshot){
    try{
      const key = `gb_conflict_backup_v1__${String(binId||"")}`;
      const payload = { at: new Date().toISOString(), state: snapshot };
      localStorage.setItem(key, JSON.stringify(payload));
    }catch{}
  }



  // ======= Reportes: filtros por categoría (local) =======
  const REPORT_FILTER_LS_KEY = "gb_reports_filter_v1";
  const REPORT_FILTER_KEYS = ["scenes","cast","crew", ...cats.filter(c=>c!=="cast")];
  const REPORT_FILTER_LABELS = { scenes:"Escenas", cast:"Cast", crew:"Crew" };
  let reportsFilterSet = null;

  function getReportsFilterSet(){
    if(reportsFilterSet) return reportsFilterSet;
    const all = new Set(REPORT_FILTER_KEYS);
    try{
      const raw = localStorage.getItem(REPORT_FILTER_LS_KEY);
      if(raw){
        const arr = JSON.parse(raw);
        if(Array.isArray(arr)){
          // Permitimos también el caso "vacío" (0 filtros) para el toggle Todo ON/OFF
          reportsFilterSet = new Set(arr.filter(k=>all.has(k)));
        }
      }
    }catch{}
    if(!reportsFilterSet) reportsFilterSet = all;
    return reportsFilterSet;
  }

  function saveReportsFilterSet(){
    try{ localStorage.setItem(REPORT_FILTER_LS_KEY, JSON.stringify([...getReportsFilterSet()])); }catch{}
  }

  function renderReportsFilters(){
    const wrap = el("reportsFilters");
    if(!wrap) return;
    const set = getReportsFilterSet();
    wrap.innerHTML = "";

    // Toggle rápido: seleccionar todos / deseleccionar todos
    {
      const allSelected = REPORT_FILTER_KEYS.every(k=>set.has(k));
      const chipAll = document.createElement("div");
      chipAll.className = "chip toggle" + (allSelected ? " active" : "");
      chipAll.innerHTML = `<span>Todo</span>`;
      chipAll.title = allSelected ? "Deseleccionar todos" : "Seleccionar todos";
      chipAll.addEventListener("click", ()=>{
        reportsFilterSet = allSelected ? new Set() : new Set(REPORT_FILTER_KEYS);
        saveReportsFilterSet();
        renderReportsFilters();
        renderReports();
      });
      wrap.appendChild(chipAll);
    }

    for(const k of REPORT_FILTER_KEYS){
      const chip = document.createElement("div");
      chip.className = "chip toggle" + (set.has(k) ? " active" : "");
      chip.innerHTML = `<span>${esc(REPORT_FILTER_LABELS[k] || catNames[k] || k)}</span>`;
      chip.addEventListener("click", ()=>{
        const next = new Set(getReportsFilterSet());
        if(next.has(k)) next.delete(k); else next.add(k);
        reportsFilterSet = next;
        saveReportsFilterSet();
        renderReportsFilters();
        renderReports();
      });
      wrap.appendChild(chip);
    }
  }
  function touch(){
    if(isReadOnly()){
      const st = el("statusText");
      if(st) st.textContent = "Lector";
      return;
    }
    state.meta.updatedAt = new Date().toISOString();
    StorageLayer.saveLocal(state);
    const saved = el("savedAtText");
    if(saved) saved.textContent = new Date(state.meta.updatedAt).toLocaleString("es-AR");
    const st = el("statusText");
    if(st) st.textContent = "Guardado";
    if(syncReady) autosyncDebounced();
  }

  // ======= Autosync robusto (evita pisadas por respuestas tardías) =======
  // Bug que te estaba pegando: si un PUT viejo termina después, guardaba un "stamp"
  // más nuevo del que realmente quedó en JSONBin, y el próximo sync interpretaba
  // eso como "cambio remoto" y te pisaba el último cambio.
  let autosyncInFlight = false;
  let autosyncPending = false;

  async function autosyncRun(){
    if(autosyncInFlight){
      autosyncPending = true;
      return;
    }
    autosyncInFlight = true;
    autosyncPending = false;

    const cfg = StorageLayer.loadCfg();
    if(!cfg.binId || !cfg.accessKey){
      autosyncInFlight = false;
      return;
    }

    // Regla de oro: nunca empujar si no pudimos traer el remoto al menos una vez en esta sesión.
    // Esto evita el caso "abrí después de días y pisé todo".
    if(!sessionPulledRemote){
      await initRemoteSync();
      if(!sessionPulledRemote){
        autosyncInFlight = false;
        return; // seguimos sin remoto (offline/bloqueado)
      }
    }

    try{
      const [remoteCore, remotePackRaw] = await Promise.all([
        StorageLayer.jsonbinGet(cfg.binId, cfg.accessKey),
        cfg.scriptBinId ? StorageLayer.jsonbinGet(cfg.scriptBinId, cfg.accessKey).catch(()=>null) : Promise.resolve(null)
      ]);

      const coreOK = isValidState(remoteCore);
      const packOK = isValidScriptPack(remotePackRaw);
      const remoteCombined = coreOK ? mergeStateFromBins(remoteCore, packOK ? remotePackRaw : null) : null;

      if(coreOK){
        const coreStamp = String(remoteCore?.meta?.updatedAt || "");
        const storedCoreStamp = StorageLayer.getRemoteStamp(cfg.binId) || lastRemoteStamp || "";

        const packStamp = cfg.scriptBinId ? String(remotePackRaw?.meta?.updatedAt || "") : "";
        const storedPackStamp = cfg.scriptBinId ? (StorageLayer.getRemoteStamp(cfg.scriptBinId) || lastScriptRemoteStamp || "") : "";

        const changedByStamp =
          (storedCoreStamp && coreStamp && coreStamp !== storedCoreStamp) ||
          (cfg.scriptBinId && storedPackStamp && packStamp && packStamp !== storedPackStamp);

        // Si el remoto cambió desde la última vez que lo vimos, NO empujamos: primero absorbemos remoto.
        if(changedByStamp){
          saveConflictBackup(cfg.binId, state); // copia local por si hay conflicto
          state = remoteCombined;
          StorageLayer.saveLocal(state);

          lastRemoteStamp = coreStamp;
          StorageLayer.setRemoteStamp(cfg.binId, lastRemoteStamp);

          if(cfg.scriptBinId){
            lastScriptRemoteStamp = packStamp;
            StorageLayer.setRemoteStamp(cfg.scriptBinId, lastScriptRemoteStamp);
          }

          hydrateAll();
          toast("Actualicé remoto ✅");
          updateSyncPill("JSONBin");
          return;
        }

        // Si el remoto es más nuevo que lo local (por updatedAt), absorbemos remoto y listo.
        if(tsUpdatedAt(remoteCombined) > tsUpdatedAt(state)){
          saveConflictBackup(cfg.binId, state);
          state = remoteCombined;
          StorageLayer.saveLocal(state);

          lastRemoteStamp = coreStamp || String(state?.meta?.updatedAt || "");
          StorageLayer.setRemoteStamp(cfg.binId, lastRemoteStamp);

          if(cfg.scriptBinId){
            lastScriptRemoteStamp = packStamp || String(state?.meta?.updatedAt || "");
            StorageLayer.setRemoteStamp(cfg.scriptBinId, lastScriptRemoteStamp);
          }

          hydrateAll();
          toast("Actualicé remoto ✅");
          updateSyncPill("JSONBin");
          return;
        }
      }else{
        // Remoto inválido: solo empujar si parece "sin inicializar".
        if(!isUninitializedRemote(remoteCore)){
          updateSyncPill("Local");
          return;
        }
      }

      // IMPORTANTÍSIMO: pusheamos un snapshot coherente y guardamos el stamp del snapshot,
      // no el de "lo que sea" que quedó en state cuando la request vuelve.
      const snapshot = JSON.parse(JSON.stringify(state));
      const pushStamp = String(snapshot?.meta?.updatedAt || "");

      const { core, pack } = splitStateForBins(snapshot);

      await StorageLayer.jsonbinPut(cfg.binId, cfg.accessKey, core);
      lastRemoteStamp = pushStamp;
      StorageLayer.setRemoteStamp(cfg.binId, lastRemoteStamp);

      if(cfg.scriptBinId){
        await StorageLayer.jsonbinPut(cfg.scriptBinId, cfg.accessKey, pack);
        lastScriptRemoteStamp = pushStamp;
        StorageLayer.setRemoteStamp(cfg.scriptBinId, lastScriptRemoteStamp);
      }

      updateSyncPill("JSONBin");
    }catch(err){
      updateSyncPill("Local");
      try{
        const msg = String(err?.message || err || "");
        // 403/404: no es conexión, es credenciales/bin
        if(msg.includes("403")){
          if(!autosyncRun._warn403){
            autosyncRun._warn403 = true;
            toast("JSONBin 403: la Access Key no puede actualizar (Update) o el bin no es tuyo.");
          }
        }
        if(msg.includes("404")){
          if(!autosyncRun._warn404){
            autosyncRun._warn404 = true;
            toast("JSONBin 404: bin no encontrado / no asociado a tu cuenta. Revisá BIN_ID y Access Key.");
          }
        }
      }catch(_e){}
    }finally{
      autosyncInFlight = false;
      if(autosyncPending){
        // Reintento rápido para empujar el último estado (sin obligarte a esperar).
        setTimeout(()=>autosyncRun(), 250);
      }
    }
  }


  const autosyncDebounced = window.U.debounce(autosyncRun, 900);

  function updateSyncPill(mode){
    const p = el("syncPill");
    if(p) p.textContent = mode;
  }

  function defaultState(title){
    return {
      meta:{ version: 14, title: title || "Proyecto", updatedAt: new Date().toISOString() },
      scenes: [],
      shootDays: [],
      crew: [],
      project: { rtsOffsetMin: 60 },
      script: { versions: [], activeVersionId: null }
    };
  }


  function ensureProjectConfig(){
    if(!state.project || typeof state.project !== "object" || Array.isArray(state.project)) state.project = {};
    const v = Number(state.project.rtsOffsetMin);
    state.project.rtsOffsetMin = Number.isFinite(v) ? Math.round(v) : 60;
  }



  function getScene(id){ return state.scenes.find(s=>s.id===id) || null; }
  function getDay(id){ return state.shootDays.find(d=>d.id===id) || null; }
  function union(arr){ return Array.from(new Set((arr||[]).filter(Boolean))); }
  function fmtPages(n){
    const v = Math.round((Number(n)||0) * 100) / 100;
    const s = String(v);
    return s.includes(".") ? s.replace(/\.?0+$/,"" ) : s;
  }

  function isValidState(s){
    return !!(s && s.meta && Array.isArray(s.scenes) && Array.isArray(s.shootDays) && Array.isArray(s.crew));
  }
  function isEmptyState(s){
    return !(s?.scenes?.length || s?.shootDays?.length || s?.crew?.length);
  }
  function tsUpdatedAt(s){
    const t = Date.parse(s?.meta?.updatedAt || "");
    return Number.isFinite(t) ? t : 0;
  }

  function isValidScriptPack(p){
    return !!(p && typeof p === "object" && !Array.isArray(p) && p.meta && Array.isArray(p.scenes) && p.script && Array.isArray(p.script.versions));
  }
  function makeEmptyScriptPack(title, updatedAt){
    return {
      meta: {
        part: "script",
        title: title || "Proyecto",
        updatedAt: updatedAt || new Date().toISOString()
      },
      scenes: [],
      script: { versions: [], activeVersionId: null }
    };
  }
  function splitStateForBins(full){
    const snap = JSON.parse(JSON.stringify(full || {}));
    const core = JSON.parse(JSON.stringify(snap));
    core.scenes = [];
    core.script = { versions: [], activeVersionId: null };

    const pack = makeEmptyScriptPack(snap?.meta?.title, snap?.meta?.updatedAt);
    pack.scenes = Array.isArray(snap.scenes) ? snap.scenes : [];
    pack.script = (snap.script && Array.isArray(snap.script.versions)) ? snap.script : { versions: [], activeVersionId: null };
    // Sanitizar guion: NO guardar texto crudo y permitir solo V1
    try{
      pack.script = JSON.parse(JSON.stringify(pack.script));
      if(Array.isArray(pack.script.versions)){
        // quitar rawText si viene de versiones viejas
        for(const v of pack.script.versions){
          if(v && Object.prototype.hasOwnProperty.call(v,"rawText")){ try{ delete v.rawText; }catch(_e){} }
          if(v) v.name = "V1";
        }
        if(pack.script.versions.length>1){
          pack.script.versions = pack.script.versions
            .slice()
            .sort((a,b)=>{
              const ta = Date.parse(a?.updatedAt || a?.createdAt || "") || 0;
              const tb = Date.parse(b?.updatedAt || b?.createdAt || "") || 0;
              return ta - tb;
            })
            .slice(-1);
        }
        pack.script.activeVersionId = pack.script.versions[0]?.id || null;
      }
    }catch(_e){}
    // Mantener el mismo updatedAt que el core (sirve como "stamp" consistente entre bins)
    pack.meta.updatedAt = String(snap?.meta?.updatedAt || pack.meta.updatedAt);

    return { core, pack };
  }
  function mergeStateFromBins(core, pack){
    const out = JSON.parse(JSON.stringify(core || {}));

    // Preferimos el BIN de guion/escenas si es válido; si no, caemos al legacy del core.
    const scenes = isValidScriptPack(pack) ? pack.scenes : (Array.isArray(core?.scenes) ? core.scenes : []);
    const script = isValidScriptPack(pack)
      ? pack.script
      : ((core?.script && Array.isArray(core.script.versions)) ? core.script : { versions: [], activeVersionId: null });

    out.scenes = Array.isArray(scenes) ? scenes : [];
    out.script = (script && Array.isArray(script.versions)) ? script : { versions: [], activeVersionId: null };
    // Limpieza por compat: no persistir rawText en el estado
    try{
      if(Array.isArray(out.script.versions)){
        for(const v of out.script.versions){ if(v && Object.prototype.hasOwnProperty.call(v,"rawText")){ try{ delete v.rawText; }catch(_e){} } }
      }
    }catch(_e){}

    // safety
    if(!out.meta) out.meta = { version: 14, title: "Proyecto", updatedAt: new Date().toISOString() };
    if(!Array.isArray(out.shootDays)) out.shootDays = [];
    if(!Array.isArray(out.crew)) out.crew = [];
    if(!Array.isArray(out.scenes)) out.scenes = [];
    if(!out.script || !Array.isArray(out.script.versions)) out.script = { versions: [], activeVersionId: null };

    return out;
  }


  function isUninitializedRemote(remote){
    if(remote == null) return true;
    if(typeof remote !== "object") return false;
    if(Array.isArray(remote)) return false;
    const keys = Object.keys(remote);
    if(keys.length === 0) return true;
    // Common accidental init payload: { "extras": [] }
    const allowed = new Set(["extras","_meta","schemaVersion"]);
    const onlyAllowed = keys.every(k=>allowed.has(k));
    const looksLikeState = !!(remote.meta || remote.scenes || remote.shootDays || remote.crew || remote.script);
    return onlyAllowed && !looksLikeState;
  }
  async function initRemoteSync(opts={}){
    if(initRemoteSync._running) return;
    initRemoteSync._running = true;
    syncReady = false;
    // Decide whether to adopt remote data, but DO NOT push on init.
    const cfg = StorageLayer.loadCfg();
    if(!cfg.binId || !cfg.accessKey){
      syncReady = true;
      initRemoteSync._running = false;
      updateSyncPill("Local");
      return;
    }

    // Read last-acknowledged stamps BEFORE fetching remote (critical to detect remote drift).
    const storedCoreStamp0 = StorageLayer.getRemoteStamp(cfg.binId) || lastRemoteStamp || "";
    const storedPackStamp0 = cfg.scriptBinId ? (StorageLayer.getRemoteStamp(cfg.scriptBinId) || lastScriptRemoteStamp || "") : "";

    try{
      const [remoteCore, remotePackRaw] = await Promise.all([
        StorageLayer.jsonbinGet(cfg.binId, cfg.accessKey),
        cfg.scriptBinId ? StorageLayer.jsonbinGet(cfg.scriptBinId, cfg.accessKey).catch(()=>null) : Promise.resolve(null)
      ]);

      sessionPulledRemote = true;

      const coreOK = isValidState(remoteCore);
      const packOK = isValidScriptPack(remotePackRaw);

      const remoteCombined = coreOK ? mergeStateFromBins(remoteCore, packOK ? remotePackRaw : null) : null;

      if(coreOK){
        const coreStamp = String(remoteCore?.meta?.updatedAt || "");
        const packStamp = cfg.scriptBinId ? String(remotePackRaw?.meta?.updatedAt || "") : "";

        const remoteHasData = !isEmptyState(remoteCombined);
        const localHasData  = !isEmptyState(state);

        // If remote changed since this device last acknowledged it, we MUST absorb remote first.
        const remoteChangedByStamp =
          (storedCoreStamp0 && coreStamp && coreStamp !== storedCoreStamp0) ||
          (cfg.scriptBinId && storedPackStamp0 && packStamp && packStamp !== storedPackStamp0) ||
          // Local exists but there's no stamp baseline -> safest is "remote manda".
          (bootHadLocal && remoteHasData && !storedCoreStamp0) ||
          (cfg.scriptBinId && bootHadLocal && remoteHasData && !storedPackStamp0);

        let shouldAdoptRemote = false;

        // Hard safety: if remote drift is detected, never push local over it automatically.
        if(remoteChangedByStamp && remoteHasData){
          shouldAdoptRemote = true;
          if(localHasData){
            try{ saveConflictBackup(cfg.binId, state); }catch(_e){}
          }
        }

        // Boot: remote is the source of truth if it has data.
        if(!shouldAdoptRemote && opts && opts.boot && remoteHasData){
          shouldAdoptRemote = true;
          if(localHasData){
            try{ saveConflictBackup(cfg.binId, state); }catch(_e){}
          }
        }

        // Existing logic: adopt remote if local is empty / first run, or if remote is newer.
        if(!shouldAdoptRemote && !bootHadLocal && remoteHasData) shouldAdoptRemote = true;
        if(!shouldAdoptRemote && !localHasData && remoteHasData) shouldAdoptRemote = true;
        if(!shouldAdoptRemote && tsUpdatedAt(remoteCombined) > tsUpdatedAt(state)) shouldAdoptRemote = true;

        // Mobile safety score (prefers remote when local might be partial)
        if(!shouldAdoptRemote && isMobileUI()){
          const rs = scoreMobileCompleteness(remoteCombined);
          const ls = scoreMobileCompleteness(state);
          if(rs > ls + 3) shouldAdoptRemote = true;
        }

        if(shouldAdoptRemote){
          state = remoteCombined;
          bootAppliedRemote = true;
          StorageLayer.saveLocal(state);

          // Acknowledge stamps only when we accept remote as baseline.
          lastRemoteStamp = coreStamp || String(state?.meta?.updatedAt || "");
          StorageLayer.setRemoteStamp(cfg.binId, lastRemoteStamp);

          if(cfg.scriptBinId){
            lastScriptRemoteStamp = packStamp || String(state?.meta?.updatedAt || "");
            StorageLayer.setRemoteStamp(cfg.scriptBinId, lastScriptRemoteStamp);
          }

          selectedSceneId = null;
          selectedDayId = null;
          callSheetDayId = null;
          hydrateAll();
          toast("Cargué remoto ✅");
        }else{
          // Keep local; do NOT overwrite stamps here (prevents blind overwrites on next autosync).
          updateSyncPill("JSONBin");
        }

        updateSyncPill("JSONBin");
      }else{
        // Remote exists but invalid/uninitialized? Bootstrap only if local has no meaningful data.
        if(!bootHadLocal && isUninitializedRemote(remoteCore)){
          updateSyncPill("JSONBin");
          // Init remote with our base state (first ever run)
          try{
            const { core, pack } = splitStateForBins(state);
            await StorageLayer.jsonbinPut(cfg.binId, cfg.accessKey, core);
            if(cfg.scriptBinId) await StorageLayer.jsonbinPut(cfg.scriptBinId, cfg.accessKey, pack);

            // Pull stamps back
            const pulled = await StorageLayer.jsonbinGet(cfg.binId, cfg.accessKey);
            lastRemoteStamp = String(pulled?.meta?.updatedAt || "");
            StorageLayer.setRemoteStamp(cfg.binId, lastRemoteStamp);

            if(cfg.scriptBinId){
              const pulledP = await StorageLayer.jsonbinGet(cfg.scriptBinId, cfg.accessKey).catch(()=>null);
              lastScriptRemoteStamp = String(pulledP?.meta?.updatedAt || "");
              StorageLayer.setRemoteStamp(cfg.scriptBinId, lastScriptRemoteStamp);
            }

            toast("Inicialicé remoto ✅");
          }catch(_e){
            updateSyncPill("Local");
          }
        }else{
          updateSyncPill("Local");
        }
      }

    }catch(err){
      // Offline / 4xx / 5xx
      try{
        updateSyncPill("Local");
        if(!syncErrorToastShown){
          syncErrorToastShown = true;
          const msg = String(err && (err.message||err) || "");
          const extra = " — Revisá BIN ID y Access Key en Configuración.";
          (function(){
            if(msg.includes("404")) toast("JSONBin 404: bin no encontrado / no asociado a tu cuenta." + extra);
            else if(msg.includes("403")) toast("JSONBin 403: la Access Key no tiene permiso (Read/Update) o el bin no es tuyo." + extra);
            else toast("No pude conectar con JSONBin, estoy en modo Local" + extra);
          })();
        }
      }catch(_e){}
    }finally{
      syncReady = true;
      initRemoteSync._running = false;
    }
      try{
        if(sanitizeScriptState._needsRemoteClean){
          sanitizeScriptState._needsRemoteClean = false;
          autosyncDebounced();
        }
      }catch(_e){}

  }function ensureSceneExtras(s){
    if(!s) return;
    if(!("intExt" in s)) s.intExt = "";
    if(!("chapter" in s)) s.chapter = "";
    // ensure elements structure
    if(!s.elements){
      s.elements = Object.fromEntries(cats.map(c=>[c,[]]));
    }else{
      for(const c of cats){
        if(!Array.isArray(s.elements[c])) s.elements[c] = [];
      }
    }
    // ensure shots
    if(!Array.isArray(s.shots)) s.shots = [];
    for(const sh of s.shots){
      if(!sh) continue;
      const n = Number(sh.durMin);
      if(!(Number.isFinite(n) && n>0)) sh.durMin = DEFAULT_SHOT_MIN;
    }
  }

  function ensureScriptState(){
    if(!state.script) state.script = { versions: [], activeVersionId: null };
    if(!Array.isArray(state.script.versions)) state.script.versions = [];
    if(!("activeVersionId" in state.script)) state.script.activeVersionId = null;
  }


function enforceScriptVersionsLimit(notify=false){
  ensureScriptState();
  const vers = state?.script?.versions || [];
  if(vers.length <= MAX_SCRIPT_VERSIONS) return false;
  vers.sort((a,b)=> Date.parse(a.createdAt||a.updatedAt||0) - Date.parse(b.createdAt||b.updatedAt||0));
  const removed = vers.length - MAX_SCRIPT_VERSIONS;
  state.script.versions = vers.slice(-MAX_SCRIPT_VERSIONS);
  if(!state.script.versions.some(v=>v.id===state.script.activeVersionId)){
    state.script.activeVersionId = state.script.versions[state.script.versions.length-1]?.id || null;
  }
  if(notify) toast(`Se limitaron las versiones de guion a ${MAX_SCRIPT_VERSIONS} (se borraron ${removed}).`);
  return true;
}


  function canonSceneNumber(n){
    const s = String(n||"").trim();
    if(!s) return "";
    const m = s.match(/^(\d+)\s*([A-Za-z]*)/);
    if(!m) return s.toUpperCase();
    const base = m[1];
    const suf = (m[2]||"").toUpperCase();
    return base + suf;
  }

  function sceneNumberKey(n){
    const s = canonSceneNumber(n);
    const m = s.match(/^(\d+)([A-Z]*)$/);
    if(!m) return { ok:false, raw:s, base: Number.POSITIVE_INFINITY, suf:"" };
    return { ok:true, raw:s, base: Number(m[1]), suf: m[2]||"" };
  }

  function compareSceneNumbers(a, b){
    const A = sceneNumberKey(a);
    const B = sceneNumberKey(b);
    if(A.base !== B.base) return A.base - B.base;
    // empty suffix first
    if(!A.suf && B.suf) return -1;
    if(A.suf && !B.suf) return 1;
    return A.suf.localeCompare(B.suf);
  }

  function sortScenesByNumberInPlace(){
    state.scenes.sort((x,y)=> compareSceneNumbers(x.number, y.number));
  }

  function nextInsertedNumber(afterNumber, existingNumbers){
    const a = sceneNumberKey(afterNumber);
    if(!a.ok || !Number.isFinite(a.base)) return "";
    const used = new Set((existingNumbers||[]).map(canonSceneNumber));
    const base = String(a.base);
    const afterSuf = (a.suf||"");
    // start from A if after has no suffix, else next letter after last suffix char
    let startChar = "A".charCodeAt(0);
    if(afterSuf){
      const last = afterSuf.charCodeAt(afterSuf.length-1);
      startChar = Math.min("Z".charCodeAt(0)+1, last+1);
    }
    for(let code = startChar; code <= "Z".charCodeAt(0); code++){
      const cand = base + String.fromCharCode(code);
      if(!used.has(cand)) return cand;
    }
    // fallback (rarísimo): base + "AA"
    let cand = base + "AA";
    let i = 0;
    while(used.has(cand) && i<200){
      i++;
      cand = base + "A" + String.fromCharCode("A".charCodeAt(0) + (i%26));
    }
    return cand;
  }

  function usedSceneNumbers(exceptSceneId=null){
    return (state.scenes||[])
      .filter(s=>s.id!==exceptSceneId)
      .map(s=>canonSceneNumber(s.number))
      .filter(Boolean);
  }

  function makeUniqueSceneNumber(desired, exceptSceneId=null){
    const cand = canonSceneNumber(desired);
    if(!cand) return "";
    const used = new Set(usedSceneNumbers(exceptSceneId));
    if(!used.has(cand)) return cand;

    const key = sceneNumberKey(cand);
    if(key.ok){
      // si ya existe "6" → devuelve "6A"; si existe "6A" → "6B", etc.
      return nextInsertedNumber(cand, Array.from(used));
    }
    const base = String(desired||"").match(/\d+/)?.[0] || cand;
    return nextInsertedNumber(base, Array.from(used));
  }

  function nextNewSceneNumber(){
    const keys = (state.scenes||[]).map(s=>sceneNumberKey(s.number)).filter(k=>k.ok && Number.isFinite(k.base));
    const maxBase = keys.reduce((m,k)=>Math.max(m,k.base), 0);
    return makeUniqueSceneNumber(String(maxBase + 1), null);
  }

  function sluglineToLocTOD(slugline){
    const s = String(slugline||"").trim();
    // separa por guiones con o sin espacios (INT. CASA - DÍA / INT-CASA-DÍA)
    const parts = s.split(/\s*[-–—]\s*/g).map(p=>p.trim()).filter(Boolean);
    let location = "";
    let tod = "";

    const stripPrefix = (txt)=>{
      return String(txt||"")
        .replace(/^\s*(INT\/EXT|INT\.?\/EXT\.?|I\/E\.?|INT|EXT)\s*[.\-–—:]?\s*/i,"")
        .replace(/^\s*(INTERIOR|EXTERIOR)\s*[.\-–—:]?\s*/i,"")
        .trim();
    };

    const extractTOD = (txt)=>{
      const raw = String(txt||"")
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/\([^\)]*\)/g, " ")
        .replace(/[.,;:!?]+$/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if(!raw) return "";
      const up = raw.toUpperCase();

      if(/\b(AMANECER|DAWN)\b/.test(up)) return "Amanecer";
      if(/\b(ATARDECER|TARDE|SUNSET|DUSK)\b/.test(up)) return "Atardecer";
      if(/\b(NOCHE|NIGHT)\b/.test(up)) return "Noche";
      if(/\b(D[IÍ]A|DAY|MAÑANA|MORNING)\b/.test(up)) return "Día";
      return "";
    };

    if(parts.length >= 2){
      // Buscar el TOD desde el final (soporta: "... - NOCHE - CONT.")
      let todIndex = -1;
      for(let i=parts.length-1;i>=0;i--){
        const t = extractTOD(parts[i]);
        if(t){
          tod = t;
          todIndex = i;
          break;
        }
      }
      if(todIndex >= 0){
        location = stripPrefix(parts.slice(0, todIndex).join(" - "));
        if(!location){
          // fallback: si quedó vacío, no rompemos
          location = stripPrefix(parts.join(" - "));
        }
      }else{
        location = stripPrefix(parts.join(" - "));
      }
    }else{
      // Sin guiones: intentamos detectar TOD al final (p.ej. "INT. CASA NOCHE")
      const t = extractTOD(s);
      if(t){
        tod = t;
        const loc = s.replace(/\b(AMANECER|DAWN|ATARDECER|TARDE|SUNSET|DUSK|NOCHE|NIGHT|D[IÍ]A|DAY|MAÑANA|MORNING)\b[\s\S]*$/i,"").trim();
        location = stripPrefix(loc);
      }else{
        location = stripPrefix(s);
      }
    }

    return { location, timeOfDay: tod };
  }

  function sluglineToIntExt(slugline){
    const s = String(slugline||"").trim();
    if(!s) return "";
    const up = s.toUpperCase();

    // INT./EXT. y variantes
    if(/^\s*(INT\/EXT|INT\.?\/EXT\.?|I\/E)\s*[.\-–—:]?\s*/i.test(up)) return "Int";
    if(/^\s*(EXT\/INT|EXT\.?\/INT\.?|E\/I)\s*[.\-–—:]?\s*/i.test(up)) return "Ext";

    if(/^\s*(INT|INTERIOR)\s*[.\-–—:]?\s*/i.test(up)) return "Int";
    if(/^\s*(EXT|EXTERIOR)\s*[.\-–—:]?\s*/i.test(up)) return "Ext";
    return "";
  }


  function normalizeTOD(raw){
    const t = (raw||"").trim().toLowerCase();
    const map = {
      "día":"Día","dia":"Día","day":"Día",
      "noche":"Noche","night":"Noche",
      "amanecer":"Amanecer","dawn":"Amanecer",
      "atardecer":"Atardecer","sunset":"Atardecer",
      "tarde":"Atardecer","mañana":"Día"
    };
    return map[t] || (raw||"").trim();
  }

  function normalizeCrewArea(a){
    const s = String(a||"").trim().toLowerCase();
    if(!s) return "Otros";
    const map = new Map([
      ["dirección","Direccion"], ["direccion","Direccion"], ["dir","Direccion"],
      ["cast","Cast"],
      ["producción","Produccion"], ["produccion","Produccion"],
      ["foto","Foto"], ["cámara","Foto"], ["camara","Foto"], ["dp","Foto"],
      ["eléctrica/grip","Electrica/Grip"], ["electrica/grip","Electrica/Grip"],
      ["electrica","Electrica/Grip"], ["grip","Electrica/Grip"],
      ["sonido","Sonido"], ["audio","Sonido"],
      ["arte","Arte"], ["art","Arte"],
      ["vestuario","Vestuario"], ["wardrobe","Vestuario"],
      ["maquillaje","Maquillaje"], ["makeup","Maquillaje"],
      ["post vfx","Post VFX"], ["post/vfx","Post VFX"], ["vfx","Post VFX"], ["post","Post VFX"],
      ["otros","Otros"]
    ]);
    if(map.has(s)) return map.get(s);
    if(s.includes("elect") || s.includes("grip")) return "Electrica/Grip";
    if(s.includes("prod")) return "Produccion";
    if(s.includes("direc")) return "Direccion";
    if(s.includes("post") || s.includes("vfx")) return "Post VFX";
    if(s.includes("foto") || s.includes("cam")) return "Foto";
    return "Otros";
  }

  function minutesFromHHMM(hhmm){
    if(!hhmm || !hhmm.includes(":")) return 8*60;
    const [h,m] = hhmm.split(":").map(Number);
    return (h*60 + (m||0));
  }
  function hhmmFromMinutes(m){
    const mm = ((m % (24*60)) + (24*60)) % (24*60);
    const h = Math.floor(mm/60);
    const mi = String(mm%60).padStart(2,"0");
    return `${String(h).padStart(2,"0")}:${mi}`;
  }
  function formatDuration(mins){
    const n = Math.max(0, Math.round(Number(mins)||0));
    if(n >= 60){
      const h = Math.floor(n/60);
      const m = n % 60;
      return m ? `${h}hr ${m}m` : `${h}hr`;
    }
    return `${n}m`;
  }

  // Duración en formato hh mm (para plan de rodaje)
  function durToHM(mins){
    const n = Math.max(0, Math.round(Number(mins)||0));
    return { h: Math.floor(n/60), m: n % 60 };
  }
  function formatDurHHMM(mins){
    const {h,m} = durToHM(mins);
    const hh = String(h).padStart(2,"0");
    const mm = String(m).padStart(2,"0");
    return `${hh}h ${mm}m`;
  }
  function formatDurHHMMCompact(mins){
    const {h,m} = durToHM(mins);
    const hh = String(h).padStart(2,"0");
    const mm = String(m).padStart(2,"0");
    return `${hh}h${mm}m`;
  }
  function minuteOptionsFromSnap(snapMin){
    const step = Math.max(1, Math.round(Number(snapMin)||1));
    if(step >= 60) return [0];
    const arr = [];
    for(let m=0; m<60; m+=step) arr.push(m);
    return arr.length ? arr : [0];
  }


  function preOffsetFromCall(callHHMM){
    const callM = minutesFromHHMM(callHHMM || "08:00");
    const baseM = Math.floor(callM/60)*60;
    return callM - baseM;
  }
  function baseHourFromCall(callHHMM){
    const callM = minutesFromHHMM(callHHMM || "08:00");
    return Math.floor(callM/60)*60;
  }

  function snap(v, step){ return Math.round(v/step)*step; }
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function fmtClockFromCall(callHHMM, offsetMin){
    const base = minutesFromHHMM(callHHMM || "08:00");
    return hhmmFromMinutes(base + offsetMin);
  }

  function formatDayTitle(dateStr){
    if(!dateStr) return "Sin fecha";
    const d = new Date(dateStr+"T00:00:00");
    const weekday = new Intl.DateTimeFormat("es-AR",{weekday:"long"}).format(d);
    const dd = String(d.getDate()).padStart(2,"0");
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const cap = weekday.charAt(0).toUpperCase()+weekday.slice(1);
    return `${cap} ${dd}/${mm}`;
  }



  function formatDDMMYYYY(dateIso){
    if(!dateIso) return "";
    const parts = String(dateIso).split("-");
    if(parts.length !== 3) return "";
    const [yyyy, mm, dd] = parts;
    if(!yyyy || !mm || !dd) return "";
    return `${dd}/${mm}/${yyyy}`;
  }

  function parseDDMMYYYY(txt){
    const s = String(txt||"").trim();
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if(!m) return null;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    if(!(yyyy>=1900 && yyyy<=2500)) return null;
    if(mm<1 || mm>12) return null;
    if(dd<1 || dd>31) return null;
    const iso = `${String(yyyy).padStart(4,"0")}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
    const d = new Date(iso+"T00:00:00");
    if(d.getFullYear()!==yyyy || (d.getMonth()+1)!==mm || d.getDate()!==dd) return null;
    return iso;
  }


  const DAY_SPAN_MIN = 24*60;
  const NIGHT_EXT_MIN = 6*60; // horario nocturno: +6h (hasta 06:00 del día siguiente)

  function dayplanEndAbs(d){
    return DAY_SPAN_MIN + (d && d.night ? NIGHT_EXT_MIN : 0);
  }

  function dayplanAvailSpan(d){
    const base = minutesFromHHMM((d && d.callTime) || "08:00");
    return Math.max(0, dayplanEndAbs(d) - base);
  }

  function clockLabelAbs(absMin){
    const m = Number(absMin);
    if(!Number.isFinite(m)) return "";
    if(m < DAY_SPAN_MIN) return hhmmFromMinutes(m);
    return `+24 - ${hhmmFromMinutes(m - DAY_SPAN_MIN)}`;
  }

  function clockLabelFromCall(day, offsetMin){
    const base = minutesFromHHMM(day?.callTime || "08:00");
    return clockLabelAbs(base + (Number(offsetMin)||0));
  }

  function ensureDayTimingMaps(d){
    d.durations = d.durations || {};
    d.times = d.times || {};
    d.sceneIds = d.sceneIds || [];
    d.crewIds = d.crewIds || [];
    d.blocks = Array.isArray(d.blocks) ? d.blocks : [];
    d.sceneColors = (d.sceneColors && typeof d.sceneColors === "object") ? d.sceneColors : {};

    // Plan de Rodaje: horario nocturno por día (extiende hasta 06:00 del día siguiente)
    d.night = !!d.night;

    // Horarios de cita (Call Diario)
    d.castCallTime = (typeof d.castCallTime === "string") ? d.castCallTime : "";
    d.castCallTimes = (d.castCallTimes && typeof d.castCallTimes === "object") ? d.castCallTimes : {};
    d.crewAreaCallTimes = (d.crewAreaCallTimes && typeof d.crewAreaCallTimes === "object") ? d.crewAreaCallTimes : {};
    d.crewCallTimes = (d.crewCallTimes && typeof d.crewCallTimes === "object") ? d.crewCallTimes : {};

    // Pick Up (PU) / Ready To Shoot (RTS)
    // Back-compat: versión vieja (pickupEnabled / pickupOffsetMin / pickupTimes)
    if(typeof d.pickupEnabled === "boolean" && !("pickupCastEnabled" in d) && !("pickupCrewEnabled" in d)){
      d.pickupCastEnabled = d.pickupEnabled;
      d.pickupCrewEnabled = d.pickupEnabled;
    }
    if(typeof d.pickupOffsetMin === "number"){
      if(!("pickupCastOffsetMin" in d)) d.pickupCastOffsetMin = d.pickupOffsetMin;
      if(!("pickupCrewOffsetMin" in d)) d.pickupCrewOffsetMin = d.pickupOffsetMin;
    }
    if(d.pickupTimes && typeof d.pickupTimes === "object"){
      if(!d.castPickUpTimes) d.castPickUpTimes = {};
      Object.assign(d.castPickUpTimes, d.pickupTimes);
    }
    if(typeof d.rtsOffset === "number" && !("rtsOffsetMin" in d)) d.rtsOffsetMin = d.rtsOffset;
    if(d.rtsTimes && typeof d.rtsTimes === "object"){
      if(!d.castRTSTimes) d.castRTSTimes = {};
      Object.assign(d.castRTSTimes, d.rtsTimes);
    }

    d.pickupCastEnabled = !!d.pickupCastEnabled;
    d.pickupCrewEnabled = !!d.pickupCrewEnabled;
    d.rtsEnabled = !!d.rtsEnabled;

    const DEF_PU = -30;
    const DEF_RTS = Number(state?.project?.rtsOffsetMin ?? 60);

    d.pickupCastOffsetMin = Number.isFinite(Number(d.pickupCastOffsetMin)) ? Number(d.pickupCastOffsetMin) : DEF_PU;
    d.pickupCrewOffsetMin = Number.isFinite(Number(d.pickupCrewOffsetMin)) ? Number(d.pickupCrewOffsetMin) : DEF_PU;
    d.rtsOffsetMin = Number.isFinite(Number(d.rtsOffsetMin)) ? Number(d.rtsOffsetMin) : DEF_RTS;

    d.castPickUpTimes = (d.castPickUpTimes && typeof d.castPickUpTimes === "object") ? d.castPickUpTimes : {};
    d.crewPickUpTimes = (d.crewPickUpTimes && typeof d.crewPickUpTimes === "object") ? d.crewPickUpTimes : {};
    d.castRTSTimes    = (d.castRTSTimes && typeof d.castRTSTimes === "object") ? d.castRTSTimes : {};


    // Normalizar bloques (notas/tareas del día)
    const _dpSpan = Math.max(5, dayplanAvailSpan(d));
    for(const b of d.blocks){
      if(!b || typeof b !== "object") continue;
      if(!b.id) b.id = uid("blk");
      if(typeof b.startMin !== "number" || !Number.isFinite(b.startMin)) b.startMin = 0;
      if(typeof b.durMin !== "number" || !Number.isFinite(b.durMin)) b.durMin = 30;
      b.durMin = clamp(b.durMin, 5, _dpSpan);
      b.startMin = clamp(b.startMin, 0, Math.max(0, _dpSpan-1));
      if(typeof b.title !== "string") b.title = String(b.title||"");
      if(typeof b.detail !== "string") b.detail = String(b.detail||"");
      if(typeof b.color !== "string" || !b.color) b.color = "#bdbdbd";
    }
    for(const sid of d.sceneIds){
      if(typeof d.durations[sid] !== "number") d.durations[sid] = 60;
      if(typeof d.times[sid] !== "number") d.times[sid] = 0;
    }
  }



// ======= Shotlist helpers =======
function ensureDayShotsDone(d){
  if(!d || typeof d !== "object") return;
  d.shotsDone = (d.shotsDone && typeof d.shotsDone === "object") ? d.shotsDone : {};
}


// ======= Shot thumbnails (Cloudinary) =======
const SHOT_THUMB_MAX_W = 512;
const SHOT_THUMB_JPEG_Q = 0.78;
const _shotThumbUploading = Object.create(null);

function _projKey(){
  const t = String(state?.meta?.title || "proyecto").toLowerCase().trim();
  return t.replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"") || "proyecto";
}
function _cloudKey(suffix){ return `gb_cloudinary_${_projKey()}_${suffix}`; }

function getCloudinaryCfg(){
  try{
    return {
      cloudName: localStorage.getItem(_cloudKey("cloud")) || "",
      preset: localStorage.getItem(_cloudKey("preset")) || "",
      // Si el preset ya define carpeta, dejar "folder" vacio evita sobreescribirla.
      folder: localStorage.getItem(_cloudKey("folder")) || ""
    };
  }catch(_e){
    return { cloudName:"", preset:"", folder:"" };
  }
}
function setCloudinaryCfg(cfg){
  try{
    if(cfg.cloudName) localStorage.setItem(_cloudKey("cloud"), cfg.cloudName);
    if(cfg.preset) localStorage.setItem(_cloudKey("preset"), cfg.preset);
    // Permite limpiar folder seteando "".
    if(Object.prototype.hasOwnProperty.call(cfg, "folder")){
      localStorage.setItem(_cloudKey("folder"), String(cfg.folder || ""));
    }
  }catch(_e){}
}

// Defaults por proyecto (sin prompts)
const CLOUDINARY_DEFAULTS = [
  { re: /(\bla\s*casona\b|\bcasona\b)/i, cloudName: "dewvybiwp", preset: "ProduccionLC", folder: "" },
  { re: /(\bjubilada\b|\bpeligrosa\b|\bjyp\b)/i, cloudName: "dewvybiwp", preset: "ProduccionJYP", folder: "" }
];

function _guessCloudinaryCfgForProject(){
  const title = String(state?.meta?.title || "");
  for(const d of CLOUDINARY_DEFAULTS){
    if(d.re && d.re.test(title)){
      return { cloudName: d.cloudName, preset: d.preset, folder: (typeof d.folder === "string") ? d.folder : "" };
    }
  }
  return null;
}

function ensureCloudinaryCfg(){
  const cur = getCloudinaryCfg();
  if(cur.cloudName && cur.preset) return cur;

  // Si conocemos el proyecto, autoconfigurar
  const guess = _guessCloudinaryCfgForProject();
  if(guess && guess.cloudName && guess.preset){
    setCloudinaryCfg(guess);
    return Object.assign(cur, guess);
  }

  const cloudName = prompt("Cloudinary cloud name (ej: gbfilms):", cur.cloudName || "");
  if(!cloudName) return null;
  const preset = prompt("Cloudinary unsigned upload preset:", cur.preset || "");
  if(!preset) return null;
  const folder = prompt("Carpeta (opcional):", cur.folder || "") || (cur.folder || "");
  const cfg = { cloudName: String(cloudName).trim(), preset: String(preset).trim(), folder: String(folder).trim() };
  setCloudinaryCfg(cfg);
  toast("Cloudinary configurado ✅");
  return cfg;
}

function _fileToImage(file){
  return new Promise((resolve, reject)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{ try{ URL.revokeObjectURL(url); }catch(_e){} resolve(img); };
    img.onerror = ()=>{ try{ URL.revokeObjectURL(url); }catch(_e){} reject(new Error("No pude leer la imagen")); };
    img.src = url;
  });
}

async function makeThumbnailBlob(file, maxW=SHOT_THUMB_MAX_W, quality=SHOT_THUMB_JPEG_Q){
  const img = await _fileToImage(file);
  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;
  // Queremos miniaturas 1:1: recorte centrado al cuadrado más grande posible
  const sideSrc = Math.max(1, Math.min(w, h));
  const sx = Math.max(0, Math.floor((w - sideSrc) / 2));
  const sy = Math.max(0, Math.floor((h - sideSrc) / 2));

  const target = Math.max(1, Math.round(Math.min(sideSrc, Number(maxW) || 512)));
  const canvas = document.createElement("canvas");
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext("2d");
  try{ ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; }catch(_e){}
  ctx.drawImage(img, sx, sy, sideSrc, sideSrc, 0, 0, target, target);

  return await new Promise((resolve, reject)=>{
    canvas.toBlob((blob)=>{
      if(!blob) reject(new Error("No pude generar miniatura"));
      else resolve(blob);
    }, "image/jpeg", Math.max(0.4, Math.min(0.92, Number(quality) || 0.78)));
  });
}


async function uploadThumbToCloudinary(file, cfg){
  const blob = await makeThumbnailBlob(file);
  const fd = new FormData();
  fd.append("file", blob, "thumb.jpg");
  fd.append("upload_preset", cfg.preset);
  if(cfg.folder) fd.append("folder", cfg.folder);

  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/image/upload`;
  const res = await fetch(url, { method:"POST", body: fd });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok || !data.secure_url) throw new Error(data?.error?.message || "Upload falló");
  return data.secure_url;
}

async function setShotThumb(sh, file){
  if(!sh || !file) return;
  if(isReadOnly()){ toast("Modo lector 🔒 (desbloqueá para editar)"); return; }
  const cfg = ensureCloudinaryCfg();
  if(!cfg) return;

  _shotThumbUploading[sh.id] = true;
  try{
    toast("Subiendo miniatura…");
    const url = await uploadThumbToCloudinary(file, cfg);
    sh.thumbUrl = url;
    sh.thumbUpdatedAt = new Date().toISOString();
    touch();
    try{ renderShotsEditor(); }catch(_e){}
    try{ renderShotList(); }catch(_e){}
    toast("Miniatura cargada ✅");
  }catch(e){
    console.error(e);
    toast("No pude subir la miniatura ❌");
  }finally{
    delete _shotThumbUploading[sh.id];
    try{ renderShotsEditor(); }catch(_e){}
    try{ renderShotList(); }catch(_e){}
  }
}

  
  // ======= Call times (Cast/Crew) =======
  function normalizeHHMM(val){
    const t = String(val||"").trim();
    if(!t) return "";
    const m = minutesFromHHMM(t);
    if(!Number.isFinite(m)) return "";
    return hhmmFromMinutes(m);
  }

  function baseDayCall(d){
    return normalizeHHMM(d?.callTime) || "08:00";
  }
  function baseCastCall(d){
    const day = baseDayCall(d);
    const b = normalizeHHMM(d?.castCallTime);
    return b || day;
  }
  function effectiveCastCall(d, name){
    const base = baseCastCall(d);
    const ov = normalizeHHMM(d?.castCallTimes?.[name]);
    return ov || base;
  }
  function baseCrewAreaCall(d, area){
    const day = baseDayCall(d);
    const b = normalizeHHMM(d?.crewAreaCallTimes?.[area]);
    return b || day;
  }
  function effectiveCrewCall(d, crew){
    const area = normalizeCrewArea(crew?.area) || "Otros";
    const base = baseCrewAreaCall(d, area);
    const ov = normalizeHHMM(d?.crewCallTimes?.[crew?.id]);
    return ov || base;
  }


  function shiftHHMM(hhmm, deltaMin){
    const base = minutesFromHHMM(normalizeHHMM(hhmm) || "08:00");
    const d = Number(deltaMin)||0;
    return hhmmFromMinutes(base + d);
  }

  function effectiveCastPU(d, name){
    if(!d?.pickupCastEnabled) return "";
    const call = effectiveCastCall(d, name);
    const base = shiftHHMM(call, Number(d.pickupCastOffsetMin ?? -30));
    const ov = normalizeHHMM(d?.castPickUpTimes?.[name]);
    return ov || base;
  }
  function effectiveCrewPU(d, crew){
    if(!d?.pickupCrewEnabled) return "";
    const call = effectiveCrewCall(d, crew);
    const base = shiftHHMM(call, Number(d.pickupCrewOffsetMin ?? -30));
    const ov = normalizeHHMM(d?.crewPickUpTimes?.[crew?.id]);
    return ov || base;
  }
  function effectiveCastRTS(d, name){
    if(!d?.rtsEnabled) return "";
    const call = effectiveCastCall(d, name);
    const base = shiftHHMM(call, Number(d.rtsOffsetMin ?? Number(state?.project?.rtsOffsetMin ?? 60)));
    const ov = normalizeHHMM(d?.castRTSTimes?.[name]);
    return ov || base;
  }

  function cleanupDayExtras(d){
    if(!d) return;
    ensureDayTimingMaps(d);

    // Cast PU
    for(const k of Object.keys(d.castPickUpTimes||{})){
      const name = String(k||"");
      const ov = normalizeHHMM(d.castPickUpTimes[name]);
      if(!ov){ delete d.castPickUpTimes[name]; continue; }
      const def = shiftHHMM(effectiveCastCall(d, name), Number(d.pickupCastOffsetMin ?? -30));
      if(ov === def) delete d.castPickUpTimes[name];
    }
    // Crew PU
    for(const k of Object.keys(d.crewPickUpTimes||{})){
      const id = String(k||"");
      const ov = normalizeHHMM(d.crewPickUpTimes[id]);
      if(!ov){ delete d.crewPickUpTimes[id]; continue; }
      const crew = state.crew.find(c=> String(c.id)===id);
      if(!crew){ delete d.crewPickUpTimes[id]; continue; }
      const def = shiftHHMM(effectiveCrewCall(d, crew), Number(d.pickupCrewOffsetMin ?? -30));
      if(ov === def) delete d.crewPickUpTimes[id];
    }
    // Cast RTS
    for(const k of Object.keys(d.castRTSTimes||{})){
      const name = String(k||"");
      const ov = normalizeHHMM(d.castRTSTimes[name]);
      if(!ov){ delete d.castRTSTimes[name]; continue; }
      const def = shiftHHMM(effectiveCastCall(d, name), Number(d.rtsOffsetMin ?? Number(state?.project?.rtsOffsetMin ?? 60)));
      if(ov === def) delete d.castRTSTimes[name];
    }

    if(Object.keys(d.castPickUpTimes||{}).length===0) d.castPickUpTimes = {};
    if(Object.keys(d.crewPickUpTimes||{}).length===0) d.crewPickUpTimes = {};
    if(Object.keys(d.castRTSTimes||{}).length===0) d.castRTSTimes = {};
  }



  function cleanupDayCallTimes(d){
    if(!d) return;
    ensureDayTimingMaps(d);

    const day = baseDayCall(d);

    // Cast base: si está igual que el día, no lo guardamos
    if(normalizeHHMM(d.castCallTime) === day) d.castCallTime = "";

    const castBase = baseCastCall(d);
    for(const [name, t] of Object.entries(d.castCallTimes||{})){
      if(normalizeHHMM(t) === castBase) delete d.castCallTimes[name];
    }

    // Áreas de crew: si están igual que el día, no lo guardamos
    for(const [area, t] of Object.entries(d.crewAreaCallTimes||{})){
      if(normalizeHHMM(t) === day) delete d.crewAreaCallTimes[area];
    }

    // Crew individual: si está igual que su base de área, no lo guardamos
    for(const [id, t] of Object.entries(d.crewCallTimes||{})){
      const crew = state.crew?.find?.(c=>c.id===id);
      const area = crew ? normalizeCrewArea(crew.area) : "Otros";
      const base = baseCrewAreaCall(d, area);
      if(normalizeHHMM(t) === base) delete d.crewCallTimes[id];
    }
  }


  function sortShootDaysInPlace(){
    state.shootDays.sort((a,b)=>{
      const ta = a.date ? Date.parse(a.date+"T00:00:00") : Number.POSITIVE_INFINITY;
      const tb = b.date ? Date.parse(b.date+"T00:00:00") : Number.POSITIVE_INFINITY;
      if(ta !== tb) return ta - tb;
      return (a.label||"").localeCompare(b.label||"");
    });
  }

  function resolveOverlapsPushDown(d, snapMin){
    ensureDayTimingMaps(d);

    // Límite del día (desde Call hasta fin de jornada)
    const span = Math.max(5, dayplanAvailSpan(d));

    const blockById = new Map((d.blocks||[]).map(b=>[b.id, b]));
    const items = [];

    for(const sid of (d.sceneIds||[])){
      items.push({
        kind:"scene",
        id:sid,
        start: d.times[sid] ?? 0,
        dur:   d.durations[sid] ?? 60
      });
    }
    for(const b of (d.blocks||[])){
      items.push({
        kind:"block",
        id:b.id,
        start: b.startMin ?? 0,
        dur:   b.durMin ?? 30
      });
    }

    items.sort((a,b)=> (a.start??0) - (b.start??0));

    let cursor = 0;
    for(const it of items){
      let st = it.start ?? 0;
      let du = it.dur ?? snapMin;

      du = clamp(du, snapMin, span);
      st = clamp(st, 0, Math.max(0, span - snapMin));

      if(st < cursor){
        st = snap(cursor, snapMin);
      }

      st = clamp(st, 0, Math.max(0, span - du));

      if(it.kind === "scene"){
        d.times[it.id] = st;
        d.durations[it.id] = du;
      }else{
        const bb = blockById.get(it.id);
        if(bb){
          bb.startMin = st;
          bb.durMin = du;
        }
      }

      cursor = clamp(st + du, 0, span);
    }

    // Mantener escenas ordenadas por horario
    d.sceneIds.sort((a,b)=> (d.times[a]??0) - (d.times[b]??0));
  }

  function sceneCatsWithItems(scene){
    const list = [];
    for(const cat of cats){
      const items = scene.elements?.[cat] || [];
      if(items.length) list.push(cat);
    }
    return list;
  }

  // Tooltip
  function showHoverTip(html, x, y){
    const tip = el("hoverTip");
    if(!tip) return;
    tip.innerHTML = html;
    tip.style.display = "block";
    moveHoverTip(x,y);
  }
  function moveHoverTip(x,y){
    const tip = el("hoverTip");
    if(!tip) return;
    const pad = 16;
    const w = tip.offsetWidth || 420;
    const h = tip.offsetHeight || 200;
    let left = x + 14;
    let top  = y + 14;
    if(left + w + pad > window.innerWidth) left = x - w - 14;
    if(top + h + pad > window.innerHeight) top = y - h - 14;
    tip.style.left = `${Math.max(pad,left)}px`;
    tip.style.top  = `${Math.max(pad,top)}px`;
  }
  function hideHoverTip(){
    const tip = el("hoverTip");
    if(!tip) return;
    tip.style.display="none";
    tip.innerHTML="";
  }
  function buildSceneTooltip(scene, opts){
    const o = opts || {};
    const includeShots = !!o.includeShots;
    const maxShots = Number.isFinite(o.maxShots) ? o.maxShots : 10;

    const parts = [];
    parts.push(`<div class="t">#${esc(scene.number||"")} — ${esc(scene.slugline||"")}</div>`);
    parts.push(`<div class="m">${esc(scene.location||"")} · ${esc(scene.timeOfDay||"")} · Pág ${esc(scene.pages||"")}</div>`);
    const tipBody = notesOrShortSummary(scene.notes, scene.summary);
    if(tipBody) parts.push(`<div class="m" style="margin-top:8px;">${esc(tipBody)}</div>`);

    for(const cat of cats){
      const items = scene.elements?.[cat] || [];
      if(!items.length) continue;
      parts.push(`
        <div class="grp">
          <div class="grpTitle">
            <span class="catBadge"><span class="dot" style="background:${catColors[cat]}"></span>${esc(catNames[cat])}</span>
          </div>
          <div class="m">${esc(items.join(", "))}</div>
        </div>
      `);
    }

    if(includeShots){
      try{ ensureSceneExtras(scene); }catch(_e){}
      const shots = (scene.shots||[]);
      if(shots.length){
        let totalMin = 0;
        try{ totalMin = sceneShotsTotalMin(scene); }catch(_e){ totalMin = 0; }
        const shown = shots.slice(0, Math.max(0, maxShots|0));
        const more = shots.length - shown.length;

        const lines = shown.map((sh, i)=>{
          const t = String(sh?.type||"").trim();
          const desc = String(sh?.desc||"").trim();
          let dur = 0;
          try{ dur = shotDurMin(sh); }catch(_e){ dur = 0; }
          const durTxt = dur ? formatDuration(dur) : "";
          return `<div class="m"><span class="muted">${i+1}.</span> <b>${esc(t||"Plano")}</b>${desc ? ` · ${esc(desc)}` : ""}${durTxt ? ` <span class="muted">(${esc(durTxt)})</span>` : ""}</div>`;
        }).join("");

        const headExtra = `${shots.length}${totalMin ? ` · ${formatDuration(totalMin)}` : ""}`;

        parts.push(`
          <div class="grp">
            <div class="grpTitle">
              <span class="catBadge"><span class="dot" style="background:var(--cat-camera)"></span>Planos (${headExtra})</span>
            </div>
            ${lines}
            ${more>0 ? `<div class="m" style="margin-top:6px;">+${more} más…</div>` : ""}
          </div>
        `);
      }
    }

    return parts.join("");
  }

  function attachSceneHover(node, scene, opts){
    node.addEventListener("mouseenter", (e)=>{
      if(schedDrag) return;
      try{ if(dayplanPointer) return; }catch(_e){}
      showHoverTip(buildSceneTooltip(scene, opts), e.clientX, e.clientY);
    });
    node.addEventListener("mousemove", (e)=>{
      const tip = el("hoverTip");
      if(tip && tip.style.display==="block") moveHoverTip(e.clientX, e.clientY);
    });
    node.addEventListener("mouseleave", hideHoverTip);
  }

  // Collapsibles
  function initCollapsibles(){
    document.querySelectorAll(".collapsible").forEach(card=>{
      const key = card.dataset.collapseKey || "x";
      const storeKey = `gb_collapse_${key}`;
      const saved = localStorage.getItem(storeKey);
      const collapsed = (saved === null)
        ? card.classList.contains("collapsed")
        : (saved === "1");
      card.classList.toggle("collapsed", collapsed);

      const btn = card.querySelector(".collapseBtn, .collapseToggle");
      if(btn){
        btn.textContent = collapsed ? "▸" : "▾";
        if(btn.dataset.bound !== "1"){
          btn.dataset.bound = "1";
          btn.addEventListener("click", ()=>{
            const now = !card.classList.contains("collapsed");
            card.classList.toggle("collapsed", now);
            localStorage.setItem(storeKey, now ? "1" : "0");
            btn.textContent = now ? "▸" : "▾";
          });
        }
      }
    });
  }

  // ======= NUEVO: Scroll horizontal superior del cronograma =======
  function isMobileUI(){
    // Mobile = viewport chico. Evitamos falsos positivos en desktop táctil.
    try{
      return window.matchMedia("(max-width: 820px)").matches;
    }catch{
      return window.innerWidth <= 820;
    }
  }

  // Mobile focus: modo "1 día" (seguimiento, no edición)
  function applyMobileDayFocus(){
    try{ document.body.classList.toggle("mobileDayFocus", isMobileUI()); }catch(_e){}
  }


  // ======= Mobile chrome (topbar + dock + drawer) =======
  function ensureMobileChrome(){
    const sidebar = document.querySelector(".sidebar");
    if(!sidebar) return;

    // Backdrop
    let back = el("mBackdrop");
    if(!back){
      back = document.createElement("div");
      back.id = "mBackdrop";
      back.className = "mBackdrop hidden";
      document.body.appendChild(back);
    }

    // Topbar
    let top = el("mTopbar");
    if(!top){
      top = document.createElement("div");
      top.id = "mTopbar";
      top.className = "mTopbar";
      top.innerHTML = `
        <button id="mMenuBtn" class="mIconBtn" title="Menú">☰</button>
        <div class="mTopMid">
          <div id="mProjectTitle" class="mProjTitle">Proyecto</div>
        </div>
        <select id="mProjectSwitch" class="mProjectSwitch" title="Proyecto"></select>
      `;
      document.body.appendChild(top);
    }

    // Day bar (selector + accesos rápidos)
    let daybar = el("mDayBar");
    if(!daybar){
      daybar = document.createElement("div");
      daybar.id = "mDayBar";
      daybar.className = "mDayBar";
      document.body.appendChild(daybar);
    }
    // v5: botones en una sola fila + orden solicitado
    if(daybar.dataset.v5 !== "1"){
      daybar.dataset.v5 = "1";
      daybar.innerHTML = `
        <div class="mDayRow">
          <select id="mDaySelect" class="mDaySelect" title="Día"></select>
          <div id="mDayMeta" class="mDayMeta">—</div>
        </div>
        <div class="mDayBtns">
          <button class="mDayBtn" data-view="dayplan">Plan</button>
          <button class="mDayBtn" data-view="shooting">Call</button>
          <button class="mDayBtn" data-view="shotlist">Shot</button>
          <button class="mDayBtn" data-view="callsheet" data-tab="callsheet">Reportes</button>
          <button class="mDayBtn" data-view="reports">Filtros</button>
        </div>
      `;
    }

    const menuBtn = el("mMenuBtn");
    function openDrawer(){
      sidebar.classList.add("mOpen");
      back.classList.remove("hidden");
      document.body.classList.add("mNoScroll");
    }
    function closeDrawer(){
      sidebar.classList.remove("mOpen");
      back.classList.add("hidden");
      document.body.classList.remove("mNoScroll");
    }
    function toggleDrawer(){
      if(sidebar.classList.contains("mOpen")) closeDrawer();
      else openDrawer();
    }

    if(menuBtn && menuBtn.dataset.bound !== "1"){
      menuBtn.dataset.bound = "1";
      menuBtn.addEventListener("click", ()=>{ if(isMobileUI()) toggleDrawer(); });
    }
    if(back && back.dataset.bound !== "1"){
      back.dataset.bound = "1";
      back.addEventListener("click", closeDrawer);
    }

    // Cerrar drawer al navegar desde el sidebar
    sidebar.querySelectorAll(".navBtn").forEach(btn=>{
      if(btn.dataset.mCloseBound === "1") return;
      btn.dataset.mCloseBound = "1";
      btn.addEventListener("click", ()=>{ if(isMobileUI()) closeDrawer(); }, true);
    });

    // Sync de proyectos (duplicamos el select, sin tocar la lógica)
    const baseProj = el("projectSwitch");
    const mProj = el("mProjectSwitch");
    function syncProjectSwitch(){
      if(!baseProj || !mProj) return;
      mProj.innerHTML = baseProj.innerHTML;
      mProj.value = baseProj.value;
    }
    syncProjectSwitch();

    if(baseProj && baseProj.dataset.mObs !== "1"){
      baseProj.dataset.mObs = "1";
      baseProj.addEventListener("change", syncProjectSwitch);
    }
    if(mProj && mProj.dataset.bound !== "1"){
      mProj.dataset.bound = "1";
      mProj.addEventListener("change", ()=>{
        if(!baseProj) return;
        baseProj.value = mProj.value;
        baseProj.dispatchEvent(new Event("change", { bubbles:true }));
      });
    }

    // Mirror badges (saved/sync/status/title)
    const savedBase = el("savedAtText");
    const syncBase = el("syncPill");
    const statusBase = el("statusText");
    const titleInput = el("projectTitle");

    const savedM = el("mSavedAtText");
    const syncM = el("mSyncPill");
    const statusM = el("mStatusText");
    const titleM = el("mProjectTitle");

    function syncBadges(){
      if(savedBase && savedM) savedM.textContent = savedBase.textContent;
      if(syncBase && syncM) syncM.textContent = syncBase.textContent;
      if(statusBase && statusM) statusM.textContent = statusBase.textContent;
      if(titleInput && titleM) titleM.textContent = (titleInput.value || titleInput.placeholder || "Proyecto");
    }
    syncBadges();

    // ===== Day focus bar (Día + accesos) =====
    const daySel = el("mDaySelect");
    const dayMeta = el("mDayMeta");
    function syncDayBar(){
      try{
        const bar = el("mDayBar");
        if(!bar) return;
        applyMobileDayFocus();
        if(!isMobileUI()){
          bar.classList.add("hidden");
          try{ document.documentElement.style.setProperty("--mChromeTop","0px"); }catch(_e2){}
          return;
        }
        bar.classList.remove("hidden");

        sortShootDaysInPlace();
        const days = (state && Array.isArray(state.shootDays)) ? state.shootDays : [];

        if(!daySel) return;
        daySel.innerHTML = days.map(d=>{
          const label = `${formatDayTitle(d.date)}${d.label ? " · "+d.label : ""}`.trim();
          return `<option value="${esc(d.id)}">${esc(label||"Día")}</option>`;
        }).join("");

        const fallback = days[0]?.id || "";
        let cur = (selectedDayId && days.some(d=>d.id===selectedDayId)) ? selectedDayId : fallback;
        if(cur && cur !== selectedDayId){
          selectedDayId = cur;
          selectedDayplanDayId = cur;
          selectedShotlistDayId = cur;
          callSheetDayId = cur;
        }
        daySel.value = cur || "";

        const d = cur ? getDay(cur) : null;
        if(dayMeta){
          const call = d?.callTime || "—";
          const loc = d?.location || "—";
          dayMeta.textContent = `Call ${call} · ${loc}`;
        }

        // Reservar espacio para la barra superior (evita que tape contenido)
        try{
          const topH = el("mTopbar")?.offsetHeight || 0;
          const dayH = bar?.classList.contains("hidden") ? 0 : (bar?.offsetHeight || 0);
          document.documentElement.style.setProperty("--mChromeTop", `${topH + dayH}px`);
        }catch(_e2){}
      }catch(_e){}
    }

    function syncDayBarActive(viewName){
      const bar = el("mDayBar");
      if(!bar) return;
      bar.querySelectorAll(".mDayBtn").forEach(b=>{
        b.classList.toggle("active", b.dataset.view === viewName);
      });
    }

    if(daySel && daySel.dataset.bound !== "1"){
      daySel.dataset.bound = "1";
      daySel.addEventListener("change", ()=>{
        const id = daySel.value;
        if(!id) return;
        selectedDayId = id;
        selectedDayplanDayId = id;
        selectedShotlistDayId = id;
        callSheetDayId = id;
        // refrescar vistas principales (día enfocado)
        try{ renderDayDetail(); }catch(_e){}
        try{ renderDayPlan(); }catch(_e){}
        try{ renderShotList(); }catch(_e){}
        try{ renderReports(); }catch(_e){}
        try{ renderCallSheetCalendar(); }catch(_e){}
        try{ renderReportsDetail(); }catch(_e){}
        syncDayBar();
      });
    }

    // Botones rápidos
    const bar = el("mDayBar");
    if(bar){
      bar.querySelectorAll(".mDayBtn").forEach(btn=>{
        if(btn.dataset.bound === "1") return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", ()=>{
          const v = btn.dataset.view;
          if(v === "callsheet"){
            try{ setReportsTab("callsheet"); }catch(_e){}
          }
          if(v) showView(v);
          syncDayBarActive(v);
        });
      });
    }

    syncDayBar();

    if(savedBase && savedBase.dataset.mObs2 !== "1"){
      savedBase.dataset.mObs2 = "1";
      const obs = new MutationObserver(syncBadges);
      obs.observe(savedBase, { characterData:true, subtree:true, childList:true });
      if(syncBase) obs.observe(syncBase, { characterData:true, subtree:true, childList:true });
      if(statusBase) obs.observe(statusBase, { characterData:true, subtree:true, childList:true });
    }
    if(titleInput && titleInput.dataset.mBound2 !== "1"){
      titleInput.dataset.mBound2 = "1";
      titleInput.addEventListener("input", syncBadges);
    }

    if(!window.__mResizeBound){
      window.__mResizeBound = true;
      window.addEventListener("resize", window.U.debounce(()=>{
        if(!isMobileUI()) closeDrawer();
        syncProjectSwitch();
        syncBadges();
        syncDayBar();
        applyBankCollapsedUI();
      }, 120));
    }

    window.MobileChrome = { openDrawer, closeDrawer, syncBadges, syncProjectSwitch, syncDayBar, syncDayBarActive };
  }

  function setupScheduleTopScrollbar(){
    if(!isMobileUI()) return;
    const top = el("schedScrollTop");
    const inner = el("schedScrollTopInner");
    const board = el("schedBoard");
    const wrap = el("schedWrap");
    if(!top || !inner || !board || !wrap) return;

    // ancho del “contenido” del scrollbar superior = scrollWidth del board
    inner.style.width = `${board.scrollWidth}px`;

    // sincronización bidireccional (sin loops)
    if(top.dataset.bound !== "1"){
      top.dataset.bound = "1";
      let lock = false;

      top.addEventListener("scroll", ()=>{
        if(lock) return;
        lock = true;
        wrap.scrollLeft = top.scrollLeft;
        lock = false;
      });

      wrap.addEventListener("scroll", ()=>{
        if(lock) return;
        lock = true;
        top.scrollLeft = wrap.scrollLeft;
        lock = false;
      });

      window.addEventListener("resize", window.U.debounce(()=>{
        inner.style.width = `${board.scrollWidth}px`;
      }, 120));
    }

    // al render, igualamos posición
    top.scrollLeft = wrap.scrollLeft;
  }

// ======= NUEVO: Scroll vertical con ruedita en cualquier lado (Cronograma) =======
function setupScheduleWheelScroll(){
  if(!isMobileUI()) return;
  const view = el("view-schedule");
  const wrap = el("schedWrap");
  if(!view || !wrap) return;

  if(view.dataset.wheelBound === "1") return;
  view.dataset.wheelBound = "1";

  // Nota: usamos un listener NO pasivo para poder evitar que el wheel “muera”
  // cuando el cursor está sobre elementos no-scrollables dentro del cronograma.
  view.addEventListener("wheel", (e)=>{
    if(view.classList.contains("hidden")) return;

    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : "";
    if(tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;

    // Si el usuario está forzando horizontal (Shift) o es principalmente horizontal, no lo tocamos.
    if(e.shiftKey) return;
    if(Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

    const maxScroll = wrap.scrollHeight - wrap.clientHeight;
    if(maxScroll <= 1) return;

    wrap.scrollTop += e.deltaY;
    e.preventDefault();
  }, { passive:false });
}

  function showView(name){
    // Reset print-only mode if a browser skipped the afterprint event.
    try{ clearPrintOrientation(); }catch(_e){}
    try{ cleanupGbPrintRoot(); }catch(_e){}
    views.forEach(v=>{
      const node = el(`view-${v}`);
      if(node) node.classList.toggle("hidden", v!==name);
    });
    document.querySelectorAll(".navBtn, .mDockBtn").forEach(b=>{
      b.classList.toggle("active", b.dataset.view===name);
    });

    // Mobile: mantener sincronizado el selector de día + botones rápidos
    try{ if(isMobileUI() && window.MobileChrome?.syncDayBar) window.MobileChrome.syncDayBar(); }catch(_e){}
    try{ if(isMobileUI() && window.MobileChrome?.syncDayBarActive) window.MobileChrome.syncDayBarActive(name); }catch(_e){}

    if(name==="breakdown"){ initCollapsibles(); renderScriptUI(); renderShotsEditor(); }
    if(name==="shooting"){ renderSceneBank(); renderDaysBoard(); renderDayDetail(); applyBankCollapsedUI(); }
    if(name==="dayplan"){ renderSceneBank(); renderDayPlan(); applyBankCollapsedUI(); }
    if(name==="schedule"){ renderScheduleBoard(); }
    if(name==="shotlist"){ renderShotList(); }
    if(name==="elements"){ renderElementsExplorer(); }
    if(name==="crew"){ renderCrew(); }
    if(name==="reports"){ renderReportsFilters(); renderReports(); }
    if(name==="callsheet"){ renderCallSheetCalendar(); applyReportsTabUI(); renderReportsDetail(); }
}

  // ======= Script parser (INT/EXT) =======


  // ======= Guion (versionado) =======
    function parseScreenplayToScriptScenes(text, extraKeywordsCsv=""){
    const rawLines = (text||"").split(/\r?\n/);
    if(!rawLines.length) return [];

    const extra = (extraKeywordsCsv||"")
      .split(",")
      .map(s=>s.trim())
      .filter(Boolean)
      .map(s=>s.toUpperCase());

    function stripSceneNumber(line){
      return String(line||"")
        .replace(/^\s*\(?\s*\d+[A-Za-z]*\s*\)?\s*[.)-:]\s*/, "")
        .replace(/^\s*\(?\s*\d+[A-Za-z]*\s*\)?\s+/, "");
    }

    function detectChapterMarker(line){
      const t = String(line||"").trim();
      if(!t) return null;
      const up = t.toUpperCase();
      // Ej: "CAPÍTULO 1", "CAPITULO 2:", "EPISODIO 3", "EP. 4", "CHAPTER 5"
      const m1 = up.match(/^(?:CAP[ÍI]TULO|CAPITULO|EPISODIO|EP\.?|CHAPTER)\s*[:.\-]?\s*(\d{1,3})\b/);
      if(m1) return Number(m1[1]);
      return null;
    }

    function isHeading(line){
      const cleaned = stripSceneNumber(line).trimStart();
      const up = cleaned.toUpperCase();
      for(const k of extra){ if(up.startsWith(k)) return true; }
      const starters = [
        "INT/EXT.", "INT/EXT ", "INT./EXT.", "INT./EXT ", "I/E.", "I/E ",
        "INT.", "INT ", "INT-", "INT:",
        "EXT.", "EXT ", "EXT-", "EXT:",
        "INTERIOR", "EXTERIOR"
      ];
      return starters.some(s=>up.startsWith(s));
    }

    const out = [];
    let current = null;
    let autoN = 1;
    let currentChapter = "";

    for(const raw of rawLines){
      const line = String(raw ?? "").replace(/\s+$/, "");

      const chap = detectChapterMarker(line);
      if(chap !== null){
        // Cierra la escena anterior (si venía en curso) y setea el capítulo para las siguientes
        if(current){
          out.push(finalize(current));
          current = null;
        }
        currentChapter = chap;
        continue;
      }

      if(isHeading(line.trim())){
        if(current) out.push(finalize(current));
        current = { rawHeading: line.trim(), body:[], autoNumber:autoN++, chapter: currentChapter };
      }else{
        if(!current){
          // skip leading empty lines
          if(!line.trim()) continue;
          current = { rawHeading:"ESCENA", body:[], autoNumber:autoN++, chapter: currentChapter };
        }
        current.body.push(line);
      }
    }
    if(current) out.push(finalize(current));

    // normalize ids and return
    return out.map(s=>({
      id: uid("scrScene"),
      number: canonSceneNumber(String(s.number)),
      chapter: s.chapter ?? "",
      slugline: s.slugline,
      intExt: s.intExt || sluglineToIntExt(s.slugline),
      location: s.location,
      timeOfDay: s.timeOfDay,
      body: s.body.join("\n").trim(),
      summary: s.summary
    }));

    function finalize(s){
      const heading = s.rawHeading || "";
      let num = s.autoNumber;
      // Accept existing numbers like 6A, 6B...
      const mNum = heading.match(/^\s*(\d+)([A-Za-z]*)\b/);
      if(mNum) num = canonSceneNumber(mNum[1] + (mNum[2]||""));

      const slugline = stripSceneNumber(heading).trim();
      const { location, timeOfDay } = sluglineToLocTOD(slugline);

      const bodyText = (s.body||[]).join(" ").trim();
      const summary = bodyText.slice(0, 220);
      return { number:num, chapter: s.chapter ?? "", slugline, location, timeOfDay, body: s.body||[], summary };
    }
  }



  function getActiveScriptVersion(){
    sanitizeScriptState({ migrateRawToLocal:true });
    const id = state.script.activeVersionId;
    return state.script.versions.find(v=>v.id===id) || state.script.versions[0] || null;
  }


  function renderScriptVersionSelect(){
    const sel = el("scriptVerSelect");
    if(!sel) return;
    sanitizeScriptState();
    const v = state.script.versions[0];
    if(!v){
      sel.innerHTML = `<option value="">(sin versión)</option>`;
      sel.value = "";
      sel.disabled = true;
      return;
    }
    sel.innerHTML = `<option value="${esc(v.id)}">V1</option>`;
    sel.value = v.id;
    sel.disabled = true;
    // Si el HTML viejo todavía trae el select, lo escondemos (ya no hay 3 opciones)
    try{ sel.style.display = "none"; }catch(_e){}
  }

  // ======= Cast roster (desde Crew área Cast) =======
  function normName(s){
    return String(s||"")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"")
      .replace(/[^\p{L}\p{N}]+/gu," ")
      .replace(/\s+/g," ")
      .trim();
  }
  function getCastRoster(){
    // Cast en Breakdown = Rol (si no hay rol, cae al Nombre para compatibilidad)
    return union(
      state.crew
        .map(c=>({ ...c, area: normalizeCrewArea(c.area) }))
        .filter(c=>c.area==="Cast")
        .map(c=>String(c.role || c.name || "").trim())
        .filter(Boolean)
    ).sort((a,b)=>a.localeCompare(b));
  }

  function findCastCrewEntryByName(name){
    const key = normName(name);
    const crew = (state.crew||[]);
    // Prioridad: match por Rol (nuevo flujo). Si no, por Nombre (compatibilidad).
    return crew.find(c=> normalizeCrewArea(c.area)==="Cast" && normName(c.role)===key)
        || crew.find(c=> normalizeCrewArea(c.area)==="Cast" && normName(c.name)===key)
        || null;
  }
  function getExistingElementsByCat(cat){
    const set = new Set();
    for(const s of state.scenes){
      for(const it of (s.elements?.[cat] || [])){
        const v = (it||"").trim();
        if(v) set.add(v);
      }
    }
    return Array.from(set).sort((a,b)=>a.localeCompare(b));
  }
  function refreshElementSuggestions(){
    const catSel = el("elCategory");
    const dl = el("elSuggestDatalist");
    if(!catSel || !dl) return;
    const cat = catSel.value;
    const options = (cat==="cast") ? getCastRoster() : getExistingElementsByCat(cat);
    dl.innerHTML = options.map(v=>`<option value="${esc(v)}"></option>`).join("");
  }

  // ===================== Breakdown =====================
  function renderCatSelect(){
    const sel = el("elCategory");
    if(sel) sel.innerHTML = cats.map(c=>`<option value="${c}">${esc(catNames[c])}</option>`).join("");
  }

  function renderScenesTable(){
    const table = el("sceneTable");
    if(!table) return;
    const tbody = table.querySelector("tbody");
    sortScenesByNumberInPlace();
    const q = (el("sceneSearch")?.value||"").toLowerCase();
    const tod = (el("sceneFilterTOD")?.value||"");
    tbody.innerHTML = "";

    const list = state.scenes.filter(s=>{
      const hay = `${s.number} ${s.slugline} ${s.intExt||""} ${s.location} ${s.timeOfDay||""} ${s.summary}`.toLowerCase();
      if(q && !hay.includes(q)) return false;
      if(tod && (s.timeOfDay||"")!==tod) return false;
      return true;
    });

    for(const s of list){
      const tr = document.createElement("tr");
      tr.className = (s.id===selectedSceneId) ? "selected" : "";
      tr.innerHTML = `
        <td>${esc(s.number||"")}</td>
        <td>${esc(s.slugline||"")}</td>
        <td>${esc(s.intExt||"")}</td>
        <td>${esc(s.location||"")}</td>
        <td>${esc(s.timeOfDay||"")}</td>
        <td>${(Number(s.pages)||0) > 0 ? esc(fmtPages(s.pages)) : ""}</td>
      `;
      tr.addEventListener("click", ()=>{
        selectedSceneId = s.id;
        renderScenesTable();
        renderSceneEditor();
    renderScriptUI();
      });
      tbody.appendChild(tr);
    }
  }

  function scrollSelectedSceneIntoView(){
    const table = el("sceneTable");
    if(!table) return;
    const row = table.querySelector("tbody tr.selected");
    if(!row) return;

    // scrollea el contenedor de la tabla (no la hoja completa)
    row.scrollIntoView({ block:"center", inline:"nearest" });
  }

  function jumpToSceneInBreakdown(sceneId){
    // aseguramos que la escena exista
    const s = state.scenes.find(x=>x.id===sceneId);
    if(!s) return;

    selectedSceneId = sceneId;

    // si había filtros activos, los limpiamos para que la escena aparezca sí o sí
    const q = el("sceneSearch"); if(q) q.value = "";
    const tod = el("sceneFilterTOD"); if(tod) tod.value = "";

    showView("breakdown");
    renderScenesTable();
    renderSceneEditor();
    renderScriptUI();

    // después del render, llevamos la lista a la fila seleccionada
    requestAnimationFrame(()=>{
      scrollSelectedSceneIntoView();
      el("scene_slugline")?.focus();
    });
  }


  function renderSceneEditor(){
    const s = selectedSceneId ? state.scenes.find(x=>x.id===selectedSceneId) : null;
    const hint = el("selectedSceneHint");
    if(hint) hint.textContent = s ? ("Editando escena " + (s.chapter ? ("C"+s.chapter+"-") : "") + "#" + s.number) : "Seleccioná una escena";

    const fields = ["number","chapter","intExt","slugline","location","timeOfDay","pages","summary","notes"];
    for(const f of fields){
      const node = el(`scene_${f}`);
      if(!node) continue;
      node.disabled = !s;
      node.value = s ? (s[f] ?? "") : "";
    }
    refreshElementSuggestions();
    renderSceneElementsGrid();
    renderShotsEditor();
  }

  function renderSceneElementsGrid(){
    const wrap = el("sceneElementsGrid");
    if(!wrap) return;
    wrap.innerHTML = "";
    const s = selectedSceneId ? state.scenes.find(x=>x.id===selectedSceneId) : null;
    if(!s) return;

    const nonEmpty = cats.filter(c=> (s.elements?.[c]||[]).length>0);
    if(!nonEmpty.length){
      wrap.innerHTML = `<div class="catBlock"><div class="items">No hay elementos cargados todavía.</div></div>`;
      return;
    }

    for(const cat of nonEmpty){
      const items = s.elements?.[cat] || [];
      const row = document.createElement("div");
      row.className = "sceneCatRow";
      row.innerHTML = `
        <div class="sceneCatHead">
          <div class="left">
            <span class="dot" style="background:${catColors[cat]}"></span>
            <div class="name">${esc(catNames[cat])}</div>
            <div class="count">(${items.length})</div>
          </div>
        </div>
        <div class="chips"></div>
      `;
      const chips = row.querySelector(".chips");
      for(const it of items){
        const chip = document.createElement("div");
        chip.className = "chip";
        chip.innerHTML = `<span>${esc(it)}</span><button title="Quitar">×</button>`;
        chip.querySelector("button").addEventListener("click", ()=>{
          s.elements[cat] = (s.elements[cat]||[]).filter(x=>x!==it);
          touch();
          renderSceneElementsGrid();
    renderShotsEditor();
          renderSceneBank();
          renderDaysBoard();
          renderDayDetail();
          renderElementsExplorer();
          renderReports();
          renderScheduleBoard();
          renderReportsDetail();
        });
        chips.appendChild(chip);
      }
      wrap.appendChild(row);
    }
  }


  function renderShotsEditor(){
    const table = el("shotsTable");
    const btnAdd = el("btnAddShot");
    if(btnAdd){
      btnAdd.disabled = !selectedSceneId || isReadOnly();
      btnAdd.onclick = ()=>{
        if(isReadOnly()){ toast("Modo lector 🔒 (desbloqueá para editar)"); return; }
        const s = selectedSceneId ? getScene(selectedSceneId) : null;
        if(!s) return;
        ensureSceneExtras(s);
        s.shots.push({ id: uid("shot"), type: "Plano general", desc: "", durMin: DEFAULT_SHOT_MIN, thumbUrl: "" });
        touch();
        renderShotsEditor();
      };
    }
    if(!table) return;
    const tbody = table.querySelector("tbody");
    if(!tbody) return;

    const s = selectedSceneId ? getScene(selectedSceneId) : null;
    tbody.innerHTML = "";
    if(!s) return;
    ensureSceneExtras_toggleThumb(s);

    (s.shots||[]).forEach((sh, i)=>{
      // migración: abreviaturas viejas → labels completos
      sh.type = normalizeShotType(sh.type) || "Plano general";
      if(typeof sh.thumbUrl !== "string") sh.thumbUrl = sh.thumbUrl ? String(sh.thumbUrl) : "";

      const hasThumb = !!(sh.thumbUrl && String(sh.thumbUrl).trim());
      const uploading = !!_shotThumbUploading[sh.id];
      const thumbInner = uploading
        ? `<div class="muted small">Subiendo…</div>`
        : (hasThumb ? `<img class="shotThumbImg" src="${esc(sh.thumbUrl)}" alt="thumb"/>` : `<div class="muted small">Drop</div>`);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i+1}</td>
        <td>
          <select class="input compact shotTypeSel" ${isReadOnly()?"disabled":""}>
            ${shotTypes.map(t=>`<option value="${esc(t)}"${(normalizeShotType(sh.type)===t)?" selected":""}>${esc(t)}</option>`).join("")}
          </select>
        </td>
        <td><input class="input shotDescInput" ${isReadOnly()?"disabled":""} placeholder="Descripción del plano…" value="${esc(sh.desc||"")}" /></td>
        <td class="shotThumbTd">
          <div class="shotThumbDrop ${hasThumb?"has":""} ${uploading?"uploading":""}" title="Arrastrá una imagen o click para cargar">${thumbInner}</div>
          <div class="row gap" style="justify-content:center; margin-top:6px;">
            <button class="btn icon shotThumbPick" title="Cargar" ${isReadOnly()?"disabled":""}>📷</button>
            <button class="btn icon danger shotThumbClear" title="Quitar" ${(isReadOnly()||!hasThumb)?"disabled":""}>×</button>
          </div>
          <input type="file" accept="image/*" class="shotThumbFile" style="display:none" />
        </td>
        <td><button class="btn icon danger shotDelBtn" title="Borrar" ${isReadOnly()?"disabled":""}>×</button></td>
      `;

      const sel = tr.querySelector(".shotTypeSel");
      const inp = tr.querySelector(".shotDescInput");
      const del = tr.querySelector(".shotDelBtn");

      sel?.addEventListener("change", ()=>{
        if(isReadOnly()) return;
        sh.type = sel.value;
        touch();
      });
      inp?.addEventListener("input", ()=>{
        if(isReadOnly()) return;
        sh.desc = inp.value;
        touch();
      });
      del?.addEventListener("click", (e)=>{
        e.preventDefault();
        if(isReadOnly()){ toast("Modo lector 🔒 (desbloqueá para editar)"); return; }
        s.shots = (s.shots||[]).filter(x=>x.id!==sh.id);
        touch();
        renderShotsEditor();
        try{ renderShotList(); }catch(_e){}
      });

      // Thumb controls
      const drop = tr.querySelector(".shotThumbDrop");
      const pick = tr.querySelector(".shotThumbPick");
      const clear = tr.querySelector(".shotThumbClear");
      const fileIn = tr.querySelector(".shotThumbFile");

      const openPicker = ()=>{
        if(isReadOnly()){ toast("Modo lector 🔒 (desbloqueá para editar)"); return; }
        fileIn && fileIn.click();
      };
      drop?.addEventListener("click", openPicker);
      pick?.addEventListener("click", (e)=>{ e.preventDefault(); openPicker(); });
      fileIn?.addEventListener("change", ()=>{
        const f = fileIn.files && fileIn.files[0];
        if(f) setShotThumb(sh, f);
        try{ fileIn.value = ""; }catch(_e){}
      });
      clear?.addEventListener("click", (e)=>{
        e.preventDefault();
        if(isReadOnly()){ toast("Modo lector 🔒 (desbloqueá para editar)"); return; }
        sh.thumbUrl = "";
        delete sh.thumbUpdatedAt;
        touch();
        renderShotsEditor();
        try{ renderShotList(); }catch(_e){}
      });

      const prevent = (e)=>{ e.preventDefault(); e.stopPropagation(); };
      drop?.addEventListener("dragover", (e)=>{ prevent(e); if(!isReadOnly()) drop.classList.add("drag"); });
      drop?.addEventListener("dragenter", (e)=>{ prevent(e); if(!isReadOnly()) drop.classList.add("drag"); });
      drop?.addEventListener("dragleave", (e)=>{ prevent(e); drop.classList.remove("drag"); });
      drop?.addEventListener("drop", (e)=>{
        prevent(e);
        drop.classList.remove("drag");
        if(isReadOnly()){ toast("Modo lector 🔒 (desbloqueá para editar)"); return; }
        const f = e.dataTransfer?.files?.[0];
        if(f) setShotThumb(sh, f);
      });

      tbody.appendChild(tr);
    });
  }

  // Asegura que escenas viejas tengan los campos nuevos en shots
  function ensureSceneExtras_toggleThumb(scene){
    ensureSceneExtras(scene);
    if(!Array.isArray(scene.shots)) scene.shots = [];
    for(const sh of scene.shots){
      if(typeof sh.thumbUrl !== "string") sh.thumbUrl = sh.thumbUrl ? String(sh.thumbUrl) : "";
    }
  }


  function renderScriptUI(){
    const wrap = el("scriptVersionUI");
    sanitizeScriptState({ migrateRawToLocal:true });

    renderScriptVersionSelect();
    const v = getActiveScriptVersion();

    if(!wrap) return;
    if(!v){
      wrap.style.display = "none";
      return;
    }
    wrap.style.display = "";

    // pick selected script scene
    if(!selectedScriptSceneId || !(v.scenes||[]).some(s=>s.id===selectedScriptSceneId)){
      selectedScriptSceneId = v.scenes?.[0]?.id || null;
    }

    renderScriptSceneList(v);
    renderScriptSceneEditor(v);
    const btnNew = el("btnNewScriptVersion");
    if(btnNew){
      btnNew.disabled = true;
      btnNew.style.display = "none";
    }

    // Mantener el guion (raw) visible y persistente por versión
    const panel = el("scriptImportPanel");
    if(panel) panel.classList.remove("hidden");
    const ta = el("scriptImportText");
    const localRaw = loadScriptRawLocal();
    if(ta && ta.value !== localRaw) ta.value = localRaw;
    const ki = el("scriptKeywords");
    if(ki && ki.value !== (v.keywords||"")) ki.value = v.keywords || "";
    const meta = el("scriptVerMeta");
    if(meta){
      const when = v.updatedAt || v.createdAt;
      meta.textContent = when ? `Actualizado: ${new Date(when).toLocaleString("es-AR")}` : "—";
    }

    // Botón "+ Escena (6A)" dinámico según selección
    const btnIns = el("btnScriptInsertAfter");
    if(btnIns){
      const scenes = (v.scenes||[]);
      if(!scenes.length){
        btnIns.textContent = "+ Escena (1)";
      }else{
        const idx = scenes.findIndex(s=>s.id===selectedScriptSceneId);
        if(idx>=0){
          const after = scenes[idx];
          const nextNum = nextInsertedNumber(after.number, scenes.map(s=>s.number));
          btnIns.textContent = nextNum ? `+ Escena (${nextNum})` : "+ Escena";
        }else{
          btnIns.textContent = "+ Escena";
        }
      }
    }

  }

  function renderScriptSceneList(version){
    const list = el("scriptSceneList");
    if(!list) return;
    list.innerHTML = "";
    for(const sc of (version.scenes||[])){
      const item = document.createElement("div");
      item.className = "scriptSceneItem" + (sc.id===selectedScriptSceneId ? " selected" : "");
      item.innerHTML = `
        <div class="n">${esc(canonSceneNumber(sc.number||""))}</div>
        <div class="grow">
          <div class="h">${esc(sc.slugline||"")}</div>
          <div class="m">${esc(sc.location||"")}${sc.timeOfDay? " · "+esc(sc.timeOfDay):""}</div>
        </div>
      `;
      item.addEventListener("click", ()=>{
        selectedScriptSceneId = sc.id;
        renderScriptUI();
      });
      item.addEventListener("dblclick", ()=>{
        // Ir al Breakdown para editar la escena del proyecto
        const target = state.scenes.find(s=>canonSceneNumber(s.number)===canonSceneNumber(sc.number));
        if(target){
          selectedSceneId = target.id;
          showView("breakdown");
          renderSceneEditor();
          renderScenesTable();
        }
      });
      list.appendChild(item);
    }
  }

  function renderScriptSceneEditor(version){
    const sc = (version.scenes||[]).find(s=>s.id===selectedScriptSceneId) || null;
    const inSlug = el("scriptSceneSlugline");
    const inNum  = el("scriptSceneNumber");
    const inBody = el("scriptSceneBody");
    if(inSlug) inSlug.disabled = !sc;
    if(inBody) inBody.disabled = !sc;
    if(inSlug) inSlug.value = sc ? (sc.slugline||"") : "";
    if(inBody) inBody.value = sc ? (sc.body||"") : "";
    if(inNum) inNum.disabled = !sc;
    if(inNum) inNum.value = sc ? (canonSceneNumber(sc.number||"")) : "";

    // prevent duplicate handlers
    if(inNum && !inNum._bound){
      inNum._bound = true;
      inNum.addEventListener("blur", ()=>{
        const v = getActiveScriptVersion();
        if(!v) return;
        const scc = (v.scenes||[]).find(s=>s.id===selectedScriptSceneId);
        if(!scc) return;
        const cand = canonSceneNumber(inNum.value);
        if(!cand){
          inNum.value = canonSceneNumber(scc.number||"");
          return;
        }
        const used = (v.scenes||[]).filter(s=>s.id!==scc.id).map(s=>canonSceneNumber(s.number)).filter(Boolean);
        let fixed = cand;
        if(used.includes(fixed)){
          fixed = nextInsertedNumber(fixed, used);
          toast(`Número ajustado → ${fixed}`);
        }
        scc.number = fixed;
        v.scenes.sort((a,b)=>sceneNumberCompare(a.number,b.number));
        v.updatedAt = new Date().toISOString();
        touch();
        renderScriptUI();
      });
    }

    if(inSlug && !inSlug._bound){
      inSlug._bound = true;
      inSlug.addEventListener("input", ()=>{
        const v = getActiveScriptVersion();
        if(!v) return;
        const scc = (v.scenes||[]).find(s=>s.id===selectedScriptSceneId);
        if(!scc) return;
        scc.slugline = inSlug.value;
        const { location, timeOfDay } = sluglineToLocTOD(scc.slugline);
        scc.location = location;
        scc.timeOfDay = timeOfDay;
        scc.intExt = sluglineToIntExt(scc.slugline);
        v.updatedAt = new Date().toISOString();
        touch();
        renderScriptSceneList(v);
      });
    }
    if(inBody && !inBody._bound){
      inBody._bound = true;
      inBody.addEventListener("input", ()=>{
        const v = getActiveScriptVersion();
        if(!v) return;
        const scc = (v.scenes||[]).find(s=>s.id===selectedScriptSceneId);
        if(!scc) return;
        scc.body = inBody.value;
        scc.summary = String(scc.body||"").replace(/\s+/g," ").trim().slice(0,220);
        v.updatedAt = new Date().toISOString();
        touch();
        // nothing else to re-render on every key
      });
    }
  }

  function addScene(){
    const s = {
      id: uid("scene"),
      number: nextNewSceneNumber(),
      slugline:"",
      intExt:"",
      location:"",
      timeOfDay:"",
      pages:0,
      summary:"",
      notes:"",
      elements: Object.fromEntries(cats.map(c=>[c,[]])),
      shots: []
    };
    state.scenes.push(s);
    sortScenesByNumberInPlace();
    selectedSceneId = s.id;
    touch();
    renderScenesTable();
    renderSceneEditor();
    renderScriptUI();
    renderSceneBank();
  }

  function deleteScene(){
    if(!selectedSceneId) return;
    const s = state.scenes.find(x=>x.id===selectedSceneId);
    if(!s) return;
    if(!confirm(`Borrar escena #${s.number}?`)) return;

    for(const d of (state.shootDays || [])){
      ensureDayTimingMaps(d);
      d.sceneIds = (d.sceneIds||[]).filter(x=>x!==s.id);
      if(d.times) delete d.times[s.id];
      if(d.durations) delete d.durations[s.id];
    }

    state.scenes = state.scenes.filter(x=>x.id!==s.id);
    selectedSceneId = state.scenes[0]?.id || null;
    touch();
    renderScenesTable();
    renderSceneEditor();
    renderScriptUI();
    renderSceneBank();
    renderDaysBoard();
    renderDayDetail();
    renderReports();
    renderScheduleBoard();
    renderReportsDetail();
  }

  function duplicateScene(){
    if(!selectedSceneId) return;
    const s = state.scenes.find(x=>x.id===selectedSceneId);
    if(!s) return;
    const c = JSON.parse(JSON.stringify(s));
    c.id = uid("scene");
    c.number = makeUniqueSceneNumber(`${s.number}B`);
    state.scenes.push(c);
    sortScenesByNumberInPlace();
    selectedSceneId = c.id;
    touch();
    renderScenesTable();
    renderSceneEditor();
    renderScriptUI();
    renderSceneBank();
  }

  function addSceneElement(){
    const s = selectedSceneId ? state.scenes.find(x=>x.id===selectedSceneId) : null;
    if(!s) return;

    const cat = el("elCategory")?.value;
    let item = (el("elItem")?.value||"").trim();
    if(!cat || !item) return;

    if(cat === "cast"){
      const roster = getCastRoster();
      if(!roster.length){
        toast("No hay Cast cargado. Cargalo en Equipo técnico (Área Cast).");
        return;
      }
      const nIn = normName(item);
      const exact = roster.find(r => normName(r) === nIn);
      if(exact) item = exact;
      else{
        toast("Ese rol no está en Cast (Equipo técnico). Cargalo ahí primero.");
        return;
      }
    }

    s.elements[cat] = s.elements[cat] || [];
    if(!s.elements[cat].includes(item)) s.elements[cat].push(item);

    if(el("elItem")) el("elItem").value="";
    touch();
    refreshElementSuggestions();
    renderSceneElementsGrid();
    renderShotsEditor();
    renderSceneBank();
    renderDaysBoard();
    renderDayDetail();
    renderElementsExplorer();
    renderReports();
    renderScheduleBoard();
    renderReportsDetail();
  }

  // ===================== Shooting plan =====================
  function sceneAssignedDayId(sceneId){
    for(const d of state.shootDays){
      if((d.sceneIds||[]).includes(sceneId)) return d.id;
    }
    return null;
  }
  function removeSceneFromAllDays(sceneId){
    for(const d of state.shootDays){
      d.sceneIds = (d.sceneIds||[]).filter(x=>x!==sceneId);
      if(d.times) delete d.times[sceneId];
      if(d.durations) delete d.durations[sceneId];
    }
  }

  function sceneCardNode(scene, mode="bank", dayId=null){
    const node = document.createElement("div");
    node.className = "sceneCard";
    node.draggable = true;
    node.dataset.sceneId = scene.id;

    if(mode==="bank"){
      const assigned = !!sceneAssignedDayId(scene.id);
      node.classList.add(assigned ? "assigned" : "unassigned");
      node.innerHTML = `
        <div class="left">
          <div class="title">#${esc(scene.number||"")} — ${esc(scene.slugline||"")}</div>
          <div class="meta">${esc(scene.location||"")} · ${esc(scene.timeOfDay||"")}</div>
        </div>
        <div class="right"><span class="dragHandle">⠿</span></div>
      `;
    }else{
      // mode === "day"
      node.innerHTML = `
        <div class="left">
          <div class="title">#${esc(scene.number||"")} — ${esc(scene.slugline||"")}</div>
        </div>
        <div class="right">
          <button class="btn icon sceneRemoveBtn" title="Quitar del día">×</button>
          <span class="dragHandle">⠿</span>
        </div>
      `;
      if(dayId) node.dataset.dayId = dayId;
      const rm = node.querySelector(".sceneRemoveBtn");
      rm?.addEventListener("click", (e)=>{
        e.preventDefault();
        e.stopPropagation();
        const did = node.dataset.dayId;
        const d = did ? getDay(did) : null;
        if(!d) return;
        d.sceneIds = (d.sceneIds||[]).filter(x=>x!==scene.id);
        if(d.times) delete d.times[scene.id];
        if(d.durations) delete d.durations[scene.id];
        selectedDayId = d.id;
        selectedDayplanDayId = d.id;
        selectedShotlistDayId = selectedShotlistDayId || d.id;
        callSheetDayId = callSheetDayId || d.id;
        touch();
        renderSceneBank();
        renderDaysBoard();
        renderDayDetail();
        renderReports();
        renderScheduleBoard();
        saveCallSheetCursor();
      renderCallSheetCalendar();
        renderReportsDetail();
      });
    }

    attachSceneHover(node, scene);

    // Doble click: abrir en Breakdown para editar
    node.addEventListener("dblclick", (e)=>{
      e.stopPropagation();
      jumpToSceneInBreakdown(scene.id);
    });

    node.addEventListener("dragstart", (e)=>{
      hideHoverTip();
      e.dataTransfer.setData("application/json", JSON.stringify({ type:"scene", sceneId: scene.id }));
      e.dataTransfer.effectAllowed = "move";
    });

    return node;
  }

  function renderSceneBank(){
    function renderInto(wrapId, searchId, filterId){
      const wrap = el(wrapId);
      if(!wrap) return;
      wrap.innerHTML = "";

      const q = (el(searchId)?.value||"").toLowerCase();
      const filter = el(filterId)?.value || "all";

      let list = state.scenes.slice();
      if(filter==="unassigned") list = list.filter(s=>!sceneAssignedDayId(s.id));
      if(q){
        list = list.filter(s=>{
          const hay = `${s.number} ${s.slugline} ${s.location} ${s.summary}`.toLowerCase();
          return hay.includes(q);
        });
      }
      for(const s of list) wrap.appendChild(sceneCardNode(s, "bank"));
    }

    // Call Diario
    renderInto("sceneBankList", "bankSearch", "bankFilter");
    // Plan de Rodaje (vista diaria)
    renderInto("dpSceneBankList", "dpBankSearch", "dpBankFilter");
  }

  function addShootDay(){
    const d = {
      id: uid("day"),
      date:"",
      callTime:"08:00",
      location:"",
      label:`Día ${state.shootDays.length+1}`,
      notes:"",
      sceneIds:[],
      crewIds:[],
      blocks:[],
      sceneColors:{},
      times:{},
      durations:{}
    };
    state.shootDays.push(d);
    sortShootDaysInPlace();
    selectedDayId = d.id;
    selectedDayplanDayId = d.id;
    selectedShotlistDayId = selectedShotlistDayId || d.id;
    callSheetDayId = callSheetDayId || d.id;
    touch();
    renderDaysBoard();
    renderDayDetail();
    renderReports();
    renderScheduleBoard();
    renderDayPlan();
    renderSceneBank();
    renderCallSheetCalendar();
    renderReportsDetail();
  }

  function deleteShootDay(){
    if(!selectedDayId) return;
    const d = getDay(selectedDayId);
    if(!d) return;
    if(!confirm(`Borrar ${formatDayTitle(d.date)}?`)) return;

    state.shootDays = state.shootDays.filter(x=>x.id!==d.id);
    sortShootDaysInPlace();
    selectedDayId = state.shootDays[0]?.id || null;
    if(selectedDayplanDayId === d.id) selectedDayplanDayId = selectedDayId;
    touch();
    renderDaysBoard();
    renderDayDetail();
    renderReports();
    renderScheduleBoard();
    renderDayPlan();
    renderSceneBank();
    renderCallSheetCalendar();
    renderReportsDetail();
  }

  function renderDaysBoard(){
    const board = el("daysBoard");
    if(!board) return;
    board.innerHTML = "";
    sortShootDaysInPlace();

    for(const d of state.shootDays){
      ensureDayTimingMaps(d);
      const span = Math.max(5, dayplanAvailSpan(d));

      const col = document.createElement("div");
      col.className = "dayCol";
      col.dataset.dayId = d.id;

      const head = document.createElement("div");
      head.className = "dayHeader";
      head.innerHTML = `
        <div>
          <div class="t">${esc(formatDayTitle(d.date))}${d.label? " · "+esc(d.label):""}</div>
          <div class="m">Call ${esc(d.callTime||"")} · ${esc(d.location||"")}</div>
        </div>
        <div class="muted small">${(d.sceneIds||[]).length} escenas</div>
      `;
      head.addEventListener("click", ()=>{
        selectedDayId = d.id;
        selectedDayplanDayId = d.id;
        selectedShotlistDayId = d.id;
        callSheetDayId = d.id;

        renderDaysBoard();
        renderDayDetail();
        try{ renderDayPlan(); }catch(_e){}
        try{ renderShotList(); }catch(_e){}
        try{ renderReports(); }catch(_e){}
        try{ renderCallSheetCalendar(); }catch(_e){}
        try{ renderReportsDetail(); }catch(_e){}
      });
const zone = document.createElement("div");
      zone.className = "dropZone";
      zone.dataset.dayId = d.id;

      zone.addEventListener("dragover", (e)=>{ e.preventDefault(); zone.classList.add("over"); });
      zone.addEventListener("dragleave", ()=>zone.classList.remove("over"));
      zone.addEventListener("drop", (e)=>{
        e.preventDefault();
        zone.classList.remove("over");
        const raw = e.dataTransfer.getData("application/json");
        if(!raw) return;
        const data = JSON.parse(raw);
        if(data.type!=="scene") return;

        const sid = data.sceneId;
        removeSceneFromAllDays(sid);

        ensureDayTimingMaps(d);
        d.sceneIds.push(sid);
        d.durations[sid] = d.durations[sid] ?? 60;

        const snapMin = Number(el("schedSnap")?.value || 15);
        let end = 0;
        for(const id of d.sceneIds){
          end = Math.max(end, (d.times[id]??0) + (d.durations[id]??60));
        }
        d.times[sid] = snap(end, snapMin);
        resolveOverlapsPushDown(d, snapMin);

        selectedDayId = d.id;
        touch();
        renderSceneBank();
        renderDaysBoard();
        renderDayDetail();
        renderReports();
        renderScheduleBoard();
        saveCallSheetCursor();
      renderCallSheetCalendar();
        renderReportsDetail();
      });

      if(!(d.sceneIds||[]).length){
        zone.innerHTML = `<div class="muted">Soltá escenas acá…</div>`;
      }else{
        for(const sid of d.sceneIds){
          const s = getScene(sid);
          if(!s) continue;
          zone.appendChild(sceneCardNode(s, "day", d.id));
        }
      }

      col.classList.toggle("selected", d.id===selectedDayId);

      col.appendChild(head);
      col.appendChild(zone);
      board.appendChild(col);
    }
  }

  
function renderDayDetail(){
  // Asegurar que haya un día seleccionado válido
  if(!selectedDayId || !getDay(selectedDayId)){
    selectedDayId = state.shootDays?.[0]?.id || null;
  }
  const d = selectedDayId ? getDay(selectedDayId) : null;
  if(d) ensureDayTimingMaps(d);

  // Selector compacto (Call Diario) para elegir día sin Tablero
  const sel = el("shootDaySelect");
  if(sel){
    sortShootDaysInPlace();
    sel.innerHTML = "";
    (state.shootDays||[]).forEach(d0=>{
      const opt = document.createElement("option");
      opt.value = d0.id;
      opt.textContent = `${formatDayTitle(d0.date)}${d0.label ? " · "+d0.label : ""}`;
      sel.appendChild(opt);
    });
    sel.disabled = !(state.shootDays||[]).length;
    if(selectedDayId) sel.value = selectedDayId;
  }

  const title = el("dayDetailTitle");
  const meta = el("dayDetailMeta");
  const scenesWrap = el("dayScenesDetail");

  if(!d){
    if(title) title.textContent = "Detalle del Día";
    if(meta) meta.innerHTML = "";
    if(scenesWrap) scenesWrap.innerHTML = '<div class="muted">Agregá un día desde <b>Plan de Rodaje</b>.</div>';
    el("dayCast").innerHTML = '<div class="muted">Agregá un día desde <b>Plan de Rodaje</b>.</div>';
    el("dayCrewPicker").innerHTML = '<div class="muted">Agregá un día desde <b>Plan de Rodaje</b>.</div>';
    return;
  }

  if(title) title.textContent = `Detalle del Día · ${formatDayTitle(d.date)}${d.label ? " · "+d.label : ""}`;

  if(meta){
    const callTxt = esc(d.callTime || "—");
    const locTxt = esc(d.location || "—");
    meta.innerHTML = `
      <span class="metaPill"><b>Call</b> ${callTxt}</span>
      <span class="metaPill"><b>Locación</b> ${locTxt}</span>
    `;
  }



  const notesBox = el("callDayNotes");
  if(notesBox){
    notesBox.value = d.notes || "";
    notesBox.disabled = isReadOnly();
    notesBox.placeholder = isReadOnly() ? "🔒 Desbloqueá para editar" : "Notas del día…";
    if(notesBox.dataset.bound !== "1"){
      notesBox.dataset.bound = "1";
      notesBox.addEventListener("input", ()=>{
        const d1 = selectedDayId ? getDay(selectedDayId) : null;
        if(!d1) return;
        d1.notes = notesBox.value;
        touch();
        try{ renderCallSheetDetail(el("callSheetDetail"), selectedDayId); }catch(_e){}
      });
    }
  }

  renderDayScenesDetail();

  renderDayCast();
  renderDayCrewPicker();
}


function dayScenes(d){ return (d.sceneIds||[]).map(getScene).filter(Boolean); }


function renderDayScenesDetail(){
  const wrap = el("dayScenesDetail");
  if(!wrap) return;
  wrap.innerHTML = "";

  const d = selectedDayId ? getDay(selectedDayId) : null;
  if(!d){ wrap.innerHTML = `<div class="muted">Seleccioná un día</div>`; return; }

  const ids = (d.sceneIds||[]);
  if(!ids.length){
    wrap.innerHTML = `<div class="muted">No hay escenas asignadas a este día.</div>`;
    return;
  }

  const list = document.createElement("div");
  list.className = "daySceneDetailList";

  for(const sid of ids){
    const sc = getScene(sid);
    if(!sc) continue;
    ensureSceneExtras(sc);

    const pagesNum = Number(sc.pages) || 0;
    const title = `#${sc.number||""} ${sc.slugline||""}`.trim();
    const metaLine = [
      sc.intExt||"",
      sc.location||"",
      sc.timeOfDay||"",
      pagesNum > 0 ? `${fmtPages(pagesNum)} pág` : ""
    ].filter(Boolean).join(" · ");

    const elementsByCat = {};
    for(const cat of cats){
      const arr = (sc.elements?.[cat] || []).map(x=>String(x||"").trim()).filter(Boolean);
      const items = union(arr);
      if(items.length) elementsByCat[cat] = items;
    }

    const catKeys = Object.keys(elementsByCat);
    const chipsHtml = catKeys.map(cat=>{
      const n = elementsByCat[cat].length;
      const label = catNames[cat] || cat;
      const dot = catColors[cat] || "var(--muted)";
      return `<span class="needChip" style="--chip-dot:${dot}"><span class="dot"></span>${esc(label)}<span class="count">${n}</span></span>`;
    }).join("");

    const key = `${d.id}:${sid}`;
    const isOpen = dayDetailOpenSceneKeys.has(key);

    const detailsHtml = catKeys.map(cat=>{
      const label = catNames[cat] || cat;
      const dot = catColors[cat] || "var(--muted)";
      const items = elementsByCat[cat].join(", ");
      return `
        <div class="needRow">
          <span class="dot" style="background:${dot}"></span>
          <div class="k">${esc(label)}</div>
          <div class="v">${esc(items)}</div>
        </div>
      `;
    }).join("");

    const card = document.createElement("div");
    card.className = "sceneNeedCard" + (isOpen ? " open" : "");
    card.innerHTML = `
      <div class="top">
        <div class="left">
          <div class="ttl">${esc(title)}</div>
          <div class="meta">${esc(metaLine)}</div>
        </div>
        <button class="btn icon ghost small toggle" type="button" title="${isOpen ? "Ocultar" : "Ver"}">▾</button>
      </div>
      <div class="chips">
        ${chipsHtml || `<span class="muted small">Sin elementos cargados en breakdown.</span>`}
      </div>
      <div class="details">${detailsHtml}</div>
    `;

    const toggle = ()=>{
      if(dayDetailOpenSceneKeys.has(key)) dayDetailOpenSceneKeys.delete(key);
      else dayDetailOpenSceneKeys.add(key);
      renderDayScenesDetail();
    };

    card.querySelector("button.toggle")?.addEventListener("click", (e)=>{
      e.stopPropagation();
      toggle();
    });
    card.addEventListener("click", toggle);

    list.appendChild(card);
  }

  wrap.appendChild(list);
}



  function groupCrewByArea(list){
    const map = new Map();
    for(const c of list){
      const a = normalizeCrewArea(c.area) || "Otros";
      if(!map.has(a)) map.set(a, []);
      map.get(a).push(c);
    }
    const order = new Map(crewAreas.map((a,i)=>[a,i]));
    const entries = Array.from(map.entries()).sort((a,b)=>{
      const ia = order.get(a[0]) ?? 999;
      const ib = order.get(b[0]) ?? 999;
      return ia-ib;
    });
    for(const [,arr] of entries){
      arr.sort((x,y)=>{
        const rx=(x.role||"").toLowerCase();
        const ry=(y.role||"").toLowerCase();
        if(rx!==ry) return rx.localeCompare(ry);
        return (x.name||"").localeCompare(y.name||"");
      });
    }
    return entries;
  }

function renderDayCast(){
      const wrap = el("dayCast");
      const ro = isReadOnly();
      if(!wrap) return;
      wrap.innerHTML = "";

      const d = selectedDayId ? getDay(selectedDayId) : null;
      if(!d){ wrap.innerHTML = `<div class="muted">Seleccioná un día.</div>`; return; }

      ensureProjectConfig();
      ensureDayTimingMaps(d);
      cleanupDayCallTimes(d);
      cleanupDayExtras(d);

      const scenes = (d.sceneIds||[]).map(getScene).filter(Boolean);
      const cast = union((scenes||[]).map(sc=> (sc.elements?.cast||[])).flat());

      if(!cast.length){
        wrap.innerHTML = `<div class="muted">No hay Cast en las escenas del día.</div>`;
        return;
      }

      const dayBase = baseDayCall(d);
      const castBase = baseCastCall(d);
      const DEF_RTS = Number(state?.project?.rtsOffsetMin ?? 60);

      // Controls
      const top = document.createElement("div");
      top.className = "callGroupBox";
      top.innerHTML = `
        <div class="callGroupRow">
          <div class="lbl">Call Cast</div>
          <input type="time" class="input timeInput" id="cast_call" value="${castBase}" ${ro ? "disabled" : ""}/>
          <button class="btn small ghost" id="cast_apply" title="Aplicar Call Cast a todo el Cast" ${ro ? "disabled" : ""}>Aplicar</button>
          <button class="btn small ghost" id="cast_reset" title="Resetear todo el Cast a Call Cast" ${ro ? "disabled" : ""}>Reset</button>
        </div>
        <div class="callExtrasRow">
          <div class="callExtraLine">
            <div class="left">
              <span class="miniLbl">PU Cast</span>
              <span class="chip toggle ${d.pickupCastEnabled ? "active" : ""} ${ro ? "disabled" : ""}" id="tglPUCast">PU</span>
            </div>
            <div class="right">
              <span class="miniLbl">Offset</span>
              <input type="number" class="input compact" id="puCastOffset" style="width:88px" value="${Math.round(Number(d.pickupCastOffsetMin ?? -30))}" ${(!d.pickupCastEnabled || ro) ? "disabled" : ""}/>
              <button class="btn icon ghost small" id="puCastReset" title="Reset PU Cast a default" ${ro ? "disabled" : ""}>↺</button>
            </div>
          </div>

          <div class="callExtraLine">
            <div class="left">
              <span class="miniLbl">RTS</span>
              <span class="chip toggle ${d.rtsEnabled ? "active" : ""} ${ro ? "disabled" : ""}" id="tglRTS">RTS</span>
            </div>
            <div class="right">
              <span class="miniLbl">Offset</span>
              <input type="number" class="input compact" id="rtsOffset" style="width:88px" value="${Math.round(Number(d.rtsOffsetMin ?? DEF_RTS))}" ${(!d.rtsEnabled || ro) ? "disabled" : ""}/>
              <button class="btn icon ghost small" id="rtsReset" title="Reset RTS a default del proyecto" ${ro ? "disabled" : ""}>↺</button>
            </div>
          </div>
        </div>
      `;
      wrap.appendChild(top);

      function rerender(){
        renderDayCast();
        renderDayCrewPicker();
        renderCallSheetDetail(el("callSheetDetail"), selectedDayId);
      }

      // Call Cast base
      top.querySelector("#cast_call")?.addEventListener("change", (e)=>{
        d.castCallTime = normalizeHHMM(e.target.value) || "";
        touch();
        rerender();
      });

      top.querySelector("#cast_apply")?.addEventListener("click", ()=>{
        const base = baseCastCall(d);
        for(const name of cast){
          // solo seteo override si hoy no tiene uno
          if(!normalizeHHMM(d.castCallTimes[name])) d.castCallTimes[name] = base;
        }
        cleanupDayCallTimes(d);
        touch();
        rerender();
        toast("Aplicado ✅");
      });

      top.querySelector("#cast_reset")?.addEventListener("click", ()=>{
        d.castCallTimes = {};
        cleanupDayCallTimes(d);
        cleanupDayExtras(d);
        touch();
        rerender();
        toast("Reseteado ✅");
      });

      // PU Cast
      top.querySelector("#tglPUCast")?.addEventListener("click", ()=>{
        if(isReadOnly()){ roToast(); return; }
        d.pickupCastEnabled = !d.pickupCastEnabled;
        touch();
        rerender();
      });
      top.querySelector("#puCastOffset")?.addEventListener("change", (e)=>{
        const v = Math.round(Number(e.target.value));
        d.pickupCastOffsetMin = Number.isFinite(v) ? v : -30;
        cleanupDayExtras(d);
        touch();
        rerender();
      });
      top.querySelector("#puCastReset")?.addEventListener("click", ()=>{
        d.pickupCastOffsetMin = -30;
        d.castPickUpTimes = {};
        cleanupDayExtras(d);
        touch();
        rerender();
        toast("PU Cast: default ✅");
      });

      // RTS
      top.querySelector("#tglRTS")?.addEventListener("click", ()=>{
        if(isReadOnly()){ roToast(); return; }
        d.rtsEnabled = !d.rtsEnabled;
        touch();
        rerender();
      });
      top.querySelector("#rtsOffset")?.addEventListener("change", (e)=>{
        const v = Math.round(Number(e.target.value));
        d.rtsOffsetMin = Number.isFinite(v) ? v : DEF_RTS;
        cleanupDayExtras(d);
        touch();
        rerender();
      });
      top.querySelector("#rtsReset")?.addEventListener("click", ()=>{
        d.rtsOffsetMin = DEF_RTS;
        d.castRTSTimes = {};
        cleanupDayExtras(d);
        touch();
        rerender();
        toast("RTS: default ✅");
      });

      // List
      const list = document.createElement("div");
      list.className = "callPeopleList";

      for(const name of cast){
        const call = effectiveCastCall(d, name);
        const callOv = normalizeHHMM(d?.castCallTimes?.[name]);
        const callIsOv = !!callOv && callOv !== castBase;

        const basePu = shiftHHMM(call, Number(d.pickupCastOffsetMin ?? -30));
        const pu = d.pickupCastEnabled ? effectiveCastPU(d, name) : "";
        const puOv = normalizeHHMM(d?.castPickUpTimes?.[name]);
        const puIsOv = d.pickupCastEnabled && !!puOv && puOv !== basePu;

        const baseRts = shiftHHMM(call, Number(d.rtsOffsetMin ?? DEF_RTS));
        const rts = d.rtsEnabled ? effectiveCastRTS(d, name) : "";
        const rtsOv = normalizeHHMM(d?.castRTSTimes?.[name]);
        const rtsIsOv = d.rtsEnabled && !!rtsOv && rtsOv !== baseRts;

        const diff = minutesFromHHMM(call) - minutesFromHHMM(castBase);
        const dotStyle = diff === 0 ? "background: rgba(var(--ok-rgb),.9)" : "background: rgba(255, 208, 0, .9)";
        const castRec = findCastCrewEntryByName(name);
        const displayRole = String(castRec?.role || "").trim();
        const displayName = String(castRec?.name || "").trim();
        const displayTitle = displayRole || name;
        const castMeta = [displayName && displayName!==displayTitle ? displayName : "", castRec?.phone].filter(Boolean).join(" • ");


        const card = document.createElement("div");
        card.className = "callPersonRow";
        card.innerHTML = `
          <div class="left">
            <div class="dot" style="${dotStyle}"></div>
            <div class="txt" style="min-width:0;">
              <div class="title">${escapeHtml(displayTitle)}</div>
              ${castMeta ? '<div class="meta">'+escapeHtml(castMeta)+'</div>' : ''}
            </div>
          </div>

          <div class="right" style="min-width:0;">
            <div class="crewTimeStack">
              <div class="timeLine">
                <div class="k">CALL</div>
                <div style="display:flex; gap:6px; align-items:center; justify-content:flex-end;">
                  <input type="time" class="input timeInput ${callIsOv ? "timeDiffDay" : ""}" value="${call}" data-kind="call" ${ro ? "disabled" : ""}/>
                  <button class="btn icon ghost small" title="Reset CALL" data-kind="callReset" ${ro ? "disabled" : ""}>↺</button>
                </div>
              </div>

              ${d.pickupCastEnabled ? `
                <div class="timeLine">
                  <div class="k">PU</div>
                  <div style="display:flex; gap:6px; align-items:center; justify-content:flex-end;">
                    <input type="time" class="input timeInput ${puIsOv ? "timeDiffDay" : ""}" value="${pu}" data-kind="pu" ${ro ? "disabled" : ""}/>
                    <button class="btn icon ghost small" title="Reset PU" data-kind="puReset" ${ro ? "disabled" : ""}>↺</button>
                  </div>
                </div>
              ` : ""}

              ${d.rtsEnabled ? `
                <div class="timeLine">
                  <div class="k">RTS</div>
                  <div style="display:flex; gap:6px; align-items:center; justify-content:flex-end;">
                    <input type="time" class="input timeInput ${rtsIsOv ? "timeDiffDay" : ""}" value="${rts}" data-kind="rts" ${ro ? "disabled" : ""}/>
                    <button class="btn icon ghost small" title="Reset RTS" data-kind="rtsReset" ${ro ? "disabled" : ""}>↺</button>
                  </div>
                </div>
              ` : ""}
            </div>
          </div>
        `;

        const callInput = card.querySelector('input[data-kind="call"]');
        const callReset = card.querySelector('button[data-kind="callReset"]');

        callInput.addEventListener("change", ()=>{
          const v = normalizeHHMM(callInput.value);
          if(!v || v === castBase) delete d.castCallTimes[name];
          else d.castCallTimes[name] = v;

          cleanupDayCallTimes(d);
          cleanupDayExtras(d);
          touch();
          rerender();
        });
        callReset.addEventListener("click", ()=>{
          delete d.castCallTimes[name];
          cleanupDayCallTimes(d);
          cleanupDayExtras(d);
          touch();
          rerender();
        });

        // PU
        if(d.pickupCastEnabled){
          const puInput = card.querySelector('input[data-kind="pu"]');
          const puReset = card.querySelector('button[data-kind="puReset"]');

          puInput.addEventListener("change", ()=>{
            const v = normalizeHHMM(puInput.value);
            const def = shiftHHMM(effectiveCastCall(d, name), Number(d.pickupCastOffsetMin ?? -30));
            if(!v || v === def) delete d.castPickUpTimes[name];
            else d.castPickUpTimes[name] = v;

            cleanupDayExtras(d);
            touch();
            rerender();
          });
          puReset.addEventListener("click", ()=>{
            delete d.castPickUpTimes[name];
            cleanupDayExtras(d);
            touch();
            rerender();
          });
        }

        // RTS
        if(d.rtsEnabled){
          const rtsInput = card.querySelector('input[data-kind="rts"]');
          const rtsReset = card.querySelector('button[data-kind="rtsReset"]');

          rtsInput.addEventListener("change", ()=>{
            const v = normalizeHHMM(rtsInput.value);
            const def = shiftHHMM(effectiveCastCall(d, name), Number(d.rtsOffsetMin ?? DEF_RTS));
            if(!v || v === def) delete d.castRTSTimes[name];
            else d.castRTSTimes[name] = v;

            cleanupDayExtras(d);
            touch();
            rerender();
          });
          rtsReset.addEventListener("click", ()=>{
            delete d.castRTSTimes[name];
            cleanupDayExtras(d);
            touch();
            rerender();
          });
        }

        list.appendChild(card);
      }

      wrap.appendChild(list);
    }


  function renderDayCrewPicker(){
    const wrap = el("dayCrewPicker");
    const ro = isReadOnly();
    if(!wrap) return;
    wrap.innerHTML = "";

    const d = selectedDayId ? getDay(selectedDayId) : null;
    if(!d){ wrap.innerHTML = `<div class="muted">Seleccioná un día.</div>`; return; }

    ensureProjectConfig();
    ensureDayTimingMaps(d);
    cleanupDayCallTimes(d);
    cleanupDayExtras(d);

    const castIds = new Set((state.crew||[])
      .filter(c=> normalizeCrewArea(c.area)==="Cast")
      .map(c=>String(c.id)));

    if(castIds.size){
      const beforeLen = (d.crewIds||[]).length;
      d.crewIds = (d.crewIds||[]).filter(id=>!castIds.has(String(id)));
      for(const id of castIds){
        if(d.crewCallTimes) delete d.crewCallTimes[id];
        if(d.crewPickUpTimes) delete d.crewPickUpTimes[id];
      }
      if((d.crewIds||[]).length !== beforeLen) touch();
    }

    const crew = (state.crew||[])
      .map(c=>({ ...c, area: normalizeCrewArea(c.area) }))
      .filter(c=>c.area!=="Cast")
      .slice()
      .sort((a,b)=> String(a.area||"").localeCompare(String(b.area||"")) || String(a.name||"").localeCompare(String(b.name||"")));
    if(!crew.length){
      wrap.innerHTML = `<div class="muted">No hay Equipo técnico cargado.</div>`;
      return;
    }

    function rerender(){
      renderDayCrewPicker();
      renderCallSheetDetail(el("callSheetDetail"), selectedDayId);
    }

    // PU Crew controls (independiente del Cast)
    const puBox = document.createElement("div");
    puBox.className = "callGroupBox";
    puBox.innerHTML = `
      <div class="callGroupRow">
        <div class="lbl">PU Equipo</div>
        <span class="chip toggle ${d.pickupCrewEnabled ? "active" : ""} ${ro ? "disabled" : ""}" id="tglPUCrew">PU</span>
        <div class="muted" style="margin-left:8px;">Offset (min)</div>
        <input type="number" class="input compact" id="puCrewOffset" style="width:88px" value="${Math.round(Number(d.pickupCrewOffsetMin ?? -30))}" ${(!d.pickupCrewEnabled || ro) ? "disabled" : ""}/>
        <button class="btn icon ghost small" id="puCrewReset" title="Reset PU Equipo a default" ${ro ? "disabled" : ""}>↺</button>
      </div>
    `;
    wrap.appendChild(puBox);

    puBox.querySelector("#tglPUCrew")?.addEventListener("click", ()=>{
      if(isReadOnly()){ roToast(); return; }
      d.pickupCrewEnabled = !d.pickupCrewEnabled;
      touch();
      rerender();
    });
    puBox.querySelector("#puCrewOffset")?.addEventListener("change", (e)=>{
      const v = Math.round(Number(e.target.value));
      d.pickupCrewOffsetMin = Number.isFinite(v) ? v : -30;
      cleanupDayExtras(d);
      touch();
      rerender();
    });
    puBox.querySelector("#puCrewReset")?.addEventListener("click", ()=>{
      d.pickupCrewOffsetMin = -30;
      d.crewPickUpTimes = {};
      cleanupDayExtras(d);
      touch();
      rerender();
      toast("PU Equipo: default ✅");
    });

    const byArea = new Map();
    const dayBase = baseDayCall(d);
    for(const c of crew){
      const area = normalizeCrewArea(c.area) || "Otros";
      if(!byArea.has(area)) byArea.set(area, []);
      byArea.get(area).push(c);
    }

    for(const area of crewAreas){
      const list = byArea.get(area);
      if(!list || !list.length) continue;

      const box = document.createElement("div");
      box.className = "callGroupBox";

      const areaBase = baseCrewAreaCall(d, area);

      box.innerHTML = `
        <div class="crewAreaHeaderRow">
          <div class="areaName">${escapeHtml(area)}</div>
          <div class="areaCallCtl">
            <span class="muted">Call</span>
            <input type="time" class="input timeInput" value="${areaBase}" ${ro ? "disabled" : ""}/>
            <button class="btn small ghost" ${ro ? "disabled" : ""}>Aplicar</button>
            <button class="btn small ghost" ${ro ? "disabled" : ""}>Reset</button>
          </div>
        </div>
      `;

      const areaInput = box.querySelector("input[type=time]");
      const btnApply = box.querySelectorAll("button")[0];
      const btnReset = box.querySelectorAll("button")[1];

      areaInput.addEventListener("change", ()=>{
        const v = normalizeHHMM(areaInput.value);
        const day = baseDayCall(d);
        if(!v || v === day) delete d.crewAreaCallTimes[area];
        else d.crewAreaCallTimes[area] = v;

        cleanupDayCallTimes(d);
        cleanupDayExtras(d);
        touch();
        rerender();
      });

      btnApply.addEventListener("click", ()=>{
        const base = baseCrewAreaCall(d, area);
        for(const c of list){
          if(!normalizeHHMM(d.crewCallTimes[c.id])) d.crewCallTimes[c.id] = base;
        }
        cleanupDayCallTimes(d);
        cleanupDayExtras(d);
        touch();
        rerender();
        toast("Aplicado ✅");
      });

      btnReset.addEventListener("click", ()=>{
        // resetea overrides individuales del área
        for(const c of list){
          delete d.crewCallTimes[c.id];
        }
        cleanupDayCallTimes(d);
        cleanupDayExtras(d);
        touch();
        rerender();
        toast("Reseteado ✅");
      });

      // Crew items
      for(const c of list){
        const isSel = (d.crewIds||[]).includes(c.id);
        const call = effectiveCrewCall(d, c);
        const diffArea = call !== areaBase;
        const diffDay = call !== dayBase;
        const callDiffCls = diffArea ? "timeDiffArea" : (diffDay ? "timeDiffDay" : "");

        const basePu = shiftHHMM(call, Number(d.pickupCrewOffsetMin ?? -30));
        const pu = d.pickupCrewEnabled ? effectiveCrewPU(d, c) : "";
        const puOv = normalizeHHMM(d?.crewPickUpTimes?.[c.id]);
        const puIsOv = d.pickupCrewEnabled && !!puOv && puOv !== basePu;

        const item = document.createElement("div");
        item.className = "crewPickItem" + (isSel ? " selected" : "");
        item.innerHTML = `
          <div class="left">
            <div class="statusDot"></div>
            <div>
              <div class="title">${escapeHtml(c.name||"")}</div>
              <div class="meta">${escapeHtml(c.role||"")} ${c.phone ? "• "+escapeHtml(c.phone) : ""}</div>
            </div>
          </div>
          <div class="right">
            <div class="crewTimeStack">
              <div class="timeLine">
                <div class="k">CALL</div>
                <div style="display:flex; gap:6px; align-items:center; justify-content:flex-end;">
                  <input type="time" class="input timeInput ${callDiffCls}" value="${call}" ${(isSel && !ro) ? "" : "disabled"}/>
                  <button class="btn icon ghost small" title="Reset CALL" ${(isSel && !ro) ? "" : "disabled"}>↺</button>
                </div>
              </div>

              ${d.pickupCrewEnabled ? `
                <div class="timeLine">
                  <div class="k">PU</div>
                  <div style="display:flex; gap:6px; align-items:center; justify-content:flex-end;">
                    <input type="time" class="input timeInput ${puIsOv ? "timeDiffDay" : ""}" value="${pu}" ${(isSel && !ro) ? "" : "disabled"}/>
                    <button class="btn icon ghost small" title="Reset PU" ${(isSel && !ro) ? "" : "disabled"}>↺</button>
                  </div>
                </div>
              ` : ""}
            </div>
          </div>
        `;

        // Toggle select (except interacting with inputs/buttons)
        item.addEventListener("click", (e)=>{
          if(isReadOnly()){ roToast(); return; }
          if(e.target?.closest?.("input,button,select,textarea,label")) return;
          const idx = d.crewIds.indexOf(c.id);
          if(idx >= 0) d.crewIds.splice(idx,1);
          else d.crewIds.push(c.id);
          touch();
          rerender();
        });

        const callInput = item.querySelectorAll("input[type=time]")[0];
        const callReset = item.querySelectorAll("button")[0];

        callInput?.addEventListener("change", ()=>{
          const v = normalizeHHMM(callInput.value);
          const base = baseCrewAreaCall(d, area);
          if(!v || v === base) delete d.crewCallTimes[c.id];
          else d.crewCallTimes[c.id] = v;

          cleanupDayCallTimes(d);
          cleanupDayExtras(d);
          touch();
          rerender();
        });
        callReset?.addEventListener("click", (e)=>{
          e.stopPropagation();
          delete d.crewCallTimes[c.id];
          cleanupDayCallTimes(d);
          cleanupDayExtras(d);
          touch();
          rerender();
        });

        if(d.pickupCrewEnabled){
          const puInput = item.querySelectorAll("input[type=time]")[1];
          const puReset = item.querySelectorAll("button")[1];

          puInput?.addEventListener("change", ()=>{
            const v = normalizeHHMM(puInput.value);
            const def = shiftHHMM(effectiveCrewCall(d, c), Number(d.pickupCrewOffsetMin ?? -30));
            if(!v || v === def) delete d.crewPickUpTimes[c.id];
            else d.crewPickUpTimes[c.id] = v;

            cleanupDayExtras(d);
            touch();
            rerender();
          });
          puReset?.addEventListener("click", (e)=>{
            e.stopPropagation();
            delete d.crewPickUpTimes[c.id];
            cleanupDayExtras(d);
            touch();
            rerender();
          });
        }

        box.appendChild(item);
      }

      wrap.appendChild(box);
    }
  }

  // ===================== Elements explorer (sin cambios funcionales) =====================
  function populateElementsFilters(){
    const catSel = el("elxCategory");
    const daySel = el("elxDay");
    if(!catSel || !daySel) return;

    const prevCat = catSel.value || "all";
    const prevDay = daySel.value || "all";

    catSel.innerHTML =
      `<option value="all">Todas las categorías</option>` +
      cats.map(c=>`<option value="${c}">${esc(catNames[c])}</option>`).join("");

    sortShootDaysInPlace();
    daySel.innerHTML = `
      <option value="all">Todos los días</option>
      <option value="unassigned">No asignadas</option>
      ${state.shootDays.map(d=>`<option value="${esc(d.id)}">${esc(formatDayTitle(d.date))}</option>`).join("")}
    `;

    catSel.value = (prevCat==="all" || cats.includes(prevCat)) ? prevCat : "all";
    if(prevDay==="unassigned" || prevDay==="all" || state.shootDays.some(d=>d.id===prevDay)){
      daySel.value = prevDay;
    }else daySel.value = "all";
  }

  function syncElementsExplorerChips(){
    const catSel = el("elxCategory");
    const daySel = el("elxDay");
    const catWrap = el("elxCatChips");
    const dayWrap = el("elxDayChips");
    if(!catSel || !daySel || !catWrap || !dayWrap) return;

    // Helper para crear chips tipo 'radio'
    function buildChips(wrap, opts, activeVal, kind){
      wrap.innerHTML = opts.map(o=>{
        const val = String(o.value||"");
        const label = String(o.label||"");
        const active = val===activeVal;
        const dot = (kind==="cat" && val!=="all") ? `<span class="dot" style="background:${catColors[val] || 'var(--muted)'}"></span>` : ``;
        return `<div class="chip toggle ${active? 'active':''}" data-v="${esc(val)}">${dot}${esc(label)}</div>`;
      }).join("");

      wrap.querySelectorAll(".chip.toggle").forEach(ch=>{
        ch.addEventListener("click", ()=>{
          const v = ch.getAttribute("data-v") || "";
          if(kind==="cat"){ catSel.value = v; }
          else { daySel.value = v; }
          renderElementsExplorer();
        });
      });
    }

    const catOpts = Array.from(catSel.options).map(o=>({ value:o.value, label:o.textContent }));
    const dayOpts = Array.from(daySel.options).map(o=>({ value:o.value, label:o.textContent }));
    buildChips(catWrap, catOpts, catSel.value || "all", "cat");
    buildChips(dayWrap, dayOpts, daySel.value || "all", "day");
  }

  function renameElementInCategory(cat, oldItem, newItem){
    const c = String(cat||"");
    if(!cats.includes(c)) return 0;
    const oldKey = String(oldItem||"").trim().toLowerCase();
    const newName = String(newItem||"").trim();
    if(!oldKey || !newName) return 0;
    let changedScenes = 0;
    for(const s of (state.scenes||[])){
      if(!s || !s.elements || !Array.isArray(s.elements[c])) continue;
      const arr = s.elements[c];
      let did = false;
      const out = [];
      const seen = new Set();
      for(const it of arr){
        const t = String(it||"").trim();
        if(!t) continue;
        let v = t;
        if(t.trim().toLowerCase() == oldKey){ v = newName; did = true; }
        const k = v.toLowerCase();
        if(seen.has(k)) continue;
        seen.add(k);
        out.push(v);
      }
      if(did){
        s.elements[c] = out;
        changedScenes += 1;
      }
    }
    return changedScenes;
  }

  function scenesForDayFilter(dayFilter){
    if(dayFilter==="all") return state.scenes.slice();
    if(dayFilter==="unassigned"){
      const assigned = new Set(state.shootDays.flatMap(d=>d.sceneIds||[]));
      return state.scenes.filter(s=>!assigned.has(s.id));
    }
    const d = getDay(dayFilter);
    const ids = new Set(d?.sceneIds || []);
    return state.scenes.filter(s=>ids.has(s.id));
  }

  function renderElementsExplorer(){
    if(!el("elxCategory")) return;
    populateElementsFilters();
    syncElementsExplorerChips();

    const catFilter = el("elxCategory").value || "all";
    const dayFilter = el("elxDay").value || "all";
    const q = (el("elxSearch").value || "").toLowerCase();

    const scenes = scenesForDayFilter(dayFilter);
    const counts = new Map();

    function pushItem(cat, item, sceneId){
      const key = `${cat}::${item}`;
      if(q && !item.toLowerCase().includes(q)) return;
      if(!counts.has(key)) counts.set(key, { cat, item, sceneIds:new Set() });
      counts.get(key).sceneIds.add(sceneId);
    }

    for(const s of scenes){
      if(catFilter==="all"){
        for(const cat of cats){
          for(const it of (s.elements?.[cat]||[])){
            const item = (it||"").trim();
            if(item) pushItem(cat, item, s.id);
          }
        }
      }else{
        for(const it of (s.elements?.[catFilter]||[])){
          const item = (it||"").trim();
          if(item) pushItem(catFilter, item, s.id);
        }
      }
    }

    const listWrap = el("elxList");
    const detailWrap = el("elxDetail");
    listWrap.innerHTML = "";
    detailWrap.innerHTML = "";

    let entries = Array.from(counts.entries()).map(([k,v])=>({ key:k, ...v }));
    entries.sort((a,b)=>{
      const ia = cats.indexOf(a.cat);
      const ib = cats.indexOf(b.cat);
      if(ia!==ib) return ia-ib;
      return a.item.localeCompare(b.item);
    });

    if(!entries.length){
      listWrap.innerHTML = `<div class="catBlock"><div class="items">No hay elementos para este filtro.</div></div>`;
      return;
    }

    const keyOf = (x)=> `${x.cat}::${String(x.item||"").trim().toLowerCase()}`;
    if(!elxSelectedKey) elxSelectedKey = keyOf(entries[0]);
    const selectedEntry = entries.find(x=>keyOf(x)===elxSelectedKey) || entries[0];
    if(keyOf(selectedEntry)!==elxSelectedKey) elxSelectedKey = keyOf(selectedEntry);

    for(const e of entries){
      const row = document.createElement("div");
      row.className = "sceneCard" + (keyOf(e)===elxSelectedKey ? " active" : "");
      row.style.cursor = "pointer";
      row.innerHTML = `
        <div class="left">
          <div class="title">
            <span class="catBadge"><span class="dot" style="background:${catColors[e.cat]}"></span>${esc(e.item)}</span>
          </div>
          <div class="meta">${esc(catNames[e.cat])} · ${e.sceneIds.size} escena(s)</div>
        </div>
        <div class="muted">${e.sceneIds.size}</div>
      `;
      row.addEventListener("click", ()=>{
        elxSelectedKey = keyOf(e);
        listWrap.querySelectorAll(".sceneCard").forEach(n=>n.classList.remove("active"));
        row.classList.add("active");
        renderElementDetail(e);
      });
      listWrap.appendChild(row);
    }

    renderElementDetail(selectedEntry);

    function renderElementDetail(info){
      detailWrap.innerHTML = "";
      const header = document.createElement("div");
      header.className = "catBlock";
      header.innerHTML = `
        <div class="hdr"><span class="dot" style="background:${catColors[info.cat]}"></span>${esc(info.item)}</div>
        <div class="items">${esc(catNames[info.cat])}</div>
      `;
      detailWrap.appendChild(header);

      const renameBox = document.createElement("div");
      renameBox.className = "catBlock";
      const ro = isReadOnly();
      renameBox.innerHTML = `
        <div class="hdr">Renombrar</div>
        <div class="items">
          <div class="row gap alignEnd" style="flex-wrap:wrap;">
            <div class="field grow" style="min-width:240px;">
              <label>Nuevo nombre</label>
              <input class="input" id="elxRenameInput" value="${esc(info.item)}" ${ro?"disabled":""}/>
            </div>
            <button class="btn primary" id="elxRenameBtn" ${ro?"disabled":""}>Aplicar</button>
          </div>
          <div class="muted small">${ro?"🔒 Desbloqueá para renombrar":"Cambia este elemento en todas las escenas de " + esc(catNames[info.cat]) + "."}</div>
        </div>`;
      detailWrap.appendChild(renameBox);
      if(!ro){
        const inp = renameBox.querySelector("#elxRenameInput");
        const btn = renameBox.querySelector("#elxRenameBtn");
        const run = ()=>{
          const nn = String(inp.value||"").trim();
          const oo = String(info.item||"").trim();
          if(!nn) { toast("Nombre vacío"); return; }
          if(nn.toLowerCase()===oo.toLowerCase()) { toast("Sin cambios"); return; }
          const n = renameElementInCategory(info.cat, oo, nn);
          if(!n){ toast("No encontré ese elemento para renombrar"); return; }
          touch();
          refreshElementSuggestions();
          try{ renderScenesTable(); renderSceneEditor(); }catch(_e){}
          try{ renderSceneBank(); renderDaysBoard(); renderDayDetail(); }catch(_e){}
          try{ renderDayPlan(); }catch(_e){}
          try{ renderScheduleBoard(); }catch(_e){}
          try{ renderShotList(); }catch(_e){}
          try{ renderReportsFilters(); renderReports(); renderReportsDetail(); }catch(_e){}
          elxSelectedKey = `${info.cat}::${nn.toLowerCase()}`;
          toast(`Renombrado (${n} escena(s))`);
          renderElementsExplorer();
        };
        btn.addEventListener("click", run);
        inp.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ e.preventDefault(); run(); } });
      }

      const scenesList = Array.from(info.sceneIds).map(getScene).filter(Boolean);
      for(const s of scenesList){
        const r = document.createElement("div");
        r.className = "sceneCard";
        r.innerHTML = `
          <div class="left">
            <div class="title">#${esc(s.number||"")} — ${esc(s.slugline||"")}</div>
            <div class="meta">${esc(s.location||"")} · ${esc(s.timeOfDay||"")}</div>
          </div>
          <button class="btn">Abrir</button>
        `;
        r.querySelector("button").addEventListener("click", ()=>{
          selectedSceneId = s.id;
          showView("breakdown");
          renderScenesTable();
          renderSceneEditor();
    renderScriptUI();
        });
        detailWrap.appendChild(r);
      }
    }
  }

  // ===================== Crew =====================
  function addCrew(){
    state.crew.push({ id: uid("crew"), area:"Produccion", role:"", name:"", phone:"", email:"", notes:"" });
    touch();
    renderCrew();
    refreshElementSuggestions();
    renderDayDetail();
    renderReports();
    renderReportsDetail();
  }

  function renderCrew(){
    const table = el("crewTable");
    if(!table) return;
    const tbody = table.querySelector("tbody");
    const q = (el("crewSearch")?.value||"").toLowerCase();
    tbody.innerHTML = "";

    // Helper: which shoot days include this crew member
    function crewDays(crewId){
      sortShootDaysInPlace();
      return state.shootDays
        .filter(d => (d.crewIds||[]).includes(crewId))
        .map(d => ({ id:d.id, date:d.date, label:d.label, location:d.location, callTime:d.callTime }));
    }

    let list = state.crew.map(c=>({ ...c, area: normalizeCrewArea(c.area) }));
    if(q){
      list = list.filter(c=>{
        const hay = `${c.area} ${c.role} ${c.name} ${c.phone} ${c.email} ${c.notes}`.toLowerCase();
        return hay.includes(q);
      });
    }
    const idx = new Map(crewAreas.map((a,i)=>[a,i]));
    list.sort((a,b)=>{
      const ia = (idx.get(a.area) ?? 999);
      const ib = (idx.get(b.area) ?? 999);
      if(ia!==ib) return ia-ib;
      return (a.name||"").localeCompare(b.name||"");
    });

    let lastArea = null;

    for(const c of list){
      const real = state.crew.find(x=>x.id===c.id);
      if(real) real.area = c.area;

      if(c.area !== lastArea){
        const trG = document.createElement("tr");
        trG.className = "groupRow";
        trG.innerHTML = `<td colspan="7">${esc(c.area)}</td>`;
        tbody.appendChild(trG);
        lastArea = c.area;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="crewAreaCell">
            <button class="btn icon crewExpander" title="Ver días">▸</button>
            <select class="input">
              ${crewAreas.map(a=>`<option value="${esc(a)}" ${c.area===a?"selected":""}>${esc(a)}</option>`).join("")}
            </select>
          </div>
        </td>
        <td><input class="input" value="${esc(c.role||"")}" /></td>
        <td><input class="input" value="${esc(c.name||"")}" /></td>
        <td><input class="input" value="${esc(c.phone||"")}" /></td>
        <td><input class="input" value="${esc(c.email||"")}" /></td>
        <td><input class="input" value="${esc(c.notes||"")}" /></td>
        <td><button class="btn danger">Borrar</button></td>
      `;

      const expBtn = tr.querySelector(".crewExpander");
      if(expBtn){
        const open = expandedCrewIds.has(real.id);
        expBtn.textContent = open ? "▾" : "▸";
        expBtn.addEventListener("click", (e)=>{
          e.preventDefault();
          e.stopPropagation();
          if(expandedCrewIds.has(real.id)) expandedCrewIds.delete(real.id);
          else expandedCrewIds.add(real.id);
          renderCrew();
        });
      }

      const [areaSel, role, name, phone, email, notes] = tr.querySelectorAll("select,input");
      areaSel.addEventListener("change", ()=>{ real.area = normalizeCrewArea(areaSel.value); touch(); renderCrew(); refreshElementSuggestions(); renderReports(); renderReportsDetail(); });
      role.addEventListener("input", ()=>{ real.role = role.value; touch(); renderReports(); renderReportsDetail(); });
      name.addEventListener("input", ()=>{ real.name = name.value; touch(); refreshElementSuggestions(); renderReports(); renderReportsDetail(); });
      phone.addEventListener("input", ()=>{ real.phone = phone.value; touch(); });
      email.addEventListener("input", ()=>{ real.email = email.value; touch(); });
      notes.addEventListener("input", ()=>{ real.notes = notes.value; touch(); });

      const delBtn = tr.querySelector("button.btn.danger");
      delBtn?.addEventListener("click", ()=>{
        if(!confirm("Borrar integrante?")) return;
        for(const d of state.shootDays){
          d.crewIds = (d.crewIds||[]).filter(id=>id!==real.id);
        }
        state.crew = state.crew.filter(x=>x.id!==real.id);
        touch();
        renderCrew();
        refreshElementSuggestions();
        renderDayDetail();
        renderReports();
        renderReportsDetail();
      });

      tbody.appendChild(tr);

      // Expanded detail row (days in shooting plan)
      if(expandedCrewIds.has(real.id)){
        const days = crewDays(real.id);
        const trD = document.createElement("tr");
        trD.className = "crewDetailRow";

        const daysHtml = days.length
          ? `<div class="crewDayPills">${days.map(d=>{
                const title = `${formatDayTitle(d.date)}${d.label ? " · "+(d.label||"") : ""}`;
                return `<span class="pill">${esc(title)}</span>`;
              }).join("")}</div>`
          : `<div class="muted small">No está asignado a ningún día del Plan de Rodaje.</div>`;

        trD.innerHTML = `
          <td colspan="7">
            <div class="crewDetailBox">
              <div class="muted small" style="margin-bottom:8px;">Días donde está cargado</div>
              ${daysHtml}
            </div>
          </td>
        `;
        tbody.appendChild(trD);
      }
    }

    if(!list.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7" class="muted">No hay resultados.</td>`;
      tbody.appendChild(tr);
    }
  }

  // ===================== Reports (sin cambios) =====================
  function renderReports(){
    const board = el("reportsBoard");
    if(!board) return;
    board.innerHTML = "";
    sortShootDaysInPlace();

    // Mobile: mostrar un solo día (el seleccionado arriba)
    const mobileSingleDay = isMobileUI();
    const focusId = (selectedDayId && state.shootDays.some(d=>d.id===selectedDayId))
      ? selectedDayId
      : (state.shootDays[0]?.id || null);
    const daysToShow = mobileSingleDay && focusId
      ? state.shootDays.filter(d=>d.id===focusId)
      : state.shootDays;
    try{ board.classList.toggle("singleDay", !!(mobileSingleDay && focusId)); }catch(_e){}

    const sceneById = new Map((state.scenes||[]).map(s=>[s.id,s]));
    const crewById  = new Map((state.crew||[]).map(c=>[c.id,c]));

    renderReportsFilters();
    const f = getReportsFilterSet();

    const qRaw = (el("reportsSearch")?.value || "").toLowerCase().trim();
    const qTokens = qRaw ? qRaw.split(/\s+/).filter(Boolean) : [];
    const matches = (txt)=>{
      if(!qTokens.length) return true;
      const hay = String(txt ?? "").toLowerCase();
      for(const t of qTokens){
        if(!hay.includes(t)) return false;
      }
      return true;
    };

    if(!f || f.size === 0){
      board.innerHTML = `<div class="muted">Seleccioná al menos un filtro arriba.</div>`;
      return;
    }

    for(const d of daysToShow){
      ensureDayTimingMaps(d);
      const col = document.createElement("div");
      col.className = "reportCol";

      const head = document.createElement("div");
      head.className = "reportHead";

      const body = document.createElement("div");
      body.className = "reportBody";
      let shownBlocks = 0;

      const scenes = (d.sceneIds||[]).map(id=>sceneById.get(id)).filter(Boolean);
      const castAll = union(scenes.flatMap(s=>s.elements?.cast||[]));
      const pages = scenes.reduce((acc, s)=> acc + (Number(s.pages)||0), 0);

      const crewAll = (d.crewIds||[])
        .map(id=>crewById.get(id))
        .filter(Boolean)
        .map(c=>({ ...c, area: normalizeCrewArea(c.area) }))
        .filter(c=>c.area!=="Cast");

      head.innerHTML = `
        <div class="t">${esc(formatDayTitle(d.date))}${d.label? " · "+esc(d.label):""}</div>
        <div class="m">Call ${esc(d.callTime||"")} · ${esc(d.location||"")}</div>
        <div class="kpiRow">
          <span class="kpi"><b>${scenes.length}</b> escenas</span>
          <span class="kpi"><b>${fmtPages(pages)}</b> pág</span>
          <span class="kpi"><b>${castAll.length}</b> cast</span>
          <span class="kpi"><b>${crewAll.length}</b> crew</span>
        </div>
      `;

      // ===== Búsqueda precisa: solo traer coincidencias (no toda la categoría) =====
      // relatedSceneIds se llena SOLO por coincidencias en elementos/cast (para mostrar también su escena)
      const relatedSceneIds = new Set();

      // Cast
      let castList = castAll;
      if(qTokens.length && f.has("cast")){
        const seen = new Set();
        const arr = [];
        for(const s of scenes){
          for(const raw of (s.elements?.cast||[])){
            const name = String(raw||"").trim();
            if(!name) continue;
            if(matches(name)){
              const key = name.toLowerCase();
              if(!seen.has(key)){ seen.add(key); arr.push(name); }
              relatedSceneIds.add(s.id);
            }
          }
        }
        castList = arr;
      }

      // Crew (no tiene escena asociada, solo filtra personas)
      let crewList = crewAll;
      if(qTokens.length && f.has("crew")){
        crewList = crewAll.filter(c=> matches(`${c.area||""} ${c.name||""} ${c.role||""}`));
      }
      const groupedCrew = groupCrewByArea(crewList);

      // Elementos por categoría (incluye escena relacionada)
      const matchedByCat = {};
      if(qTokens.length){
        for(const cat of cats){
          if(cat === "cast") continue;
          if(!f.has(cat)) continue;
          const seen = new Set();
          const arr = [];
          for(const s of scenes){
            const list = (s.elements?.[cat] || []);
            for(const raw of list){
              const it = String(raw||"").trim();
              if(!it) continue;
              if(matches(it)){
                const key = it.toLowerCase();
                if(!seen.has(key)){ seen.add(key); arr.push(it); }
                relatedSceneIds.add(s.id);
              }
            }
          }
          matchedByCat[cat] = arr;
        }
      }

      // Escenas (si hay coincidencia en elementos/cast, mostrar también su escena aunque el filtro "Escenas" esté apagado)
      const showScenesBox = f.has("scenes") || (qTokens.length && relatedSceneIds.size>0);
      if(showScenesBox){
        let listScenes = [];
        if(!qTokens.length){
          listScenes = scenes;
        }else{
          const seen = new Set();
          for(const s of scenes){
            const sceneHay = `${s.number||""} ${s.slugline||""} ${s.location||""} ${s.summary||""}`;
            const ok = relatedSceneIds.has(s.id) || (f.has("scenes") && matches(sceneHay));
            if(ok && !seen.has(s.id)) { seen.add(s.id); listScenes.push(s); }
          }
        }

        // En búsqueda: si no hay escenas para mostrar, no agregamos el bloque.
        if(!qTokens.length || listScenes.length){
          const label = f.has("scenes") ? "Escenas" : "Escenas relacionadas";
          const scenesBox = document.createElement("div");
          scenesBox.className = "catBlock";
          scenesBox.innerHTML = `
            <div class="hdr"><span class="dot" style="background:var(--cat-props)"></span>${esc(label)}</div>
            <div class="items">${listScenes.length ? listScenes.map(s=>`<div>#${esc(s.number)} ${esc(s.slugline)}</div>`).join("") : `<div>—</div>`}</div>
          `;
          body.appendChild(scenesBox);
          shownBlocks++;
        }
      }

      // Cast
      if(f.has("cast")){
        const list = qTokens.length ? castList : castAll;
        if(!qTokens.length || list.length){
          const castBox = document.createElement("div");
          castBox.className = "catBlock";
          castBox.innerHTML = `
            <div class="hdr"><span class="dot" style="background:${catColors.cast}"></span>Cast</div>
            <div class="items">${list.length ? list.map(n=>`<div>${esc(n)}</div>`).join("") : `<div>—</div>`}</div>
          `;
          body.appendChild(castBox);
          shownBlocks++;
        }
      }

      // Crew
      if(f.has("crew")){
        if(!qTokens.length || crewList.length){
          const crewBox = document.createElement("div");
          crewBox.className = "catBlock";
          crewBox.innerHTML = `<div class="hdr"><span class="dot" style="background:var(--cat-sound)"></span>Crew citado</div>`;
          const crewItems = document.createElement("div");
          crewItems.className = "items";

          if(!crewList.length){
            crewItems.innerHTML = `<div>—</div>`;
          }else{
            crewItems.innerHTML = groupedCrew.map(([area, arr])=>`
              <div class="repCrewArea">
                <div class="repCrewAreaT">${esc(area)}</div>
                <div class="repCrewAreaL">
                  ${arr.map(c=>`<div>${esc(c.name)}${c.role? ` (${esc(c.role)})`:""}</div>`).join("")}
                </div>
              </div>
            `).join("");
          }
          crewBox.appendChild(crewItems);
          body.appendChild(crewBox);
          shownBlocks++;
        }
      }

      // Categorías de elementos
      for(const cat of cats){
        if(cat === "cast") continue;
        if(!f.has(cat)) continue;

        const items = qTokens.length
          ? (matchedByCat[cat] || [])
          : union(scenes.flatMap(s=>s.elements?.[cat]||[]));

        // En búsqueda, si no hay coincidencias, no mostramos el bloque
        if(!items.length) continue;

        const box = document.createElement("div");
        box.className = "catBlock";
        box.innerHTML = `
          <div class="hdr"><span class="dot" style="background:${catColors[cat]}"></span>${esc(catNames[cat])}</div>
          <div class="items">${items.map(x=>`<div>${esc(x)}</div>`).join("")}</div>
        `;
        body.appendChild(box);
        shownBlocks++;
      }

      // Si hay búsqueda y no se mostró nada, solo mantenemos el día si el encabezado coincide
      if(qTokens.length && shownBlocks===0){
        const hhay = `${formatDayTitle(d.date)} ${d.label||""} ${d.location||""} ${d.callTime||""}`;
        if(!matches(hhay)) continue;
        body.innerHTML = `<div class="muted">Sin resultados.</div>`;
      }

      col.appendChild(head);
      col.appendChild(body);
      board.appendChild(col);
    }

    if(qTokens.length && !board.children.length){
      board.innerHTML = `<div class="muted">Sin resultados.</div>`;
    }
  }

  // ===================== Schedule =====================


// --- Plan General: selector de días (calendario) ---
const SCHED_DAYFILTER_PREFIX = "gb_sched_dayfilter_v1__";
function getSchedDayFilterKey(){
  try{
    const cfg = (typeof StorageLayer!=="undefined" && StorageLayer.loadCfg) ? StorageLayer.loadCfg() : null;
    const k = cfg?.binId || cfg?.projectId || cfg?.projectName || "default";
    return SCHED_DAYFILTER_PREFIX + String(k);
  }catch(_e){
    return SCHED_DAYFILTER_PREFIX + "default";
  }
}

function loadSchedDayFilter(){
  let raw = null;
  try{ raw = localStorage.getItem(getSchedDayFilterKey()); }catch(_e){}
  let obj = null;
  try{ obj = raw ? JSON.parse(raw) : null; }catch(_e){ obj=null; }
  if(!obj || typeof obj!=="object") obj = { mode:"all", selected:[] };
  if(obj.mode!=="all" && obj.mode!=="selected" && obj.mode!=="none") obj.mode="all";
  if(!Array.isArray(obj.selected)) obj.selected=[];
  obj.selected = obj.selected.filter(x=>typeof x==="string" && x.length<100);
  return obj;
}

function saveSchedDayFilter(obj){
  if(!obj || typeof obj!=="object") return;
  if(obj.mode!=="all" && obj.mode!=="selected" && obj.mode!=="none") obj.mode="all";
  if(!Array.isArray(obj.selected)) obj.selected=[];
  obj.selected = obj.selected.filter(x=>typeof x==="string" && x.length<100);
  try{ localStorage.setItem(getSchedDayFilterKey(), JSON.stringify(obj)); }catch(_e){}
}

function getScheduleDaysFiltered(){
  sortShootDaysInPlace();
  const f = loadSchedDayFilter();
  const days = (state.shootDays || []);
  if(f.mode==="all") return days.slice();
  if(f.mode==="none") return [];
  const set = new Set(f.selected || []);
  return days.filter(d=> set.has(d.id));
}

function computeScheduleGlobalBaseHour(days){
  let minBase = Infinity;
  for(const d of (days||[])){
    const baseH = baseHourFromCall((d && d.callTime) || "08:00"); // floor a la hora
    if(Number.isFinite(baseH)) minBase = Math.min(minBase, baseH);
  }
  if(!Number.isFinite(minBase) || minBase===Infinity) return 8*60;
  return minBase;
}

function scheduleBoardBaseHourFallback(){
  const days = getScheduleDaysFiltered();
  return computeScheduleGlobalBaseHour(days);
}

function getScheduleBoardBaseHour(){
  const b = el("schedBoard");
  const v = Number(b?.dataset?.baseHour ?? NaN);
  if(Number.isFinite(v)) return v;
  return scheduleBoardBaseHourFallback();
}

function updateSchedDaysButton(){
  const btn = el("btnSchedDays");
  if(!btn) return;
  const f = loadSchedDayFilter();
  let title = "Días: Todos";
  btn.classList.remove("active");
  if(f.mode==="none"){
    title = "Días: Ninguno";
    btn.classList.add("active");
  }else if(f.mode==="selected"){
    const n = (f.selected||[]).length;
    title = `Días: ${n} seleccionado${n===1?"":"s"}`;
    btn.classList.add("active");
  }
  btn.title = title;
}

// Calendar UI state
let schedCalCursor = null; // {y,m}
function openSchedDayPicker(){
  const dlg = el("schedDayPicker");
  if(!dlg) return;

  // init month: primer día del proyecto o del primer seleccionado
  const f = loadSchedDayFilter();
  let initDateStr = null;
  if(f.mode==="selected" && (f.selected||[]).length){
    const d0 = getDay(f.selected[0]);
    initDateStr = d0?.date || null;
  }
  if(!initDateStr){
    initDateStr = state.shootDays?.[0]?.date || null;
  }
  let dt = initDateStr ? new Date(initDateStr+"T12:00:00") : new Date();
  if(!Number.isFinite(dt.getTime())) dt = new Date();

  schedCalCursor = { y: dt.getFullYear(), m: dt.getMonth() };
  renderSchedCalendar();
  updateSchedDaysButton();

  try{ dlg.showModal(); }
  catch(_e){ dlg.setAttribute("open",""); }
}

function closeSchedDayPicker(){
  const dlg = el("schedDayPicker");
  if(!dlg) return;
  try{ dlg.close(); }catch(_e){ dlg.removeAttribute("open"); }
}

function renderSchedCalendar(){
  const grid = el("schedCalGrid");
  const monthLab = el("schedCalMonth");
  if(!grid || !monthLab) return;
  if(!schedCalCursor) schedCalCursor = { y:new Date().getFullYear(), m:new Date().getMonth() };

  const y = schedCalCursor.y;
  const m = schedCalCursor.m;

  const monthName = new Date(y, m, 1).toLocaleDateString("es-AR", { month:"long", year:"numeric" });
  monthLab.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const days = (state.shootDays||[]);
  const byDate = new Map();
  for(const d of days){
    if(d?.date) byDate.set(d.date, d.id);
  }

  const f = loadSchedDayFilter();
  const sel = new Set(f.selected||[]);

  const first = new Date(y, m, 1);
  // Week starts Monday (AR): 0..6
  const dow = (first.getDay() + 6) % 7;
  const lastDay = new Date(y, m+1, 0).getDate();

  const dows = ["L","M","X","J","V","S","D"];
  let html = dows.map(x=>`<div class="schedCalDow">${x}</div>`).join("");

  for(let i=0;i<dow;i++){
    html += `<div class="schedCalCell isEmpty"></div>`;
  }

  for(let day=1; day<=lastDay; day++){
    const dateStr = `${y}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const dayId = byDate.get(dateStr);
    const enabled = !!dayId;
    const isSelected = enabled && sel.has(dayId);
    const cls = [
      "schedCalCell",
      enabled ? "" : "isDisabled",
      isSelected ? "isSelected" : ""
    ].filter(Boolean).join(" ");
    const attrs = enabled ? `data-day-id="${escAttr(dayId)}"` : "";
    html += `<div class="${cls}" ${attrs} title="${escAttr(dateStr)}">${day}</div>`;
  }

  grid.innerHTML = html;

  // click delegate (solo una vez)
  if(grid.dataset.bound!=="1"){
    grid.dataset.bound="1";
    grid.addEventListener("click", (e)=>{
      const cell = e.target.closest(".schedCalCell");
      if(!cell || cell.classList.contains("isEmpty") || cell.classList.contains("isDisabled")) return;
      const dayId = cell.getAttribute("data-day-id");
      if(!dayId) return;

      const f = loadSchedDayFilter();
      const set = new Set(f.selected||[]);
      if(set.has(dayId)) set.delete(dayId); else set.add(dayId);

      const selected = [...set];
      if(selected.length){
        f.mode = "selected";
        f.selected = selected;
      }else{
        f.mode = "none";
        f.selected = [];
      }
      saveSchedDayFilter(f);
      updateSchedDaysButton();
      renderSchedCalendar();
      renderScheduleBoard();
    });
  }
}

function escAttr(s){
  return String(s||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function bindSchedDayPickerUI(){
  if(el("btnSchedDays")?.dataset.bound==="1") return;
  const btn = el("btnSchedDays");
  if(btn) btn.dataset.bound="1";

  // Allow this UI in Lector mode (filtering doesn't modify data)
  try{ const dlg = el("schedDayPicker"); if(dlg) dlg.dataset.roAllow="1"; }catch(_e){}
  try{
    ["btnSchedDays","schedDayPicker","schedDayPickerClose","schedCalPrev","schedCalNext","schedCalAll","schedCalNone","schedCalDone","schedCalGrid"]
      .forEach(id=>{ const n = el(id); if(n) n.dataset.roAllow="1"; });
  }catch(_e){}

  el("btnSchedDays")?.addEventListener("click", openSchedDayPicker);
  el("schedDayPickerClose")?.addEventListener("click", closeSchedDayPicker);
  el("schedCalDone")?.addEventListener("click", closeSchedDayPicker);

  el("schedCalPrev")?.addEventListener("click", ()=>{
    if(!schedCalCursor) schedCalCursor = { y:new Date().getFullYear(), m:new Date().getMonth() };
    schedCalCursor.m -= 1;
    if(schedCalCursor.m<0){ schedCalCursor.m=11; schedCalCursor.y -= 1; }
    renderSchedCalendar();
  });
  el("schedCalNext")?.addEventListener("click", ()=>{
    if(!schedCalCursor) schedCalCursor = { y:new Date().getFullYear(), m:new Date().getMonth() };
    schedCalCursor.m += 1;
    if(schedCalCursor.m>11){ schedCalCursor.m=0; schedCalCursor.y += 1; }
    renderSchedCalendar();
  });

  el("schedCalAll")?.addEventListener("click", ()=>{
    const f = loadSchedDayFilter();
    f.mode = "all";
    f.selected = [];
    saveSchedDayFilter(f);
    updateSchedDaysButton();
    renderSchedCalendar();
    renderScheduleBoard();
  });

  el("schedCalNone")?.addEventListener("click", ()=>{
    const f = loadSchedDayFilter();
    f.mode = "none";
    f.selected = [];
    saveSchedDayFilter(f);
    updateSchedDaysButton();
    renderSchedCalendar();
    renderScheduleBoard();
  });

  // update initial tooltip
  updateSchedDaysButton();
}

  function renderScheduleBoard(){
    const board = el("schedBoard");
    if(!board) return;
    board.innerHTML = "";

    const q = (el("schedSearch")?.value || "").toLowerCase().trim();

    sortShootDaysInPlace();
    updateSchedDaysButton();

    const daysToShow = getScheduleDaysFiltered();

    if(!state.shootDays.length){
      board.innerHTML = `<div class="muted">No hay días cargados.</div>`;
      setupScheduleTopScrollbar();
      return;
    }

    if(!daysToShow.length){
      board.innerHTML = `<div class="muted">No hay días seleccionados.</div>`;
      setupScheduleTopScrollbar();
      return;
    }

    const globalBaseHour = computeScheduleGlobalBaseHour(daysToShow);
    board.dataset.baseHour = String(globalBaseHour);

    const zoom = Number(el("schedZoom")?.value || 90);
    const pxPerMin = zoom / 60;

    for(const d of daysToShow){
      ensureDayTimingMaps(d);
      const span = Math.max(5, dayplanAvailSpan(d));

      const dayWrap = document.createElement("div");
      dayWrap.className = "schedDay";

      const head = document.createElement("div");
      head.className = "schedHead";
      head.innerHTML = `
        <div class="t">${esc(formatDayTitle(d.date))}${d.label? " · "+esc(d.label):""}</div>
        <div class="m">Call ${esc(d.callTime||"")} · ${esc(d.location||"")}</div>
      `;

      const grid = document.createElement("div");
      grid.className = "schedGrid";
      let shownBlocks = 0;
      grid.dataset.dayId = d.id;
      const callM = minutesFromHHMM(d.callTime||"08:00");
      const preOffset = callM - globalBaseHour;
      const baseHour = globalBaseHour;
      const endAbs = dayplanEndAbs(d);
      const totalSpan = Math.max(60, endAbs - baseHour);
      const numHours = Math.ceil(totalSpan/60);

      grid.style.height = `${Math.ceil(totalSpan * pxPerMin)}px`;

      for(let h=0; h<=numHours; h++){
        const y = h * 60 * pxPerMin;
        const line = document.createElement("div");
        line.className = "hourLine";
        line.style.top = `${y}px`;
        grid.appendChild(line);

        const lab = document.createElement("div");
        lab.className = "hourLabel";
        lab.style.top = `${y}px`;
        lab.textContent = clockLabelAbs(baseHour + h*60);
        grid.appendChild(lab);
      }

      for(const sid of d.sceneIds){
        const s = getScene(sid);
        if(!s) continue;
        if(q){
          let elemsTxt = "";
          try{
            const parts = [];
            for(const cat of cats){
              const items = s.elements?.[cat] || [];
              if(items && items.length) parts.push(items.join(" "));
            }
            elemsTxt = parts.join(" ");
          }catch(_e){ elemsTxt = ""; }

          const hay = `${s.number||""} ${s.slugline||""} ${s.location||""} ${s.summary||""} ${elemsTxt}`.toLowerCase();
          if(!hay.includes(q)) continue;
        }

        const startMin = clamp(d.times[sid] ?? 0, 0, Math.max(0, span-1));
        const durMin   = clamp(d.durations[sid] ?? 60, 5, span);

        const top = (preOffset + startMin) * pxPerMin;
        const height = Math.max(34, durMin * pxPerMin);

        const involved = sceneCatsWithItems(s);
        const ticks = involved.length
          ? `<div class="schedTicks">${involved.map(cat=>`<span class="tick" style="background:${catColors[cat]}"></span>`).join("")}</div>`
          : "";

        const block = document.createElement("div");
        block.className = "schedBlock";
        const rowColor = d.sceneColors?.[sid];
        if(rowColor) block.style.borderLeft = `6px solid ${rowColor}`;
        block.dataset.sceneId = sid;
        block.dataset.dayId = d.id;
        block.style.top = `${top}px`;
        block.style.height = `${height}px`;
                const startTxt = clockLabelFromCall(d, startMin);
        const endTxt   = clockLabelFromCall(d, startMin + durMin);

        block.innerHTML = `
          ${ticks}
          <div class="schedTitleRow">
            <div class="schedTime">${esc(startTxt)}–${esc(endTxt)}</div>
            <div class="title">#${esc(s.number||"")} — ${esc(s.slugline||"")}</div>
          </div>
          <div class="meta">${esc(formatDuration(durMin))}</div>
          <div class="resize" title="Cambiar duración"></div>
        `;

        attachSceneHover(block, s);

        // Doble click robusto (algunos browsers no disparan dblclick si hay pointerdown preventDefault)
        block.addEventListener("dblclick", (e)=>{ e.stopPropagation(); jumpToSceneInBreakdown(s.id); });
        block.addEventListener("click", (e)=>{
          if(e.detail === 2 && !(schedDrag && schedDrag.moved)) jumpToSceneInBreakdown(s.id);
        });

        grid.appendChild(block);
        shownBlocks++;
      }


// Notas / tareas (sincronizadas desde Plan de Rodaje)
for(const b of (d.blocks||[])){
  if(!b) continue;
  if(q){
    const hay = `${b.title||""} ${b.detail||""}`.toLowerCase();
    if(!hay.includes(q)) continue;
  }

  const startMin = clamp(Number(b.startMin ?? 0) || 0, 0, Math.max(0, span-1));
  const durMin   = clamp(Number(b.durMin ?? 30) || 30, 5, span);

  const top = (preOffset + startMin) * pxPerMin;
  const height = Math.max(34, durMin * pxPerMin);

  const col = safeHexColor(b.color || "#E5E7EB", "#E5E7EB");
  const bg = hexToRgba(col, 0.18);

  const block = document.createElement("div");
  block.className = "schedBlock";
  block.dataset.kind = "block";
  block.dataset.itemId = b.id;
  block.dataset.dayId = d.id;
  block.style.top = `${top}px`;
  block.style.height = `${height}px`;
  block.style.background = bg;
  block.style.borderLeft = `6px solid ${col}`;
    const startTxt = clockLabelFromCall(d, startMin);
  const endTxt   = clockLabelFromCall(d, startMin + durMin);

  block.innerHTML = `
    <div class="schedTitleRow">
      <div class="schedTime">${esc(startTxt)}–${esc(endTxt)}</div>
      <div class="title">🗒 ${esc(b.title||"Tarea")}</div>
    </div>
    <div class="meta">${esc(formatDuration(durMin))}${b.detail ? " · " + esc(b.detail) : ""}</div>
    <div class="resize" title="Cambiar duración"></div>
  `;

  grid.appendChild(block);
  shownBlocks++;
}

      if(q && shownBlocks===0){
        const hhay = `${formatDayTitle(d.date)} ${d.label||""} ${d.location||""}`.toLowerCase();
        if(!hhay.includes(q)) continue;
      }
      dayWrap.appendChild(head);
      dayWrap.appendChild(grid);
      board.appendChild(dayWrap);
    }

    if(q && !board.children.length){
      board.innerHTML = `<div class="muted">Sin resultados.</div>`;
    }
    bindScheduleDnD();
    setupScheduleTopScrollbar(); // ✅
  }

function bindScheduleDnD(){
  const board = el("schedBoard");
  if(!board) return;
  if(board.dataset.dndBound === "1") return;
  board.dataset.dndBound = "1";

  schedDrag = null;


  function getPxPerMin(){
    const zoom = Number(el("schedZoom")?.value || 90); // px por hora
    return zoom / 60;
  }

  function getItem(d, kind, id){
    ensureDayTimingMaps(d);
    if(kind === "scene"){
      return {
        start: Number.isFinite(d.times?.[id]) ? d.times[id] : 0,
        dur: Number.isFinite(d.durations?.[id]) ? d.durations[id] : 60
      };
    }
    const b = (d.blocks||[]).find(x=>x.id===id);
    return {
      start: Number.isFinite(b?.startMin) ? b.startMin : 0,
      dur: Number.isFinite(b?.durMin) ? b.durMin : 30,
      block: b || null
    };
  }

  function setItem(d, kind, id, start, dur){
    ensureDayTimingMaps(d);
    if(kind === "scene"){
      d.times[id] = start;
      d.durations[id] = dur;
      return;
    }
    const b = (d.blocks||[]).find(x=>x.id===id);
    if(b){
      b.startMin = start;
      b.durMin = dur;
    }
  }

  board.addEventListener("pointerdown", (e)=>{
    const block = e.target.closest(".schedBlock");
    if(!block) return;

    const isResize = !!e.target.closest(".resize");

    const ro = isReadOnly();
    if(ro && isResize){ roToast(); return; }

    const dayId = block.dataset.dayId;
    const kind = block.dataset.kind || (block.dataset.sceneId ? "scene" : "block");
    const itemId = block.dataset.itemId || block.dataset.sceneId || "";
    if(!dayId || !itemId) return;

    const d = getDay(dayId);
    if(!d) return;
    ensureDayTimingMaps(d);

    const snapMin = Number(el("schedSnap")?.value || 15);
    const pxPerMin = getPxPerMin();

    const grid = block.closest(".schedGrid");
    if(!grid) return;

    const rectBlock = block.getBoundingClientRect();
    const clickY = e.clientY - rectBlock.top;

    const it = getItem(d, kind, itemId);

    schedDrag = {
      pointerId: e.pointerId,
      el: block,
      fromGrid: grid,
      kind,
      itemId,
      dayId,
      mode: ro ? "tap" : (isResize ? "resize" : "move"),
      ro,
      snapMin,
      pxPerMin,
      grabOffsetMin: clamp(clickY / pxPerMin, 0, it.dur),
      dur0: it.dur,
      start0: it.start,
      targetDayId: dayId,
      newStart: it.start,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false
    };

    try{ block.setPointerCapture(e.pointerId); }catch(_){}
    if(!ro) e.preventDefault();
  });

  board.addEventListener("pointermove", (e)=>{
    if(!schedDrag || schedDrag.pointerId !== e.pointerId) return;
    if(!schedDrag.ro) e.preventDefault();

    const drag = schedDrag;

    if(!drag.moved){
      const dx = Math.abs(e.clientX - drag.startClientX);
      const dy = Math.abs(e.clientY - drag.startClientY);
      if(dx > 4 || dy > 4){
        drag.moved = true;
        schedTap = null;
      }
    }

    if(drag.ro || isReadOnly()) return;

    const pxPerMin = getPxPerMin();
    drag.pxPerMin = pxPerMin; // por si cambió el zoom mientras arrastra

    const allGrids = [...board.querySelectorAll(".schedGrid")];
    let targetGrid = null;
    for(const g of allGrids){
      const r = g.getBoundingClientRect();
      if(e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom){
        targetGrid = g;
        break;
      }
    }
    targetGrid = targetGrid || drag.fromGrid;

    const targetDayId = targetGrid.dataset.dayId || drag.dayId;
    const targetDay = getDay(targetDayId);
    if(!targetDay) return;
    ensureDayTimingMaps(targetDay);

    const call = targetDay.callTime || "08:00";
    const baseHour = getScheduleBoardBaseHour();
    const preOffset = minutesFromHHMM(call) - baseHour;

    const rect = targetGrid.getBoundingClientRect();
    const y = clamp(e.clientY - rect.top, 0, rect.height);

    if(drag.mode === "resize"){
      if(targetDayId !== drag.dayId) return; // resize solo dentro del mismo día
      const d = getDay(drag.dayId);
      if(!d) return;
      ensureDayTimingMaps(d);

      const span = Math.max(5, dayplanAvailSpan(d));

      const cur = getItem(d, drag.kind, drag.itemId);
      const startMin = cur.start;

      let dur = (y/pxPerMin - preOffset) - startMin;
      dur = snap(dur, drag.snapMin);
      dur = clamp(dur, drag.snapMin, Math.max(drag.snapMin, span - startMin));

      setItem(d, drag.kind, drag.itemId, startMin, dur);
      resolveOverlapsPushDown(d, drag.snapMin);
      updateScheduleDayDOM(drag.dayId);
      return;
    }

    // move
    let newStart = (y/pxPerMin - preOffset) - drag.grabOffsetMin;
    newStart = snap(newStart, drag.snapMin);
    const tSpan = Math.max(5, dayplanAvailSpan(targetDay));
    newStart = clamp(newStart, 0, Math.max(0, tSpan - drag.dur0));

    // reparent visual if day changes
    if(targetGrid !== drag.el.parentElement){
      targetGrid.appendChild(drag.el);
      drag.el.dataset.dayId = targetDayId;
    }

    drag.el.style.top = `${(preOffset + newStart) * pxPerMin}px`;

    drag.targetDayId = targetDayId;
    drag.newStart = newStart;
  });

  function end(e){
    if(!schedDrag || schedDrag.pointerId !== e.pointerId) return;
    const d0 = schedDrag;
    schedDrag = null;

    const roEnd = !!d0.ro || isReadOnly();

    // Si fue solo click (sin drag), no tocamos layout: permite doble click y evita re-render innecesario
    if((d0.mode === "move" || d0.mode === "tap") && !d0.moved){
      const now = Date.now();
      if(d0.kind === "scene" && d0.itemId){
        if(schedTap && schedTap.sceneId === d0.itemId && (now - schedTap.t) < 380){
          schedTap = null;
          jumpToSceneInBreakdown(d0.itemId);
        }else{
          schedTap = { sceneId: d0.itemId, t: now };
        }
      }else{
        schedTap = null;
      }
      return;
    }
    if(d0.mode === "resize" && !d0.moved){
      return;
    }

    if(roEnd) return;

    const fromDay = getDay(d0.dayId);
    if(!fromDay) return;
    ensureDayTimingMaps(fromDay);

    if(d0.mode === "resize"){
      touch();
      renderScheduleBoard();
      renderDayPlan();
      renderDayDetail();
      renderReportsDetail();
      renderReports();
      return;
    }

    const toDayId = d0.targetDayId || d0.dayId;
    const newStart = Number.isFinite(d0.newStart) ? d0.newStart : d0.start0;

    if(toDayId !== d0.dayId){
      const toDay = getDay(toDayId);
      if(!toDay) return;
      ensureDayTimingMaps(toDay);

      if(d0.kind === "scene"){
        const sid = d0.itemId;
        const keepDur = fromDay.durations?.[sid] ?? d0.dur0;

        fromDay.sceneIds = (fromDay.sceneIds||[]).filter(x=>x!==sid);
        delete fromDay.times[sid];
        delete fromDay.durations[sid];

        if(!toDay.sceneIds.includes(sid)) toDay.sceneIds.push(sid);
        toDay.times[sid] = newStart;
        toDay.durations[sid] = keepDur;

        resolveOverlapsPushDown(fromDay, d0.snapMin);
        resolveOverlapsPushDown(toDay, d0.snapMin);
      }else{
        const bid = d0.itemId;
        const idx = (fromDay.blocks||[]).findIndex(b=>b.id===bid);
        if(idx>=0){
          const moved = fromDay.blocks.splice(idx,1)[0];
          moved.startMin = newStart;
          moved.durMin = clamp(moved.durMin ?? d0.dur0, 5, Math.max(5, dayplanAvailSpan(toDay)));
          toDay.blocks = (toDay.blocks||[]);
          toDay.blocks.push(moved);
          resolveOverlapsPushDown(fromDay, d0.snapMin);
          resolveOverlapsPushDown(toDay, d0.snapMin);
        }
      }
    }else{
      const cur = getItem(fromDay, d0.kind, d0.itemId);
      setItem(fromDay, d0.kind, d0.itemId, newStart, cur.dur);
      resolveOverlapsPushDown(fromDay, d0.snapMin);
    }

    touch();
    renderScheduleBoard();
    renderDayPlan();
    renderDayDetail();
    renderReportsDetail();
    renderReports();
  }

  board.addEventListener("pointerup", end);
  board.addEventListener("pointercancel", end);
}



function updateScheduleDayDOM(dayId){
  const escId = (()=>{
    try{ return (window.CSS && CSS.escape) ? CSS.escape(dayId) : String(dayId).replace(/[^a-zA-Z0-9_-]/g, "_"); }
    catch{ return String(dayId).replace(/[^a-zA-Z0-9_-]/g, "_"); }
  })();

  const grid = document.querySelector(`.schedGrid[data-day-id="${escId}"]`);
  if(!grid) return;
  const d = getDay(dayId);
  if(!d) return;
  ensureDayTimingMaps(d);

  const snapMin = Number(el("schedSnap")?.value || 15);
  const zoom = Number(el("schedZoom")?.value || 90); // px por hora
  const pxPerMin = zoom / 60;

  const baseHour = getScheduleBoardBaseHour();
  const preOffset = minutesFromHHMM(d.callTime || "08:00") - baseHour;

  // Normalizar overlaps (incluye bloques)
  resolveOverlapsPushDown(d, snapMin);

  for(const block of grid.querySelectorAll(".schedBlock")){
    const kind = block.dataset.kind || (block.dataset.sceneId ? "scene" : "block");
    const itemId = block.dataset.itemId || block.dataset.sceneId || "";
    if(!itemId) continue;

    let startMin = 0;
    let durMin = snapMin;

    if(kind === "scene"){
      startMin = d.times?.[itemId] ?? 0;
      durMin = d.durations?.[itemId] ?? 60;
    }else{
      const b = (d.blocks||[]).find(x=>x.id===itemId);
      startMin = b?.startMin ?? 0;
      durMin = b?.durMin ?? 30;
    }

    const top = (preOffset + startMin) * pxPerMin;
    const height = Math.max(34, durMin * pxPerMin);
    block.style.top = `${top}px`;
    block.style.height = `${height}px`;

    const meta = block.querySelector(".meta");
    if(meta){
      meta.textContent = `${clockLabelFromCall(d, startMin)} · ${formatDuration(durMin)}`;
    }
  }
}



  function shotDurMin(sh){
    const n = Number(sh?.durMin);
    return (Number.isFinite(n) && n>0) ? n : DEFAULT_SHOT_MIN;
  }

  function sceneShotsTotalMin(scene){
    if(!scene) return 0;
    ensureSceneExtras(scene);
    let total = 0;
    for(const sh of (scene.shots||[])) total += shotDurMin(sh);
    return total;
  }

  function syncDayDurationsFromShots(day, snapMin=15){
    if(!day) return false;
    if(isReadOnly()) return false;
    ensureDayTimingMaps(day);
    let changed = false;
    for(const sid of (day.sceneIds||[])){
      const sc = getScene(sid);
      if(!sc) continue;
      const shotsMin = sceneShotsTotalMin(sc);
      if(!shotsMin) continue;
      const cur = Number(day.durations?.[sid] ?? 0) || 0;
      if(cur < shotsMin){
        day.durations[sid] = shotsMin;
        changed = true;
      }
    }
    if(changed){
      resolveOverlapsPushDown(day, snapMin);
    }
    return changed;
  }

  function syncAllDaysDurationsFromShotsForScene(sceneId, snapMin=15){
    if(!sceneId) return false;
    let changed = false;
    for(const d of state.shootDays){
      if((d.sceneIds||[]).includes(sceneId)){
        if(syncDayDurationsFromShots(d, snapMin)) changed = true;
      }
    }
    return changed;
  }

  

  // ===================== Plan de Rodaje (vista diaria: escenas + notas) =====================
  let dayplanSelectedKey = null; // primary
  let dayplanSelectedKeys = new Set();
  let dayplanAnchorKey = null;
  let dayplanPaletteKey = null;
  let dayplanPointer = null;

  // Doble click robusto (sobrevive re-renders del timeline)
  let dayplanLastTapId = null;
  let dayplanLastTapAt = 0;

  let dayplanMetaOpen = false;

  const DAYPLAN_PPM = 1.2; // px por minuto (altura total ~1728px)
  const DAYPLAN_COLORS = [
    "#9CA3AF", // gris (más fuerte)
    "#F59E0B", // amarillo
    "#F97316", // naranja
    "#EF4444", // rojo
    "#EC4899", // rosa
    "#8B5CF6", // violeta
    "#3B82F6", // azul
    "#22C55E"  // verde
  ];


  function safeHexColor(c, fallback="#bdbdbd"){
    const s = String(c||"").trim();
    if(/^#[0-9a-fA-F]{6}$/.test(s)) return s;
    return fallback;
  }

  function hexToRgba(hex, a=0.22){
    const h = safeHexColor(hex, "#bdbdbd").slice(1);
    const r = parseInt(h.slice(0,2),16);
    const g = parseInt(h.slice(2,4),16);
    const b = parseInt(h.slice(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // ===== Plan de Rodaje: línea roja "ahora" =====
  let _dpNowTimer = null;

  function localISODate(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${dd}`;
  }

  function computeDayplanNowTopPx(day){
    try{
      if(!day || !day.date) return null;
      const now = new Date();
      const todayIso = localISODate(now);
      const dayIso = String(day.date);

      // Si el día tiene horario nocturno, entre 00:00 y 06:00 la "hora actual" puede pertenecer al día anterior.
      // Ej: Día 2026-02-02 con nocturno, y ahora es 2026-02-03 02:00 => mostrar línea en +24.
      let nowAbs = null;
      const nowMin = now.getHours()*60 + now.getMinutes();

      if(todayIso === dayIso){
        nowAbs = nowMin;
      }else if(day.night){
        const y = new Date(now.getTime());
        y.setDate(y.getDate() - 1);
        const yIso = localISODate(y);
        if(yIso === dayIso && nowMin <= NIGHT_EXT_MIN){
          nowAbs = DAY_SPAN_MIN + nowMin;
        }
      }
      if(nowAbs == null) return null;

      const base0 = minutesFromHHMM(day.callTime || "08:00");
      const dpStartAbs = Math.floor(base0/60)*60;
      const endAbs = dayplanEndAbs(day);
      const spanMin = endAbs - dpStartAbs;
      const ppm = getDayplanPPM() || DAYPLAN_PPM;
      const maxPx = spanMin * ppm;
      const top = (nowAbs - dpStartAbs) * ppm;
      if(top < 0 || top > maxPx) return null;
      return Math.round(top);
    }catch(_e){
      return null;
    }
  }

  function ensureDayplanNowTicker(){
    if(_dpNowTimer) return;
    _dpNowTimer = setInterval(()=>{
      if(document.hidden) return;
      updateDayplanNowLine();
    }, 30_000);
  }

  function updateDayplanNowLine(){
    const lane = el("dpLane");
    const view = el("view-dayplan");
    if(!lane || !view || view.classList.contains("hidden")) return;
    const d = getDay(selectedDayplanDayId);
    const top = computeDayplanNowTopPx(d);
    const line = lane.querySelector(".dpNowLine");
    if(top == null){
      if(line) line.remove();
      return;
    }
    if(line){
      line.style.top = `${top}px`;
    }else{
      lane.insertAdjacentHTML("afterbegin", `<div class="dpNowLine" style="top:${top}px"><span class="dpNowDot"></span></div>`);
    }
  }


  function getDayplanSnap(){
    const a = Number(el("dayplanSnap")?.value || 0);
    const b = Number(el("schedSnap")?.value || 0);
    return (a || b || 15);
  }


  function snapCeil(v, step){ return Math.ceil(v/step)*step; }
  function snapFloor(v, step){ return Math.floor(v/step)*step; }

  function getDayplanZoomPxPerHour(){
    const sel = el("dayplanZoom");
    let v = Number(sel?.value || 0);
    if(!v){
      const st = Number(localStorage.getItem("gb_dayplan_zoom")||0);
      if(st) v = st;
    }
    if(!Number.isFinite(v) || v<=0) v = 72;
    return v;
  }

  function getDayplanPPM(){
    const pxH = getDayplanZoomPxPerHour();
    return pxH/60;
  }

  function buildDayplanItems(d){
    ensureDayTimingMaps(d);
    const items = [];

    for(const sid of (d.sceneIds||[])){
      const sc = getScene(sid);
      if(!sc) continue;
      const pagesNum = Number(sc.pages) || 0;
items.push({
  key:`scene:${sid}`,
  kind:"scene",
  id:sid,
  start: Number(d.times?.[sid] ?? 0) || 0,
  dur: Number(d.durations?.[sid] ?? 60) || 0,

  number: sc.number || "",
  slugline: sc.slugline || "",
  intExt: sc.intExt || "",
  location: sc.location || "",
  timeOfDay: sc.timeOfDay || "",
  pages: pagesNum,
  summary: sc.summary || "",
  notes: sc.notes || "",

  title: `#${sc.number||""} ${sc.slugline||""}`.trim(),
  detail: [
    sc.intExt||"",
    sc.location||"",
    sc.timeOfDay||"",
    pagesNum > 0 ? `${fmtPages(pagesNum)} pág` : ""
  ].filter(Boolean).join(" · "),
  color: d.sceneColors?.[sid] || ""
});
}

    for(const b of (d.blocks||[])){
      items.push({
        key:`block:${b.id}`,
        kind:"block",
        id:b.id,
        start: Number(b.startMin ?? 0) || 0,
        dur: Number(b.durMin ?? 0) || 0,
        title: b.title || "Nota",
        detail: b.detail || "",
        color: b.color || ""
      });
    }

    items.sort((a,b)=> (a.start||0) - (b.start||0));
    return items;
  }

  function setDayplanStart(d, kind, id, startMin){
    if(kind === "scene"){
      d.times[id] = startMin;
      return;
    }
    const b = (d.blocks||[]).find(x=>x.id===id);
    if(b) b.startMin = startMin;
  }

  function setDayplanDur(d, kind, id, durMin){
    if(kind === "scene"){
      d.durations[id] = durMin;
      return;
    }
    const b = (d.blocks||[]).find(x=>x.id===id);
    if(b) b.durMin = durMin;
  }

  function finalizeDayplanGroupMove(d, selKeys){
    // Mantiene el grupo seleccionado unido: primero lo corre hacia abajo lo mínimo necesario
    // para que ninguno quede "después" de un item no-seleccionado que lo solape; luego empuja el resto.
    if(!d) return;
    ensureDayTimingMaps(d);

    const snapMin = getDayplanSnap();
    const base = minutesFromHHMM(d.callTime || "08:00");
    const dpEndAbs = dayplanEndAbs(d);
    const availSpan = Math.max(0, dpEndAbs - base);

    const sel = new Set(selKeys || []);
    if(!sel.size) { resolveOverlapsPushDown(d, snapMin); return; }

    const items = buildDayplanItems(d);
    const selected = items.filter(it=>sel.has(it.key));
    if(selected.length < 2){ resolveOverlapsPushDown(d, snapMin); return; }

    const getDur = (it, startOff)=>{
      const absStart = clamp(base + startOff, base, dpEndAbs);
      return clamp(Math.max(snapMin, it.dur||snapMin), snapMin, Math.max(snapMin, dpEndAbs - absStart));
    };

    // cuánto hay que correr el grupo para que ningún seleccionado quede "atrapado" detrás de un no-seleccionado
    let needed = 0;
    for(const s of selected){
      const sStart0 = clamp(s.start||0, 0, availSpan);
      const sAbs = base + sStart0;

      for(const o of items){
        if(sel.has(o.key)) continue;
        const oStart0 = clamp(o.start||0, 0, availSpan);
        const oAbs = base + oStart0;

        if(oAbs < sAbs){
          const oDur = getDur(o, oStart0);
          const oEnd = Math.min(dpEndAbs, oAbs + oDur);
          if(oEnd > sAbs){
            needed = Math.max(needed, oEnd - sAbs);
          }
        }
      }
    }

    if(needed > 0){
      needed = snapCeil(needed, snapMin);

      // clamp por límite del día (no pasarse de medianoche)
      let maxShift = Infinity;
      for(const s of selected){
        const sStart0 = clamp(s.start||0, 0, availSpan);
        const sDur = getDur(s, sStart0);
        const maxStart = availSpan - sDur;
        maxShift = Math.min(maxShift, maxStart - sStart0);
      }
      needed = clamp(needed, 0, maxShift);

      if(needed > 0){
        for(const s of selected){
          const sStart0 = clamp(s.start||0, 0, availSpan);
          const sDur = getDur(s, sStart0);
          const maxStart = availSpan - sDur;
          const newStart = clamp(sStart0 + needed, 0, maxStart);
          setDayplanStart(d, s.kind, s.id, newStart);
        }
      }
    }

    resolveOverlapsPushDown(d, snapMin);
  }

  function addDayplanNote(){
    const dayId = selectedDayplanDayId || selectedDayId || state.shootDays?.[0]?.id || null;
    const d = dayId ? getDay(dayId) : null;
    if(!d) return toast("No hay día seleccionado.");
    ensureDayTimingMaps(d);
    const snapMin = getDayplanSnap();

    const items = buildDayplanItems(d);
    let lastEnd = 0;
    for(const it of items) lastEnd = Math.max(lastEnd, (it.start||0) + (it.dur||0));

    d.blocks.push({
      id: uid("blk"),
      title: "Nueva tarea",
      detail: "",
      startMin: snap(lastEnd, snapMin),
      durMin: snapMin,
      color: "#bdbdbd"
    });

    resolveOverlapsPushDown(d, snapMin);
    touch();
    renderDayPlan();
    renderScheduleBoard();
    renderReportsDetail();
    renderReports();
    toast("Agregada ✅");
  }

  function deleteDayplanBlock(dayId, blockId){
    const d = getDay(dayId);
    if(!d) return;
    d.blocks = (d.blocks||[]).filter(b=>b.id!==blockId);
    resolveOverlapsPushDown(d, getDayplanSnap());
    touch();
    renderDayPlan();
    renderScheduleBoard();
    renderReportsDetail();
    renderReports();
  }

  function renderDayPlan(){
    const sel = el("dayplanSelect");
    const head = el("dayplanHead");
    const timeCol = el("dpTimeCol");
    const lane = el("dpLane");
    const scroller = el("dpScroller");
    const inspector = el("dayplanInspector");
    const printWrap = el("dayplanPrint");
    if(!sel || !head || !timeCol || !lane || !scroller || !inspector || !printWrap) return;

    // Init zoom selector from localStorage
    const zSel = el("dayplanZoom");
    if(zSel && zSel.dataset.init !== "1"){
      const st = localStorage.getItem("gb_dayplan_zoom");
      if(st) zSel.value = st;
      zSel.dataset.init = "1";
    }

    sortShootDaysInPlace();

    // selector de día
    sel.innerHTML = "";
    for(const d0 of state.shootDays){
      const opt = document.createElement("option");
      opt.value = d0.id;
      const main = formatDayTitle(d0.date);
      opt.textContent = `${main}${d0.label ? " · "+d0.label : ""}`;
      sel.appendChild(opt);
    }

    selectedDayplanDayId = selectedDayplanDayId || selectedDayId || state.shootDays?.[0]?.id || null;
    selectedDayId = selectedDayplanDayId; // mantener sync con Call Diario
    if(!selectedDayplanDayId || !state.shootDays.some(x=>x.id===selectedDayplanDayId)){
      selectedDayplanDayId = state.shootDays?.[0]?.id || null;
    }
    if(selectedDayplanDayId) sel.value = selectedDayplanDayId;

    const d = selectedDayplanDayId ? getDay(selectedDayplanDayId) : null;
    if(!d){
      head.innerHTML = `<div class="muted">No hay días cargados.</div>`;
      timeCol.innerHTML = "";
      lane.innerHTML = "";
      inspector.innerHTML = "";
      printWrap.innerHTML = "";
      return;
    }

    ensureDayTimingMaps(d);
    const snapMin = getDayplanSnap();
    const base = minutesFromHHMM(d.callTime || "08:00"); // minutos absolutos del día
    const dpStartAbs = Math.floor(base/60)*60; // arranca en la hora exacta (hacia abajo)
    const dpEndAbs = dayplanEndAbs(d); // hasta 24:00 (o 06:00 del día siguiente)
    const dpSpanMin = dpEndAbs - dpStartAbs;
    const items = buildDayplanItems(d);

    // Preservar botones de acciones del día (si están dentro del header, innerHTML los destruiría)
    const preservedNightBtn = el("btnDayplanNight");
    const preservedDeleteBtn = el("btnDeleteShootDay");
    const preserveFrag = document.createDocumentFragment();
    if(preservedNightBtn) preserveFrag.appendChild(preservedNightBtn);
    if(preservedDeleteBtn) preserveFrag.appendChild(preservedDeleteBtn);

    // Toggle UI "Horario nocturno"
    if(preservedNightBtn){
      preservedNightBtn.classList.toggle("toggleOn", !!d.night);
      preservedNightBtn.textContent = d.night ? "Horario nocturno ✓" : "Horario nocturno";
    }


    // Header (día seleccionado)
    const proj = esc(state.meta?.title || "Proyecto");
    const dayTxt = `${formatDayTitle(d.date)}${d.label ? " · "+esc(d.label) : ""}`;
    const eattr = (s)=>esc(String(s||"")).replace(/"/g,"&quot;");

    head.innerHTML = `
  <div class="dayplanHeader">
    <div class="dpTitle">
      <div class="dpProj">${proj}</div>
      <div class="dpRowLine">
        <button class="dpDayBtn" id="dpDayTitleBtn" type="button" title="Editar detalle del día">${dayTxt}</button>
        <div class="dpBadges" id="dpDayBadges">
          <span class="metaPill"><b>Call</b> ${esc(d.callTime || "—")}</span>
          <span class="metaPill"><b>Locación</b> ${esc(d.location || "—")}</span>
          ${d.night ? `<span class="metaPill"><b>Nocturno</b> hasta 06:00</span>` : ""}
        </div>
      </div>
    </div>

    <div class="dpRight">
      <div class="dpActions noPrint">
        <div class="row gap" style="align-items:center; flex-wrap:wrap; justify-content:flex-end;">
          <div id="dpDayNightMount"></div>
          <div id="dpDayDeleteMount"></div>
        </div>
      </div>

      <div class="dpMeta">
        <div class="muted small">${esc((d.notes||"").trim() ? (d.notes||"").trim() : "Click en el título para editar fecha, call time, locación, nombre y notas.")}</div>
      </div>
    </div>
  </div>

  <div class="dayMetaEditor noPrint" id="dpDayMetaEditor" style="display:${dayplanMetaOpen ? "block" : "none"};">
    <div class="dayMetaGrid">
      <div class="field">
        <label>Fecha</label>
        <div class="dateDual">
          <input class="input" id="dp_day_date_display" type="text" inputmode="numeric" placeholder="dd/mm/aaaa" value="${eattr(formatDDMMYYYY(d.date))}"/>
          <button class="btn icon datePickBtn" id="dp_day_date_pick" type="button" title="Elegir fecha">📅</button>
          <input class="input hiddenDate" id="dp_day_date" type="date" value="${eattr(d.date||"")}"/>
        </div>
      </div>

      <div class="field">
        <label>Call Time</label>
        <div class="row gap">
          <button class="btn icon" id="dp_day_call_minus" title="-15">−</button>
          <input class="input grow" id="dp_day_call" placeholder="08:00" value="${eattr(d.callTime||"")}"/>
          <button class="btn icon" id="dp_day_call_plus" title="+15">+</button>
        </div>
      </div>

      <div class="field">
        <label>Locación</label>
        <input class="input" id="dp_day_location" value="${eattr(d.location||"")}"/>
      </div>

      <div class="field">
        <label>Nombre</label>
        <input class="input" id="dp_day_label" value="${eattr(d.label||"")}"/>
      </div>

      <div class="field dayMetaNotes">
        <label>Notas</label>
        <textarea class="textarea smallArea" id="dp_day_notes">${esc(d.notes||"")}</textarea>
      </div>
    </div>
  </div>
`;

    // Montar acciones del día (reusamos los botones existentes para no perder listeners)
    try{
      const nightBtn = preservedNightBtn;
      const delBtn = preservedDeleteBtn;
      const nightMount = head.querySelector("#dpDayNightMount");
      const delMount = head.querySelector("#dpDayDeleteMount");
      if(nightBtn && nightMount){
        nightMount.innerHTML = "";
        nightMount.appendChild(nightBtn);
        nightBtn.classList.remove("full");
      }
      if(delBtn && delMount){
        delMount.innerHTML = "";
        delMount.appendChild(delBtn);
        delBtn.classList.remove("full");
      }
    }catch(_e){}

    // Bind del editor de Detalle del Día (delegado en el header para sobrevivir re-render)
    if(head.dataset.metaBound !== "1"){
      head.dataset.metaBound = "1";

      const liteSave = window.U.debounce(()=>{ touch(); }, 450);

      const fullRefresh = ()=>{
        sortShootDaysInPlace();
        touch();
        renderDayPlan();
        renderDayDetail();
        renderReports();
        renderScheduleBoard();
        renderCallSheetCalendar();
        renderReportsDetail();
      };

      head.addEventListener("click", (e)=>{
        const d0 = selectedDayplanDayId ? getDay(selectedDayplanDayId) : null;
        if(!d0) return;

        // Toggle editor (click en el título del día)
        const titleBtn = e.target?.closest && e.target.closest("#dpDayTitleBtn");
        if(titleBtn){
          dayplanMetaOpen = !dayplanMetaOpen;
          const box = head.querySelector("#dpDayMetaEditor");
          if(box) box.style.display = dayplanMetaOpen ? "block" : "none";
          return;
        }

        if(e.target && e.target.id === "dp_day_call_minus"){
          d0.callTime = hhmmFromMinutes(minutesFromHHMM(d0.callTime||"08:00") - 15);
          const inp = head.querySelector("#dp_day_call");
          if(inp) inp.value = d0.callTime;
          cleanupDayCallTimes(d0);
          fullRefresh();
          return;
        }
        if(e.target && e.target.id === "dp_day_call_plus"){
          d0.callTime = hhmmFromMinutes(minutesFromHHMM(d0.callTime||"08:00") + 15);
          const inp = head.querySelector("#dp_day_call");
          if(inp) inp.value = d0.callTime;
          cleanupDayCallTimes(d0);
          fullRefresh();
          return;
        }

        const pickBtn = e.target.closest && e.target.closest("#dp_day_date_pick");
        if(pickBtn){
          const hid = head.querySelector("#dp_day_date");
          if(!hid) return;

          if(typeof hid.showPicker === "function"){
            try{ hid.showPicker(); return; }catch(err){}
          }

          const r = pickBtn.getBoundingClientRect();
          const prev = {
            position: hid.style.position || "",
            left: hid.style.left || "",
            top: hid.style.top || "",
            width: hid.style.width || "",
            height: hid.style.height || "",
            opacity: hid.style.opacity || "",
            pointerEvents: hid.style.pointerEvents || "",
            zIndex: hid.style.zIndex || ""
          };

          hid.style.position = "fixed";
          hid.style.left = `${Math.round(r.left)}px`;
          hid.style.top = `${Math.round(r.top)}px`;
          hid.style.width = `${Math.max(1, Math.round(r.width))}px`;
          hid.style.height = `${Math.max(1, Math.round(r.height))}px`;
          hid.style.opacity = "0";
          hid.style.pointerEvents = "auto";
          hid.style.zIndex = "9999";

          hid.focus({ preventScroll:true });
          hid.click();

          setTimeout(()=>{ Object.assign(hid.style, prev); }, 700);
        }
      });

      head.addEventListener("input", (e)=>{
        const d0 = selectedDayplanDayId ? getDay(selectedDayplanDayId) : null;
        if(!d0) return;

        const id = e.target?.id;
        if(id === "dp_day_location"){
          d0.location = e.target.value;
          const badges = head.querySelector("#dpDayBadges");
          if(badges){
            const pills = badges.querySelectorAll(".metaPill");
            if(pills[1]) pills[1].innerHTML = `<b>Locación</b> ${esc(d0.location || "—")}`;
          }
          liteSave();
        }
        if(id === "dp_day_label"){
          d0.label = e.target.value;
          const t = head.querySelector("#dpDayTitleBtn");
          if(t) t.textContent = `${formatDayTitle(d0.date)}${d0.label ? " · "+d0.label : ""}`;
          liteSave();
        }
        if(id === "dp_day_notes"){ d0.notes = e.target.value; liteSave(); }
      });

      head.addEventListener("change", (e)=>{
        const d0 = selectedDayplanDayId ? getDay(selectedDayplanDayId) : null;
        if(!d0) return;

        const id = e.target?.id;
        if(id === "dp_day_call"){
          d0.callTime = (e.target.value||"").trim();
          e.target.value = d0.callTime;
          cleanupDayCallTimes(d0);
          fullRefresh();
        }
        if(id === "dp_day_date"){
          const iso = (e.target.value||"").trim();
          if(!iso) return;
          d0.date = iso;
          const disp = head.querySelector("#dp_day_date_display");
          if(disp) disp.value = formatDDMMYYYY(iso);
          fullRefresh();
        }
      });

      head.addEventListener("keydown", (e)=>{
        if(e.target?.id === "dp_day_date_display" && e.key === "Enter"){
          e.preventDefault();
          e.target.blur();
        }
        if(e.target?.id === "dp_day_call" && e.key === "Enter"){
          e.preventDefault();
          e.target.blur();
        }
      });

      head.addEventListener("focusout", (e)=>{
        const d0 = selectedDayplanDayId ? getDay(selectedDayplanDayId) : null;
        if(!d0) return;

        const id = e.target?.id;
        if(id === "dp_day_date_display"){
          const iso = parseDDMMYYYY(e.target.value||"");
          if(iso){
            d0.date = iso;
            const hid = head.querySelector("#dp_day_date");
            if(hid) hid.value = iso;
            e.target.value = formatDDMMYYYY(iso);
            fullRefresh();
          }else{
            e.target.value = formatDDMMYYYY(d0.date);
          }
          return;
        }

        if(id === "dp_day_location" || id === "dp_day_label" || id === "dp_day_notes"){
          fullRefresh();
        }
      });
    }

    const call = esc(d.callTime || "");
    const loc = esc(d.location || "");

    // Timeline sizing
    const ppm = getDayplanPPM() || DAYPLAN_PPM;
    scroller.dataset.ppm = String(ppm);
    const dayH = Math.round(dpSpanMin * ppm);
    scroller.style.setProperty("--dp-day-h", dayH+"px");
    timeCol.style.height = dayH+"px";
    lane.style.height = dayH+"px";

// Hour labels
const hourLabels = [];
for(let m=dpStartAbs; m<=dpEndAbs; m+=60){
  const top = Math.round((m - dpStartAbs) * ppm);
  const label = clockLabelAbs(m);
  hourLabels.push(`<div class="dpTimeLabel" style="top:${top}px">${label}</div>`);
}
timeCol.innerHTML = hourLabels.join("");


// Grid lines (cada 30m)
const grid = [];
for(let m=dpStartAbs; m<=dpEndAbs; m+=30){
  const rel = m - dpStartAbs;
  const top = Math.round(rel*ppm);
  const cls = (m%60===0) ? "dpLine hour" : "dpLine half";
  grid.push(`<div class="${cls}" style="top:${top}px"></div>`);
}

    const blocks = items.map((it)=>{
      const col = safeHexColor(it.color || (it.kind==="scene" ? "#BFDBFE" : "#E5E7EB"));
      const bg = hexToRgba(col, 0.75);
const absStart = clamp(base + (it.start||0), base, dpEndAbs - snapMin);
const dur = clamp(Math.max(snapMin, it.dur||snapMin), snapMin, dpEndAbs - absStart);
const absEnd = clamp(absStart + dur, absStart + snapMin, dpEndAbs);

const top = Math.round((absStart - dpStartAbs) * ppm);
const height = Math.max(Math.round((absEnd - absStart) * ppm), Math.round(snapMin*ppm));

      const startTxt = clockLabelAbs(absStart);
      const endTxt = clockLabelAbs(absEnd);
      const isSel = (dayplanSelectedKeys?.has?.(it.key) || dayplanSelectedKey === it.key);
      const showPal = (dayplanPaletteKey === it.key);

      const actionBtns = it.kind==="block"
        ? `<button class="dpMiniBtn noPrint" data-action="delete" title="Eliminar">🗑</button>`
        : `<button class="dpMiniBtn noPrint" data-action="removeScene" title="Quitar del Plan">🗑</button>
           <button class="dpMiniBtn noPrint" data-action="openScene" title="Abrir escena">↗</button>`;

      return `
        <div class="dpBlock ${isSel?"sel":""} ${showPal?"showPalette":""}"
             data-key="${eattr(it.key)}" data-kind="${eattr(it.kind)}" data-id="${eattr(it.id)}"
             style="top:${top}px;height:${height}px;background:${eattr(bg)};border-left:8px solid ${eattr(col)};">
          <div class="dpBlockBtns dpBlockBtns--abs">
              <button class="dpMiniBtn noPrint" data-action="palette" title="Color">🎨</button>
              ${actionBtns}
            </div>
<div class="dpBlockTitle">
  <span class="dpTime">${esc(startTxt)}–${esc(endTxt)}</span>
  ${
    it.kind==="scene"
      ? `<span class="dpNum">#${esc(it.number||"")}</span><span class="dpSlug">${esc(it.slugline||"")}</span>`
      : `<span class="dpSlug">${esc(it.title||"")}</span>`
  }
</div>

${
  it.kind==="scene"
    ? `
      <div class="dpBlockMeta">
        <div class="dpMetaItem"><div class="v">${esc(it.intExt||"—")}</div></div>
        <div class="dpMetaItem"><div class="v">${esc(it.location||"—")}</div></div>
        <div class="dpMetaItem"><div class="v">${esc(it.timeOfDay||"—")}</div></div>
      </div>
      ${(()=>{ const t = notesOrShortSummary(it.notes, it.summary); return t ? `<div class="dpBlockSummary">${esc(t)}</div>` : ``; })()}
    `
    : (it.detail ? `<div class="dpBlockDetail">${esc(it.detail)}</div>` : ``)
}

          <div class="dpPalettePop noPrint" data-role="palette">
            <div class="dpSwatches">
              ${DAYPLAN_COLORS.map(c=>`<button class="dpSwatchBtn" data-action="pickColor" data-color="${eattr(c)}" style="background:${eattr(c)}" title="${eattr(c)}"></button>`).join("")}
            </div>
          </div>

          <div class="dpResize noPrint" data-action="resize" title="Arrastrá para cambiar duración"></div>
        </div>
      `;
    }).join("");

    lane.innerHTML = grid.join("") + blocks;

    // Hover preview (igual que Cronograma + Planos)
    try{
      lane.querySelectorAll('.dpBlock[data-kind="scene"]').forEach((blk)=>{
        const sid = blk.dataset.id;
        const sc = sid ? getScene(sid) : null;
        if(sc) attachSceneHover(blk, sc, { includeShots:true, maxShots: 12 });
      });
    }catch(_e){}

    // Línea roja "ahora" (seguimiento)
    try{ ensureDayplanNowTicker(); updateDayplanNowLine(); }catch(_e){}

    // Drop desde Banco de Escenas → agrega/mueve la escena en el horario donde la soltás
    if(lane.dataset.sceneDropBound !== "1"){
      lane.dataset.sceneDropBound = "1";

      lane.addEventListener("dragover", (e)=>{
        try{
          const types = Array.from(e.dataTransfer?.types || []);
          if(types.includes("application/json")){
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            lane.classList.add("dpDropOver");
          }
        }catch(_e){}
      });

      lane.addEventListener("dragleave", ()=> lane.classList.remove("dpDropOver"));

      lane.addEventListener("drop", (e)=>{
        e.preventDefault();
        lane.classList.remove("dpDropOver");

        if(isReadOnly()){ roToast(); return; }

        let data = null;
        try{
          const raw = e.dataTransfer.getData("application/json");
          if(raw) data = JSON.parse(raw);
        }catch(_e){ data = null; }

        if(!data || data.type!=="scene" || !data.sceneId) return;

        const dayId = selectedDayplanDayId || selectedDayId || null;
        const d0 = dayId ? getDay(dayId) : null;
        if(!d0) return;

        const sid = data.sceneId;
        const alreadyInThisDay = (d0.sceneIds||[]).includes(sid);
        const curDay = sceneAssignedDayId(sid);

        if(curDay && curDay !== d0.id){
          removeSceneFromAllDays(sid);
        }

        ensureDayTimingMaps(d0);
        if(!alreadyInThisDay){
          d0.sceneIds.push(sid);
        }

        // calcular hora según el punto de suelta
        const snapMin0 = getDayplanSnap();
        const ppm0 = getDayplanPPM() || DAYPLAN_PPM;

        const base0 = minutesFromHHMM(d0.callTime || "08:00");
        const dpStartAbs0 = Math.floor(base0/60)*60;
        const dpEndAbs0 = dayplanEndAbs(d0);
        const availSpan0 = Math.max(0, dpEndAbs0 - base0);

        const rect = lane.getBoundingClientRect();
        const y = (e.clientY - rect.top) + (scroller?.scrollTop || 0);
        let abs = dpStartAbs0 + (y / ppm0);

        abs = clamp(abs, base0, dpEndAbs0 - snapMin0);
        let offset = abs - base0;
        offset = snap(offset, snapMin0);
        offset = clamp(offset, 0, Math.max(0, availSpan0 - snapMin0));

        d0.times[sid] = offset;
        d0.durations[sid] = d0.durations[sid] ?? 60;

        resolveOverlapsPushDown(d0, snapMin0);

        selectedDayId = d0.id; // sincroniza con Call Diario
        selectedDayplanDayId = d0.id;

        touch();
        renderSceneBank();
        renderDaysBoard();
        renderDayDetail();
        renderDayPlan();
        renderScheduleBoard();
        renderReportsDetail();
        renderReports();
        saveCallSheetCursor();
        renderCallSheetCalendar();
      });
    }


    // Print table (se ve solo al imprimir) — igual a Reportes
    const snapMinPrint = Number(el("schedSnap")?.value || snapMin || 15);

    const rows = items.map((it)=>{
      const absStart = clamp(base + (it.start||0), base, dpEndAbs - snapMinPrint);
      const durMax = Math.max(snapMinPrint, dpEndAbs - absStart);
      const dur = clamp(Math.max(snapMinPrint, it.dur||snapMinPrint), snapMinPrint, durMax);
      const absEnd = clamp(absStart + dur, base, dpEndAbs);
      const isNote = it.kind==="block";
      const col = safeHexColor(it.color || (it.kind==="scene" ? "#BFDBFE" : "#E5E7EB"));
      const bg = hexToRgba(col, isNote ? 0.10 : 0.12);
      const tA = clockLabelAbs(absStart);
      const tB = clockLabelAbs(absEnd);
      const clockHTML = `<div class="dpClock2"><div>${esc(tA)}</div><div>${esc(tB)}</div></div>`;
      const num = isNote ? "NOTA" : (it.number||"");
      const title = isNote ? (it.title||"") : (it.slugline||it.title||"");
      const ie = isNote ? "" : (it.intExt||"");
      const locTxt = isNote ? "" : (it.location||"");
      const todTxt = isNote ? "" : (it.timeOfDay||"");
      const sumTxt = isNote ? (it.detail||"") : (notesOrShortSummary(it.notes, it.summary) || "");
      return `
  <tr class="${isNote ? "dpPrintNote" : ""}" style="background:${eattr(bg)};border-left:8px solid ${eattr(col)};">
    <td class="cHour">${clockHTML}</td>
    <td class="cDur">${esc(formatDurHHMMCompact(dur))}</td>
    <td class="cNro">${esc(num)}</td>
    <td class="cTitle">${esc(title)}</td>
    <td class="cIE">${esc(ie)}</td>
    <td class="cLoc">${esc(locTxt)}</td>
    <td class="cTod">${esc(todTxt)}</td>
    <td class="cSum">${esc(sumTxt)}</td>
  </tr>
`;
    }).join("");

    printWrap.innerHTML = `
      <div class="catBlock dpPrintBlock">
        <div class="hdr"><span class="dot" style="background:var(--cat-vehicles)"></span>Plan de Rodaje</div>
        <div class="items">
          <div><b>${proj}</b> · ${dayTxt}</div>
          <div><b>Call:</b> ${call||"—"} &nbsp; <b>Locación:</b> ${loc||"—"}</div>
        </div>
        <div class="items">
          <table class="dayplanPrintTable">
            <colgroup>
              <col class="colHour"><col class="colDur"><col class="colNro"><col class="colTitle">
              <col class="colIE"><col class="colLoc"><col class="colTod"><col class="colSum">
            </colgroup>
            <thead><tr><th>Hora</th><th>Dur</th><th>Nro</th><th>Título</th><th>I/E</th><th>Locación</th><th>Momento</th><th>Notas</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="8" class="muted">—</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;
    renderDayplanInspector(d, items);

    // Bind interactions once
    if(!lane.dataset.bound){
      lane.dataset.bound = "1";

      // Clicks: seleccionar, paleta, delete, open
      lane.addEventListener("click", (e)=>{
        const block = e.target.closest(".dpBlock");
        if(!block) return;

        const d = selectedDayplanDayId ? getDay(selectedDayplanDayId) : null;
        if(!d) return;
        ensureDayTimingMaps(d);

        const key = block.dataset.key;
        const kind = block.dataset.kind;
        const id = block.dataset.id;

        const actEl = e.target.closest("[data-action]");
        const action = actEl?.dataset.action || "";


        if(!(dayplanSelectedKeys instanceof Set)) dayplanSelectedKeys = new Set();
        if(dayplanSelectedKey && dayplanSelectedKeys.size===0) dayplanSelectedKeys.add(dayplanSelectedKey);

        // Doble click (sin depender de `dblclick`): 2 taps rápidos sobre la misma escena → Breakdown
        if(action || kind !== "scene"){
          dayplanLastTapId = null;
          dayplanLastTapAt = 0;
        }else if(id){
          const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
          if(dayplanLastTapId === id && (now - dayplanLastTapAt) < 420){
            dayplanLastTapId = null; dayplanLastTapAt = 0;
            try{ e.preventDefault(); }catch(_e){}
            try{ e.stopPropagation(); }catch(_e){}
            jumpToSceneInBreakdown(id);
            return;
          }
          dayplanLastTapId = id;
          dayplanLastTapAt = now;
        }


        if(action === "palette"){
          dayplanPaletteKey = (dayplanPaletteKey === key) ? null : key;
          dayplanSelectedKeys.add(key);
          dayplanSelectedKey = key;
          dayplanAnchorKey = key;
          renderDayPlan();
          return;
        }
        if(action === "pickColor"){
          const col = safeHexColor(actEl.dataset.color);
          if(kind === "scene"){
            d.sceneColors[id] = col;
          }else{
            const b = (d.blocks||[]).find(x=>x.id===id);
            if(b) b.color = col;
          }
          dayplanPaletteKey = null;
          dayplanSelectedKeys.add(key);
          dayplanSelectedKey = key;
          dayplanAnchorKey = key;
          touch();
          renderDayPlan();
          renderScheduleBoard();
          renderReportsDetail();
          renderReports();
          return;
        }
        if(action === "delete" && kind === "block"){
          deleteDayplanBlock(selectedDayplanDayId, id);
          try{ dayplanSelectedKeys.delete(key); }catch(_e){}
          if(dayplanSelectedKey === key){
            dayplanSelectedKey = dayplanSelectedKeys.size ? Array.from(dayplanSelectedKeys).slice(-1)[0] : null;
          }
          dayplanPaletteKey = null;
          return;
        }
        if(action === "removeScene" && kind === "scene"){
          // Quita la escena de este día (no la borra del Breakdown)
          d.sceneIds = (d.sceneIds||[]).filter(x=>x!==id);
          if(d.times) delete d.times[id];
          if(d.durations) delete d.durations[id];
          if(d.sceneColors) delete d.sceneColors[id];

          selectedDayId = d.id;
          try{ dayplanSelectedKeys.delete(key); }catch(_e){}
          if(dayplanSelectedKey === key){
            dayplanSelectedKey = dayplanSelectedKeys.size ? Array.from(dayplanSelectedKeys).slice(-1)[0] : null;
          }
          dayplanPaletteKey = null;
          touch();
          renderSceneBank();
          renderDaysBoard();
          renderDayDetail();
          renderDayPlan();
          renderScheduleBoard();
          renderReports();
          saveCallSheetCursor();
          renderCallSheetCalendar();
          renderReportsDetail();
          return;
        }
        if(action === "openScene" && kind === "scene")
        {
          jumpToSceneInBreakdown(id);
          return;
        }

        // Selección (multi + rango)
        const ordered = buildDayplanItems(d);
        const multi = !!(e.ctrlKey || e.metaKey);
        const range = !!(e.shiftKey);

        if(!(dayplanSelectedKeys instanceof Set)) dayplanSelectedKeys = new Set();
        if(dayplanSelectedKey && dayplanSelectedKeys.size===0) dayplanSelectedKeys.add(dayplanSelectedKey);

        if(range && dayplanAnchorKey){
          const ia = ordered.findIndex(x=>x.key===dayplanAnchorKey);
          const ib = ordered.findIndex(x=>x.key===key);
          if(ia>=0 && ib>=0){
            const lo = Math.min(ia,ib), hi = Math.max(ia,ib);
            dayplanSelectedKeys = new Set(ordered.slice(lo,hi+1).map(x=>x.key));
            dayplanSelectedKey = key;
          }else{
            dayplanSelectedKeys = new Set([key]);
            dayplanSelectedKey = key;
            dayplanAnchorKey = key;
          }
        }else if(multi){
          if(dayplanSelectedKeys.has(key)){
            dayplanSelectedKeys.delete(key);
            if(dayplanSelectedKey === key){
              dayplanSelectedKey = dayplanSelectedKeys.size ? Array.from(dayplanSelectedKeys).slice(-1)[0] : null;
            }
          }else{
            dayplanSelectedKeys.add(key);
            dayplanSelectedKey = key;
          }
          dayplanAnchorKey = key;
        }else{
          dayplanSelectedKeys = new Set([key]);
          dayplanSelectedKey = key;
          dayplanAnchorKey = key;
        }

        dayplanPaletteKey = null;
        renderDayPlan();
      });

      // Doble click en una escena: ir directo al Breakdown de esa escena
      lane.addEventListener("dblclick", (e)=>{
        const block = e.target?.closest?.(".dpBlock");
        if(!block) return;
        if(block.dataset.kind !== "scene") return;
        if(e.target?.closest?.("[data-action]")) return;
        const id = block.dataset.id;
        if(!id) return;
        jumpToSceneInBreakdown(id);
      });

      // Drag / resize
      lane.addEventListener("pointerdown", (e)=>{
        const block = e.target.closest(".dpBlock");
        if(!block) return;

        const action = e.target.closest("[data-action]")?.dataset.action || "";
        if(action === "palette" || action === "pickColor" || action === "delete" || action === "removeScene" || action === "openScene") return;

        if(isReadOnly()) return;

        e.preventDefault();
        try{ block.setPointerCapture(e.pointerId); }catch(_){/*ignore*/}


        const dayId = selectedDayplanDayId || null;
        const d = dayId ? getDay(dayId) : null;
        if(!d) return;
        ensureDayTimingMaps(d);

const snapMin = getDayplanSnap();
const base = minutesFromHHMM(d.callTime || "08:00");
const dpStartAbs = Math.floor(base/60)*60;
const dpEndAbs = dayplanEndAbs(d);
const items = buildDayplanItems(d);
const ppm = getDayplanPPM() || DAYPLAN_PPM;

        const sc = el("dpScroller");
        const rect = sc.getBoundingClientRect();
        const y = (e.clientY - rect.top) + (sc?.scrollTop||0);
        const pressAbsMin = clamp(dpStartAbs + (y / ppm), dpStartAbs, dpEndAbs);

        const key = block.dataset.key;
        const kind = block.dataset.kind;
        const id = block.dataset.id;

        const it = items.find(x=>x.key===key);
        if(!it) return;

        // Selection for group drag (Ctrl/Cmd = multi, Shift = rango)
        if(!(dayplanSelectedKeys instanceof Set)) dayplanSelectedKeys = new Set();
        if(dayplanSelectedKey && dayplanSelectedKeys.size===0) dayplanSelectedKeys.add(dayplanSelectedKey);

        const wantsMulti = !!(e.ctrlKey || e.metaKey || e.shiftKey);
        if(!dayplanSelectedKeys.has(key) && !wantsMulti){
          dayplanSelectedKeys = new Set([key]);
          dayplanSelectedKey = key;
          dayplanAnchorKey = key;
          try{
            lane.querySelectorAll(".dpBlock.sel").forEach(x=>x.classList.remove("sel"));
            block.classList.add("sel");
          }catch(_e){}
        }else{
          dayplanSelectedKeys.add(key);
          dayplanSelectedKey = key;
          dayplanAnchorKey = key;
          try{ block.classList.add("sel"); }catch(_e){}
        }

        const selSet = dayplanSelectedKeys;
        const domMap = new Map();
        try{ lane.querySelectorAll(".dpBlock").forEach(b=> domMap.set(b.dataset.key, b)); }catch(_e){}
        const availSpan = Math.max(0, dpEndAbs - base);

        const selItems = items.filter(x=>selSet.has(x.key)).map(x=>{
          const start0 = clamp(x.start||0, 0, availSpan);
          const absStartX = clamp(base + start0, base, dpEndAbs);
          const durX = clamp(Math.max(snapMin, x.dur||snapMin), snapMin, Math.max(snapMin, dpEndAbs - absStartX));
          return { key:x.key, kind:x.kind, id:x.id, start0, dur0: durX, el: domMap.get(x.key) || null };
        });

        let minDelta = -Infinity;
        let maxDelta = Infinity;
        for(const s of selItems){
          const start0 = clamp(s.start0||0, 0, availSpan);
          const dur0i = clamp(Math.max(snapMin, s.dur0||snapMin), snapMin, Math.max(snapMin, availSpan - start0));
          const maxStart = availSpan - dur0i;
          minDelta = Math.max(minDelta, -start0);
          maxDelta = Math.min(maxDelta, maxStart - start0);
        }

        const absStart0 = clamp(base + (it.start||0), base, dpEndAbs);
        const dur0 = clamp(Math.max(snapMin, it.dur||snapMin), snapMin, Math.max(snapMin, dpEndAbs - absStart0));

        const mode = (action === "resize") ? "resize" : "drag";
        const grabOffset = clamp(pressAbsMin - absStart0, 0, dur0);
        const activeStart0 = clamp(it.start||0, 0, availSpan);

dayplanPointer = {
  dayId,
  base,
  dpStartAbs,
  dpEndAbs,
  snapMin,
  ppm,

          key, kind, id, mode,
          startY: y,
          pressAbsMin,
          grabOffset,
          absStart0,
          dur0,
          activeStart0,
          sel: selItems,
          minDelta,
          maxDelta,
          el: block
        };

        dayplanSelectedKeys.add(key);
        dayplanSelectedKey = key;
        dayplanAnchorKey = key;
        dayplanPaletteKey = null;
        block.setPointerCapture?.(e.pointerId);
        e.preventDefault();
      });

      lane.addEventListener("pointermove", (e)=>{
        if(!dayplanPointer) return;
        e.preventDefault();
        const sc = el("dpScroller");
        const rect = sc.getBoundingClientRect();
        const y = (e.clientY - rect.top) + (sc?.scrollTop||0);
        const p = dayplanPointer;

        const d = p.dayId ? getDay(p.dayId) : null;
        if(!d) return;
        ensureDayTimingMaps(d);

  const ppm = p.ppm || getDayplanPPM() || DAYPLAN_PPM;
  const snapMin = p.snapMin || getDayplanSnap();
  const base = p.base || minutesFromHHMM(d.callTime || "08:00");
  const dpStartAbs = Number.isFinite(p.dpStartAbs) ? p.dpStartAbs : Math.floor(base/60)*60;
  const dpEndAbs = Number.isFinite(p.dpEndAbs) ? p.dpEndAbs : dayplanEndAbs(d);
  const availSpan = Math.max(0, dpEndAbs - base);

  const absPos = dpStartAbs + (y/ppm);

  if(p.mode === "drag"){
    let absStart = absPos - p.grabOffset;
    absStart = snap(absStart, snapMin);

    // delta based on the active item, applied to the whole selection
    const activeOffsetRaw = absStart - base;
    let delta = activeOffsetRaw - (p.activeStart0||0);

    if(Number.isFinite(p.minDelta)) delta = Math.max(delta, p.minDelta);
    if(Number.isFinite(p.maxDelta)) delta = Math.min(delta, p.maxDelta);

    const group = Array.isArray(p.sel) ? p.sel : [];
    if(group.length > 1){
      // place active based on clamped delta (keeps group together)
      const newActiveOff = clamp((p.activeStart0||0) + delta, 0, Math.max(0, availSpan - snapMin));
      absStart = clamp(base + newActiveOff, base, dpEndAbs - p.dur0);

      for(const s of group){
        const newStart = clamp((s.start0||0) + delta, 0, Math.max(0, availSpan - snapMin));
        setDayplanStart(d, s.kind, s.id, newStart);
        const absS = base + newStart;
        if(s.el) s.el.style.top = Math.round((absS - dpStartAbs)*ppm) + "px";
      }
    }else{
      absStart = clamp(absStart, base, dpEndAbs - p.dur0);
      const offset = absStart - base;
      setDayplanStart(d, p.kind, p.id, clamp(offset, 0, Math.max(0, availSpan - snapMin)));
      // update UI live
      p.el.style.top = Math.round((absStart - dpStartAbs)*ppm) + "px";
    }
  }else if(p.mode === "resize"){
    let dur = absPos - p.absStart0;
    dur = snap(dur, snapMin);
    dur = clamp(dur, snapMin, dpEndAbs - p.absStart0);

    setDayplanDur(d, p.kind, p.id, dur);
    p.el.style.height = Math.round(dur*ppm) + "px";
  }
});


      function endPointer(){
        if(!dayplanPointer) return;
        const p = dayplanPointer;
        const dayId = p.dayId;
        const d2 = dayId ? getDay(dayId) : null;
        if(!d2) { dayplanPointer = null; return; }

        if(p.mode === "drag" && Array.isArray(p.sel) && p.sel.length > 1){
          finalizeDayplanGroupMove(d2, p.sel.map(x=>x.key));
        }else{
          resolveOverlapsPushDown(d2, getDayplanSnap());
        }

        touch();
        dayplanPointer = null;
        renderDayPlan();
        renderScheduleBoard();
        renderReportsDetail();
        renderReports();
      }

      lane.addEventListener("pointerup", endPointer);
      lane.addEventListener("pointercancel", endPointer);
    }
  }

  function renderDayplanInspector(d, items){
    const box = el("dayplanInspector");
    if(!box) return;

    const snapMin = getDayplanSnap();
    const base = minutesFromHHMM(d.callTime || "08:00");
    const dpEndAbs = dayplanEndAbs(d);

    const it = dayplanSelectedKey ? items.find(x=>x.key===dayplanSelectedKey) : null;
    if(!it){
      box.innerHTML = `<div class="muted">Seleccioná una escena o tarea para editarla.</div>`;
      return;
    }

    const col = safeHexColor(it.color || (it.kind==="scene" ? "#BFDBFE" : "#E5E7EB"));
    const absStart = clamp(base + (it.start||0), base, dpEndAbs - snapMin);
    const durMax = Math.max(snapMin, dpEndAbs - absStart);
    const dur = clamp(Math.max(snapMin, it.dur||snapMin), snapMin, durMax);
    const timeVal = hhmmFromMinutes(absStart);
    const hm = durToHM(dur);
    const minOpts = minuteOptionsFromSnap(snapMin);
    let selM = hm.m;
    if(!minOpts.includes(selM)) selM = minOpts[0];

    const isBlock = it.kind==="block";

    box.innerHTML = `
      <div class="row gap" style="align-items:center;justify-content:space-between;flex-wrap:wrap">
        <div><b>${it.kind==="scene" ? "Escena" : "Nota / tarea"}</b> <span class="muted">(${esc(it.title||"")})</span></div>
        <div class="row gap" style="align-items:center">
          <span class="muted small">Color</span>
          <div class="dpSwatches">
            ${DAYPLAN_COLORS.map(c=>`<button class="dpSwatchBtn" data-action="pickColorInspector" data-color="${esc(c)}" style="background:${esc(c)}" title="${esc(c)}"></button>`).join("")}
          </div>
        </div>
      </div>

      <div class="spacer"></div>

      <div class="dpGrid">
        <div class="field">
          <label>Hora</label>
          <input class="input" type="time" id="dpi_time" value="${esc(timeVal)}">
        </div>
        <div class="field">
          <label>Duración</label>
          <div class="dpDurRow">
            <input class="input dpDurH" type="number" id="dpi_dur_h" min="0" step="1" value="${esc(String(hm.h))}">
            <span class="muted small">h</span>
            <select class="input dpDurM" id="dpi_dur_m">
              ${minOpts.map(n=>`<option value="${n}"${(n===selM)?" selected":""}>${String(n).padStart(2,"0")}</option>`).join("")}
            </select>
            <span class="muted small">m</span>
          </div>
          <div class="muted small" style="margin-top:6px">Total: <b>${esc(formatDurHHMM(dur))}</b></div>
        </div>

        ${isBlock ? `
          <div class="field" style="grid-column:1/-1">
            <label>Título</label>
            <input class="input" id="dpi_title" value="${esc(it.title||"")}">
          </div>
          <div class="field" style="grid-column:1/-1">
            <label>Detalle</label>
            <textarea class="textarea smallArea" id="dpi_detail">${esc(it.detail||"")}</textarea>
          </div>
                ` : `
          <div class="field" style="grid-column:1/-1">
            <label>Datos de escena</label>
            <div class="dpSceneTop"><b>#${esc(it.number||"")}</b> ${esc(it.slugline||"")}</div>
            <div class="dpFacts">
              <div class="dpFact"><div class="k">Int/Ext</div><div class="v">${esc(it.intExt||"—")}</div></div>
              <div class="dpFact"><div class="k">Lugar</div><div class="v">${esc(it.location||"—")}</div></div>
              <div class="dpFact"><div class="k">Momento</div><div class="v">${esc(it.timeOfDay||"—")}</div></div>
              <div class="dpFact"><div class="k">Largo (Pág)</div><div class="v">${esc((Number(it.pages)||0) > 0 ? fmtPages(it.pages) : "—")}</div></div>
            </div>
          </div>
          <div class="field" style="grid-column:1/-1">
            <label>Notas</label>
            <div class="muted dpSceneResText">${esc(notesOrShortSummary(it.notes, it.summary) || "—")}</div>
          </div>
        `}
</div>

      <div class="dpActions">
        ${it.kind==="scene" ? `<button class="btn" id="dpi_openScene">Abrir escena</button>` : ``}
        ${it.kind==="block" ? `<button class="btn danger" id="dpi_delete">Eliminar</button>` : ``}
      </div>
    `;

    // Bind once per render (clean approach: delegation)
    if(!box.dataset.bound){
      box.dataset.bound = "1";

      box.addEventListener("click", (e)=>{
        const act = e.target.closest("[data-action]")?.dataset.action || "";
        if(act === "pickColorInspector"){
          const d0 = selectedDayplanDayId ? getDay(selectedDayplanDayId) : null;
          if(!d0) return;
          const it0 = dayplanSelectedKey ? buildDayplanItems(d0).find(x=>x.key===dayplanSelectedKey) : null;
          if(!it0) return;

          const col = safeHexColor(e.target.closest("[data-action]")?.dataset.color);
          if(it0.kind==="scene"){
            d0.sceneColors[it0.id] = col;
          }else{
            const b = (d0.blocks||[]).find(x=>x.id===it0.id);
            if(b) b.color = col;
          }
          touch();
          renderDayPlan();
          renderScheduleBoard();
          renderReportsDetail();
          renderReports();
          return;
        }
      });

      box.addEventListener("change", (e)=>{
        const d0 = selectedDayplanDayId ? getDay(selectedDayplanDayId) : null;
        if(!d0) return;
        const items0 = buildDayplanItems(d0);
        const it0 = dayplanSelectedKey ? items0.find(x=>x.key===dayplanSelectedKey) : null;
        if(!it0) return;

        const base0 = minutesFromHHMM(d0.callTime || "08:00");
        const snap0 = getDayplanSnap();
        const dpEndAbs0 = dayplanEndAbs(d0);
        const availSpan0 = Math.max(0, dpEndAbs0 - base0);

        if(e.target.id === "dpi_time"){
          let abs = minutesFromHHMM(e.target.value || "00:00");
          // En horario nocturno, una hora 00:00-06:00 puede pertenecer al día siguiente
          if(d0.night && abs < base0) abs += DAY_SPAN_MIN;

          abs = clamp(abs, base0, dpEndAbs0 - snap0);
          let offset = abs - base0;
          offset = clamp(offset, 0, Math.max(0, availSpan0 - snap0));
          offset = snap(offset, snap0);
          setDayplanStart(d0, it0.kind, it0.id, offset);
          resolveOverlapsPushDown(d0, snap0);
          touch();
          renderDayPlan();
          renderScheduleBoard();
          renderReportsDetail();
          renderReports();
          return;
        }
        if(e.target.id === "dpi_dur_h" || e.target.id === "dpi_dur_m"){
          const h = Number(el("dpi_dur_h")?.value || 0);
          const m = Number(el("dpi_dur_m")?.value || 0);
          let dur = (Number.isFinite(h)?h:0) * 60 + (Number.isFinite(m)?m:0);
          if(!Number.isFinite(dur) || dur<=0) dur = snap0;
          dur = snap(dur, snap0);
          const absS = base0 + (it0.start||0);
          const maxDur = Math.max(snap0, dpEndAbs0 - absS);
          dur = clamp(dur, snap0, maxDur);
          setDayplanDur(d0, it0.kind, it0.id, dur);
          resolveOverlapsPushDown(d0, snap0);
          touch();
          renderDayPlan();
          renderScheduleBoard();
          renderReportsDetail();
          renderReports();
          return;
        }

if(e.target.id === "dpi_title" || e.target.id === "dpi_detail"){
  if(it0.kind !== "block") return;
  const b = (d0.blocks||[]).find(x=>x.id===it0.id);
  if(!b) return;
  if(e.target.id === "dpi_title") b.title = e.target.value;
  if(e.target.id === "dpi_detail") b.detail = e.target.value;
  touch();
  renderDayPlan();
  renderScheduleBoard();
  renderReportsDetail();
  renderReports();
  return;
}
      });

      
const dpTextSave = window.U.debounce(()=>{ touch(); }, 450);

function updateLaneBlock(bid, title, detail){
  const escAttr = (v)=> String(v||"").replace(/\\/g,"\\\\").replace(/"/g,'\\"');
  const node = document.querySelector(`.dpBlock[data-kind="block"][data-id="${escAttr(bid)}"]`);
  if(!node) return;

  const t = node.querySelector(".dpBlockTitle");
  if(t) t.textContent = title || "";

  let dEl = node.querySelector(".dpBlockDetail");
  const should = String(detail||"").trim();
  if(should){
    if(!dEl){
      dEl = document.createElement("div");
      dEl.className = "dpBlockDetail";
      const before = node.querySelector(".dpPalettePop") || node.querySelector(".dpResize");
      if(before) node.insertBefore(dEl, before);
      else node.appendChild(dEl);
    }
    dEl.textContent = detail;
  }else{
    if(dEl) dEl.remove();
  }
}

box.addEventListener("input", (e)=>{
  const d0 = selectedDayplanDayId ? getDay(selectedDayplanDayId) : null;
  if(!d0) return;
  if(!dayplanSelectedKey) return;

  const items0 = buildDayplanItems(d0);
  const it0 = items0.find(x=>x.key===dayplanSelectedKey);
  if(!it0 || it0.kind!=="block") return;

  const b = (d0.blocks||[]).find(x=>x.id===it0.id);
  if(!b) return;

  if(e.target.id === "dpi_title"){
    b.title = e.target.value;
    updateLaneBlock(b.id, b.title, b.detail);
    dpTextSave();
  }
  if(e.target.id === "dpi_detail"){
    b.detail = e.target.value;
    updateLaneBlock(b.id, b.title, b.detail);
    dpTextSave();
  }
});


      box.addEventListener("click", (e)=>{
        const d0 = selectedDayplanDayId ? getDay(selectedDayplanDayId) : null;
        if(!d0) return;
        const items0 = buildDayplanItems(d0);
        const it0 = dayplanSelectedKey ? items0.find(x=>x.key===dayplanSelectedKey) : null;
        if(!it0) return;

        if(e.target.id === "dpi_openScene" && it0.kind==="scene"){
          selectedSceneId = it0.id;
          showView("breakdown");
          renderScenesTable();
          renderSceneEditor();
          renderShotsEditor();
          return;
        }
        if(e.target.id === "dpi_delete" && it0.kind==="block"){
          deleteDayplanBlock(selectedDayplanDayId, it0.id);
          dayplanSelectedKey = null;
          dayplanPaletteKey = null;
          renderDayPlan();
          return;
        }
      });
    }

    // highlight current color selection (simple)
    const btns = box.querySelectorAll('.dpSwatchBtn[data-action="pickColorInspector"]');
    btns.forEach(b=>{
      const c = b.getAttribute("data-color");
      if(c === col) b.style.outline = "2px solid rgba(255,255,255,.45)";
      else b.style.outline = "none";
    });
  }



function renderShotList(){
    const sel = el("shotDaySelect");
    const wrap = el("shotlistWrap");
    const sum = el("shotlistSummary");
    const btnPrint = el("btnShotPrint");
    const side = el("shotSceneInfo");
    const btnGo = el("btnShotSceneGoBreakdown");
    if(!sel || !wrap || !sum) return;

    sortShootDaysInPlace();

    // Select options
    sel.innerHTML = state.shootDays.map(d=>{
      const label = `${formatDayTitle(d.date)}${d.label ? " · "+d.label : ""}`.trim();
      return `<option value="${esc(d.id)}">${esc(label||"Día")}</option>`;
    }).join("");

    if(!selectedShotlistDayId || !state.shootDays.some(d=>d.id===selectedShotlistDayId)){
      selectedShotlistDayId = state.shootDays[0]?.id || null;
    }
    sel.value = selectedShotlistDayId || "";

    if(!sel.dataset.bound){
      sel.dataset.bound = "1";
      sel.addEventListener("change", ()=>{
        const id = sel.value;
        selectedShotlistDayId = id;
        syncAllDaySelections(id);
        renderShotList();
        try{ renderDayDetail(); }catch(_e){}
        try{ renderDayPlan(); }catch(_e){}
        try{ renderCallSheetCalendar(); }catch(_e){}
        try{ renderReportsDetail(); }catch(_e){}
      });
    }
    if(btnPrint && !btnPrint.dataset.bound){
      btnPrint.dataset.bound = "1";
      btnPrint.addEventListener("click", ()=> printShotlistByDayId(selectedShotlistDayId));
    }
    if(btnGo && !btnGo.dataset.bound){
      btnGo.dataset.bound = "1";
      btnGo.addEventListener("click", ()=>{
        if(selectedShotlistSceneId) jumpToSceneInBreakdown(selectedShotlistSceneId);
      });
    }

    const d = getDay(selectedShotlistDayId);
    if(!d){
      wrap.innerHTML = `<div class="muted">No hay días cargados.</div>`;
      sum.textContent = "—";
      if(side) side.innerHTML = `<div class="muted">Seleccioná un día con rodaje.</div>`;
      if(btnGo) btnGo.disabled = true;
      return;
    }

    ensureDayTimingMaps(d);
    ensureDayShotsDone(d);

    // Auto-ajuste: si los planos superan la duración de la escena en cronograma, ampliamos.
    const snapMin = Number(el("schedSnap")?.value || 15);
    const changed = syncDayDurationsFromShots(d, snapMin);
    if(changed){
      touch();
      // re-render de lo que depende del cronograma
      renderScheduleBoard();
      renderDayDetail();
      renderReports();
      renderCallSheetCalendar();
      renderReportsDetail();
      toast("Ajusté duraciones del cronograma según los planos");
    }

    // Selección de escena (si no existe o no está en el día, tomar la primera)
    const daySceneIds = (d.sceneIds||[]).filter(Boolean);
    if(!selectedShotlistSceneId || !daySceneIds.includes(selectedShotlistSceneId)){
      selectedShotlistSceneId = daySceneIds[0] || null;
    }

    // KPIs
    let totalShots = 0;
    let totalMin = 0;
    let lastEnd = 0;
    for(const sid of daySceneIds){
      const sc = getScene(sid);
      if(!sc) continue;
      ensureSceneExtras_toggleThumb(sc);
      totalShots += (sc.shots||[]).length;
      const sMin = sceneShotsTotalMin(sc);
      totalMin += sMin;
      const st = Number(d.times?.[sid] ?? 0) || 0;
      const du = Number(d.durations?.[sid] ?? 60) || 0;
      lastEnd = Math.max(lastEnd, st + du);
    }
    // Incluir notas/tareas del día
    for(const b of (d.blocks||[])){
      const st = Number(b.startMin ?? 0) || 0;
      const du = Number(b.durMin ?? 0) || 0;
      lastEnd = Math.max(lastEnd, st + du);
    }
    const wrapClock = d.callTime ? fmtClockFromCall(d.callTime, lastEnd) : "";
    sum.innerHTML = `
      <div class="shotDayKpis">
        <span class="pill">Escenas: <b>${daySceneIds.length}</b></span>
        <span class="pill">Planos: <b>${totalShots}</b></span>
        <span class="pill">Tiempo (planos): <b>${esc(formatDuration(totalMin))}</b></span>
        <span class="pill">Fin estimado: <b>${esc(wrapClock||"—")}</b></span>
      </div>
    `;

    function renderSelectedScenePanel(){
      if(!side) return;
      const sid = selectedShotlistSceneId;
      const sc = sid ? getScene(sid) : null;
      if(!sc){
        side.innerHTML = `<div class="muted">Seleccioná una escena para ver su info.</div>`;
        if(btnGo) btnGo.disabled = true;
        return;
      }
      ensureSceneExtras(sc);
      ensureSceneExtras_toggleThumb(sc);

      const st = Number(d.times?.[sid] ?? 0) || 0;
      const du = Number(d.durations?.[sid] ?? 60) || 60;
      const scStart = d.callTime ? fmtClockFromCall(d.callTime, st) : "";
      const scEnd = d.callTime ? fmtClockFromCall(d.callTime, st+du) : "";
      const shotsMin = sceneShotsTotalMin(sc);
      const shotsCount = (sc.shots||[]).length;

      const elems = sc.elements && typeof sc.elements==="object" ? sc.elements : {};
      const nonEmpty = Object.keys(elems).filter(k=> Array.isArray(elems[k]) && elems[k].length);
      const elemLine = nonEmpty.length ? nonEmpty.map(k=>`${k}: ${elems[k].length}`).join(" · ") : "—";

      side.innerHTML = `
        <div class="value">#${esc(sc.number||"")} — ${esc(sc.slugline||"")}</div>
        <div class="spacer"></div>

        <div class="label">Resumen</div>
        <div class="bigText">${esc(sc.summary||"")}</div>

        <div class="spacer"></div>
        <div class="label">Horario</div>
        <div class="value">${esc((scStart && scEnd) ? (scStart+" → "+scEnd) : (scStart||scEnd||"—"))}</div>

        <div class="spacer"></div>
        <div class="label">Duración escena (cronograma)</div>
        <div class="value">${esc(formatDuration(du))}</div>

        <div class="spacer"></div>
        <div class="label">Planos</div>
        <div class="value">${esc(String(shotsCount))} · ${esc(formatDuration(shotsMin))}</div>

        <div class="spacer"></div>
        <div class="label">Páginas</div>
        <div class="value">${esc(fmtPages(sc.pages)||"—")}</div>

        <div class="spacer"></div>
        <div class="label">Elementos</div>
        <div class="value">${esc(elemLine)}</div>

        ${sc.notes ? `
          <div class="spacer"></div>
          <div class="label">Notas</div>
          <div class="bigText">${esc(sc.notes||"")}</div>
        ` : ``}
      `;
      if(btnGo) btnGo.disabled = false;
    }

    wrap.innerHTML = "";
    if(!daySceneIds.length){
      wrap.innerHTML = `<div class="muted">No hay escenas asignadas a este día.</div>`;
      if(side) side.innerHTML = `<div class="muted">No hay escenas para mostrar.</div>`;
      if(btnGo) btnGo.disabled = true;
      return;
    }

    for(const sid of daySceneIds){
      const sc = getScene(sid);
      if(!sc) continue;
      ensureSceneExtras_toggleThumb(sc);

      const st = Number(d.times?.[sid] ?? 0) || 0;
      const du = Number(d.durations?.[sid] ?? 60) || 60;
      const scStart = d.callTime ? fmtClockFromCall(d.callTime, st) : "";
      const scEnd = d.callTime ? fmtClockFromCall(d.callTime, st+du) : "";
      const shotsMin = sceneShotsTotalMin(sc);
      const warn = shotsMin > du ? "Planos > duración" : "";

      const isCollapsed = shotlistCollapsedSceneIds.has(sid);
      const isSelected = (sid === selectedShotlistSceneId);

      const box = document.createElement("div");
      box.className = `shotSceneBox${isSelected?" selected":""}${isCollapsed?" collapsed":""}`;
      box.innerHTML = `
        <div class="shotSceneHead">
          <div class="shotSceneHeadLeft">
            <div class="shotSceneCaret">${isCollapsed ? "▸" : "▾"}</div>
            <div>
              <div class="t">#${esc(sc.number||"")} — ${esc(sc.slugline||"")}</div>
              <div class="m">${esc(scStart||"")} → ${esc(scEnd||"")} · Escena: ${esc(formatDuration(du))} · Planos: ${esc(formatDuration(shotsMin))}</div>
            </div>
          </div>
          <div class="shotSceneHeadRight">
            ${warn ? `<div class="warn">${esc(warn)}</div>` : ""}
            <button class="btn small shotAddBtn noPrint" title="Agregar plano" ${isReadOnly()?"disabled":""}>+ Plano</button>
          </div>
        </div>
        <div class="shotTableWrap">
          <div class="tableWrap">
            <table class="table shotTable">
              <thead>
                <tr>
                  <th class="shotChk">✓</th>
                  <th class="shotNum">#</th>
                  <th class="shotTime">Hora</th>
                  <th class="shotType">Tipo</th>
                  <th class="shotThumb">Mini</th>
                  <th>Descripción</th>
                  <th class="shotDur">Min</th>
                  <th class="shotAct noPrint"> </th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `;

      const head = box.querySelector(".shotSceneHead");
      const btnAdd = box.querySelector(".shotAddBtn");

      head?.addEventListener("click", (e)=>{
        // Evitar que clicks en botones/inputs cambien el estado
        if(e.target && e.target.closest && e.target.closest("button, input, select, a, label")) return;

        if(selectedShotlistSceneId !== sid){
          selectedShotlistSceneId = sid;
          renderShotList();
          return;
        }
        // Segundo click (misma escena): colapsar/desplegar
        if(shotlistCollapsedSceneIds.has(sid)) shotlistCollapsedSceneIds.delete(sid);
        else shotlistCollapsedSceneIds.add(sid);
        renderShotList();
      });

      // Doble click: ir a editar la escena en Breakdown
      box.addEventListener("dblclick", ()=> jumpToSceneInBreakdown(sc.id));

      btnAdd?.addEventListener("click", (e)=>{
        e.preventDefault();
        e.stopPropagation();
        if(isReadOnly()){ toast("Modo lector 🔒 (desbloqueá para editar)"); return; }
        sc.shots = Array.isArray(sc.shots) ? sc.shots : [];
        sc.shots.push({ id: uid("shot"), type: "Plano general", desc: "", durMin: DEFAULT_SHOT_MIN, thumbUrl: "" });
        selectedShotlistSceneId = sid;
        shotlistCollapsedSceneIds.delete(sid); // asegurar abierto
        touch();
        renderShotList();
      });

      const tbody = box.querySelector("tbody");
      if(!(sc.shots||[]).length){
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="8" class="muted">Sin planos cargados para esta escena.</td>`;
        tbody.appendChild(tr);
      }else{
        let offset = 0;
        (sc.shots||[]).forEach((sh, idx)=>{
          const dur = shotDurMin(sh);
          const key = `${sid}|${sh.id}`;
          const done = !!d.shotsDone[key];
          const t = d.callTime ? fmtClockFromCall(d.callTime, st + offset) : "";

          const hasThumb = !!sh.thumbUrl;
          const uploading = !!_shotThumbUploading[sh.id];
          const thumbInner = uploading
            ? `<div class="muted small">Subiendo…</div>`
            : (hasThumb ? `<img class="shotThumbImg" src="${esc(sh.thumbUrl)}" alt="thumb"/>` : `<div class="muted small">Mini</div>`);

          const tr = document.createElement("tr");
          if(done) tr.classList.add("shotRowDone");
          tr.innerHTML = `
            <td class="shotChk"><input type="checkbox" ${done?"checked":""} /></td>
            <td class="shotNum">${idx+1}</td>
            <td class="shotTime">${esc(t||"")}</td>
            <td class="shotType">
              <select class="input compact shotTypeSel" ${isReadOnly()?"disabled":""}>
                ${shotTypes.map(tp=>`<option value="${esc(tp)}"${(normalizeShotType(sh.type)===tp)?" selected":""}>${esc(tp)}</option>`).join("")}
              </select>
            </td>
            <td class="shotThumbTd">
              <div class="shotThumbDrop ${hasThumb?"has":""} ${uploading?"uploading":""}" title="Arrastrá una imagen o click para cargar">${thumbInner}</div>
              <div class="row gap noPrint" style="justify-content:center; margin-top:6px;">
                <button class="btn icon shotThumbPick" title="Cargar" ${isReadOnly()?"disabled":""}>📷</button>
                <button class="btn icon danger shotThumbClear" title="Quitar" ${(isReadOnly()||!hasThumb)?"disabled":""}>×</button>
              </div>
              <input type="file" accept="image/*" class="shotThumbFile" style="display:none" />
            </td>
            <td><input class="input shotDescInput" ${isReadOnly()?"disabled":""} placeholder="Descripción del plano…" value="${esc(sh.desc||"")}" /></td>
            <td class="shotDur">
              <select class="input compact shotDurSel" ${isReadOnly()?"disabled":""}>
                ${[5,10,15,20,30,45,60].map(n=>`<option value="${n}"${(dur===n)?" selected":""}>${n}</option>`).join("")}
              </select>
            </td>
            <td class="shotAct noPrint"><button class="btn icon danger shotDelBtn" title="Borrar" ${isReadOnly()?"disabled":""}>×</button></td>
          `;

          const chk = tr.querySelector("input[type=checkbox]");
          const selDur = tr.querySelector(".shotDurSel");
          const selType = tr.querySelector(".shotTypeSel");
          const inpDesc = tr.querySelector(".shotDescInput");
          const delBtn = tr.querySelector(".shotDelBtn");

          chk?.addEventListener("change", ()=>{
            d.shotsDone[key] = chk.checked;
            touch();
            renderShotList();
          });

          selDur?.addEventListener("change", ()=>{
            if(isReadOnly()) return;
            sh.durMin = Number(selDur.value) || DEFAULT_SHOT_MIN;
            const changed2 = syncAllDaysDurationsFromShotsForScene(sid, snapMin);
            touch();
            if(changed2){
              renderScheduleBoard();
              try{ renderDayDetail(); }catch(_e){}
              try{ renderReports(); }catch(_e){}
              try{ renderCallSheetCalendar(); }catch(_e){}
              try{ renderReportsDetail(); }catch(_e){}
              toast("Ajusté duraciones del cronograma según los planos");
            }
            renderShotList();
          });

          selType?.addEventListener("change", ()=>{
            if(isReadOnly()) return;
            sh.type = selType.value;
            touch();
          });

          inpDesc?.addEventListener("input", ()=>{
            if(isReadOnly()) return;
            sh.desc = inpDesc.value;
          });
          inpDesc?.addEventListener("blur", ()=>{
            if(isReadOnly()) return;
            sh.desc = inpDesc.value;
            touch();
          });

          delBtn?.addEventListener("click", (e)=>{
            e.preventDefault();
            if(isReadOnly()){ toast("Modo lector 🔒 (desbloqueá para editar)"); return; }
            sc.shots = (sc.shots||[]).filter(x=>x.id!==sh.id);
            // limpiar done map del día para ese plano
            delete d.shotsDone[key];
            touch();
            renderShotList();
          });

          // Thumb controls
          const drop = tr.querySelector(".shotThumbDrop");
          const pick = tr.querySelector(".shotThumbPick");
          const clear = tr.querySelector(".shotThumbClear");
          const fileIn = tr.querySelector(".shotThumbFile");

          const openPicker = ()=>{
            if(isReadOnly()){ toast("Modo lector 🔒 (desbloqueá para editar)"); return; }
            fileIn && fileIn.click();
          };

          drop?.addEventListener("click", openPicker);
          pick?.addEventListener("click", (e)=>{ e.preventDefault(); openPicker(); });

          fileIn?.addEventListener("change", ()=>{
            const f = fileIn.files && fileIn.files[0];
            if(f) setShotThumb(sh, f);
            try{ fileIn.value = ""; }catch(_e){}
          });

          clear?.addEventListener("click", (e)=>{
            e.preventDefault();
            if(isReadOnly()){ toast("Modo lector 🔒 (desbloqueá para editar)"); return; }
            sh.thumbUrl = "";
            delete sh.thumbUpdatedAt;
            touch();
            renderShotList();
          });

          const prevent = (e)=>{ e.preventDefault(); e.stopPropagation(); };
          drop?.addEventListener("dragover", (e)=>{ prevent(e); if(!isReadOnly()) drop.classList.add("drag"); });
          drop?.addEventListener("dragenter", (e)=>{ prevent(e); if(!isReadOnly()) drop.classList.add("drag"); });
          drop?.addEventListener("dragleave", (e)=>{ prevent(e); drop.classList.remove("drag"); });
          drop?.addEventListener("drop", (e)=>{
            prevent(e);
            drop.classList.remove("drag");
            if(isReadOnly()){ toast("Modo lector 🔒 (desbloqueá para editar)"); return; }
            const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if(f) setShotThumb(sh, f);
          });

          tbody.appendChild(tr);
          offset += dur;
        });
      }

      wrap.appendChild(box);
    }

    renderSelectedScenePanel();
  }
  function renderCallSheetCalendar(){ /* ... sin cambios ... */ 
    const grid = el("calGrid");
    const title = el("calTitle");
    if(!grid || !title) return;

    const y = calCursor.year;
    const m = calCursor.month;

    title.textContent = new Intl.DateTimeFormat("es-AR",{month:"long",year:"numeric"}).format(new Date(y,m,1));
    grid.innerHTML = "";

    const first = new Date(y,m,1);
    const startDow = (first.getDay()+6)%7;
    const daysInMonth = new Date(y,m+1,0).getDate();

    const shootByDate = new Map();
    for(const d of state.shootDays){
      if(d.date) shootByDate.set(d.date, d.id);
    }

    for(let i=0;i<startDow;i++){
      const cell = document.createElement("div");
      cell.className = "calCell";
      cell.style.opacity="0";
      cell.style.pointerEvents="none";
      grid.appendChild(cell);
    }

    for(let day=1; day<=daysInMonth; day++){
      const ds = `${y}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      const hasShoot = shootByDate.has(ds);
      const cell = document.createElement("div");
      cell.className = "calCell" + (hasShoot ? " hasShoot" : "");
      if(hasShoot && callSheetDayId === shootByDate.get(ds)) cell.classList.add("selected");
      cell.innerHTML = `<div class="d">${day}</div><div class="tag">${hasShoot ? "Rodaje" : ""}</div>`;
      cell.addEventListener("click", ()=>{
        if(!hasShoot) return;
        const id = shootByDate.get(ds);

        // Sync de día entre Call Sheet / Call Diario / Plan / Shotlist
        callSheetDayId = id;
        selectedDayId = id;
        selectedDayplanDayId = id;
        selectedShotlistDayId = id;

        renderCallSheetCalendar();
        try{ renderDayDetail(); }catch(_e){}
        try{ renderDayPlan(); }catch(_e){}
        try{ renderShotList(); }catch(_e){}
        try{ renderReports(); }catch(_e){}
        renderReportsDetail();
      });
grid.appendChild(cell);
    }
  }

  function renderCallSheetDetail(targetWrap=null, dayIdOverride=null){ /* ... sin cambios ... */ 
    const wrap = targetWrap || el("callSheetDetail");
    if(!wrap) return;
    wrap.innerHTML = "";

    const d = dayIdOverride ? getDay(dayIdOverride) : (callSheetDayId ? getDay(callSheetDayId) : (selectedDayId ? getDay(selectedDayId) : null));
    if(!d){
      wrap.innerHTML = `<div class="catBlock"><div class="items">Elegí un día con rodaje.</div></div>`;
      return;
    }
    ensureProjectConfig();
    ensureDayTimingMaps(d);
    // Mantener consistencia con Call Diario (evita estados viejos que cambian colores/overrides)
    cleanupDayCallTimes(d);
    cleanupDayExtras(d);
    const dayBase = baseDayCall(d);
    const castBase = baseCastCall(d);

    const scenes = (d.sceneIds||[]).map(getScene).filter(Boolean);
    const cast = union(scenes.flatMap(s=>s.elements?.cast||[]));

    const crewAll = (d.crewIds||[])
      .map(id=>state.crew.find(c=>String(c.id)===String(id)))
      .filter(Boolean)
      .map(c=>({ ...c, area: normalizeCrewArea(c.area) }))
      .filter(c=>c.area!=="Cast");

    const crewGrouped = groupCrewByArea(crewAll);

    const header = document.createElement("div");
    header.className = "catBlock callHeader";
    const pages = scenes.reduce((acc, s)=> acc + (Number(s.pages)||0), 0);
    header.innerHTML = `
      <div class="hdr"><span class="dot" style="background:var(--cat-props)"></span>${esc(state.meta.title||"Proyecto")}</div>
      <div class="items">
        <div><b>Día:</b> ${esc(formatDayTitle(d.date))}${d.label? " · "+esc(d.label):""}</div>
        <div><b>Call:</b> ${esc(d.callTime||"")} &nbsp; <b>Locación:</b> ${esc(d.location||"")}</div>
        <div class="kpiRow" style="margin-top:10px;">
          <span class="kpi"><b>${scenes.length}</b> escenas</span>
          <span class="kpi"><b>${fmtPages(pages)}</b> pág</span>
          <span class="kpi"><b>${cast.length}</b> cast</span>
          <span class="kpi"><b>${crewAll.length}</b> crew</span>
        </div>
        ${d.notes ? `<div style="margin-top:8px;"><b>Notas:</b> ${esc(d.notes)}</div>` : ""}
      </div>
    `;
    wrap.appendChild(header);

    const snapMin = Number(el("schedSnap")?.value || 15);
    try{ resolveOverlapsPushDown(d, snapMin); }catch(e){ console.warn('CallSheet overlaps:', e); }

    const scenesBox = document.createElement("div");
    scenesBox.className = "catBlock callScenes";
    scenesBox.innerHTML = `<div class="hdr"><span class="dot" style="background:var(--cat-vehicles)"></span>Itinerario</div>`;
    const list = document.createElement("div");
    list.className = "items";

    const timeline = [];
    try{
      for(const sid of (d.sceneIds||[])){
      const s = getScene(sid);
      if(!s) continue;
      timeline.push({
        kind:"scene",
        id:sid,
        start: Number(d.times?.[sid] ?? 0) || 0,
        dur:   Number(d.durations?.[sid] ?? 60) || 0,
        title: `#${s.number||""} ${s.slugline||""}`.trim(),
        detail: [
          s.intExt||"",
          s.location||"",
          s.timeOfDay||"",
          (Number(s.pages)||0) > 0 ? `${fmtPages(s.pages)} pág` : ""
        ].filter(Boolean).join(" · "),
        color: d.sceneColors?.[sid] || ""
      });
    }
    for(const b of (d.blocks||[])){
      timeline.push({
        kind:"block",
        id:b.id,
        start: Number(b.startMin ?? 0) || 0,
        dur:   Number(b.durMin ?? 0) || 0,
        title: b.title || "Nota",
        detail: b.detail || "",
        color: b.color || ""
      });
    }
    timeline.sort((a,b)=> (a.start||0) - (b.start||0));
    }catch(e){ console.warn('CallSheet timeline:', e); }

    if(!timeline.length){
      list.innerHTML = `<div>—</div>`;
    }else{
      list.innerHTML = timeline.map(it=>{
        const time = d.callTime ? fmtClockFromCall(d.callTime, it.start) : `+${it.start}m`;
        const du = Math.round(it.dur||0);
        const border = it.color ? `border-left:6px solid ${esc(it.color)}; padding-left:10px;` : "";
        const main = it.kind==="scene"
          ? `<b>#${esc(getScene(it.id)?.number||"")}</b> ${esc(getScene(it.id)?.slugline||"")}`
          : `<b>${esc(it.title||"Nota")}</b>${it.detail ? ` <span class="muted">— ${esc(it.detail)}</span>` : ""}`;

        const sub = (it.kind==="scene" && it.detail) ? `<div class="muted small">${esc(it.detail)}</div>` : ``;

        return `<div style="${border}"><b>${time}</b> · <span class="muted">(${esc(formatDuration(du))})</span> · ${main}${sub}</div>`;
      }).join("");
    }

    scenesBox.appendChild(list);
    wrap.appendChild(scenesBox);

    const castBox = document.createElement("div");
    castBox.className = "catBlock callCast";
    castBox.innerHTML = `
      <div class="hdr"><span class="dot" style="background:${catColors.cast}"></span>Cast</div>
      <div class="items">
        <table class="callTimeTable callTimeTable--cast">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th class="time">PU</th>
              <th class="time">Call</th>
              <th class="time">RTS</th>
            </tr>
          </thead>
          <tbody>
            ${cast.length ? cast.map(n=>{
              const castRec = findCastCrewEntryByName(n);
              const role = String(castRec?.role || "").trim();
              const actorName = String(castRec?.name || "").trim();
              const roleDisp = role;
              const nameDisp = actorName || n;
              const call = effectiveCastCall(d, n);
              const pu = d.pickupCastEnabled ? effectiveCastPU(d, n) : "—";
              const rts = d.rtsEnabled ? effectiveCastRTS(d, n) : "—";
              const diff = call !== castBase;
              const sem = diff ? "yellow" : "green";
              const tdCls = diff ? "timeDiffDay" : "";

              // PU/RTS: en Call Diario el resaltado indica *override* (no se hereda del Call)
              const basePu = shiftHHMM(call, Number(d.pickupCastOffsetMin ?? -30));
              const puOv = normalizeHHMM(d?.castPickUpTimes?.[n]);
              const puIsOv = d.pickupCastEnabled && !!puOv && puOv !== basePu;

              const rtsOff = Number(d.rtsOffsetMin ?? Number(state?.project?.rtsOffsetMin ?? 60));
              const baseRts = shiftHHMM(call, rtsOff);
              const rtsOv = normalizeHHMM(d?.castRTSTimes?.[n]);
              const rtsIsOv = d.rtsEnabled && !!rtsOv && rtsOv !== baseRts;

              const puSem = puIsOv ? "yellow" : "green";
              const rtsSem = rtsIsOv ? "yellow" : "green";
              const puCls = (puIsOv && pu !== "—") ? "timeDiffDay" : "";
              const rtsCls = (rtsIsOv && rts !== "—") ? "timeDiffDay" : "";
              const puCell = (pu === "—") ? "—" : `<span class="callTimeDot ${puSem}"></span><b>${esc(pu)}</b>`;
              const rtsCell = (rts === "—") ? "—" : `<span class="callTimeDot ${rtsSem}"></span><b>${esc(rts)}</b>`;
              return `<tr>
                <td class="name">${esc(nameDisp)}</td>
                <td>${esc(roleDisp)}</td>
                <td class="time ${puCls}">${puCell}</td>
                <td class="time ${tdCls}"><span class="callTimeDot ${sem}"></span><b>${esc(call)}</b></td>
                <td class="time ${rtsCls}">${rtsCell}</td>
              </tr>`;
            }).join("") : `<tr><td colspan="5" class="mutedCell">—</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
    wrap.appendChild(castBox);

    const crewBox = document.createElement("div");
    crewBox.className = "catBlock callCrew";
    crewBox.innerHTML = `<div class="hdr"><span class="dot" style="background:var(--cat-sound)"></span>Crew</div>`;
    const crewItems = document.createElement("div");
    crewItems.className = "items";
    if(!crewAll.length){
      crewItems.innerHTML = `<div>—</div>`;
    }else{
      crewItems.innerHTML = `
        <table class="callTimeTable callTimeTable--crew">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th class="time">PU</th>
              <th class="time">Call</th>
              <th>Tel</th>
            </tr>
          </thead>
          <tbody>
            ${crewGrouped.map(([area, arr])=>{
              const areaBase = baseCrewAreaCall(d, area);
              const areaRow = `<tr class="crewAreaRow"><td colspan="5">${esc(area)}</td></tr>`;
              const rows = arr.map(c=>{
                const call = effectiveCrewCall(d, c);
                const pu = d.pickupCrewEnabled ? effectiveCrewPU(d, c) : "—";
                const diffArea = call !== areaBase;
                const diffDay = call !== dayBase;
                const sem = diffArea ? "red" : (diffDay ? "yellow" : "green");
                const tdCls = diffArea ? "timeDiffArea" : (diffDay ? "timeDiffDay" : "");

                // PU: en Call Diario el resaltado indica override propio (no hereda del Call)
                const basePu = shiftHHMM(call, Number(d.pickupCrewOffsetMin ?? -30));
                const puOv = normalizeHHMM(d?.crewPickUpTimes?.[c.id]);
                const puIsOv = d.pickupCrewEnabled && !!puOv && puOv !== basePu;
                const puSem = puIsOv ? "yellow" : "green";
                const puCls = (puIsOv && pu !== "—") ? "timeDiffDay" : "";
                const puCell = (pu === "—") ? "—" : `<span class="callTimeDot ${puSem}"></span><b>${esc(pu)}</b>`;

                return `<tr>
                  <td class="name">${esc(c.name||"")}</td>
                  <td>${esc(c.role||"")}</td>
                  <td class="time ${puCls}">${puCell}</td>
                  <td class="time ${tdCls}"><span class="callTimeDot ${sem}"></span><b>${esc(call)}</b></td>
                  <td class="tel">${c.phone ? esc(c.phone) : "—"}</td>
                </tr>`;
              }).join("");
              return areaRow + rows;
            }).join("")}
          </tbody>
        </table>
      `;
    }
    crewBox.appendChild(crewItems);
    wrap.appendChild(crewBox);
  }

  // ===================== REPORTES (Plan de Rodaje / Call Sheet / Shotlist) =====================
  function applyReportsTabUI(){
    const tab = (reportsTab || "callsheet");
    const tabs = document.querySelectorAll("#reportTabs .reportTabBtn");
    tabs.forEach(btn=> btn.classList.toggle("active", btn.dataset.tab===tab));
    ["dayplan","schedule","callsheet","shotlist","elements"].forEach(t=>{
      el(`reportPane-${t}`)?.classList.toggle("hidden", t!==tab);
    });
  }

  function setReportsTab(tab){
    const t = (["dayplan","schedule","callsheet","shotlist","elements"].includes(tab)) ? tab : "callsheet";
    reportsTab = t;
    localStorage.setItem("gb_reports_tab", t);
    applyReportsTabUI();
    renderReportsDetail();
  }

  function renderReportsDetail(){
    const dayId = getReportsSelectedDayId();
    const d = dayId ? getDay(dayId) : null;

    if(reportsTab==="dayplan"){
      renderReportDayplanDetail(d);
      return;
    }
    if(reportsTab==="shotlist"){
      renderReportShotlistDetail(d);
      return;
    }
    if(reportsTab==="elements"){
      renderReportElementsDetail(d);
      return;
    }
    if(reportsTab==="schedule"){
      renderReportScheduleDetail();
      return;
    }
    // Call Sheet
    renderCallSheetDetail(null, dayId);
  }

  function buildElementsByScenePrintPage(d, opts={}){
  if(!d) return "";
  const title = opts.title || "Elementos por escena";
  const proj = esc(state.meta?.title || "Proyecto");
  const dayTxt = `${formatDayTitle(d.date)}${d.label ? " · "+esc(d.label) : ""}`;
  const callHHMM = normalizeHHMM(d.callTime) || "08:00";

  const ALWAYS = new Set(["cast","props","wardrobe","art"]);
  const scenePairs = (d.sceneIds||[]).map(sid=>({ sid, sc: getScene(sid) })).filter(x=>!!x.sc);

  const sceneBlocks = scenePairs.map(({sid, sc})=>{
    const num = sc.number || "";
    const slug = sc.slugline || "";
    const metaBits = [];
    if(sc.intExt) metaBits.push(sc.intExt);
    if(sc.location) metaBits.push(sc.location);
    if(sc.timeOfDay) metaBits.push(sc.timeOfDay);
    if((Number(sc.pages)||0) > 0) metaBits.push(`${fmtPages(sc.pages)} pág`);

    const startOff = Number(d.times?.[sid] ?? 0) || 0;
    const startClock = callHHMM ? fmtClockFromCall(callHHMM, startOff) : "";

    const rows = cats.map((cat)=>{
      const arr = union(sc.elements?.[cat] || []);
      if(!ALWAYS.has(cat) && !arr.length) return "";
      const label = catNames?.[cat] || cat;
      const items = arr.length ? arr.map(x=>esc(String(x))).join(", ") : `<span class="muted">—</span>`;
      return `
        <tr class="eleRow ${cat==="cast" ? "eleRowCast" : ""}">
          <th>
            <span class="eleCatLabel">
              <span class="dot" style="background:${catColors[cat]}"></span>${esc(label)}
            </span>
          </th>
          <td>${items}</td>
        </tr>
      `;
    }).filter(Boolean).join("");

    return `
      <div class="eleScene">
        <div class="eleSceneHdr">
          <div class="eleSceneNum">Escena ${esc(num)}${startClock ? ` · ${esc(startClock)}` : ""}</div>
          <div class="eleSceneSlug">${esc(slug)}</div>
        </div>
        ${metaBits.length ? `<div class="eleSceneMeta">${esc(metaBits.join(" · "))}</div>` : ``}
        <table class="eleTable">
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join("");

  return `
    <div class="elementsPrintPage printOnly">
      <div class="eleHeader">
        <div class="eleTitle">${esc(title)}</div>
        <div class="eleSub">${proj} · ${dayTxt}</div>
        <div class="eleSub2"><b>Call:</b> ${esc(d.callTime||"")} &nbsp; <b>Locación:</b> ${esc(d.location||"")}</div>
      </div>
      <div class="eleList">
        ${sceneBlocks || `<div class="muted">No hay escenas asignadas.</div>`}
      </div>
    </div>
  `;
}

// Screen version: tarjetas (más usable) + punto de color por categoría
function buildElementsBySceneScreenPage(d, opts={}){
  if(!d) return "";
  const project = state?.meta?.title || "Proyecto";
  const dayLabel = `${formatDayTitle(d.date)}${d.label ? " · "+d.label : ""}`.trim();
  const title = opts.title || "Elementos por escena";
  const callHHMM = normalizeHHMM(d.callTime) || "08:00";

  const ALWAYS = new Set(["cast","props","wardrobe","art"]);
  const scenePairs = (d.sceneIds||[]).map(sid=>({ sid, sc: getScene(sid) })).filter(x=>!!x.sc);

  let cardsHTML = "";
  if(!scenePairs.length){
    cardsHTML = `<div class="muted">No hay escenas asignadas a este día.</div>`;
  }else{
    cardsHTML = scenePairs.map(({sid, sc})=>{
      const meta = [
        sc.intExt ? sc.intExt : "",
        sc.location ? sc.location : "",
        sc.timeOfDay ? sc.timeOfDay : "",
        (Number(sc.pages)||0) > 0 ? `${fmtPages(sc.pages)} pág` : ""
      ].filter(Boolean).join(" · ");

      const startOff = Number(d.times?.[sid] ?? 0) || 0;
      const startClock = callHHMM ? fmtClockFromCall(callHHMM, startOff) : "";

      const catBlocks = [];
      for(const cat of cats){
        const arr = union(sc.elements?.[cat] || []);
        if(!ALWAYS.has(cat) && !arr.length) continue;
        const label = catNames?.[cat] || cat;
        const items = arr.length ? arr.map(x=>esc(String(x))).join(", ") : `<span class="muted">—</span>`;
        catBlocks.push(`
          <div class="eleCatCard">
            <div class="eleCatHdr">
              <span class="dot" style="background:${catColors[cat]}"></span>${esc(label)}
            </div>
            <div class="eleCatItems">${items}</div>
          </div>
        `);
      }

      return `
        <div class="eleSceneCard">
          <div class="eleSceneTop">
            <div class="eleSceneLeft">
              <div class="eleSceneNum">#${esc(sc.number||"")}</div>
              <div class="eleSceneSlug">${esc(sc.slugline||"")}</div>
            </div>
            <div class="eleSceneStart">${startClock ? `<span class="metaPill"><b>Inicio</b> ${esc(startClock)}</span>` : ""}</div>
          </div>
          ${meta ? `<div class="eleSceneMeta">${esc(meta)}</div>` : ``}
          <div class="eleCatsGrid">${catBlocks.join("")}</div>
        </div>
      `;
    }).join("");
  }

  return `
    <div class="elementsScreenPage screenOnly">
      <div class="eleHeader">
        <div class="eleTitle">${esc(title)}</div>
        <div class="eleSub"><b>${esc(project)}</b> · ${esc(dayLabel||"Día")}</div>
        <div class="eleSub2"><b>Call:</b> ${esc(d.callTime||"—")} &nbsp; <b>Locación:</b> ${esc(d.location||"—")}</div>
      </div>
      <div class="eleCards">${cardsHTML}</div>
    </div>
  `;
}

  function renderReportElementsDetail(d){
    const wrap = el("reportElementsDetail");
    if(!wrap) return;
    wrap.innerHTML = "";
    if(!d){
      wrap.innerHTML = `<div class="catBlock"><div class="items">Elegí un día con rodaje.</div></div>`;
      return;
    }
    wrap.innerHTML = buildElementsBySceneScreenPage(d, { title: "Elementos por escena" });
  }





function renderReportScheduleDetail(){
  const wrap = el("reportScheduleDetail");
  if(!wrap) return;
  wrap.innerHTML = "";

  sortShootDaysInPlace();
  const allDays = (state.shootDays || []);
  const days = getScheduleDaysFiltered();
  if(!days.length){
    wrap.innerHTML = `<div class="catBlock"><div class="items">No hay días cargados.</div></div>`;
    return;
  }

  const proj = esc(state.meta?.title || "Proyecto");
  const hint = document.createElement("div");
  hint.className = "catBlock";
  hint.innerHTML = `
    <div class="hdr"><span class="dot" style="background:var(--cat-vehicles)"></span>Plan General</div>
    <div class="items">
      <div><b>${proj}</b> · ${esc(days.length)} días</div>
      <div class="muted">Usá el botón <b>Imprimir</b> para sacar el Plan General completo (horizontal).</div>
    </div>
  `;
  wrap.appendChild(hint);

  const table = document.createElement("div");
  table.className = "catBlock";
  table.innerHTML = `<div class="hdr"><span class="dot" style="background:var(--cat-props)"></span>Resumen</div>`;
  const items = document.createElement("div");
  items.className = "items";

  const rows = days.map((d)=>{
    ensureDayTimingMaps(d);
    const dayTitle = `${formatDayTitle(d.date)}${d.label ? " · "+d.label : ""}`.trim();
    const scenes = (d.sceneIds||[]).map(getScene).filter(Boolean);
    const pages = scenes.reduce((acc, s)=> acc + (Number(s.pages)||0), 0);
    const notes = (d.blocks||[]).length || 0;
    return `
      <tr>
        <td>${esc(dayTitle||"Día")}</td>
        <td>${esc(d.callTime||"—")}</td>
        <td>${esc(d.location||"—")}</td>
        <td style="text-align:right;">${esc(String(scenes.length))}</td>
        <td style="text-align:right;">${esc(String(notes))}</td>
        <td style="text-align:right;">${esc(fmtPages(pages))}</td>
      </tr>
    `;
  }).join("");

  items.innerHTML = `
    <div class="tableWrap">
      <table class="table">
        <thead>
          <tr>
            <th>Día</th>
            <th style="width:90px;">Call</th>
            <th>Locación</th>
            <th style="width:70px; text-align:right;">Esc.</th>
            <th style="width:70px; text-align:right;">Notas</th>
            <th style="width:70px; text-align:right;">Pág</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  table.appendChild(items);
  wrap.appendChild(table);
}

function renderReportDayplanDetail(d){
    const wrap = el("reportDayplanDetail");
    if(!wrap) return;
    wrap.innerHTML = "";
    if(!d){
      wrap.innerHTML = `<div class="catBlock"><div class="items">Elegí un día con rodaje.</div></div>`;
      return;
    }
    ensureDayTimingMaps(d);

    const eattr = (s)=> esc(String(s||"")) .replace(/"/g,"&quot;");

    const items = buildDayplanItems(d);
    const proj = esc(state.meta?.title || "Proyecto");
    const dayTxt = `${formatDayTitle(d.date)}${d.label ? " · "+esc(d.label) : ""}`;

    const scenes = (d.sceneIds||[]).map(getScene).filter(Boolean);
    const pages = scenes.reduce((acc, s)=> acc + (Number(s.pages)||0), 0);

    const box = document.createElement("div");
    box.className = "catBlock";
    box.innerHTML = `
      <div class="hdr"><span class="dot" style="background:var(--cat-vehicles)"></span>Plan de Rodaje</div>
      <div class="items">
        <div><b>${proj}</b> · ${dayTxt}</div>
        <div><b>Call:</b> ${esc(d.callTime||"")} &nbsp; <b>Locación:</b> ${esc(d.location||"")}</div>
        <div class="dpHdrChips screenOnly">
          <span class="dpChip">Escenas: <b>${scenes.length}</b></span>
          <span class="dpChip">Pág: <b>${esc(fmtPages(pages))}</b></span>
        </div>
      </div>
    `;

    // ========= Vista "linda" (solo pantalla) =========
    const base = minutesFromHHMM(d.callTime || "08:00");
    const dpEndAbs = dayplanEndAbs(d);
    const snapMin = Number(el("schedSnap")?.value || 15);
    resolveOverlapsPushDown(d, snapMin);

    const pretty = document.createElement("div");
    pretty.className = "dayplanPretty screenOnly";

    const cards = items.map((it)=>{
      const absStart = clamp(base + (it.start||0), base, dpEndAbs - snapMin);
      const durMax = Math.max(snapMin, dpEndAbs - absStart);
      const dur = clamp(Math.max(snapMin, it.dur||snapMin), snapMin, durMax);
      const absEnd = clamp(absStart + dur, base, dpEndAbs);

      const isNote = it.kind==="block";
      const num = isNote ? "NOTA" : (it.number||"");
      const title = isNote ? (it.title||"Nota") : (it.slugline||it.title||"");
      const ie = isNote ? "" : (it.intExt||"");
      const locTxt = isNote ? "" : (it.location||"");
      const todTxt = isNote ? "" : (it.timeOfDay||"");
      const pagesTxt = isNote ? "" : ((Number(it.pages)||0) > 0 ? fmtPages(it.pages) : "");
      const sumTxt = isNote ? (it.detail||"") : (notesOrShortSummary(it.notes, it.summary) || "");

      const col = safeHexColor(it.color || (it.kind==="scene" ? "#BFDBFE" : "#E5E7EB"));
      const bg = hexToRgba(col, isNote ? 0.10 : 0.12);

      const tA = clockLabelAbs(absStart);
      const tB = clockLabelAbs(absEnd);

      const metaBits = [];
      if(ie) metaBits.push(ie);
      if(locTxt) metaBits.push(locTxt);
      if(todTxt) metaBits.push(todTxt);

      const tag = isNote ? "NOTA" : `#${num}`;

      return `
        <div class="dpRowCard" style="border-left:8px solid ${eattr(col)}">
          <div class="dpRowTime">
            <div class="dpT1">${esc(tA)}</div>
            <div class="dpT2">${esc(tB)}</div>
          </div>

          <div class="dpRowBody">
            <div class="dpRowTop">
              <div class="dpRowTitle">
                <span class="dpRowTag" style="background:${eattr(bg)};border-color:${eattr(col)}">${esc(tag)}</span>
                <span class="dpRowTitleTxt">${esc(title)}</span>
              </div>
              <div class="dpRowBadges">
                <span class="dpBadge">${esc(formatDurHHMMCompact(dur))}</span>
                ${pagesTxt ? `<span class="dpBadge">${esc(pagesTxt)} pág</span>` : ``}
              </div>
            </div>

            ${metaBits.length ? `<div class="dpRowMeta">${esc(metaBits.join(" · "))}</div>` : ``}
            ${sumTxt ? `<div class="dpRowSum">${esc(sumTxt)}</div>` : ``}
          </div>
        </div>
      `;
    }).join("");

    pretty.innerHTML = `
      <div class="dpPrettyList">
        ${cards || `<div class="muted">—</div>`}
      </div>
    `;
    box.appendChild(pretty);

    // ========= Vista de impresión (intacta) =========
    const rows = items.map((it)=>{
      const absStart = clamp(base + (it.start||0), base, dpEndAbs - snapMin);
      const durMax = Math.max(snapMin, dpEndAbs - absStart);
      const dur = clamp(Math.max(snapMin, it.dur||snapMin), snapMin, durMax);
      const absEnd = clamp(absStart + dur, base, dpEndAbs);
      const isNote = it.kind==="block";
      const num = isNote ? "NOTA" : (it.number||"");
      const title = isNote ? (it.title||"") : (it.slugline||it.title||"");
      const ie = isNote ? "" : (it.intExt||"");
      const locTxt = isNote ? "" : (it.location||"");
      const todTxt = isNote ? "" : (it.timeOfDay||"");
      const pagesTxt = isNote ? "" : ((Number(it.pages)||0) > 0 ? fmtPages(it.pages) : "");
      const sumTxt = isNote ? (it.detail||"") : (notesOrShortSummary(it.notes, it.summary) || "");
      const col = safeHexColor(it.color || (it.kind==="scene" ? "#BFDBFE" : "#E5E7EB"));
      const bg = hexToRgba(col, isNote ? 0.10 : 0.12);
      const tA = clockLabelAbs(absStart);
      const tB = clockLabelAbs(absEnd);
      const clockHTML = `<div class="dpClock2"><div>${esc(tA)}</div><div>${esc(tB)}</div></div>`;
      return `
  <tr class="${isNote ? "dpPrintNote" : ""}" style="background:${eattr(bg)};border-left:8px solid ${eattr(col)};">
    <td class="cHour">${clockHTML}</td>
    <td class="cDur">${esc(formatDurHHMMCompact(dur))}</td>
    <td class="cNro">${esc(num)}</td>
    <td class="cTitle">${esc(title)}</td>
    <td class="cIE">${esc(ie)}</td>
    <td class="cLoc">${esc(locTxt)}</td>
    <td class="cTod">${esc(todTxt)}</td>
    <td class="cSum">${esc(sumTxt)}</td>
  </tr>
`;
    }).join("");

    const printWrap = document.createElement("div");
    printWrap.className = "printOnly";
    printWrap.innerHTML = `
      <div class="items">
        <table class="dayplanPrintTable">
          <colgroup>
            <col class="colHour"><col class="colDur"><col class="colNro"><col class="colTitle">
            <col class="colIE"><col class="colLoc"><col class="colTod"><col class="colSum">
          </colgroup>
          <thead><tr><th>Hora</th><th>Dur</th><th>Nro</th><th>Título</th><th>I/E</th><th>Locación</th><th>Momento</th><th>Notas</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="8" class="muted">—</td></tr>`}</tbody>
        </table>
      </div>
    `;
    box.appendChild(printWrap);

    wrap.appendChild(box);
  }

  function renderReportShotlistDetail(d){
    const wrap = el("reportShotlistDetail");
    if(!wrap) return;
    wrap.innerHTML = "";
    if(!d){
      wrap.innerHTML = `<div class="catBlock"><div class="items">Elegí un día con rodaje.</div></div>`;
      return;
    }

    const scenes = (d.sceneIds||[]).map(getScene).filter(Boolean);
    const pages = scenes.reduce((acc, s)=> acc + (Number(s.pages)||0), 0);
    const totalShots = scenes.reduce((acc, s)=> acc + ((s.shots||[]).length), 0);

    const header = document.createElement("div");
    header.className = "catBlock";
    header.innerHTML = `
      <div class="hdr"><span class="dot" style="background:var(--cat-camera)"></span>Shotlist</div>
      <div class="items">
        <div><b>${esc(state.meta.title||"Proyecto")}</b> · ${esc(formatDayTitle(d.date))}${d.label? " · "+esc(d.label):""}</div>
        <div><b>Call:</b> ${esc(d.callTime||"")} &nbsp; <b>Locación:</b> ${esc(d.location||"")}</div>
        <div class="kpiRow" style="margin-top:10px;">
          <span class="kpi"><b>${scenes.length}</b> escenas</span>
          <span class="kpi"><b>${totalShots}</b> planos</span>
          <span class="kpi"><b>${fmtPages(pages)}</b> pág</span>
        </div>
      </div>
    `;
    wrap.appendChild(header);

    const list = document.createElement("div");
    list.className = "catBlock";
    list.innerHTML = `<div class="hdr"><span class="dot" style="background:var(--cat-props)"></span>Listado</div>`;

    const items = document.createElement("div");
    items.className = "items";
    if(!scenes.length){
      items.innerHTML = `<div>—</div>`;
    }else{
      items.innerHTML = scenes.map(s=>{
        const meta = [
          s.intExt||"",
          s.location||"",
          s.timeOfDay||"",
          (Number(s.pages)||0)>0 ? `${fmtPages(s.pages)} pág` : ""
        ].filter(Boolean).join(" · ");
        const shots = (s.shots||[]);
        const shotsHtml = shots.length
          ? `<div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
               ${shots.map((sh,i)=>{
                 const t = (sh.type||"").trim();
                 const desc = (sh.desc||"").trim();
                 return `<div><span class="muted">${i+1}.</span> <b>${esc(t||"Plano")}</b>${desc? ` · ${esc(desc)}`:""}</div>`;
               }).join("")}
             </div>`
          : `<div class="muted">Sin planos cargados</div>`;
        return `
          <div style="margin-top:12px;">
            <div><b>#${esc(s.number||"")}</b> ${esc(s.slugline||"")}</div>
            ${meta ? `<div class="muted small">${esc(meta)}</div>` : ``}
            ${shotsHtml}
          </div>
        `;
      }).join("");
    }
    list.appendChild(items);
    wrap.appendChild(list);
  }

  // Print orientation helper (para REPORTES)
  let _printOrientEl = null;
  function setPrintOrientation(orientation, marginMm=10){
    try{
      if(_printOrientEl) _printOrientEl.remove();
      _printOrientEl = document.createElement("style");
      _printOrientEl.id = "gb-print-orient";
      _printOrientEl.media = "print";
      const o = orientation === "landscape" ? "A4 landscape" : "A4 portrait";
      const m = (Number(marginMm)||0);
      _printOrientEl.textContent = `@page{ size:${o}; margin:${m}mm; }`;
      document.head.appendChild(_printOrientEl);
    }catch(_e){}
  }

  function clearPrintOrientation(){
    try{ if(_printOrientEl){ _printOrientEl.remove(); _printOrientEl = null; } }catch(_e){}
  }

  // ===================== PRINT: Shotlist (unificado para pestaña Shotlist y REPORTES) =====================
  let _gbPrintRoot = null;
  function ensureGbPrintRoot(){
    if(_gbPrintRoot) return _gbPrintRoot;
    _gbPrintRoot = document.createElement("div");
    _gbPrintRoot.id = "gbPrintRoot";
    _gbPrintRoot.className = "printOnly";
    document.body.appendChild(_gbPrintRoot);
    return _gbPrintRoot;
  }
  function cleanupGbPrintRoot(){
    try{ document.body.classList.remove("gbPrintingShotlist","gbPrintingCallsheet","gbPrintingElements","gbPrintingSchedule","gbPrintMobile"); }catch(_e){}
    try{ if(_gbPrintRoot) _gbPrintRoot.innerHTML = ""; }catch(_e){}
  }

  function applyPrintDeviceFlag(){
    try{
      const isMobile = !!(window.matchMedia && window.matchMedia("(max-width: 820px)").matches);
      document.body.classList.toggle("gbPrintMobile", isMobile);
    }catch(_e){}
  }

  function waitForImages(container, timeoutMs=2500){
    try{
      const imgs = Array.from(container?.querySelectorAll?.("img") || []).filter(im=>!!im.src);
      if(!imgs.length) return Promise.resolve();
      const ps = imgs.map(im=> new Promise(res=>{
        if(im.complete) return res();
        const done = ()=>{ try{ im.removeEventListener("load", done); im.removeEventListener("error", done); }catch(_e){} res(); };
        im.addEventListener("load", done);
        im.addEventListener("error", done);
      }));
      return Promise.race([Promise.all(ps), new Promise(res=>setTimeout(res, Number(timeoutMs)||2500))]);
    }catch(_e){
      return Promise.resolve();
    }
  }


  function buildShotlistPrintHTML(d){
    const project = state?.meta?.title || "Proyecto";
    const dayLabel = `${formatDayTitle(d.date)}${d.label ? " · "+d.label : ""}`.trim();

    // KPIs
    const scenes = (d.sceneIds||[]).map(getScene).filter(Boolean);
    const pages = scenes.reduce((acc, s)=> acc + (Number(s.pages)||0), 0);
    const totalShots = scenes.reduce((acc, s)=> acc + ((s.shots||[]).length), 0);

    let kpi = `
      <div class="shotPrintKpis">
        <span class="pill">Escenas: <b>${scenes.length}</b></span>
        <span class="pill">Planos: <b>${totalShots}</b></span>
        <span class="pill">Pág: <b>${fmtPages(pages)}</b></span>
      </div>
    `;

    const header = `
      <div class="shotPrintHeader">
        <div class="shotPrintTitle">Shotlist</div>
        <div class="shotPrintSub"><b>${esc(project)}</b> · ${esc(dayLabel||"Día")}</div>
        <div class="shotPrintMeta"><b>Call:</b> ${esc(d.callTime||"")} &nbsp; <b>Locación:</b> ${esc(d.location||"")}</div>
        ${kpi}
      </div>
    `;

    if(!scenes.length){
      return header + `<div class="muted">No hay escenas asignadas a este día.</div>`;
    }

    let out = header;
    for(const sid of (d.sceneIds||[])){
      const sc = getScene(sid);
      if(!sc) continue;
      ensureSceneExtras(sc);
      const st = Number(d.times?.[sid] ?? 0) || 0;
      const du = Number(d.durations?.[sid] ?? 60) || 60;
      const scStart = d.callTime ? fmtClockFromCall(d.callTime, st) : "";
      const scEnd = d.callTime ? fmtClockFromCall(d.callTime, st+du) : "";

      const shotsMin = sceneShotsTotalMin(sc);
      const warn = shotsMin > du ? "Planos > duración" : "";

      let rows = "";
      let offset = 0;
      const shots = (sc.shots||[]);
      if(!shots.length){
        rows = `<tr><td colspan="7" class="muted">Sin planos cargados para esta escena.</td></tr>`;
      }else{
        rows = shots.map((sh, idx)=>{
          const dur = shotDurMin(sh);
          const key = `${sid}|${sh.id}`;
          const done = !!d.shotsDone?.[key];
          const t = d.callTime ? fmtClockFromCall(d.callTime, st + offset) : "";
          offset += dur;
          return `
            <tr class="${done?"shotRowDone":""}">
              <td class="shotChk"><input type="checkbox" ${done?"checked":""} /></td>
              <td class="shotNum">${idx+1}</td>
              <td class="shotTime">${esc(t||"")}</td>
              <td class="shotType">${esc(normalizeShotType(sh.type)||sh.type||"Plano")}</td>
              <td class="shotThumb">${(sh.thumbUrl?`<img class="shotThumbImg" src="${esc(sh.thumbUrl)}" alt="thumb"/>`:"")}</td>
              <td>${esc(sh.desc||"")}</td>
              <td class="shotDur">${esc(String(dur||DEFAULT_SHOT_MIN))}</td>
            </tr>
          `;
        }).join("");
      }

      out += `
        <div class="shotSceneBox">
          <div class="shotSceneHead">
            <div>
              <div class="t">#${esc(sc.number||"")} — ${esc(sc.slugline||"")}</div>
              <div class="m">${esc(scStart||"")} → ${esc(scEnd||"")} · Escena: ${esc(formatDuration(du))} · Planos: ${esc(formatDuration(shotsMin))}</div>
            </div>
            ${warn ? `<div class="warn">${esc(warn)}</div>` : ""}
          </div>

          <div class="shotTableWrap">
            <div class="tableWrap">
              <table class="table shotTable">
                <thead>
                  <tr>
                    <th class="shotChk">✓</th>
                    <th class="shotNum">#</th>
                    <th class="shotTime">Hora</th>
                    <th class="shotType">Tipo</th>
                    <th class="shotThumb">Mini</th>
                    <th>Descripción</th>
                    <th class="shotDur">Min</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }
    return out;
  }

  function getReportsSelectedDayId(){
    // Prefer a valid focused day. If stored IDs point to deleted days, ignore them.
    const exists = (id)=> !!(id && getDay(id));
    if(!exists(callSheetDayId)) callSheetDayId = null;
    if(!exists(selectedDayId)) selectedDayId = null;
    if(!exists(selectedShotlistDayId)) selectedShotlistDayId = null;
    if(!exists(selectedDayplanDayId)) selectedDayplanDayId = null;

    return (callSheetDayId || selectedDayId || selectedShotlistDayId || selectedDayplanDayId || (state.shootDays?.[0]?.id || null));
  }

  
  function printCallSheetByDayId(dayId){
    const d = dayId ? getDay(dayId) : null;
    if(!d){ toast("Elegí un día con rodaje"); return; }
    ensureDayTimingMaps(d);
    applyPrintDeviceFlag();
    const root = ensureGbPrintRoot();
    root.innerHTML = `<div id="callSheetPrintRoot" class="callSheetPrintPage"></div>`;
    const target = root.querySelector("#callSheetPrintRoot");
    renderCallSheetDetail(target, dayId);
    document.body.classList.add("gbPrintingCallsheet");
    // Menos margen para que arranque más arriba
    setPrintOrientation("portrait", 6);
    try{ window.print(); } finally { clearPrintOrientation(); cleanupGbPrintRoot(); }
  }

  function printElementsByDayId(dayId){
    const d = dayId ? getDay(dayId) : null;
    if(!d){ toast("Elegí un día con rodaje"); return; }
    ensureDayTimingMaps(d);

    applyPrintDeviceFlag();
    const root = ensureGbPrintRoot();
    root.innerHTML = buildElementsByScenePrintPage(d, { title: "Elementos por escena" });

    document.body.classList.add("gbPrintingElements");
    setPrintOrientation("portrait", 6);
    try{ window.print(); } finally { clearPrintOrientation(); cleanupGbPrintRoot(); }
  }



async function printShotlistByDayId(dayId){
    const d = dayId ? getDay(dayId) : null;
    if(!d){ toast("Elegí un día con rodaje"); return; }
    ensureDayTimingMaps(d);
    ensureDayShotsDone(d);
    applyPrintDeviceFlag();
    const root = ensureGbPrintRoot();
    root.innerHTML = buildShotlistPrintHTML(d);
    document.body.classList.add("gbPrintingShotlist");
    setPrintOrientation("portrait");
    try{
      await waitForImages(root, 2500);
      window.print();
    } finally { clearPrintOrientation(); cleanupGbPrintRoot(); }
  }


// ===================== PRINT: Plan General (todos los días) =====================
function buildPlanGeneralPrintHTML(){
  sortShootDaysInPlace();
  const project = esc(state?.meta?.title || "Proyecto");
  const gen = new Date().toLocaleString("es-AR");

  const allDays = (state.shootDays || []);
  const days = getScheduleDaysFiltered();
  if(!days.length){
    const msg = allDays.length ? "No hay días seleccionados." : "No hay días cargados.";
    return `
      <div class="pgPrintWrap">
        <div class="pgPrintHeader">
          <div class="pgHeaderLeft">
            <div class="pgTitle">Plan General</div>
            <div class="pgProject">${project}</div>
          </div>
          <div class="pgHeaderRight">
            <div><b>Generado:</b> ${esc(gen)}</div>
          </div>
        </div>
        <div class="muted">${esc(msg)}</div>
      </div>
    `;
  }

  // KPIs simples para el header
  const firstDate = days[0]?.date || "";
  const lastDate  = days[days.length-1]?.date || "";
  const range = (firstDate && lastDate)
    ? (firstDate === lastDate ? formatDayTitle(firstDate) : `${formatDayTitle(firstDate)} → ${formatDayTitle(lastDate)}`)
    : "";
  const kpis = `${days.length} día${days.length===1?"":"s"}${range ? " · "+esc(range) : ""}`;

  const cards = days.map((d)=>{
    ensureDayTimingMaps(d);
    const dayTitle = `${formatDayTitle(d.date)}${d.label ? " · "+d.label : ""}`.trim();
    const call = d.callTime || "";
    const loc  = d.location || "";

    const span = Math.max(5, dayplanAvailSpan(d));
    const items = [];

    for(const sid of (d.sceneIds||[])){
      const s = getScene(sid);
      if(!s) continue;
      const startMin = clamp(Number(d.times?.[sid] ?? 0) || 0, 0, Math.max(0, span-1));
      const durMin   = clamp(Number(d.durations?.[sid] ?? 60) || 60, 5, span);
      items.push({
        kind:"scene",
        start:startMin,
        dur:durMin,
        title:`#${s.number||""} — ${s.slugline||""}`.trim()
      });
    }

    for(const b of (d.blocks||[])){
      if(!b) continue;
      const startMin = clamp(Number(b.startMin ?? 0) || 0, 0, Math.max(0, span-1));
      const durMin   = clamp(Number(b.durMin ?? 30) || 30, 5, span);
      items.push({
        kind:"block",
        start:startMin,
        dur:durMin,
        title:`🗒 ${b.title||"Tarea"}`
      });
    }

    items.sort((a,b)=> (a.start||0) - (b.start||0));

    const rows = items.length ? items.map((it)=>{
      const tA = clockLabelFromCall(d, it.start||0);
      const tB = clockLabelFromCall(d, (it.start||0) + (it.dur||0));
      const dur = formatDurHHMMCompact(it.dur||0);
      const cls = it.kind==="block" ? "pgRowNote" : "";
      return `
        <tr class="${cls}">
          <td class="pgTime"><span class="pgT">${esc(tA)}</span><span class="pgSep">–</span><span class="pgT">${esc(tB)}</span></td>
          <td class="pgItem">${esc(it.title||"")}</td>
          <td class="pgDur">${esc(dur)}</td>
        </tr>
      `;
    }).join("") : `<tr><td colspan="3" class="muted">—</td></tr>`;

    const nightBadge = d.night ? `<span class="pgBadge">Nocturno</span>` : "";

    const pills = `
      <div class="pgPills">
        <span class="pgPill"><b>Call</b> ${esc(call||"—")}</span>
        <span class="pgPill"><b>Locación</b> ${esc(loc||"—")}</span>
      </div>
    `;

    return `
      <div class="pgDayCard">
        <div class="pgDayHead">
          <div class="pgDayTop">
            <div class="pgDayTitle">${esc(dayTitle||"Día")}</div>
            ${nightBadge}
          </div>
          <div class="pgDayMeta">${pills}</div>
        </div>

        <table class="pgTable">
          <thead>
            <tr>
              <th style="width:110px;">Hora</th>
              <th>Escena / Tarea</th>
              <th style="width:58px; text-align:right;">Dur</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join("");

  return `
    <div class="pgPrintWrap">
      <div class="pgPrintHeader">
        <div class="pgHeaderLeft">
          <div class="pgTitle">Plan General</div>
          <div class="pgProject">${project}</div>
          <div class="pgKpis">${kpis}</div>
        </div>
        <div class="pgHeaderRight">
          <div><b>Generado:</b> ${esc(gen)}</div>
          <div><b>Días:</b> ${days.length}</div>
        </div>
      </div>
      <div class="pgGrid">${cards}</div>
    </div>
  `;
}

async function printPlanGeneral(){
  applyPrintDeviceFlag();
  const root = ensureGbPrintRoot();
  root.innerHTML = buildPlanGeneralPrintHTML();
  document.body.classList.add("gbPrintingSchedule");
  setPrintOrientation("landscape", 6);
  try{
    await waitForImages(root, 2500);
    window.print();
  } finally { clearPrintOrientation(); cleanupGbPrintRoot(); }
}


  // Bank collapse
  function applyBankCollapsedUI(){
    const layout = el("shootingLayout");
    if(!layout) return;
    const collapsed = localStorage.getItem("gb_bank_collapsed")==="1";
    layout.classList.toggle("bankCollapsed", collapsed);

    const isMobile = window.matchMedia("(max-width: 820px)").matches;

    const dock = el("bankDock");
    if(dock){
      if(isMobile) dock.classList.add("hidden");
      else dock.classList.toggle("hidden", !collapsed);
    }
    syncBankDockPlacement(collapsed, isMobile);
    applyDayplanBankCollapsedUI();
  }

  function applyDayplanBankCollapsedUI(){
    const layout = el("dayplanLayout");
    if(!layout) return;
    const collapsed = localStorage.getItem("gb_bank_collapsed")==="1";
    layout.classList.toggle("bankCollapsed", collapsed);

    const isMobile = window.matchMedia("(max-width: 820px)").matches;
    const dock = el("dpBankDock");
    if(dock){
      if(isMobile) dock.classList.add("hidden");
      else dock.classList.toggle("hidden", !collapsed);
    }
  }


  function syncBankDockPlacement(collapsed, isMobile){
    const btn = el("btnToggleBankDock");
    const dock = el("bankDock");
    const header = el("daysBoardCard")?.querySelector(".cardHeader");
    if(!btn || !dock || !header) return;

    let slot = header.querySelector(".bankToggleSlot");
    if(!slot){
      slot = document.createElement("div");
      slot.className = "bankToggleSlot hidden";
      header.insertBefore(slot, header.firstChild);
    }

    if(isMobile){
      if(collapsed){
        slot.classList.remove("hidden");
        if(btn.parentElement !== slot) slot.appendChild(btn);
      }else{
        slot.classList.add("hidden");
        if(btn.parentElement !== dock) dock.appendChild(btn);
      }
    }else{
      slot.classList.add("hidden");
      if(btn.parentElement !== dock) dock.appendChild(btn);
    }
  }
  function expandBank(){
    localStorage.setItem("gb_bank_collapsed","0");
    applyBankCollapsedUI();
    applyDayplanBankCollapsedUI();
  }

  // Settings JSONBin
  function saveCfgFromUI(){
    // Config fija (credenciales embebidas + autosync ON)
    StorageLayer.saveCfg(StorageLayer.loadCfg());
    toast("Config fija (Autosync ON) ✅");
  }
  async function testCfg(){
    const cfg = StorageLayer.loadCfg();
    if(!cfg.binId || !cfg.accessKey) return toast("Falta Bin ID o Access Key");
    try{
      await StorageLayer.jsonbinGet(cfg.binId, cfg.accessKey);
      if(cfg.scriptBinId) await StorageLayer.jsonbinGet(cfg.scriptBinId, cfg.accessKey);
      toast("Conexión JSONBin OK ✅");
    }catch(err){
      console.error(err);
      toast("Conexión falló ❌");
    }
  }
  async function pullRemote(){
    const cfg = StorageLayer.loadCfg();
    if(!cfg.binId || !cfg.accessKey) return toast("Falta Bin ID o Access Key");
    try{
      const [core, packRaw] = await Promise.all([
        StorageLayer.jsonbinGet(cfg.binId, cfg.accessKey),
        cfg.scriptBinId ? StorageLayer.jsonbinGet(cfg.scriptBinId, cfg.accessKey).catch(()=>null) : Promise.resolve(null)
      ]);

      if(!core || !core.meta) return toast("Remoto vacío o inválido");
      if(!isValidState(core)) return toast("Remoto inválido");

      const pack = isValidScriptPack(packRaw) ? packRaw : null;
      state = mergeStateFromBins(core, pack);

      StorageLayer.saveLocal(state);

      lastRemoteStamp = String(core?.meta?.updatedAt || "");
      StorageLayer.setRemoteStamp(cfg.binId, lastRemoteStamp);

      if(cfg.scriptBinId){
        lastScriptRemoteStamp = String(packRaw?.meta?.updatedAt || "");
        StorageLayer.setRemoteStamp(cfg.scriptBinId, lastScriptRemoteStamp);
      }

      toast("Remoto cargado ✅");
      hydrateAll();
      updateSyncPill("JSONBin");
    }catch(err){
      console.error(err);
      toast("No pude traer remoto ❌");
    }
  }
  async function pushRemote(){
    const cfg = StorageLayer.loadCfg();
    if(!cfg.binId || !cfg.accessKey) return toast("Falta Bin ID o Access Key");
    try{
      const snapshot = JSON.parse(JSON.stringify(state));
      const pushStamp = String(snapshot?.meta?.updatedAt || "");
      const { core, pack } = splitStateForBins(snapshot);

      await StorageLayer.jsonbinPut(cfg.binId, cfg.accessKey, core);
      lastRemoteStamp = pushStamp;
      StorageLayer.setRemoteStamp(cfg.binId, lastRemoteStamp);

      if(cfg.scriptBinId){
        await StorageLayer.jsonbinPut(cfg.scriptBinId, cfg.accessKey, pack);
        lastScriptRemoteStamp = pushStamp;
        StorageLayer.setRemoteStamp(cfg.scriptBinId, lastScriptRemoteStamp);
      }

      toast("Estado subido ✅");
      updateSyncPill("JSONBin");
    }catch(err){
      console.error(err);
      toast("No pude subir ❌");
    }
  }


  // ===================== Breakdown Import (Excel/CSV) =====================
  const BD_SCENE_NUM_ALIASES = ["scenenumber","scene","escena","nro","numero","nroescena","numescena","#"];
  const BD_LONG_SCENE_ALIASES = BD_SCENE_NUM_ALIASES.concat(["scenenro","escenanro"]);
  const BD_LONG_CAT_ALIASES = ["category","categoria","cat","depto","departamento"];
  const BD_LONG_ITEM_ALIASES = ["item","elemento","nombre","name","value","valor"];

  const BD_CAT_SYNONYMS = {
    cast: ["reparto","personajes","personaje","actor","actores","talento"],
    props: ["utileria","utileriaprops","objetos","objeto"],
    wardrobe: ["ropa"],
    art: ["escenografia","escenografiaarte","decorado","setdressing"],
    makeup: ["mua","peinado","hair","hairmakeup"],
    sound: [],
    sfx: ["fx","efectosespeciales","efectoespecial"],
    vfx: ["postvfx","cgi","efectosvisuales","efectovisual"],
    vehicles: ["vehiculos","vehiculo","autos","auto"],
    animals: ["animales","animal"],
    extras: ["figuracion","figurantes","extra"]
  };

  function bdNormKey(k){
    return String(k||"").trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9]+/g,"");
  }

  const BD_CAT_LOOKUP = {};
  function bdInitCatLookup(){
    if(bdInitCatLookup._done) return;
    bdInitCatLookup._done = true;
    for(const cat of cats){
      BD_CAT_LOOKUP[bdNormKey(cat)] = cat;
      BD_CAT_LOOKUP[bdNormKey(catNames[cat]||cat)] = cat;
      for(const a of (BD_CAT_SYNONYMS[cat]||[])) BD_CAT_LOOKUP[bdNormKey(a)] = cat;
    }
  }

  function bdResolveCatKey(label){
    bdInitCatLookup();
    const k = bdNormKey(label);
    return BD_CAT_LOOKUP[k] || "";
  }

  function bdNormRow(obj){
    const row = {};
    if(!obj) return row;
    for(const k of Object.keys(obj)) row[bdNormKey(k)] = obj[k];
    return row;
  }

  function bdGetCell(row, aliases){
    for(const a of (aliases||[])){
      const k = bdNormKey(a);
      if(Object.prototype.hasOwnProperty.call(row, k)) return { present:true, value: row[k] };
    }
    return { present:false, value: "" };
  }

  function bdStr(v){
    if(v==null) return "";
    if(typeof v === "string") return v;
    return String(v);
  }

  function bdSplitList(v){
    const s = bdStr(v).trim();
    if(!s) return [];
    return s.split(/[\n\r,;|]+/g).map(x=>x.trim()).filter(Boolean);
  }

  function bdDedupe(list){
    const seen = new Set();
    const out = [];
    for(const raw of (list||[])){
      const it = String(raw||"").trim();
      if(!it) continue;
      const key = it.toLowerCase();
      if(seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
    return out;
  }

  function bdMergeLists(existing, add){
    const base = Array.isArray(existing) ? existing.slice() : [];
    const seen = new Set(base.map(x=>String(x||"").trim().toLowerCase()).filter(Boolean));
    let added = 0;
    for(const raw of (add||[])){
      const it = String(raw||"").trim();
      if(!it) continue;
      const key = it.toLowerCase();
      if(seen.has(key)) continue;
      seen.add(key);
      base.push(it);
      added++;
    }
    return { list: base, added };
  }

  function bdDownloadText(filename, content, mime="text/plain"){
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ try{ URL.revokeObjectURL(url); }catch(_e){} a.remove(); }, 0);
  }

  function bdCsvEscape(v){
    const s = String(v==null ? "" : v);
    if(/[\",\n\r;]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }

  function bdDownloadTemplateWide(){
    const headers = [
      "SceneNumber",
      "Cast","Props","Vestuario","Arte","Maquillaje","Sonido","SFX","VFX","Vehiculos","Animales","Extras"
    ];
    const sample = [
      "1",
      "JUAN; ANA",
      "Llaves; Pistola",
      "Traje gris",
      "Silla rota",
      "Herida en mejilla",
      "",
      "",
      "",
      "",
      "",
      ""
    ];
    const csv = [headers.join(","), sample.map(bdCsvEscape).join(",")].join("\n");
    bdDownloadText("breakdown_template_por_escena.csv", csv, "text/csv;charset=utf-8");
  }

  function bdDownloadTemplateLong(){
    const headers = ["SceneNumber","Category","Item"];
    const rows = [
      ["1","Cast","JUAN"],
      ["1","Cast","ANA"],
      ["1","Props","Llaves"],
      ["1","Vestuario","Traje gris"]
    ];
    const csv = [headers.join(",")].concat(rows.map(r=>r.map(bdCsvEscape).join(","))).join("\n");
    bdDownloadText("breakdown_template_por_item.csv", csv, "text/csv;charset=utf-8");
  }

  function bdDetectCsvDelimiter(line){
    const c = (line.match(/,/g)||[]).length;
    const s = (line.match(/;/g)||[]).length;
    const t = (line.match(/\t/g)||[]).length;
    if(s > c && s >= t) return ";";
    if(t > c && t > s) return "\t";
    return ",";
  }

  function bdParseCSV(text){
    const firstLine = (String(text||"").split(/\r?\n/)[0]||"");
    const delim = bdDetectCsvDelimiter(firstLine);
    const rows = [];
    let row = [];
    let cur = "";
    let inQ = false;

    const str = String(text||"");
    for(let i=0;i<str.length;i++){
      const ch = str[i];
      if(inQ){
        if(ch === '"'){
          if(str[i+1] === '"'){ cur += '"'; i++; }
          else { inQ = false; }
        }else{
          cur += ch;
        }
      }else{
        if(ch === '"'){ inQ = true; }
        else if(ch === delim){ row.push(cur); cur = ""; }
        else if(ch === "\n"){
          row.push(cur); rows.push(row);
          row = []; cur = "";
        }else if(ch === "\r"){
          // ignore
        }else{
          cur += ch;
        }
      }
    }
    row.push(cur); rows.push(row);

    while(rows.length && rows[rows.length-1].every(c=>String(c||"").trim()==="")) rows.pop();
    return rows;
  }

  function bdRowsToObjects(rows){
    if(!rows || !rows.length) return [];
    const headers = (rows[0]||[]).map(h=>String(h||"").trim());
    const out = [];
    for(let r=1;r<rows.length;r++){
      const line = rows[r] || [];
      const obj = {};
      let empty = true;
      for(let c=0;c<headers.length;c++){
        const key = headers[c] || ("col"+(c+1));
        const val = (c < line.length) ? line[c] : "";
        if(String(val||"").trim()!=="") empty = false;
        obj[key] = val;
      }
      if(!empty) out.push(obj);
    }
    return out;
  }

  function bdReadFileText(file){
    return new Promise((res, rej)=>{
      const fr = new FileReader();
      fr.onload = ()=> res(String(fr.result||""));
      fr.onerror = ()=> rej(fr.error || new Error("No pude leer el archivo"));
      fr.readAsText(file);
    });
  }

  function bdReadFileArrayBuffer(file){
    return new Promise((res, rej)=>{
      const fr = new FileReader();
      fr.onload = ()=> res(fr.result);
      fr.onerror = ()=> rej(fr.error || new Error("No pude leer el archivo"));
      fr.readAsArrayBuffer(file);
    });
  }



  function bdLoadScript(url){
    return new Promise((res)=>{
      try{
        const s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = ()=>res(true);
        s.onerror = ()=>res(false);
        document.body.appendChild(s);
      }catch(_e){ res(false); }
    });
  }

  async function bdEnsureXLSX(){
    if(window.XLSX) return true;
    // Fallbacks por si jsdelivr queda bloqueado en mobile
    const urls = [
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
      'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
    ];
    for(const u of urls){
      await bdLoadScript(u);
      if(window.XLSX) return true;
    }
    return !!window.XLSX;
  }
  async function bdParseFileToRowObjects(file){
    const name = String(file?.name||"").toLowerCase();
    if(name.endsWith(".csv")){
      const t = await bdReadFileText(file);
      return bdRowsToObjects(bdParseCSV(t));
    }
    if(!window.XLSX){
      const ok = await bdEnsureXLSX();
      if(!ok) throw new Error("No se pudo cargar window.XLSX. Tip: exportá el Excel a CSV.");
    }
    const buf = await bdReadFileArrayBuffer(file);
    const wb = window.XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames?.[0];
    const sheet = wb.Sheets?.[sheetName];
    if(!sheet) return [];
    return window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  }

  function bdBuildSceneMap(){
    const map = new Map();
    for(const s of (state.scenes||[])){
      const key = canonSceneNumber(s.number);
      if(!key) continue;
      if(!map.has(key)) map.set(key, s);
    }
    return map;
  }

  function bdIsLongRow(nrow){
    const hasCat = BD_LONG_CAT_ALIASES.some(a=>Object.prototype.hasOwnProperty.call(nrow, bdNormKey(a)));
    const hasItem = BD_LONG_ITEM_ALIASES.some(a=>Object.prototype.hasOwnProperty.call(nrow, bdNormKey(a)));
    return hasCat && hasItem;
  }

  function bdAnalyzeImport(normRows, opts){
    const sceneMap = bdBuildSceneMap();
    const touched = new Set();
    let missing = 0;
    let unknownCats = 0;
    let items = 0;
    const isLong = normRows.some(bdIsLongRow);

    for(const row of normRows){
      const sn = bdGetCell(row, isLong ? BD_LONG_SCENE_ALIASES : BD_SCENE_NUM_ALIASES);
      const num = canonSceneNumber(sn.value);
      if(!num) continue;
      if(!sceneMap.has(num)) missing++;
      touched.add(num);

      if(isLong){
        const catLabel = bdGetCell(row, BD_LONG_CAT_ALIASES).value;
        const ck = bdResolveCatKey(catLabel);
        if(!ck){ unknownCats++; continue; }
        const it = bdSplitList(bdGetCell(row, BD_LONG_ITEM_ALIASES).value);
        items += it.length;
      }else{
        for(const cat of cats){
          const aliases = [cat, catNames[cat]].concat(BD_CAT_SYNONYMS[cat]||[]);
          const cell = bdGetCell(row, aliases);
          if(!cell.present) continue;
          const it = bdSplitList(cell.value);
          items += it.length;
        }
      }
    }

    return {
      format: isLong ? "por_item" : "por_escena",
      rows: normRows.length,
      scenesTouched: touched.size,
      missing,
      willCreate: opts.createMissing ? missing : 0,
      unknownCats,
      items
    };
  }

  function bdApplyImport(normRows, opts){
    const sceneMap = bdBuildSceneMap();
    const isLong = normRows.some(bdIsLongRow);
    let created = 0;
    let touched = 0;
    let missing = 0;
    let unknownCats = 0;
    let itemsAdded = 0;
    let changed = false;
    const touchedScenes = new Set();
    const cleared = new Set();

    function getOrCreate(numCanon){
      let sc = sceneMap.get(numCanon);
      if(sc) return sc;
      missing++;
      if(!opts.createMissing) return null;
      const s = {
        id: uid("scene"),
        number: makeUniqueSceneNumber(numCanon, null) || numCanon,
        slugline:"",
        intExt:"",
        location:"",
        timeOfDay:"",
        pages:0,
        summary:"",
        notes:"",
        elements: Object.fromEntries(cats.map(c=>[c,[]])),
        shots: []
      };
      state.scenes.push(s);
      ensureSceneExtras(s);
      // map by both: original key y el key final
      sceneMap.set(numCanon, s);
      sceneMap.set(canonSceneNumber(s.number), s);
      created++;
      changed = true;
      return s;
    }

    for(const row of normRows){
      const sn = bdGetCell(row, isLong ? BD_LONG_SCENE_ALIASES : BD_SCENE_NUM_ALIASES);
      const numCanon = canonSceneNumber(sn.value);
      if(!numCanon) continue;
      const s = getOrCreate(numCanon);
      if(!s) continue;
      ensureSceneExtras(s);
      touchedScenes.add(s.id);

      if(isLong){
        const catLabel = bdGetCell(row, BD_LONG_CAT_ALIASES).value;
        const ck = bdResolveCatKey(catLabel);
        if(!ck){ unknownCats++; continue; }
        const items = bdDedupe(bdSplitList(bdGetCell(row, BD_LONG_ITEM_ALIASES).value));
        if(opts.mode === "replace"){
          const key = s.id + "|" + ck;
          if(!cleared.has(key)){
            s.elements[ck] = [];
            cleared.add(key);
            changed = true;
          }
        }
        const merged = bdMergeLists(s.elements[ck], items);
        if(merged.added){
          s.elements[ck] = merged.list;
          itemsAdded += merged.added;
          changed = true;
        }
      }else{
        for(const cat of cats){
          const aliases = [cat, catNames[cat]].concat(BD_CAT_SYNONYMS[cat]||[]);
          const cell = bdGetCell(row, aliases);
          if(!cell.present) continue;
          const parsed = bdDedupe(bdSplitList(cell.value));
          if(opts.mode === "replace"){
            // si está presente pero vacío, limpia
            const before = (s.elements[cat]||[]).join("\u0000");
            s.elements[cat] = parsed;
            const after = (s.elements[cat]||[]).join("\u0000");
            if(before !== after) changed = true;
          }else{
            const merged = bdMergeLists(s.elements[cat], parsed);
            if(merged.added){
              s.elements[cat] = merged.list;
              itemsAdded += merged.added;
              changed = true;
            }
          }
        }
      }
    }

    touched = touchedScenes.size;
    if(changed){
      sortScenesByNumberInPlace();
      touch();
    }

    return { format: isLong ? "por_item" : "por_escena", touched, created, missing, unknownCats, itemsAdded, changed };
  }

  async function runBreakdownImportFromUI(){
    const inp = el("bdFileInput");
    const pill = el("bdImportStatus");
    const modeSel = el("bdImportMode");
    const createChk = el("bdImportCreateMissing");

    const file = inp?.files?.[0];
    if(!file) return toast("Elegí un .xlsx o .csv");

    const opts = {
      mode: (modeSel?.value === "replace") ? "replace" : "merge",
      createMissing: !!createChk?.checked
    };

    try{
      if(pill) pill.textContent = "Leyendo…";
      const rows = await bdParseFileToRowObjects(file);
      const normRows = rows.map(bdNormRow);
      const a = bdAnalyzeImport(normRows, opts);

      const msg = [
        `Importar Breakdown (${a.format.replace('_',' ')})`,
        `Filas: ${a.rows}`,
        `Escenas referenciadas: ${a.scenesTouched}`,
        `Faltantes: ${a.missing}${opts.createMissing ? ` (se crearán)` : ""}`,
        `Ítems detectados: ${a.items}`,
        a.unknownCats ? `Categorías desconocidas: ${a.unknownCats}` : "",
        "\n¿Aplicar cambios?"
      ].filter(Boolean).join("\n");

      if(!confirm(msg)){
        if(pill) pill.textContent = "Cancelado";
        return;
      }

      const res = bdApplyImport(normRows, opts);

      if(pill){
        pill.textContent = res.changed
          ? `OK: ${res.touched} escenas · +${res.itemsAdded} ítems${res.created ? ` · ${res.created} creadas` : ""}`
          : "Sin cambios";
      }

      // refrescamos lo necesario
      renderScenesTable();
      renderSceneEditor();
      renderScriptUI();
      renderSceneBank();
      renderDaysBoard();
      renderDayDetail();
      renderElementsExplorer();
      renderReports();
      renderScheduleBoard();
      renderReportsDetail();
      try{ renderShotList(); }catch(_e){}

      toast("Breakdown importado ✅");
    }catch(err){
      console.error(err);
      if(pill) pill.textContent = "Error";
      toast(err?.message ? String(err.message) : "Error importando");
    }
  }


  // Bind events (igual que antes, pero llamamos setupScheduleTopScrollbar después de render schedule)
  function bindEvents(){
    document.querySelectorAll(".navBtn, .mDockBtn").forEach(b=>{
      b.addEventListener("click", ()=>{
        const v = b.dataset.view;
        if(v) showView(v);
      });
    });

    el("btnAddScene")?.addEventListener("click", addScene);
    el("btnDuplicateScene")?.addEventListener("click", duplicateScene);
    el("btnDeleteScene")?.addEventListener("click", deleteScene);
    el("sceneSearch")?.addEventListener("input", renderScenesTable);
    el("sceneFilterTOD")?.addEventListener("change", renderScenesTable);


// Breakdown: Importar (Excel/CSV)
el("btnBDTemplateWide")?.addEventListener("click", bdDownloadTemplateWide);
el("btnBDTemplateLong")?.addEventListener("click", bdDownloadTemplateLong);
el("btnBDImport")?.addEventListener("click", runBreakdownImportFromUI);
el("bdFileInput")?.addEventListener("change", ()=>{
  const f = el("bdFileInput")?.files?.[0];
  const pill = el("bdImportStatus");
  if(pill) pill.textContent = f ? `Listo: ${f.name}` : "—";
});


    el("schedSearch")?.addEventListener("input", renderScheduleBoard);
    el("reportsSearch")?.addEventListener("input", renderReports);

    // Call Diario: selector de día
    el("shootDaySelect")?.addEventListener("change", ()=>{
      selectedDayId = el("shootDaySelect").value;

      // Sync global "día enfocado" para que Reportes / Call Sheet no queden mirando otro día
      selectedDayplanDayId = selectedDayId;
      selectedShotlistDayId = selectedDayId;
      callSheetDayId = selectedDayId;

      renderDayDetail();
      renderDayPlan();
      try{ renderShotList(); }catch(_e){}
      try{ renderReports(); }catch(_e){}
      try{ renderCallSheetCalendar(); }catch(_e){}
      try{ renderReportsDetail(); }catch(_e){}
    });
// Plan del día
    el("dayplanSelect")?.addEventListener("change", ()=>{
      selectedDayplanDayId = el("dayplanSelect").value;

      // Sync con Call Diario / Call Sheet / Shotlist
      selectedDayId = selectedDayplanDayId;
      selectedShotlistDayId = selectedDayplanDayId;
      callSheetDayId = selectedDayplanDayId;

      renderDayPlan();
      renderDayDetail();
      try{ renderShotList(); }catch(_e){}
      try{ renderReports(); }catch(_e){}
      try{ renderCallSheetCalendar(); }catch(_e){}
      try{ renderReportsDetail(); }catch(_e){}
    });
el("btnDayplanAddNote")?.addEventListener("click", addDayplanNote);
    el("btnDayplanAuto")?.addEventListener("click", ()=>{
      const d = selectedDayplanDayId ? getDay(selectedDayplanDayId) : null;
      if(!d) return;
      resolveOverlapsPushDown(d, getDayplanSnap());
      touch();
      renderDayPlan();
      renderScheduleBoard();
      renderReportsDetail();
      renderReports();
    });

    el("btnDayplanNight")?.addEventListener("click", ()=>{
      if(isReadOnly()) return roToast();
      const dayId = selectedDayplanDayId || selectedDayId || state.shootDays?.[0]?.id || null;
      const d = dayId ? getDay(dayId) : null;
      if(!d) return toast("No hay día seleccionado.");
      ensureDayTimingMaps(d);

      d.night = !d.night;

      // Re-normalizar por si había items fuera de rango (p.ej. al apagar nocturno)
      resolveOverlapsPushDown(d, getDayplanSnap());
      touch();
      renderDayPlan();
      renderScheduleBoard();
      renderDayDetail();
      renderReportsDetail();
      renderReports();
    });
    el("btnDayplanPrint")?.addEventListener("click", ()=>{ setPrintOrientation("landscape"); window.print(); });
    el("dayplanSnap")?.addEventListener("change", ()=> renderDayPlan());
    el("dayplanZoom")?.addEventListener("change", ()=>{
      const sc = el("dpScroller");
      const d = selectedDayplanDayId ? getDay(selectedDayplanDayId) : null;
      const oldPpm = Number(sc?.dataset.ppm || 0) || (getDayplanPPM() || DAYPLAN_PPM);

      let centerAbs = null;
      if(sc && d){
        const base = minutesFromHHMM(d.callTime || "08:00");
        const dpStartAbs = Math.floor(base/60)*60;
        const centerY = (sc.scrollTop||0) + (sc.clientHeight||0)/2;
        centerAbs = dpStartAbs + (centerY / oldPpm);
      }

      try{ localStorage.setItem("gb_dayplan_zoom", String(el("dayplanZoom")?.value || "")); }catch(_e){}
      renderDayPlan();

      if(sc && d && centerAbs!=null){
        const base = minutesFromHHMM(d.callTime || "08:00");
        const dpStartAbs = Math.floor(base/60)*60;
        const newPpm = getDayplanPPM() || DAYPLAN_PPM;
        const newCenterY = (centerAbs - dpStartAbs) * newPpm;
        sc.scrollTop = Math.max(0, newCenterY - (sc.clientHeight||0)/2);
      }
    });

    // Número de escena: no permitimos duplicados (si chocan, auto 6A/6B…)
    const numNode = el("scene_number");
    numNode?.addEventListener("input", ()=>{
      const s = selectedSceneId ? getScene(selectedSceneId) : null;
      if(!s) return;
      s.number = numNode.value;
      renderScenesTable();
      renderSceneBank();
      renderDaysBoard();
      renderDayDetail();
      renderReports();
      renderScheduleBoard();
      renderReportsDetail();
    });
    numNode?.addEventListener("blur", ()=>{
      const s = selectedSceneId ? getScene(selectedSceneId) : null;
      if(!s) return;
      const before = canonSceneNumber(s.number);
      const fixed = makeUniqueSceneNumber(numNode.value, s.id);
      if(!fixed){
        s.number = "";
        numNode.value = "";
        touch();
        renderScenesTable();
        return;
      }
      s.number = fixed;
      numNode.value = fixed;
      if(canonSceneNumber(fixed)!==before){
        toast(`Número ajustado → ${fixed}`);
      }
      sortScenesByNumberInPlace();
      touch();
      renderScenesTable();
      renderSceneEditor();
      renderScriptUI();
      renderSceneBank();
      renderDaysBoard();
      renderDayDetail();
      renderElementsExplorer();
      renderReports();
      renderScheduleBoard();
      renderReportsDetail();
    });

    ["chapter","slugline","intExt","location","timeOfDay","pages","summary","notes"].forEach(k=>{
      const node = el(`scene_${k}`);
      if(!node) return;

      const handler = ()=>{
        const s = selectedSceneId ? getScene(selectedSceneId) : null;
        if(!s) return;

        if(k==="chapter"){
          const raw = String(node.value||"").trim();
          s[k] = raw ? Number(raw) : "";
        }else if(k==="pages"){
          s[k] = Number(node.value||0);
        }else if(k==="timeOfDay"){
          s[k] = normalizeTOD(node.value);
        }else if(k==="intExt"){
          const v = String(node.value||"").trim();
          s[k] = (v==="Int" || v==="Ext") ? v : "";
        }else{
          s[k] = node.value;
        }

        // Extra útil: si el título tiene formato de slugline, autocompletamos I/E, Lugar, Momento (sin pisar lo que ya llenaste)
        if(k==="slugline"){
          const up = String(s.slugline||"").toUpperCase();
          if(/[-–—]/.test(up) || /\b(DIA|DÍA|NOCHE|AMANECER|ATARDECER)\b/.test(up) || /^\s*(INT|EXT|INTERIOR|EXTERIOR)\b/i.test(up)){
            const ie = sluglineToIntExt(s.slugline);
            const { location, timeOfDay } = sluglineToLocTOD(s.slugline);
            let changed = false;
            if(!s.intExt && ie){ s.intExt = ie; el("scene_intExt").value = ie; changed = true; }
            if(!s.location && location){ s.location = location; el("scene_location").value = location; changed = true; }
            if(!s.timeOfDay && timeOfDay){ s.timeOfDay = timeOfDay; el("scene_timeOfDay").value = timeOfDay; changed = true; }
            if(changed){
              // no spamear: sin toast en cada tecla
            }
          }
        }

        touch();
        renderScenesTable();
        renderSceneBank();
        renderDaysBoard();
        renderDayDetail();
        renderElementsExplorer();
        renderReports();
        renderScheduleBoard();
        renderReportsDetail();
      };

      node.addEventListener("input", handler);
      node.addEventListener("change", handler);
    });

    el("elCategory")?.addEventListener("change", refreshElementSuggestions);
    el("btnAddSceneElement")?.addEventListener("click", addSceneElement);

    // Enter also adds element (same as clicking Agregar)
    el("elItem")?.addEventListener("keydown", (e)=>{
      if(e.isComposing) return;
      if(e.key === "Enter"){
        e.preventDefault();
        addSceneElement();
      }
    });


    

    function toggleScriptImportPanel(open){
      const panel = el("scriptImportPanel");
      if(!panel) return;
      panel.classList.toggle("hidden", !open);
      if(open){
        panel.scrollIntoView({block:"nearest"});
        requestAnimationFrame(()=> el("scriptImportText")?.focus());
      }
    }

    el("btnCancelScriptImport")?.addEventListener("click", ()=> toggleScriptImportPanel(false));

    el("btnToggleScriptImport")?.addEventListener("click", ()=>{
      sanitizeScriptState({ migrateRawToLocal:true });
      const panel = el("scriptImportPanel");
      const open = panel ? panel.classList.contains("hidden") : true;
      toggleScriptImportPanel(open);
    });

    // Nueva versión: crea una versión editable (y opcionalmente pegás el guion para procesarla)
    el("btnNewScriptVersion")?.addEventListener("click", ()=>{
      toast("Solo existe V1. Reemplazá el guion desde “Pegar / Procesar”.");
      const panel = el("scriptImportPanel");
      if(panel) panel.classList.remove("hidden");
      requestAnimationFrame(()=> el("scriptImportText")?.focus());
    });
el("btnParseScript")?.addEventListener("click", ()=>{
      const txt = el("scriptImportText")?.value || "";
      const keys = el("scriptKeywords")?.value || "";
      saveScriptRawLocal(txt);
      const scenes = parseScreenplayToScriptScenes(txt, keys);
      if(!scenes.length) return toast("No detecté escenas (revisá INT./EXT. por línea).");
      // Aviso: si repetís números de escena (p.ej. reiniciás en cada capítulo) el merge por número puede confundirse.
      try{
        const seen = new Set();
        const dup = new Set();
        for(const s of scenes){
          const n = canonSceneNumber(s.number);
          if(!n) continue;
          if(seen.has(n)) dup.add(n);
          else seen.add(n);
        }
        if(dup.size) toast("⚠️ Números de escena duplicados: " + Array.from(dup).slice(0,6).join(", ") + ". Recomendación: numeración única a lo largo del guion.");
      }catch(_e){}
    
      ensureScriptState();

      const now = new Date().toISOString();
      let v = getActiveScriptVersion();

      // Si venís de 'Nueva versión' (draft) y está vacía, completamos ESA versión
      if(v && v.draft && !(v.scenes||[]).length){
        v.keywords = keys;
        v.scenes = scenes;
        v.updatedAt = now;
        v.draft = false;
      }else{
  // Si ya llegamos al límite, re-procesamos la versión activa en lugar de crear otra.
  if(state.script.versions.length >= MAX_SCRIPT_VERSIONS){
    v.keywords = keys;
    v.scenes = scenes;
    v.updatedAt = now;
    v.draft = false;
  }else{
    v = {
      id: uid("scrVer"),
      name: `V${state.script.versions.length + 1}`,
      createdAt: now,
      updatedAt: now,
      keywords: keys,
      scenes
    };
    state.script.versions.push(v);
    state.script.activeVersionId = v.id;
  }
}

      state.script.activeVersionId = v.id;
      selectedScriptSceneId = v.scenes?.[0]?.id || null;
      touch();
      toast(`Guion procesado → ${v.name} ✅`);
      renderScriptUI();
      // No ocultamos el panel: el guion debe quedar visible por versión
    });

    // Guardar también el texto crudo del guion y keywords por versión (editable)
    const taImport = el("scriptImportText");
    if(taImport && !taImport._bound){
      taImport._bound = true;
      taImport.addEventListener("input", ()=>{
        saveScriptRawLocal(taImport.value || "");
      });
    }
    const kw = el("scriptKeywords");
    if(kw && !kw._bound){
      kw._bound = true;
      kw.addEventListener("input", ()=>{
        const v = getActiveScriptVersion();
        if(!v) return;
        v.keywords = kw.value || "";
        v.updatedAt = new Date().toISOString();
        touch();
      });
    }

    
    el("btnScriptSaveScene")?.addEventListener("click", ()=>{
      const v = getActiveScriptVersion();
      if(!v) return;
      v.updatedAt = new Date().toISOString();
      touch();
      toast("Cambios guardados ✅");
    });
el("scriptVerSelect")?.addEventListener("change", ()=>{
      sanitizeScriptState();
      const v = state.script.versions[0];
      state.script.activeVersionId = v?.id || null;
      selectedScriptSceneId = null;
      renderScriptUI();
    });

    el("btnScriptInsertAfter")?.addEventListener("click", ()=>{
      const v = getActiveScriptVersion();
      if(!v) return;

      // Si la versión está vacía, creamos la primera escena #1
      if(!(v.scenes||[]).length){
        const fresh = {
          id: uid("scrScene"),
          number: "1",
          slugline: "INT. (NUEVA ESCENA) - DÍA",
          location: "(NUEVA ESCENA)",
          timeOfDay: "Día",
          body: "",
          summary: ""
        };
        v.scenes = [fresh];
        selectedScriptSceneId = fresh.id;
        v.updatedAt = new Date().toISOString();
        touch();
        renderScriptUI();
        toast("Creada escena 1 ✅");
        requestAnimationFrame(()=> el("scriptSceneSlugline")?.focus());
        return;
      }

      const idx = (v.scenes||[]).findIndex(s=>s.id===selectedScriptSceneId);
      if(idx < 0) return toast("Elegí una escena en la versión.");
      const after = v.scenes[idx];
      const nextNum = nextInsertedNumber(after.number, v.scenes.map(s=>s.number));
      if(!nextNum) return toast("No pude calcular el número.");
      const fresh = {
        id: uid("scrScene"),
        number: nextNum,
        slugline: "INT. (NUEVA ESCENA) - DÍA",
        location: "(NUEVA ESCENA)",
        timeOfDay: "Día",
        body: "",
        summary: ""
      };
      v.scenes.splice(idx+1, 0, fresh);
      selectedScriptSceneId = fresh.id;
      v.updatedAt = new Date().toISOString();
      touch();
      renderScriptUI();
      toast(`Insertada ${nextNum} ✅`);
      // focus editor
      requestAnimationFrame(()=> el("scriptSceneSlugline")?.focus());
    });

    el("btnScriptApply")?.addEventListener("click", ()=>{
      const v = getActiveScriptVersion();
      if(!v) return toast("No hay versión activa.");
      // Apply (merge) to project scenes by number
      const byNum = new Map(state.scenes.map(s=>[canonSceneNumber(s.number), s]));
      let added = 0, updated = 0;

      for(const sc of (v.scenes||[])){
        const num = canonSceneNumber(sc.number);
        if(!num) continue;
        const existing = byNum.get(num);
        if(existing){
          ensureSceneExtras(existing);

          const slug = String(sc.slugline || existing.slugline || "").trim();
          const locTod = sluglineToLocTOD(slug);
          const ie = String(sc.intExt || sluglineToIntExt(slug) || existing.intExt || "").trim();
          const loc = String(sc.location || locTod.location || existing.location || "").trim();
          const todRaw = String(sc.timeOfDay || locTod.timeOfDay || existing.timeOfDay || "").trim();
          const tod = normalizeTOD(todRaw);

          const hasChap = (sc.chapter!==undefined && sc.chapter!==null && String(sc.chapter).trim()!=="");
          const bodyTxt = (sc.body!==undefined && sc.body!==null) ? String(sc.body) : "";
          const resumen = bodyTxt.trim()
            ? bodyTxt.trim()
            : ((sc.summary!==undefined && sc.summary!==null) ? String(sc.summary).trim() : (existing.summary||""));

          existing.number = num;
          if(slug) existing.slugline = slug;
          if(ie) existing.intExt = ie;
          if(loc) existing.location = loc;
          if(tod) existing.timeOfDay = tod;
          if(hasChap) existing.chapter = sc.chapter;
          existing.summary = resumen;

          updated++;
        }else{
          const slug = String(sc.slugline || "").trim();
          const locTod = sluglineToLocTOD(slug);
          const ie = String(sc.intExt || sluglineToIntExt(slug) || "").trim();

          const bodyTxt = (sc.body!==undefined && sc.body!==null) ? String(sc.body) : "";
          const resumen = bodyTxt.trim()
            ? bodyTxt.trim()
            : ((sc.summary!==undefined && sc.summary!==null) ? String(sc.summary).trim() : "");

          const s = {
            id: uid("scene"),
            number: num,
            chapter: (sc.chapter!==undefined && sc.chapter!==null && String(sc.chapter).trim()!=="") ? sc.chapter : "",
            slugline: slug,
            intExt: ie,
            location: String(sc.location || locTod.location || "").trim(),
            timeOfDay: normalizeTOD(String(sc.timeOfDay || locTod.timeOfDay || "").trim()),
            pages: 0,
            summary: resumen,
            notes: "",
            elements: Object.fromEntries(cats.map(c=>[c,[]])),
            shots: []
          };
          state.scenes.push(s);
          byNum.set(num, s);
          added++;
        }
      }

      sortScenesByNumberInPlace();
      selectedSceneId = state.scenes[0]?.id || null;

      touch();
      toast(`Aplicado ✅ (nuevas: ${added}, actualizadas: ${updated})`);
      renderScenesTable();
      renderSceneEditor();
    renderScriptUI();
      renderSceneBank();
      renderDaysBoard();
      renderDayDetail();
      renderElementsExplorer();
      renderReports();
      renderScheduleBoard();
      renderReportsDetail();
    });


    el("btnImportScenes")?.addEventListener("click", ()=>{
      const txt = el("sceneImportText").value || "";
      const rows = window.U.parseTableText(txt);
      if(!rows.length) return toast("No hay nada para importar");
      let start = 0;
      if(rows[0] && window.U.isHeaderRow(rows[0])) start = 1;

      let added = 0;
      for(let i=start;i<rows.length;i++){
        const r = rows[i];
        if(!r.length) continue;
        const ieRaw = String(r[2]||"").trim();
        const ieLike = /^(int|ext|i\/e|int\/ext|ext\/int)$/i.test(ieRaw);
        const isNewLayout = (r.length >= 7) || ieLike;

        const number = r[0]||"";
        const slugline = r[1]||"";
        const intExt = isNewLayout ? (ieRaw ? (/^ext/i.test(ieRaw) ? "Ext" : "Int") : "") : (sluglineToIntExt(slugline) || "");
        const location = isNewLayout ? (r[3]||"") : (r[2]||"");
        const timeOfDay = normalizeTOD(isNewLayout ? (r[4]||"") : (r[3]||""));
        const pages = Number(isNewLayout ? (r[5]||0) : (r[4]||0));
        const summary = isNewLayout ? (r[6]||"") : (r[5]||"");

        const locTod = sluglineToLocTOD(slugline);

        state.scenes.push({
          id: uid("scene"),
          number,
          slugline,
          intExt,
          location: location || locTod.location || "",
          timeOfDay: timeOfDay || locTod.timeOfDay || "",
          pages,
          summary,
          notes:"",
          elements: Object.fromEntries(cats.map(c=>[c,[]])),
          shots: []
        });
        added++;
      }
      if(added){
        selectedSceneId = state.scenes[state.scenes.length-1].id;
        touch();
        toast(`Importadas ${added} escenas ✅`);
        renderScenesTable();
        renderSceneEditor();
    renderScriptUI();
        renderSceneBank();
      }
    });

    el("btnAddShootDay")?.addEventListener("click", addShootDay);
    el("btnDeleteShootDay")?.addEventListener("click", deleteShootDay);
    el("bankSearch")?.addEventListener("input", renderSceneBank);
    el("bankFilter")?.addEventListener("change", renderSceneBank);
    el("dpBankSearch")?.addEventListener("input", renderSceneBank);
    el("dpBankFilter")?.addEventListener("change", renderSceneBank);



    el("btnOpenCallSheet")?.addEventListener("click", ()=>{
      // Desde Call Diario: imprimir el Call Sheet del día seleccionado
      printCallSheetByDayId(selectedDayId);
    });

    el("btnToggleBank")?.addEventListener("click", ()=>{
      localStorage.setItem("gb_bank_collapsed","1");
      applyBankCollapsedUI();
    });
    el("btnToggleBankDock")?.addEventListener("click", expandBank);

    el("dpBtnToggleBank")?.addEventListener("click", ()=>{
      localStorage.setItem("gb_bank_collapsed","1");
      applyBankCollapsedUI();
    });
    el("dpBtnToggleBankDock")?.addEventListener("click", expandBank);

    el("schedZoom")?.addEventListener("change", ()=>{ renderScheduleBoard(); });

    bindSchedDayPickerUI();

    el("btnSchedPrint")?.addEventListener("click", ()=>{
      printPlanGeneral();
    });
    el("schedSnap")?.addEventListener("change", ()=>{
      for(const d of state.shootDays) resolveOverlapsPushDown(d, Number(el("schedSnap").value||15));
      touch();
      renderScheduleBoard();
    });

    el("elxCategory")?.addEventListener("change", renderElementsExplorer);
    el("elxDay")?.addEventListener("change", renderElementsExplorer);
    el("elxSearch")?.addEventListener("input", renderElementsExplorer);

    el("btnAddCrew")?.addEventListener("click", addCrew);
    el("crewSearch")?.addEventListener("input", renderCrew);

    el("btnRefreshReports")?.addEventListener("click", renderReports);

    el("calPrev")?.addEventListener("click", ()=>{
      calCursor.month -= 1;
      if(calCursor.month < 0){ calCursor.month = 11; calCursor.year -= 1; }
      renderCallSheetCalendar();
    });
    el("calNext")?.addEventListener("click", ()=>{
      calCursor.month += 1;
      if(calCursor.month > 11){ calCursor.month = 0; calCursor.year += 1; }
      renderCallSheetCalendar();
    });

    el("reportTabs")?.addEventListener("click", (e)=>{
      const btn = e.target?.closest?.(".reportTabBtn");
      if(!btn) return;
      setReportsTab(btn.dataset.tab);
    });

    el("btnPrintCallSheet")?.addEventListener("click", ()=>{
      // Plan de Rodaje = landscape.
      // Call Sheet + Shotlist: impresión unificada (mismo diseño desde cualquier pestaña).
      if(reportsTab === "shotlist"){
        printShotlistByDayId(getReportsSelectedDayId());
        return;
      }
      if(reportsTab === "callsheet"){
        printCallSheetByDayId(getReportsSelectedDayId());
        return;
      }
      if(reportsTab === "elements"){
        printElementsByDayId(getReportsSelectedDayId());
        return;
      }
      if(reportsTab === "schedule"){
        printPlanGeneral();
        return;
      }
      setPrintOrientation("landscape");
      window.print();
    });
    window.addEventListener("afterprint", ()=>{ clearPrintOrientation(); cleanupGbPrintRoot(); });

    el("btnSaveCfg")?.addEventListener("click", saveCfgFromUI);
    el("btnTestCfg")?.addEventListener("click", testCfg);
    el("btnPullRemote")?.addEventListener("click", pullRemote);
    el("btnPushRemote")?.addEventListener("click", pushRemote);

    el("projectTitle")?.addEventListener("input", ()=>{
      state.meta.title = el("projectTitle").value || "Proyecto";
      const pill = el("projPill");
      if(pill) pill.textContent = projectInitials(state.meta.title);
      touch();
      renderReportsDetail();
    });
  }

  function hydrateAll(){
    ensureScriptState();
    sanitizeScriptState({ migrateRawToLocal:true });
    ensureProjectConfig();
    state.scenes.forEach(ensureSceneExtras);
// Backfill automático para escenas existentes (INT/EXT, Lugar, Momento) a partir del Título/slugline
let _bf = false;
for(const s of (state.scenes||[])){
  if(!s || !s.slugline) continue;
  const ie = sluglineToIntExt(s.slugline);
  const { location, timeOfDay } = sluglineToLocTOD(s.slugline);
  let changed = false;
  if(!s.intExt && ie){ s.intExt = ie; changed = true; }
  if(!s.location && location){ s.location = location; changed = true; }
  if(!s.timeOfDay && timeOfDay){ s.timeOfDay = timeOfDay; changed = true; }
  if(changed) _bf = true;
}
if(_bf) touch();

    renderCatSelect();
    refreshElementSuggestions();

    el("projectTitle").value = state.meta.title || "Proyecto";
    const _savedAt = el("savedAtText");
    if(_savedAt) _savedAt.textContent = new Date(state.meta.updatedAt).toLocaleString("es-AR");
if(!state.scenes.length){
      state.scenes.push({
        id: uid("scene"),
        number:"1",
        slugline:"INT. CASA - NOCHE",
        intExt:"Int",
        location:"Casa",
        timeOfDay:"Noche",
        pages:1,
        summary:"(Completá el resumen)",
        notes:"",
        elements: Object.fromEntries(cats.map(c=>[c,[]])),
        shots: []
      });
    }
    if(!state.shootDays.length){
      state.shootDays.push({
        id: uid("day"),
        date:"",
        callTime:"08:00",
        location:"",
        label:"Día 1",
        notes:"",
        sceneIds:[],
        crewIds:[],
        blocks:[],
        sceneColors:{},
        times:{},
        durations:{}
      });
    }

    state.crew = (state.crew||[]).map(c=>({ ...c, area: normalizeCrewArea(c.area) }));

    sortScenesByNumberInPlace();

    sortShootDaysInPlace();
    for(const d of state.shootDays) ensureDayTimingMaps(d);

    selectedSceneId = selectedSceneId || state.scenes[0]?.id || null;
    selectedDayId   = selectedDayId   || state.shootDays[0]?.id || null;
    selectedShotlistDayId = selectedShotlistDayId || selectedDayId;
    selectedDayplanDayId = selectedDayplanDayId || selectedDayId;
    callSheetDayId  = callSheetDayId  || selectedDayId;

    renderScenesTable();
    renderSceneEditor();
    renderScriptUI();
    renderSceneBank();
    renderDaysBoard();
    renderDayDetail();
    renderElementsExplorer();
    renderCrew();
    renderReportsFilters();
    renderReports();
    renderScheduleBoard();
    renderShotList();
    renderCallSheetCalendar();
    renderReportsDetail();
    applyBankCollapsedUI();
    initCollapsibles();
  }

  async function init(){
    loadCallSheetCursor();

    const cfg = StorageLayer.loadCfg();

    // Apply per-project theme (pink for Jubilada y Peligrosa)
    try{
      if(cfg && cfg.theme && cfg.theme !== "default") document.documentElement.setAttribute("data-theme", cfg.theme);
      else document.documentElement.removeAttribute("data-theme");
    }catch{}

    // Project switcher (trusted projects only)
    try{
      const sw = el("projectSwitch");
      if(sw){
        const projs = (cfg && Array.isArray(cfg.projects)) ? cfg.projects : [];
        sw.innerHTML = "";
        for(const p of projs){
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.name;
          sw.appendChild(opt);
        }
        if(cfg && cfg.projectId) sw.value = cfg.projectId;
        sw.addEventListener("change", ()=>{
          StorageLayer.setActiveProjectId(sw.value);
          location.reload();
        });
      }
    }catch{}

    initSidebarUI(cfg);

    // Bloqueamos cualquier interacción/autosave antes de decidir remoto vs local.
    try{ document.body.classList.add("bootLoading"); }catch(_e){}

    const local = StorageLayer.loadLocal();
    bootHadLocal = !!(local && local.meta);
    state = bootHadLocal ? local : defaultState(cfg && cfg.projectName);

    if(!bootHadLocal){
      // Persist initial state locally for this project
      StorageLayer.saveLocal(state);
    }

    // CRÍTICO: cargar remoto primero y recién después habilitar UI + eventos.
    try{ await initRemoteSync({ boot:true }); }catch(_e){}

    selectedSceneId = state.scenes?.[0]?.id || null;
    selectedDayId = state.shootDays?.[0]?.id || null;
    callSheetDayId = selectedDayId;
    selectedShotlistDayId = selectedDayId;
    selectedDayplanDayId = selectedDayId;

    bindEvents();
    ensureMobileChrome();
    applyMobileDayFocus();
    // Permisos de edición
    setEditUnlocked(editUnlocked);
    mountModeBanner();
    installReadOnlyGuards();
    markReadOnlyAllowList();
    setupScheduleWheelScroll();
    hydrateAll();
    showView(isMobileUI() ? "dayplan" : "breakdown");

    window.addEventListener("online", ()=>{
      // Cuando vuelve la conexión, refrescamos desde remoto.
      initRemoteSync();
    });

    try{ document.body.classList.remove("bootLoading"); }catch(_e){}
  }if(document.readyState === "loading") window.addEventListener("DOMContentLoaded", init);
  else init();
})();
