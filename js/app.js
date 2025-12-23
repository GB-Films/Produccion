(function(){
  const el = (id)=>document.getElementById(id);
  const views = ["breakdown","shooting","schedule","shotlist","elements","crew","reports","callsheet","settings"];

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
  let selectedSceneId = null;
  let selectedDayId = null;
  let callSheetDayId = null;
  let selectedShotlistDayId = null;

  const DEFAULT_SHOT_MIN = 15;

  // Guion versionado (Breakdown)
  let selectedScriptSceneId = null;

  // Sync safety:
  // - We do an initial pull from JSONBin when possible (especially on first run)
  // - We avoid pushing until that initial sync decision is made
  let syncReady = false;
  let bootHadLocal = false;
  let bootAppliedRemote = false;

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

  function uid(p="id"){ return `${p}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`; }
  function esc(s){
    return String(s||"")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }
  function toast(msg){
    const t = el("toast");
    if(!t) return;
    t.textContent = msg;
    t.style.display="block";
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>t.style.display="none", 2200);
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
    state.meta.updatedAt = new Date().toISOString();
    StorageLayer.saveLocal(state);
    const saved = el("savedAtText");
    if(saved) saved.textContent = new Date(state.meta.updatedAt).toLocaleString("es-AR");
    const st = el("statusText");
    if(st) st.textContent = "Guardado";
    if(syncReady) autosyncDebounced();
  }

  const autosyncDebounced = window.U.debounce(async ()=>{
    const cfg = StorageLayer.loadCfg();    if(!cfg.binId || !cfg.accessKey) return;
    try{
      await StorageLayer.jsonbinPut(cfg.binId, cfg.accessKey, state);
      updateSyncPill("JSONBin");
    }catch{
      updateSyncPill("Local");
    }
  }, 900);

  function updateSyncPill(mode){
    const p = el("syncPill");
    if(p) p.textContent = mode;
  }

  function defaultState(){
    return {
      meta:{ version: 14, title:"Proyecto", updatedAt: new Date().toISOString() },
      scenes: [],
      shootDays: [],
      crew: [],
      script: { versions: [], activeVersionId: null }
    };
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

  async function initRemoteSync(){
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

    try{
      const remote = await StorageLayer.jsonbinGet(cfg.binId, cfg.accessKey);
      const remoteOK = isValidState(remote);

      if(remoteOK){
        const remoteHasData = !isEmptyState(remote);
        const localHasData  = !isEmptyState(state);

        let shouldAdoptRemote = false;

        // First run (no local) and remote has data => always adopt remote
        if(!bootHadLocal && remoteHasData) shouldAdoptRemote = true;

        // If local is empty but remote isn't => adopt remote
        if(!localHasData && remoteHasData) shouldAdoptRemote = true;

        // Otherwise adopt the newest by updatedAt
        if(!shouldAdoptRemote && tsUpdatedAt(remote) > tsUpdatedAt(state)) shouldAdoptRemote = true;

        if(shouldAdoptRemote){
          state = remote;
          bootAppliedRemote = true;
          StorageLayer.saveLocal(state);
          selectedSceneId = null;
          selectedDayId = null;
          callSheetDayId = null;
          hydrateAll();
          toast("Cargué remoto ✅");
        }

        updateSyncPill("JSONBin");
      }else{
        updateSyncPill("Local");
      }
    }catch(err){
      // Offline or blocked: stay local
      updateSyncPill("Local");
    }finally{
      syncReady = true;
      initRemoteSync._running = false;
    }
  }

  function daysForCrew(crewId){
    sortShootDaysInPlace();
    return (state.shootDays||[]).filter(d=> (d.crewIds||[]).includes(crewId));
  }




  function ensureSceneExtras(s){
    if(!s) return;
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
    const parts = s.split(/\s[-–—]\s/g).map(p=>p.trim()).filter(Boolean);
    let location = "";
    let tod = "";
    if(parts.length >= 2){
      tod = normalizeTOD(parts[parts.length-1]);
      const mid = parts.slice(0, parts.length-1).join(" - ");
      location = mid
        .replace(/^(INT\/EXT\.?|INT\.?\/EXT\.?|I\/E\.?|INT\.?|EXT\.?)\s*/i,"")
        .replace(/^(INTERIOR|EXTERIOR)\s*/i,"")
        .trim();
    }else{
      location = s
        .replace(/^(INT\/EXT\.?|INT\.?\/EXT\.?|I\/E\.?|INT\.?|EXT\.?)\s*/i,"")
        .replace(/^(INTERIOR|EXTERIOR)\s*/i,"")
        .trim();
    }
    return { location, timeOfDay: tod };
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

  const DAY_SPAN_MIN = 24*60;

  function ensureDayTimingMaps(d){
    d.durations = d.durations || {};
    d.times = d.times || {};
    d.sceneIds = d.sceneIds || [];
    d.crewIds = d.crewIds || [];
    for(const sid of d.sceneIds){
      if(typeof d.durations[sid] !== "number") d.durations[sid] = 60;
      if(typeof d.times[sid] !== "number") d.times[sid] = 0;
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
    d.sceneIds.sort((a,b)=> (d.times[a]??0) - (d.times[b]??0));
    let cursor = 0;
    for(const sid of d.sceneIds){
      let st = d.times[sid] ?? 0;
      const du = d.durations[sid] ?? 60;
      st = clamp(st, 0, DAY_SPAN_MIN - snapMin);
      if(st < cursor){
        st = snap(cursor, snapMin);
      }
      st = clamp(st, 0, Math.max(0, DAY_SPAN_MIN - du));
      d.times[sid] = st;
      cursor = st + du;
      cursor = clamp(cursor, 0, DAY_SPAN_MIN);
    }
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
  function buildSceneTooltip(scene){
    const parts = [];
    parts.push(`<div class="t">#${esc(scene.number||"")} — ${esc(scene.slugline||"")}</div>`);
    parts.push(`<div class="m">${esc(scene.location||"")} · ${esc(scene.timeOfDay||"")} · Pág ${esc(scene.pages||"")}</div>`);
    if(scene.summary) parts.push(`<div class="m" style="margin-top:8px;">${esc(scene.summary)}</div>`);
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
    return parts.join("");
  }
  function attachSceneHover(node, scene){
    node.addEventListener("mouseenter", (e)=>{
      if(schedDrag) return;
      showHoverTip(buildSceneTooltip(scene), e.clientX, e.clientY);
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
  function setupScheduleTopScrollbar(){
    const top = el("schedScrollTop");
    const inner = el("schedScrollTopInner");
    const board = el("schedBoard");
    if(!top || !inner || !board) return;

    // ancho del “contenido” del scrollbar superior = scrollWidth del board
    inner.style.width = `${board.scrollWidth}px`;

    // sincronización bidireccional (sin loops)
    if(top.dataset.bound !== "1"){
      top.dataset.bound = "1";
      let lock = false;

      top.addEventListener("scroll", ()=>{
        if(lock) return;
        lock = true;
        board.scrollLeft = top.scrollLeft;
        lock = false;
      });

      board.addEventListener("scroll", ()=>{
        if(lock) return;
        lock = true;
        top.scrollLeft = board.scrollLeft;
        lock = false;
      });

      window.addEventListener("resize", window.U.debounce(()=>{
        inner.style.width = `${board.scrollWidth}px`;
      }, 120));
    }

    // al render, igualamos posición
    top.scrollLeft = board.scrollLeft;
  }

// ======= NUEVO: Scroll vertical con ruedita en cualquier lado (Cronograma) =======
function setupScheduleWheelScroll(){
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
    views.forEach(v=>{
      const node = el(`view-${v}`);
      if(node) node.classList.toggle("hidden", v!==name);
    });
    document.querySelectorAll(".navBtn").forEach(b=>{
      b.classList.toggle("active", b.dataset.view===name);
    });

    if(name==="breakdown"){ initCollapsibles(); renderScriptUI(); renderShotsEditor(); }
    if(name==="shooting"){ renderSceneBank(); renderDaysBoard(); renderDayDetail(); applyBankCollapsedUI(); }
    if(name==="schedule"){ renderScheduleBoard(); }
    if(name==="shotlist"){ renderShotList(); }
    if(name==="elements"){ renderElementsExplorer(); }
    if(name==="crew"){ renderCrew(); }
    if(name==="reports"){ renderReportsFilters(); renderReports(); }
    if(name==="callsheet"){ renderCallSheetCalendar(); renderCallSheetDetail(); }
    if(name==="settings"){ loadCfgToUI(); }
  }

  // ======= Script parser (INT/EXT) =======
  function parseScreenplayToScenes(text, extraKeywordsCsv=""){
    const rawLines = (text||"").split(/\r?\n/);
    const lines = rawLines.map(l => String(l ?? "").replace(/\s+$/,"")).filter(l => l.trim() !== "");
    if(!lines.length) return [];

    const extra = (extraKeywordsCsv||"").split(",").map(s=>s.trim()).filter(Boolean).map(s=>s.toUpperCase());

    function stripSceneNumber(line){
      return line
        .replace(/^\s*\(?\s*\d+\s*\)?\s*[.)-:]\s*/,"")
        .replace(/^\s*\(?\s*\d+\s*\)?\s+/,"");
    }
    function isHeading(line){
      const cleaned = stripSceneNumber(line).trimStart();
      const up = cleaned.toUpperCase();
      for(const k of extra){ if(up.startsWith(k)) return true; }
      const starters = [
        "INT/EXT.", "INT/EXT ", "INT./EXT.", "INT./EXT ", "I/E.", "I/E ",
        "INT.", "INT ", "EXT.", "EXT ", "INTERIOR", "EXTERIOR"
      ];
      return starters.some(s=>up.startsWith(s));
    }

    const out = [];
    let current = null;
    let autoN = 1;

    for(const line of lines){
      if(isHeading(line)){
        if(current) out.push(finalize(current));
        current = { rawHeading: line.trim(), body:[], autoNumber:autoN++ };
      }else{
        if(!current) current = { rawHeading:"ESCENA", body:[], autoNumber:autoN++ };
        current.body.push(line);
      }
    }
    if(current) out.push(finalize(current));

    return out.map(s=>({
      id: uid("scene"),
      number: String(s.number),
      slugline: s.slugline,
      location: s.location,
      timeOfDay: s.timeOfDay,
      pages: 0,
      summary: s.summary,
      notes:"",
      elements: Object.fromEntries(cats.map(c=>[c,[]])),
      shots: []
    }));

    function finalize(s){
      const heading = s.rawHeading;
      let num = s.autoNumber;
      const mNum = heading.match(/^\s*(\d+)\s*[.)-:]\s*/);
      if(mNum) num = Number(mNum[1]);

      const slugline = stripSceneNumber(heading).trim();

      const parts = slugline.split(/\s[-–—]\s/g).map(p=>p.trim()).filter(Boolean);
      let location = "";
      let tod = "";

      if(parts.length >= 2){
        tod = normalizeTOD(parts[parts.length-1]);
        const mid = parts.slice(0, parts.length-1).join(" - ");
        location = mid
          .replace(/^(INT\/EXT\.?|INT\.\/EXT\.?|I\/E\.?|INT\.?|EXT\.?)\s*/i,"")
          .replace(/^(INTERIOR|EXTERIOR)\s*/i,"")
          .trim();
      }else{
        location = slugline
          .replace(/^(INT\/EXT\.?|INT\.\/EXT\.?|I\/E\.?|INT\.?|EXT\.?)\s*/i,"")
          .replace(/^(INTERIOR|EXTERIOR)\s*/i,"")
          .trim();
      }

      const bodyText = (s.body||[]).join(" ");
      const summary = bodyText.slice(0, 220);
      return { number:num, slugline, location, timeOfDay:tod, summary };
    }
  }


  // ======= Guion (versionado) =======
  function parseScreenplayToScriptScenes(text, extraKeywordsCsv=""){
    const rawLines = (text||"").split(/\r?\n/);
    if(!rawLines.length) return [];

    const extra = (extraKeywordsCsv||"").split(",").map(s=>s.trim()).filter(Boolean).map(s=>s.toUpperCase());

    function stripSceneNumber(line){
      return String(line||"")
        .replace(/^\s*\(?\s*\d+[A-Za-z]*\s*\)?\s*[.)-:]\s*/,"")
        .replace(/^\s*\(?\s*\d+[A-Za-z]*\s*\)?\s+/,"");
    }
    function isHeading(line){
      const cleaned = stripSceneNumber(line).trimStart();
      const up = cleaned.toUpperCase();
      for(const k of extra){ if(up.startsWith(k)) return true; }
      const starters = [
        "INT/EXT.", "INT/EXT ", "INT./EXT.", "INT./EXT ", "I/E.", "I/E ",
        "INT.", "INT ", "EXT.", "EXT ", "INTERIOR", "EXTERIOR"
      ];
      return starters.some(s=>up.startsWith(s));
    }

    const out = [];
    let current = null;
    let autoN = 1;

    for(const raw of rawLines){
      const line = String(raw ?? "").replace(/\s+$/,"");
      if(isHeading(line.trim())){
        if(current) out.push(finalize(current));
        current = { rawHeading: line.trim(), body:[], autoNumber:autoN++ };
      }else{
        if(!current){
          // skip leading empty lines
          if(!line.trim()) continue;
          current = { rawHeading:"ESCENA", body:[], autoNumber:autoN++ };
        }
        current.body.push(line);
      }
    }
    if(current) out.push(finalize(current));

    // normalize ids and return
    return out.map(s=>({
      id: uid("scrScene"),
      number: canonSceneNumber(String(s.number)),
      slugline: s.slugline,
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
      return { number:num, slugline, location, timeOfDay, body: s.body||[], summary };
    }
  }

  function buildScriptReadView(version){
    if(!version) return "";
    const parts = [];
    for(const sc of (version.scenes||[])){
      const head = `${canonSceneNumber(sc.number)} ${String(sc.slugline||"").trim()}`.trim();
      parts.push(head);
      if(sc.body) parts.push(String(sc.body).trim());
      parts.push(""); // blank line between scenes
    }
    return parts.join("\n").trim();
  }

  function cloneScriptScenes(scenes){
    return (scenes||[]).map(sc=>({
      id: uid("scrScene"),
      number: canonSceneNumber(sc.number||""),
      slugline: sc.slugline||"",
      location: sc.location||"",
      timeOfDay: sc.timeOfDay||"",
      body: sc.body||"",
      summary: sc.summary||""
    }));
  }

  function getActiveScriptVersion(){
    ensureScriptState();
    const id = state.script.activeVersionId;
    return state.script.versions.find(v=>v.id===id) || state.script.versions[0] || null;
  }

  function setActiveScriptVersion(versionId){
    ensureScriptState();
    state.script.activeVersionId = versionId;
  }

  function renderScriptVersionSelect(){
    const sel = el("scriptVerSelect");
    if(!sel) return;
    ensureScriptState();
    if(!state.script.versions.length){
      sel.innerHTML = `<option value="">(sin versiones)</option>`;
      sel.value = "";
      return;
    }
    sel.innerHTML = state.script.versions
      .slice()
      .sort((a,b)=> (a.createdAt||"").localeCompare(b.createdAt||""))
      .map(v=>`<option value="${esc(v.id)}">${esc(v.name||"Versión")}</option>`)
      .join("");
    if(!state.script.activeVersionId) state.script.activeVersionId = state.script.versions[state.script.versions.length-1].id;
    sel.value = state.script.activeVersionId;
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
    return union(
      state.crew
        .map(c=>({ ...c, area: normalizeCrewArea(c.area) }))
        .filter(c=>c.area==="Cast")
        .map(c=>(c.name||"").trim())
        .filter(Boolean)
    ).sort((a,b)=>a.localeCompare(b));
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
      const hay = `${s.number} ${s.slugline} ${s.location} ${s.summary}`.toLowerCase();
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
        <td>${esc(s.location||"")}</td>
        <td>${esc(s.timeOfDay||"")}</td>
        <td>${s.pages? esc(String(s.pages)) : ""}</td>
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
    if(hint) hint.textContent = s ? `Editando escena #${s.number}` : "Seleccioná una escena";

    const fields = ["number","slugline","location","timeOfDay","pages","summary","notes"];
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
          renderCallSheetDetail();
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
      btnAdd.disabled = !selectedSceneId;
      btnAdd.onclick = ()=>{
        const s = selectedSceneId ? getScene(selectedSceneId) : null;
        if(!s) return;
        ensureSceneExtras(s);
        s.shots.push({ id: uid("shot"), type: "Plano general", desc: "", durMin: DEFAULT_SHOT_MIN });
        touch();
        renderShotsEditor();
      };
    }
    if(!table) return;
    const tbody = table.querySelector("tbody");
    if(!tbody) return;

    const s = selectedSceneId ? getScene(selectedSceneId) : null;
    tbody.innerHTML = "";
    if(!s){
      return;
    }
    ensureSceneExtras(s);

    (s.shots||[]).forEach((sh, i)=>{
      // migración: abreviaturas viejas → labels completos
      sh.type = normalizeShotType(sh.type) || "Plano general";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i+1}</td>
        <td>
          <select class="input compact shotTypeSel">
            ${shotTypes.map(t=>`<option value="${esc(t)}"${(normalizeShotType(sh.type)===t)?" selected":""}>${esc(t)}</option>`).join("")}
          </select>
        </td>
        <td><input class="input shotDescInput" placeholder="Descripción del plano…" value="${esc(sh.desc||"")}" /></td>
        <td><button class="btn icon danger" title="Borrar">×</button></td>
      `;
      const sel = tr.querySelector("select");
      const inp = tr.querySelector("input");
      const del = tr.querySelector("button");

      sel?.addEventListener("change", ()=>{
        sh.type = sel.value;
        touch();
      });
      inp?.addEventListener("input", ()=>{
        sh.desc = inp.value;
        touch();
      });
      del?.addEventListener("click", (e)=>{
        e.preventDefault();
        s.shots = (s.shots||[]).filter(x=>x.id!==sh.id);
        touch();
        renderShotsEditor();
      });

      tbody.appendChild(tr);
    });
  }

  function renderScriptUI(){
    const wrap = el("scriptVersionUI");
    ensureScriptState();

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

    // Mantener el guion (raw) visible y persistente por versión
    const panel = el("scriptImportPanel");
    if(panel) panel.classList.remove("hidden");
    const ta = el("scriptImportText");
    if(ta && ta.value !== (v.rawText||"")) ta.value = v.rawText || "";
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

    for(const d of state.shootDays){
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
    renderCallSheetDetail();
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
        toast("Ese nombre no está en Cast (Equipo técnico). Cargalo ahí primero.");
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
    renderCallSheetDetail();
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
        touch();
        renderSceneBank();
        renderDaysBoard();
        renderDayDetail();
        renderReports();
        renderScheduleBoard();
        saveCallSheetCursor();
      renderCallSheetCalendar();
        renderCallSheetDetail();
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
    const wrap = el("sceneBankList");
    if(!wrap) return;
    wrap.innerHTML = "";

    const q = (el("bankSearch")?.value||"").toLowerCase();
    const filter = el("bankFilter")?.value || "all";

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
      times:{},
      durations:{}
    };
    state.shootDays.push(d);
    sortShootDaysInPlace();
    selectedDayId = d.id;
    touch();
    renderDaysBoard();
    renderDayDetail();
    renderReports();
    renderScheduleBoard();
    renderCallSheetCalendar();
    renderCallSheetDetail();
  }

  function deleteShootDay(){
    if(!selectedDayId) return;
    const d = getDay(selectedDayId);
    if(!d) return;
    if(!confirm(`Borrar ${formatDayTitle(d.date)}?`)) return;

    state.shootDays = state.shootDays.filter(x=>x.id!==d.id);
    sortShootDaysInPlace();
    selectedDayId = state.shootDays[0]?.id || null;
    touch();
    renderDaysBoard();
    renderDayDetail();
    renderReports();
    renderScheduleBoard();
    renderCallSheetCalendar();
    renderCallSheetDetail();
  }

  function renderDaysBoard(){
    const board = el("daysBoard");
    if(!board) return;
    board.innerHTML = "";
    sortShootDaysInPlace();

    for(const d of state.shootDays){
      ensureDayTimingMaps(d);

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
        renderDaysBoard();
        renderDayDetail();
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
        renderCallSheetDetail();
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

      if(d.id===selectedDayId){
        col.style.borderColor = "rgba(110,231,255,.35)";
      }

      col.appendChild(head);
      col.appendChild(zone);
      board.appendChild(col);
    }
  }

  function renderDayDetail(){
    const d = selectedDayId ? getDay(selectedDayId) : null;

    const map = { day_date:"date", day_call:"callTime", day_location:"location", day_label:"label", day_notes:"notes" };
    for(const id in map){
      const node = el(id);
      if(!node) continue;
      node.disabled = !d;
      node.value = d ? (d[map[id]] || "") : "";
    }

    renderDayNeeds();
    renderDayCast();
    renderDayCrewPicker();
  }

  function dayScenes(d){ return (d.sceneIds||[]).map(getScene).filter(Boolean); }

  function renderDayNeeds(){
    const wrap = el("dayNeeds");
    if(!wrap) return;
    wrap.innerHTML = "";
    const d = selectedDayId ? getDay(selectedDayId) : null;
    if(!d){ wrap.innerHTML = `<div class="muted">Seleccioná un día</div>`; return; }

    const scenes = dayScenes(d);
    const needs = {};
    for(const cat of cats){
      const items = union(scenes.flatMap(s=>s.elements?.[cat] || []));
      if(!items.length) continue;
      if(cat==="cast") continue;
      needs[cat] = items;
    }

    const keys = Object.keys(needs);
    if(!keys.length){
      wrap.innerHTML = `<div class="catBlock"><div class="items">No hay elementos cargados en breakdown.</div></div>`;
      return;
    }

    for(const cat of cats){
      if(!needs[cat]) continue;
      const box = document.createElement("div");
      box.className = "catBlock";
      box.innerHTML = `
        <div class="hdr"><span class="dot" style="background:${catColors[cat]}"></span>${esc(catNames[cat])}</div>
        <div class="items">${esc(needs[cat].join(", "))}</div>
      `;
      wrap.appendChild(box);
    }
  }

  function renderDayCast(){
    const wrap = el("dayCast");
    if(!wrap) return;
    wrap.innerHTML = "";
    const d = selectedDayId ? getDay(selectedDayId) : null;
    if(!d){ wrap.innerHTML = `<div class="muted">Seleccioná un día</div>`; return; }

    const scenes = dayScenes(d);
    const cast = union(scenes.flatMap(s=>s.elements?.cast || []));
    if(!cast.length){
      wrap.innerHTML = `<div class="catBlock"><div class="items">No hay cast cargado en breakdown.</div></div>`;
      return;
    }

    for(const name of cast){
      const chip = document.createElement("div");
      chip.className = "catBlock";
      chip.innerHTML = `<div class="hdr"><span class="dot" style="background:${catColors.cast}"></span>${esc(name)}</div>`;
      wrap.appendChild(chip);
    }
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

  function renderDayCrewPicker(){
    const wrap = el("dayCrewPicker");
    if(!wrap) return;
    wrap.innerHTML = "";
    const d = selectedDayId ? getDay(selectedDayId) : null;
    if(!d){ wrap.innerHTML = `<div class="muted">Seleccioná un día</div>`; return; }

    const crewAll = state.crew
      .map(c=>({ ...c, area: normalizeCrewArea(c.area) }))
      .filter(c=>c.area!=="Cast");

    if(!crewAll.length){
      wrap.innerHTML = `<div class="catBlock"><div class="items">No cargaste equipo técnico todavía.</div></div>`;
      return;
    }

    const selected = new Set(d.crewIds || []);
    const grouped = groupCrewByArea(crewAll);

    for(const [area, arr] of grouped){
      const hdr = document.createElement("div");
      hdr.className = "crewAreaHeader";
      hdr.textContent = area;
      wrap.appendChild(hdr);

      for(const c of arr){
        const isSel = selected.has(c.id);
        const item = document.createElement("div");
        item.className = "crewPickItem" + (isSel ? " selected" : "");
        item.innerHTML = `
          <div class="left">
            <span class="statusDot"></span>
            <div>
              <div class="title">${esc(c.name||"(sin nombre)")}</div>
              <div class="meta">${esc(area)} · ${esc(c.role||"")} ${c.phone? " · "+esc(c.phone):""}</div>
            </div>
          </div>
          <div class="muted small">${isSel ? "Citado" : "No citado"}</div>
        `;
        item.addEventListener("click", ()=>{
          d.crewIds = d.crewIds || [];
          const idx = d.crewIds.indexOf(c.id);
          if(idx>=0) d.crewIds.splice(idx,1);
          else d.crewIds.push(c.id);
          d.crewIds = Array.from(new Set(d.crewIds));
          touch();
          renderDayCrewPicker();
          renderReports();
          renderCallSheetDetail();
        });
        wrap.appendChild(item);
      }
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

    for(const e of entries){
      const row = document.createElement("div");
      row.className = "sceneCard";
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
      row.addEventListener("click", ()=>renderElementDetail(e));
      listWrap.appendChild(row);
    }

    renderElementDetail(entries[0]);

    function renderElementDetail(info){
      detailWrap.innerHTML = "";
      const header = document.createElement("div");
      header.className = "catBlock";
      header.innerHTML = `
        <div class="hdr"><span class="dot" style="background:${catColors[info.cat]}"></span>${esc(info.item)}</div>
        <div class="items">${esc(catNames[info.cat])}</div>
      `;
      detailWrap.appendChild(header);

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
    renderCallSheetDetail();
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
      areaSel.addEventListener("change", ()=>{ real.area = normalizeCrewArea(areaSel.value); touch(); renderCrew(); refreshElementSuggestions(); renderReports(); renderCallSheetDetail(); });
      role.addEventListener("input", ()=>{ real.role = role.value; touch(); renderReports(); renderCallSheetDetail(); });
      name.addEventListener("input", ()=>{ real.name = name.value; touch(); refreshElementSuggestions(); renderReports(); renderCallSheetDetail(); });
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
        renderCallSheetDetail();
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

    renderReportsFilters();
    const f = getReportsFilterSet();

    if(!f || f.size === 0){
      board.innerHTML = `<div class="muted">Seleccioná al menos un filtro arriba.</div>`;
      return;
    }

    for(const d of state.shootDays){
      ensureDayTimingMaps(d);
      const col = document.createElement("div");
      col.className = "reportCol";

      const head = document.createElement("div");
      head.className = "reportHead";

      const body = document.createElement("div");
      body.className = "reportBody";

      const scenes = (d.sceneIds||[]).map(getScene).filter(Boolean);
      const cast = union(scenes.flatMap(s=>s.elements?.cast||[]));
      const pages = scenes.reduce((acc, s)=> acc + (Number(s.pages)||0), 0);

      const crewAll = (d.crewIds||[])
        .map(id=>state.crew.find(c=>c.id===id))
        .filter(Boolean)
        .map(c=>({ ...c, area: normalizeCrewArea(c.area) }))
        .filter(c=>c.area!=="Cast");

      const grouped = groupCrewByArea(crewAll);

      head.innerHTML = `
        <div class="t">${esc(formatDayTitle(d.date))}${d.label? " · "+esc(d.label):""}</div>
        <div class="m">Call ${esc(d.callTime||"")} · ${esc(d.location||"")}</div>
        <div class="kpiRow">
          <span class="kpi"><b>${scenes.length}</b> escenas</span>
          <span class="kpi"><b>${fmtPages(pages)}</b> pág</span>
          <span class="kpi"><b>${cast.length}</b> cast</span>
          <span class="kpi"><b>${crewAll.length}</b> crew</span>
        </div>
      `;

      if(f.has("scenes")){
      const scenesBox = document.createElement("div");
      scenesBox.className = "catBlock";
      scenesBox.innerHTML = `
        <div class="hdr"><span class="dot" style="background:var(--cat-props)"></span>Escenas</div>
        <div class="items">${scenes.length ? scenes.map(s=>`<div>#${esc(s.number)} ${esc(s.slugline)}</div>`).join("") : `<div>—</div>`}</div>
      `;
      body.appendChild(scenesBox);
      }

      if(f.has("cast")){
      const castBox = document.createElement("div");
      castBox.className = "catBlock";
      castBox.innerHTML = `
        <div class="hdr"><span class="dot" style="background:${catColors.cast}"></span>Cast</div>
        <div class="items">${cast.length ? cast.map(n=>`<div>${esc(n)}</div>`).join("") : `<div>—</div>`}</div>
      `;
      body.appendChild(castBox);
      }

      if(f.has("crew")){
      const crewBox = document.createElement("div");
      crewBox.className = "catBlock";
      crewBox.innerHTML = `<div class="hdr"><span class="dot" style="background:var(--cat-sound)"></span>Crew citado</div>`;
      const crewItems = document.createElement("div");
      crewItems.className = "items";

      if(!crewAll.length){
        crewItems.innerHTML = `<div>—</div>`;
      }else{
        crewItems.innerHTML = grouped.map(([area, arr])=>`
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
      }

      for(const cat of cats){
        if(cat==="cast") continue;
        if(!f.has(cat)) continue;
        const items = union(scenes.flatMap(s=>s.elements?.[cat]||[]));
        if(!items.length) continue;
        const box = document.createElement("div");
        box.className = "catBlock";
        box.innerHTML = `
          <div class="hdr"><span class="dot" style="background:${catColors[cat]}"></span>${esc(catNames[cat])}</div>
          <div class="items">${items.map(x=>`<div>${esc(x)}</div>`).join("")}</div>
        `;
        body.appendChild(box);
      }

      col.appendChild(head);
      col.appendChild(body);
      board.appendChild(col);
    }
  }

  // ===================== Schedule =====================
  function renderScheduleBoard(){
    const board = el("schedBoard");
    if(!board) return;
    board.innerHTML = "";

    sortShootDaysInPlace();
    if(!state.shootDays.length){
      board.innerHTML = `<div class="muted">No hay días cargados.</div>`;
      setupScheduleTopScrollbar();
      return;
    }

    const zoom = Number(el("schedZoom")?.value || 90);
    const pxPerMin = zoom / 60;

    for(const d of state.shootDays){
      ensureDayTimingMaps(d);

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
      grid.dataset.dayId = d.id;
      grid.style.height = `${Math.ceil(DAY_SPAN_MIN * pxPerMin)}px`;

      for(let h=0; h<=24; h++){
        const y = h * 60 * pxPerMin;
        const line = document.createElement("div");
        line.className = "hourLine";
        line.style.top = `${y}px`;
        grid.appendChild(line);

        const lab = document.createElement("div");
        lab.className = "hourLabel";
        lab.style.top = `${y}px`;
        lab.textContent = hhmmFromMinutes(minutesFromHHMM(d.callTime||"08:00")+h*60);
        grid.appendChild(lab);
      }

      for(const sid of d.sceneIds){
        const s = getScene(sid);
        if(!s) continue;

        const startMin = clamp(d.times[sid] ?? 0, 0, DAY_SPAN_MIN-1);
        const durMin   = clamp(d.durations[sid] ?? 60, 5, DAY_SPAN_MIN);

        const top = startMin * pxPerMin;
        const height = Math.max(34, durMin * pxPerMin);

        const involved = sceneCatsWithItems(s);
        const ticks = involved.length
          ? `<div class="schedTicks">${involved.map(cat=>`<span class="tick" style="background:${catColors[cat]}"></span>`).join("")}</div>`
          : "";

        const block = document.createElement("div");
        block.className = "schedBlock";
        block.dataset.sceneId = sid;
        block.dataset.dayId = d.id;
        block.style.top = `${top}px`;
        block.style.height = `${height}px`;
        block.innerHTML = `
          ${ticks}
          <div class="title">#${esc(s.number||"")} — ${esc(s.slugline||"")}</div>
          <div class="meta">${esc(fmtClockFromCall(d.callTime, startMin))} · ${durMin} min</div>
          <div class="resize" title="Cambiar duración"></div>
        `;

        attachSceneHover(block, s);

        // Doble click robusto (algunos browsers no disparan dblclick si hay pointerdown preventDefault)
        block.addEventListener("dblclick", (e)=>{ e.stopPropagation(); jumpToSceneInBreakdown(s.id); });
        block.addEventListener("click", (e)=>{
          if(e.detail === 2 && !(schedDrag && schedDrag.moved)) jumpToSceneInBreakdown(s.id);
        });

        grid.appendChild(block);
      }

      dayWrap.appendChild(head);
      dayWrap.appendChild(grid);
      board.appendChild(dayWrap);
    }

    bindScheduleDnD();
    setupScheduleTopScrollbar(); // ✅
  }

  function bindScheduleDnD(){
    const board = el("schedBoard");
    if(!board) return;

    board.onpointerdown = (e)=>{
      const block = e.target.closest(".schedBlock");
      if(!block) return;

      const isResize = !!e.target.closest(".resize");
      const dayId = block.dataset.dayId;
      const sceneId = block.dataset.sceneId;
      const d = getDay(dayId);
      if(!d) return;

      const snapMin = Number(el("schedSnap")?.value || 15);
      const zoom = Number(el("schedZoom")?.value || 90);
      const pxPerMin = zoom/60;

      ensureDayTimingMaps(d);

      const grid = block.closest(".schedGrid");
      const gridRect = grid.getBoundingClientRect();
      const startMin0 = d.times[sceneId] ?? 0;
      const dur0 = d.durations[sceneId] ?? 60;

      const blockRect = block.getBoundingClientRect();
      const offsetY = e.clientY - blockRect.top;

      schedDrag = {
        mode: isResize ? "resize" : "move",
        block,
        dayId,
        sceneId,
        startMin0,
        dur0,
        offsetY,
        gridRect,
        snapMin,
        pxPerMin,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        moved: false,
        captured: false
      };

      hideHoverTip();
      // Importante: no capturamos el puntero aún; lo hacemos recién cuando hay drag real.

    };

    board.onpointermove = (e)=>{
      if(!schedDrag) return;

      // Umbral de drag: si no se movió, no hacemos nada (así el doble click funciona)
      if(!schedDrag.moved){
        const dx = e.clientX - schedDrag.startClientX;
        const dy = e.clientY - schedDrag.startClientY;
        if(Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        schedDrag.moved = true;
        if(!schedDrag.captured){
          try{ schedDrag.block.setPointerCapture(schedDrag.pointerId); }catch(_){ }
          schedDrag.captured = true;
        }
      }

      const { mode, dayId, sceneId, snapMin, pxPerMin } = schedDrag;

      if(mode === "resize"){
        const d = getDay(dayId);
        if(!d) return;
        ensureDayTimingMaps(d);

        const gridRect = schedDrag.gridRect;
        const y = e.clientY - gridRect.top;

        const currentStart = d.times?.[sceneId] ?? schedDrag.startMin0;
        const rawH = y - (currentStart * pxPerMin);

        let newDur = snap(rawH / pxPerMin, snapMin);
        newDur = clamp(newDur, snapMin, DAY_SPAN_MIN - currentStart);

        d.durations[sceneId] = newDur;
        resolveOverlapsPushDown(d, snapMin);
        updateScheduleDayDOM(dayId);
        setupScheduleTopScrollbar();
        return;
      }

      const targetGrid = document.elementFromPoint(e.clientX, e.clientY)?.closest(".schedGrid");
      const targetDayId = targetGrid?.dataset?.dayId || dayId;
      const targetDay = getDay(targetDayId);
      if(!targetDay) return;

      ensureDayTimingMaps(targetDay);

      const gridRect = targetGrid ? targetGrid.getBoundingClientRect() : schedDrag.gridRect;
      const y = e.clientY - gridRect.top;

      const rawTopPx = y - schedDrag.offsetY;
      let newStart = snap(rawTopPx / pxPerMin, snapMin);

      const dur = (targetDay.durations[sceneId] ?? (getDay(dayId)?.durations?.[sceneId] ?? schedDrag.dur0));
      newStart = clamp(newStart, 0, Math.max(0, DAY_SPAN_MIN - dur));

      schedDrag.block.style.top = `${newStart * pxPerMin}px`;
    };

    board.onpointerup = (e)=>{
      if(!schedDrag) return;
      const { mode, dayId, sceneId, snapMin, pxPerMin } = schedDrag;

      // Si fue solo un click (sin drag), no re-renderizamos (permite doble click)
      if(mode === "move" && !schedDrag.moved){
        schedDrag = null;
        return;
      }
      if(mode === "resize" && !schedDrag.moved){
        schedDrag = null;
        return;
      }

      if(mode === "resize"){
        touch();
        schedDrag = null;
        renderScheduleBoard();
        renderSceneBank();
        renderDaysBoard();
        renderDayDetail();
        renderReports();
        renderCallSheetCalendar();
        renderCallSheetDetail();
        return;
      }

      const targetGrid = document.elementFromPoint(e.clientX, e.clientY)?.closest(".schedGrid");
      const targetDayId = targetGrid?.dataset?.dayId || dayId;

      const fromDay = getDay(dayId);
      const toDay = getDay(targetDayId);
      if(!fromDay || !toDay){
        schedDrag = null;
        renderScheduleBoard();
        return;
      }

      ensureDayTimingMaps(fromDay);
      ensureDayTimingMaps(toDay);

      const gridRect = targetGrid ? targetGrid.getBoundingClientRect() : schedDrag.gridRect;
      const y = e.clientY - gridRect.top;
      const rawTopPx = y - schedDrag.offsetY;

      let newStart = snap(rawTopPx / pxPerMin, snapMin);
      const dur = (toDay.durations[sceneId] ?? fromDay.durations[sceneId] ?? 60);
      newStart = clamp(newStart, 0, Math.max(0, DAY_SPAN_MIN - dur));

      if(targetDayId !== dayId){
        fromDay.sceneIds = (fromDay.sceneIds||[]).filter(x=>x!==sceneId);
        delete fromDay.times[sceneId];
        const keepDur = (fromDay.durations?.[sceneId] ?? dur);
        delete fromDay.durations[sceneId];

        if(!toDay.sceneIds.includes(sceneId)) toDay.sceneIds.push(sceneId);
        toDay.durations[sceneId] = keepDur;
        toDay.times[sceneId] = newStart;

        resolveOverlapsPushDown(toDay, snapMin);
      }else{
        fromDay.times[sceneId] = newStart;
        resolveOverlapsPushDown(fromDay, snapMin);
      }

      touch();
      schedDrag = null;

      renderScheduleBoard();
      renderSceneBank();
      renderDaysBoard();
      renderDayDetail();
      renderReports();
      renderCallSheetCalendar();
      renderCallSheetDetail();
    };
  }

  function updateScheduleDayDOM(dayId){
    const d = getDay(dayId);
    if(!d) return;
    const snapMin = Number(el("schedSnap")?.value || 15);
    const zoom = Number(el("schedZoom")?.value || 90);
    const pxPerMin = zoom/60;

    resolveOverlapsPushDown(d, snapMin);

    const grid = document.querySelector(`.schedGrid[data-day-id="${CSS.escape(dayId)}"]`);
    if(!grid) return;

    for(const block of grid.querySelectorAll(".schedBlock")){
      const sid = block.dataset.sceneId;
      const start = d.times[sid] ?? 0;
      const dur = d.durations[sid] ?? 60;
      block.style.top = `${start * pxPerMin}px`;
      block.style.height = `${Math.max(34, dur * pxPerMin)}px`;
      const meta = block.querySelector(".meta");
      if(meta) meta.textContent = `${fmtClockFromCall(d.callTime, start)} · ${dur} min`;
    }
  }

  // ===================== Shotlist (por día) =====================
  function ensureDayShotsDone(d){
    if(!d) return;
    if(!d.shotsDone || typeof d.shotsDone !== "object") d.shotsDone = {};
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

  function renderShotList(){
    const sel = el("shotDaySelect");
    const wrap = el("shotlistWrap");
    const sum = el("shotlistSummary");
    const btnPrint = el("btnShotPrint");
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
        selectedShotlistDayId = sel.value;
        renderShotList();
      });
    }
    if(btnPrint && !btnPrint.dataset.bound){
      btnPrint.dataset.bound = "1";
      btnPrint.addEventListener("click", ()=> window.print());
    }

    const d = getDay(selectedShotlistDayId);
    if(!d){
      wrap.innerHTML = `<div class="muted">No hay días cargados.</div>`;
      sum.textContent = "—";
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
      renderCallSheetDetail();
      toast("Ajusté duraciones del cronograma según los planos");
    }

    // KPIs
    let totalShots = 0;
    let totalMin = 0;
    let lastEnd = 0;
    for(const sid of (d.sceneIds||[])){
      const sc = getScene(sid);
      if(!sc) continue;
      ensureSceneExtras(sc);
      totalShots += (sc.shots||[]).length;
      const sMin = sceneShotsTotalMin(sc);
      totalMin += sMin;
      const st = Number(d.times?.[sid] ?? 0) || 0;
      const du = Number(d.durations?.[sid] ?? 60) || 0;
      lastEnd = Math.max(lastEnd, st + du);
    }
    const wrapClock = d.callTime ? fmtClockFromCall(d.callTime, lastEnd) : "";
    sum.innerHTML = `
      <div class="shotDayKpis">
        <span class="pill">Escenas: <b>${(d.sceneIds||[]).length}</b></span>
        <span class="pill">Planos: <b>${totalShots}</b></span>
        <span class="pill">Min (planos): <b>${totalMin}</b></span>
        <span class="pill">Fin estimado: <b>${esc(wrapClock||"—")}</b></span>
      </div>
    `;

    wrap.innerHTML = "";
    if(!(d.sceneIds||[]).length){
      wrap.innerHTML = `<div class="muted">No hay escenas asignadas a este día.</div>`;
      return;
    }

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

      const box = document.createElement("div");
      box.className = "shotSceneBox";
      box.innerHTML = `
        <div class="shotSceneHead">
          <div>
            <div class="t">#${esc(sc.number||"")} — ${esc(sc.slugline||"")}</div>
            <div class="m">${esc(scStart||"")} → ${esc(scEnd||"")} · Escena: ${du} min · Planos: ${shotsMin} min</div>
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
                  <th style="width:220px">Tipo</th>
                  <th>Descripción</th>
                  <th class="shotDur">Min</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `;

      const tbody = box.querySelector("tbody");
      if(!(sc.shots||[]).length){
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="6" class="muted">Sin planos cargados para esta escena.</td>`;
        tbody.appendChild(tr);
      }else{
        let offset = 0;
        (sc.shots||[]).forEach((sh, idx)=>{
          const dur = shotDurMin(sh);
          const key = `${sid}|${sh.id}`;
          const done = !!d.shotsDone[key];
          const t = d.callTime ? fmtClockFromCall(d.callTime, st + offset) : "";

          const tr = document.createElement("tr");
          if(done) tr.classList.add("shotRowDone");
          tr.innerHTML = `
            <td class="shotChk"><input type="checkbox" ${done?"checked":""} /></td>
            <td class="shotNum">${idx+1}</td>
            <td class="shotTime">${esc(t||"")}</td>
            <td>${esc(normalizeShotType(sh.type)||sh.type||"Plano")}</td>
            <td>${esc(sh.desc||"")}</td>
            <td class="shotDur">
              <select class="input compact shotDurSel">
                ${[5,10,15,20,30,45,60].map(n=>`<option value="${n}"${(dur===n)?" selected":""}>${n}</option>`).join("")}
              </select>
            </td>
          `;

          const chk = tr.querySelector("input[type=checkbox]");
          const selDur = tr.querySelector("select");

          chk?.addEventListener("change", ()=>{
            d.shotsDone[key] = chk.checked;
            touch();
            renderShotList();
          });
          selDur?.addEventListener("change", ()=>{
            sh.durMin = Number(selDur.value) || DEFAULT_SHOT_MIN;
            const changed2 = syncAllDaysDurationsFromShotsForScene(sid, snapMin);
            touch();
            if(changed2){
              renderScheduleBoard();
              renderDayDetail();
              renderReports();
              renderCallSheetDetail();
            }
            renderShotList();
          });

          tbody.appendChild(tr);
          offset += dur;
        });
      }

      // Doble click: ir a editar la escena en Breakdown
      box.addEventListener("dblclick", ()=> jumpToSceneInBreakdown(sc.id));

      wrap.appendChild(box);
    }
  }

  // ===================== Call sheets + settings (igual que antes, no copio más cambios) =====================
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
        callSheetDayId = shootByDate.get(ds);
        renderCallSheetCalendar();
        renderCallSheetDetail();
      });
      grid.appendChild(cell);
    }
  }

  function renderCallSheetDetail(){ /* ... sin cambios ... */ 
    const wrap = el("callSheetDetail");
    if(!wrap) return;
    wrap.innerHTML = "";

    const d = callSheetDayId ? getDay(callSheetDayId) : (selectedDayId ? getDay(selectedDayId) : null);
    if(!d){
      wrap.innerHTML = `<div class="catBlock"><div class="items">Elegí un día con rodaje.</div></div>`;
      return;
    }
    ensureDayTimingMaps(d);

    const scenes = (d.sceneIds||[]).map(getScene).filter(Boolean);
    const cast = union(scenes.flatMap(s=>s.elements?.cast||[]));

    const crewAll = (d.crewIds||[])
      .map(id=>state.crew.find(c=>c.id===id))
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
    resolveOverlapsPushDown(d, snapMin);

    const scenesBox = document.createElement("div");
    scenesBox.className = "catBlock callScenes";
    scenesBox.innerHTML = `<div class="hdr"><span class="dot" style="background:var(--cat-vehicles)"></span>Escenas</div>`;
    const list = document.createElement("div");
    list.className = "items";
    if(!scenes.length){
      list.innerHTML = `<div>—</div>`;
    }else{
      const ordered = d.sceneIds.map(getScene).filter(Boolean);
      list.innerHTML = ordered.map(s=>{
        const st = d.times[s.id] ?? 0;
        const du = d.durations[s.id] ?? 60;
        return `<div><b>${esc(fmtClockFromCall(d.callTime, st))}</b> · #${esc(s.number)} ${esc(s.slugline)} <span class="muted">(${du}m)</span></div>`;
      }).join("");
    }
    scenesBox.appendChild(list);
    wrap.appendChild(scenesBox);

    const castBox = document.createElement("div");
    castBox.className = "catBlock callCast";
    castBox.innerHTML = `
      <div class="hdr"><span class="dot" style="background:${catColors.cast}"></span>Cast</div>
      <div class="items">${cast.length ? cast.map(n=>`<div>${esc(n)}</div>`).join("") : "<div>—</div>"}</div>
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
      crewItems.innerHTML = crewGrouped.map(([area, arr])=>`
        <div style="margin-top:10px;">
          <div style="font-weight:900; margin-bottom:6px;">${esc(area)}</div>
          ${arr.map(c=>`<div>${esc(c.name)}${c.role? ` (${esc(c.role)})`:""}${c.phone? ` · ${esc(c.phone)}`:""}</div>`).join("")}
        </div>
      `).join("");
    }
    crewBox.appendChild(crewItems);
    wrap.appendChild(crewBox);
  }

  // Bank collapse
  function applyBankCollapsedUI(){
    const layout = el("shootingLayout");
    if(!layout) return;
    const collapsed = localStorage.getItem("gb_bank_collapsed")==="1";
    layout.classList.toggle("bankCollapsed", collapsed);
    el("bankDock")?.classList.toggle("hidden", !collapsed);
  }
  function expandBank(){
    localStorage.setItem("gb_bank_collapsed","0");
    applyBankCollapsedUI();
  }

  // Settings JSONBin
  function loadCfgToUI(){
    const cfg = StorageLayer.loadCfg();
    const bin = el("cfg_binId");
    const key = el("cfg_accessKey");
    const au  = el("cfg_autosync");
    if(bin){ bin.value = cfg.binId || ""; bin.setAttribute("readonly","readonly"); }
    if(key){ key.value = cfg.accessKey || ""; key.setAttribute("readonly","readonly"); }
    if(au){ au.value = "on"; au.setAttribute("disabled","disabled"); }
  }
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
      const rec = await StorageLayer.jsonbinGet(cfg.binId, cfg.accessKey);
      if(!rec || !rec.meta) return toast("Remoto vacío o inválido");
      state = rec;
      touch();
      toast("Remoto cargado ✅");
      hydrateAll();
    }catch(err){
      console.error(err);
      toast("No pude traer remoto ❌");
    }
  }
  async function pushRemote(){
    const cfg = StorageLayer.loadCfg();
    if(!cfg.binId || !cfg.accessKey) return toast("Falta Bin ID o Access Key");
    try{
      await StorageLayer.jsonbinPut(cfg.binId, cfg.accessKey, state);
      toast("Estado subido ✅");
      updateSyncPill("JSONBin");
    }catch(err){
      console.error(err);
      toast("No pude subir ❌");
    }
  }


  // Bind events (igual que antes, pero llamamos setupScheduleTopScrollbar después de render schedule)
  function bindEvents(){
    document.querySelectorAll(".navBtn").forEach(b=>{
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
      renderCallSheetDetail();
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
      renderCallSheetDetail();
    });

    ["slugline","location","timeOfDay","pages","summary","notes"].forEach(k=>{
      const node = el(`scene_${k}`);
      node?.addEventListener("input", ()=>{
        const s = selectedSceneId ? getScene(selectedSceneId) : null;
        if(!s) return;
        if(k==="pages") s[k] = Number(node.value||0);
        else if(k==="timeOfDay") s[k] = normalizeTOD(node.value);
        else s[k] = node.value;
        touch();
        renderScenesTable();
        renderSceneBank();
        renderDaysBoard();
        renderDayDetail();
        renderElementsExplorer();
        renderReports();
        renderScheduleBoard();
        renderCallSheetDetail();
      });
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
      ensureScriptState();
      if(!state.script.versions.length){
        el("btnNewScriptVersion")?.click();
        return;
      }
      const panel = el("scriptImportPanel");
      const open = panel ? panel.classList.contains("hidden") : true;
      toggleScriptImportPanel(open);
    });

    // Nueva versión: crea una versión editable (y opcionalmente pegás el guion para procesarla)
    el("btnNewScriptVersion")?.addEventListener("click", ()=>{
      ensureScriptState();
      const now = new Date().toISOString();
      const base = getActiveScriptVersion();
      const v = {
        id: uid("scrVer"),
        name: `V${state.script.versions.length + 1}`,
        createdAt: now,
        updatedAt: now,
        keywords: base?.keywords || "",
        rawText: base?.rawText || "",
        scenes: [],
        draft: true
      };
      state.script.versions.push(v);
      state.script.activeVersionId = v.id;
      selectedScriptSceneId = v.scenes?.[0]?.id || null;

      // Prefill textarea con el último guion (si lo había)
      const ta = el("scriptImportText");
      if(ta) ta.value = base?.rawText || "";
      const ki = el("scriptKeywords");
      if(ki) ki.value = base?.keywords || "";

      touch();
      toast(`Nueva versión creada → ${v.name}`);
      renderScriptUI();
      toggleScriptImportPanel(true);
    });
el("btnParseScript")?.addEventListener("click", ()=>{
      const txt = el("scriptImportText")?.value || "";
      const keys = el("scriptKeywords")?.value || "";
      const scenes = parseScreenplayToScriptScenes(txt, keys);
      if(!scenes.length) return toast("No detecté escenas (revisá INT./EXT. por línea).");
      ensureScriptState();

      const now = new Date().toISOString();
      let v = getActiveScriptVersion();

      // Si venís de 'Nueva versión' (draft) y está vacía, completamos ESA versión
      if(v && v.draft && !(v.scenes||[]).length){
        v.keywords = keys;
        v.rawText = txt;
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
          rawText: txt,
          scenes
        };
        state.script.versions.push(v);
        state.script.activeVersionId = v.id;
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
        const v = getActiveScriptVersion();
        if(!v) return;
        v.rawText = taImport.value || "";
        v.updatedAt = new Date().toISOString();
        touch();
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
      const id = el("scriptVerSelect").value;
      ensureScriptState();
      state.script.activeVersionId = id || null;
      selectedScriptSceneId = null;
      touch();
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
          existing.number = num;
          existing.slugline = sc.slugline || existing.slugline;
          existing.location = sc.location || existing.location;
          existing.timeOfDay = sc.timeOfDay || existing.timeOfDay;
          existing.summary = sc.summary || String(sc.body||"").replace(/\s+/g," ").trim().slice(0,220) || existing.summary;
          updated++;
        }else{
          const s = {
            id: uid("scene"),
            number: num,
            slugline: sc.slugline || "",
            location: sc.location || "",
            timeOfDay: sc.timeOfDay || "",
            pages: 0,
            summary: sc.summary || String(sc.body||"").replace(/\s+/g," ").trim().slice(0,220),
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
      renderCallSheetDetail();
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
        state.scenes.push({
          id: uid("scene"),
          number: r[0]||"",
          slugline: r[1]||"",
          location: r[2]||"",
          timeOfDay: normalizeTOD(r[3]||""),
          pages: Number(r[4]||0),
          summary: r[5]||"",
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

    const dayMap = { day_date:"date", day_call:"callTime", day_location:"location", day_label:"label", day_notes:"notes" };
    for(const id in dayMap){
      el(id)?.addEventListener("input", ()=>{
        const d = selectedDayId ? getDay(selectedDayId) : null;
        if(!d) return;
        d[dayMap[id]] = el(id).value;
        sortShootDaysInPlace();
        touch();
        renderDaysBoard();
        renderDayDetail();
        renderReports();
        renderScheduleBoard();
        renderCallSheetCalendar();
        renderCallSheetDetail();
      });
    }

    el("day_call_minus")?.addEventListener("click", ()=>{
      const d = selectedDayId ? getDay(selectedDayId) : null;
      if(!d) return;
      d.callTime = hhmmFromMinutes(minutesFromHHMM(d.callTime||"08:00") - 15);
      el("day_call").value = d.callTime;
      touch();
      renderDaysBoard(); renderScheduleBoard(); renderReports(); renderCallSheetDetail();
    });
    el("day_call_plus")?.addEventListener("click", ()=>{
      const d = selectedDayId ? getDay(selectedDayId) : null;
      if(!d) return;
      d.callTime = hhmmFromMinutes(minutesFromHHMM(d.callTime||"08:00") + 15);
      el("day_call").value = d.callTime;
      touch();
      renderDaysBoard(); renderScheduleBoard(); renderReports(); renderCallSheetDetail();
    });

    el("btnOpenCallSheet")?.addEventListener("click", ()=>{
      callSheetDayId = selectedDayId;
      showView("callsheet");
      renderCallSheetCalendar();
      renderCallSheetDetail();
    });

    el("btnToggleBank")?.addEventListener("click", ()=>{
      localStorage.setItem("gb_bank_collapsed","1");
      applyBankCollapsedUI();
    });
    el("btnToggleBankDock")?.addEventListener("click", expandBank);

    el("schedZoom")?.addEventListener("change", ()=>{ renderScheduleBoard(); });
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

    el("btnPrintCallSheet")?.addEventListener("click", ()=>window.print());

    el("btnSaveCfg")?.addEventListener("click", saveCfgFromUI);
    el("btnTestCfg")?.addEventListener("click", testCfg);
    el("btnPullRemote")?.addEventListener("click", pullRemote);
    el("btnPushRemote")?.addEventListener("click", pushRemote);

    el("projectTitle")?.addEventListener("input", ()=>{
      state.meta.title = el("projectTitle").value || "Proyecto";
      touch();
      renderCallSheetDetail();
    });
  }

  function hydrateAll(){
    ensureScriptState();
    state.scenes.forEach(ensureSceneExtras);

    renderCatSelect();
    refreshElementSuggestions();

    el("projectTitle").value = state.meta.title || "Proyecto";
    el("savedAtText").textContent = new Date(state.meta.updatedAt).toLocaleString("es-AR");

    if(!state.scenes.length){
      state.scenes.push({
        id: uid("scene"),
        number:"1",
        slugline:"INT. CASA - NOCHE",
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
    renderCallSheetDetail();
    applyBankCollapsedUI();
    initCollapsibles();
  }

  function init(){
    loadCallSheetCursor();
    const local = StorageLayer.loadLocal();
    bootHadLocal = !!(local && local.meta);
    state = bootHadLocal ? local : defaultState();

    selectedSceneId = state.scenes?.[0]?.id || null;
    selectedDayId = state.shootDays?.[0]?.id || null;
    callSheetDayId = selectedDayId;
    selectedShotlistDayId = selectedDayId;

    bindEvents();
    setupScheduleWheelScroll();
    hydrateAll();
    showView("breakdown");

    // Auto-pull remoto when possible (prevents first-time users overwriting remote data)
    initRemoteSync();
    window.addEventListener("online", ()=>{
      // If we started without remote (offline), retry pulling when connection returns
      if(!bootAppliedRemote) initRemoteSync();
    });
  }

  window.addEventListener("DOMContentLoaded", init);
})();
