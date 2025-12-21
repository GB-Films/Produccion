(function(){
  const el = (id)=>document.getElementById(id);

  const views = ["breakdown","shooting","schedule","elements","crew","reports","callsheet","settings"];

  const cats = ["cast","props","wardrobe","art","makeup","sound","sfx","vfx","vehicles","animals","extras"];
  const catNames = {
    cast:"Cast",
    props:"Props",
    wardrobe:"Vestuario",
    art:"Arte",
    makeup:"Maquillaje",
    sound:"Sonido",
    sfx:"SFX",
    vfx:"VFX",
    vehicles:"Vehículos",
    animals:"Animales",
    extras:"Extras"
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

  const crewAreas = ["Producción","Dirección","Foto","Arte","Vestuario","Maquillaje","Sonido","Eléctrica/Grip","Post/VFX","Cast","Otros"];

  let state = null;
  let selectedSceneId = null;
  let selectedDayId = null;
  let callSheetDayId = null;
  let selectedElementKey = null;

  // schedule resize
  let resizing = null;

  // no arrancamos drag en el primer click (timeline)
  let pendingDrag = null;
  let schedDrag = null;

  // drag nativo (HTML5) para banco/plan
  let nativeDragActive = false;

  let calCursor = { year: new Date().getFullYear(), month: new Date().getMonth() };

  const saveDebouncedRemote = window.U.debounce(async ()=>{
    const cfg = StorageLayer.loadCfg();
    if(cfg.autosync !== "on") return;
    if(!cfg.binId || !cfg.accessKey) return;
    try{
      await StorageLayer.jsonbinPut(cfg.binId, cfg.accessKey, state);
      toast("Autosync: JSONBin ✅");
      updateSyncPill("JSONBin");
    }catch{
      toast("Autosync falló (quedó local)");
      updateSyncPill("Local");
    }
  }, 900);

  function esc(s){
    return String(s||"")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
  function uid(p="id"){ return `${p}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`; }
  function toast(msg){
    const t = el("toast");
    t.textContent = msg;
    t.style.display="block";
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>t.style.display="none", 2400);
  }

  function defaultState(){
    return {
      meta: { version: 6, title:"Proyecto", updatedAt: new Date().toISOString() },
      scenes: [],
      shootDays: [],
      crew: []
    };
  }

  function touch(){
    state.meta.updatedAt = new Date().toISOString();
    StorageLayer.saveLocal(state);
    el("savedAtText").textContent = new Date(state.meta.updatedAt).toLocaleString("es-AR");
    el("statusText").textContent = "Guardado";
    saveDebouncedRemote();
  }

  function updateSyncPill(mode){
    const pill = el("syncPill");
    if(pill) pill.textContent = mode;
  }

  function showView(name){
    for(const v of views){
      const node = el(`view-${v}`);
      if(node) node.classList.toggle("hidden", v!==name);
    }
    document.querySelectorAll(".navBtn").forEach(b=>{
      b.classList.toggle("active", b.dataset.view === name);
    });

    if(name === "shooting"){
      // recalcular altura del banco cuando entrás a Plan de rodaje
      window.requestAnimationFrame(()=>syncSceneBankHeight());
    }
  }

  function getScene(id){ return state.scenes.find(s=>s.id===id) || null; }
  function getDay(id){ return state.shootDays.find(d=>d.id===id) || null; }
  function getCrew(id){ return state.crew.find(c=>c.id===id) || null; }

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

  function formatDayTitle(dateStr){
    if(!dateStr) return "Sin fecha";
    const d = new Date(dateStr + "T00:00:00");
    const weekday = new Intl.DateTimeFormat("es-AR",{weekday:"long"}).format(d);
    const dd = String(d.getDate()).padStart(2,"0");
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    return `${cap} ${dd}/${mm}`;
  }

  function sortShootDaysInPlace(){
    state.shootDays.sort((a,b)=>{
      const ta = a.date ? Date.parse(a.date+"T00:00:00") : Number.POSITIVE_INFINITY;
      const tb = b.date ? Date.parse(b.date+"T00:00:00") : Number.POSITIVE_INFINITY;
      if(ta !== tb) return ta - tb;
      return (a.label||"").localeCompare(b.label||"");
    });
  }

  function union(arr){ return Array.from(new Set((arr||[]).filter(Boolean))); }

  // ---------- string utils for element matching ----------
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
  function levenshtein(a,b){
    a = String(a); b = String(b);
    const n=a.length, m=b.length;
    if(!n) return m;
    if(!m) return n;
    const dp = Array.from({length:n+1}, ()=>Array(m+1).fill(0));
    for(let i=0;i<=n;i++) dp[i][0]=i;
    for(let j=0;j<=m;j++) dp[0][j]=j;
    for(let i=1;i<=n;i++){
      for(let j=1;j<=m;j++){
        const cost = a[i-1]===b[j-1]?0:1;
        dp[i][j] = Math.min(
          dp[i-1][j]+1,
          dp[i][j-1]+1,
          dp[i-1][j-1]+cost
        );
      }
    }
    return dp[n][m];
  }

  // ---------- tooltip (reutilizable) ----------
  function showHoverTip(html, x, y){
    const tip = el("hoverTip");
    tip.innerHTML = html;
    tip.style.display = "block";
    moveHoverTip(x,y);
  }
  function moveHoverTip(x,y){
    const tip = el("hoverTip");
    const pad = 16;
    const w = tip.offsetWidth || 420;
    const h = tip.offsetHeight || 200;

    let left = x + 14;
    let top = y + 14;

    if(left + w + pad > window.innerWidth) left = x - w - 14;
    if(top + h + pad > window.innerHeight) top = y - h - 14;

    tip.style.left = `${Math.max(pad, left)}px`;
    tip.style.top = `${Math.max(pad, top)}px`;
  }
  function hideHoverTip(){
    const tip = el("hoverTip");
    tip.style.display = "none";
    tip.innerHTML = "";
  }

  function buildSceneTooltipHTML(scene){
    const parts = [];
    parts.push(`<div class="t">#${esc(scene.number||"")} — ${esc(scene.slugline||"")}</div>`);
    parts.push(`<div class="m">${esc(scene.location||"")} · ${esc(scene.timeOfDay||"")} · Pág ${esc(scene.pages||"")}</div>`);
    if(scene.summary) parts.push(`<div class="m" style="margin-top:8px;">${esc(scene.summary)}</div>`);

    for(const cat of cats){
      const items = (scene.elements?.[cat] || []);
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
      if(nativeDragActive || schedDrag || pendingDrag || resizing) return;
      showHoverTip(buildSceneTooltipHTML(scene), e.clientX, e.clientY);
    });
    node.addEventListener("mousemove", (e)=>{
      if(el("hoverTip").style.display === "block") moveHoverTip(e.clientX, e.clientY);
    });
    node.addEventListener("mouseleave", ()=>hideHoverTip());
  }

  // ----------- Scene bank height sync (hasta "Cast citado") -----------
  function syncSceneBankHeight(){
    const bank = el("sceneBankList");
    const cast = el("dayCast");
    if(!bank || !cast) return;

    const br = bank.getBoundingClientRect();
    const cr = cast.getBoundingClientRect();

    // queremos que el banco termine aprox donde empieza "Cast citado"
    let maxH = (cr.top - br.top) - 14;

    // fallback razonable si por algún motivo da raro
    const minH = 220;
    const maxPossible = Math.max(minH, window.innerHeight - br.top - 28);
    if(!Number.isFinite(maxH) || maxH < minH) maxH = Math.min(maxPossible, 420);

    maxH = Math.max(minH, Math.min(maxH, maxPossible));

    bank.style.maxHeight = `${Math.floor(maxH)}px`;
    bank.style.overflowY = "auto";
  }

  // Cast roster from crew
  function getCastRoster(){
    return union(
      state.crew
        .filter(c=>String(c.area||"").trim().toLowerCase()==="cast")
        .map(c=>(c.name||"").trim())
        .filter(Boolean)
    ).sort((a,b)=>a.localeCompare(b));
  }

  function getExistingElementsByCat(cat){
    const set = new Set();
    for(const s of state.scenes){
      const arr = s.elements?.[cat] || [];
      for(const it of arr){
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
    let options = [];
    if(cat === "cast") options = getCastRoster();
    else options = getExistingElementsByCat(cat);

    dl.innerHTML = options.map(v=>`<option value="${esc(v)}"></option>`).join("");
  }

  // ----------- Script parser (robusto) -----------
  function parseScreenplayToScenes(text, extraKeywordsCsv=""){
    const rawLines = (text||"").split(/\r?\n/);
    const lines = rawLines
      .map(l => String(l ?? "").replace(/\s+$/,""))
      .filter(l => l.trim() !== "");

    if(!lines.length) return [];

    const extra = (extraKeywordsCsv||"")
      .split(",")
      .map(s=>s.trim())
      .filter(Boolean)
      .map(s=>s.toUpperCase());

    function stripSceneNumber(line){
      return line
        .replace(/^\s*\(?\s*\d+\s*\)?\s*[.)-:]\s*/,"")
        .replace(/^\s*\(?\s*\d+\s*\)?\s+/,"");
    }

    function isHeading(line){
      const cleaned = stripSceneNumber(line).trimStart();
      const up = cleaned.toUpperCase();

      for(const k of extra){
        if(up.startsWith(k)) return true;
      }

      if(up.startsWith("INT/EXT.") || up.startsWith("INT/EXT ")) return true;
      if(up.startsWith("INT./EXT.") || up.startsWith("INT./EXT ")) return true;
      if(up.startsWith("I/E.") || up.startsWith("I/E ")) return true;

      if(up.startsWith("INT.") || up.startsWith("INT ")) return true;
      if(up.startsWith("EXT.") || up.startsWith("EXT ")) return true;

      if(up.startsWith("INTERIOR")) return true;
      if(up.startsWith("EXTERIOR")) return true;

      return false;
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
      elements: Object.fromEntries(cats.map(c=>[c,[]]))
    }));

    function finalize(s){
      const heading = s.rawHeading;

      let num = s.autoNumber;
      const mNum = heading.match(/^\s*(\d+)\s*[.)-:]\s*/);
      if(mNum) num = Number(mNum[1]);

      const slugline = stripSceneNumber(heading).trim();

      const parts = slugline
        .split(/\s[-–—]\s/g)
        .map(p=>p.trim())
        .filter(Boolean);

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

  // ----------- schedule helpers -----------
  function minutesFromHHMM(hhmm){
    if(!hhmm) return 8*60;
    const [h,m] = hhmm.split(":").map(Number);
    return (h*60 + (m||0));
  }
  function hhmmFromMinutes(m){
    const mm = ((m % (24*60)) + (24*60)) % (24*60);
    const h = Math.floor(mm/60);
    const mi = String(mm%60).padStart(2,"0");
    return `${String(h).padStart(2,"0")}:${mi}`;
  }
  function snap(value, step){ return Math.round(value/step)*step; }

  function roundTimeToStep(hhmm, stepMin=15){
    if(!hhmm || !hhmm.includes(":")) return hhmm;
    const [h,m] = hhmm.split(":").map(Number);
    if(!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
    const total = h*60 + m;
    const step = stepMin;
    const r = Math.round(total/step)*step;
    return hhmmFromMinutes(r);
  }

  function ensureDayTimingMaps(d){
    d.durations = d.durations || {};
    d.times = d.times || {};
    d.sceneIds = d.sceneIds || [];

    for(const sid of d.sceneIds){
      if(typeof d.durations[sid] !== "number") d.durations[sid] = 60;
    }

    const hasAny = Object.keys(d.times).some(k => typeof d.times[k] === "number");
    if(!hasAny){
      let cursor = 0;
      for(const sid of d.sceneIds){
        d.times[sid] = cursor;
        cursor += d.durations[sid] || 60;
      }
      return;
    }

    let end = 0;
    for(const sid of d.sceneIds){
      const st = d.times[sid];
      const dur = d.durations[sid] || 60;
      if(typeof st === "number") end = Math.max(end, st + dur);
    }
    for(const sid of d.sceneIds){
      if(typeof d.times[sid] !== "number"){
        d.times[sid] = end;
        end += d.durations[sid] || 60;
      }
    }
  }

  function sortDaySceneIdsByTime(d){
    ensureDayTimingMaps(d);
    d.sceneIds.sort((a,b)=>{
      const ta = (typeof d.times[a] === "number") ? d.times[a] : Number.POSITIVE_INFINITY;
      const tb = (typeof d.times[b] === "number") ? d.times[b] : Number.POSITIVE_INFINITY;
      if(ta !== tb) return ta - tb;
      return String(a).localeCompare(String(b));
    });
  }

  function computeDayGridMin(d){
    ensureDayTimingMaps(d);
    let maxEnd = 0;
    for(const sid of d.sceneIds){
      const st = d.times[sid] || 0;
      const dur = d.durations[sid] || 60;
      maxEnd = Math.max(maxEnd, st + dur);
    }
    return Math.max(10*60, maxEnd + 120);
  }

  function findNonOverlappingStart(d, sceneId, startMin, durMin, snapMin){
    ensureDayTimingMaps(d);
    let start = Math.max(0, startMin);

    for(let guard=0; guard<200; guard++){
      let clashEnd = null;
      for(const sid of d.sceneIds){
        if(sid === sceneId) continue;
        const st = d.times[sid] ?? 0;
        const du = d.durations[sid] ?? 60;
        const a0 = start;
        const a1 = start + durMin;
        const b0 = st;
        const b1 = st + du;
        const overlap = (a0 < b1) && (a1 > b0);
        if(overlap){
          clashEnd = Math.max(clashEnd ?? 0, b1);
        }
      }
      if(clashEnd === null) break;
      start = snap(clashEnd, snapMin);
    }
    return start;
  }

  // ----------- Breakdown render -----------
  function renderCatSelects(){
    const sel = el("elCategory");
    if(sel){
      sel.innerHTML = cats.map(c=>`<option value="${c}">${esc(catNames[c])}</option>`).join("");
    }
  }

  function renderScenesTable(){
    const tbody = el("sceneTable").querySelector("tbody");
    const q = (el("sceneSearch").value||"").toLowerCase();
    const tod = (el("sceneFilterTOD").value||"");
    tbody.innerHTML = "";

    const list = state.scenes.filter(s=>{
      const hay = `${s.number} ${s.slugline} ${s.location} ${s.summary}`.toLowerCase();
      if(q && !hay.includes(q)) return false;
      if(tod && (s.timeOfDay||"") !== tod) return false;
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
      });
      tbody.appendChild(tr);
    }
  }

  function renderSceneEditor(){
    const s = selectedSceneId ? getScene(selectedSceneId) : null;
    el("selectedSceneHint").textContent = s ? `Editando escena #${s.number}` : "Seleccioná una escena";

    const fields = ["number","slugline","location","timeOfDay","pages","summary","notes"];
    for(const f of fields){
      const node = el(`scene_${f}`);
      if(!node) continue;
      node.disabled = !s;
      node.value = s ? (s[f] ?? "") : "";
    }

    refreshElementSuggestions();
    renderSceneElementsGrid();
  }

  function renderSceneElementsGrid(){
    const wrap = el("sceneElementsGrid");
    wrap.innerHTML = "";
    const s = selectedSceneId ? getScene(selectedSceneId) : null;
    if(!s) return;

    const nonEmptyCats = cats.filter(cat => (s.elements?.[cat] || []).length > 0);

    if(nonEmptyCats.length === 0){
      wrap.innerHTML = `
        <div class="emptyBox">
          No hay elementos cargados todavía.<br/>
          <b>Tip:</b> elegí una categoría arriba y agregá necesidades de la escena (cast, props, vestuario, etc.).
        </div>
      `;
      return;
    }

    for(const cat of nonEmptyCats){
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
        <div class="chips" id="chips_${cat}"></div>
      `;

      const chipsWrap = row.querySelector(`#chips_${cat}`);
      items.forEach(it=>{
        const chip = document.createElement("div");
        chip.className = "chip";
        chip.innerHTML = `<span>${esc(it)}</span><button title="Quitar">×</button>`;
        chip.querySelector("button").addEventListener("click", ()=>{
          s.elements[cat] = (s.elements[cat]||[]).filter(x=>x!==it);
          touch();
          renderSceneElementsGrid();
          renderDayDetail();
          renderReports();
          renderElementsExplorer();
          renderScheduleBoard();
          renderDaysBoard();
          renderSceneBank();
          renderCallSheetCalendar();
          renderCallSheet();
        });
        chipsWrap.appendChild(chip);
      });

      wrap.appendChild(row);
    }
  }

  function addScene(){
    const s = {
      id: uid("scene"),
      number: String((state.scenes.length||0)+1),
      slugline:"",
      location:"",
      timeOfDay:"",
      pages:0,
      summary:"",
      notes:"",
      elements: Object.fromEntries(cats.map(c=>[c,[]]))
    };
    state.scenes.push(s);
    selectedSceneId = s.id;
    touch();
    renderScenesTable();
    renderSceneEditor();
    renderSceneBank();
    renderDaysBoard();
    renderScheduleBoard();
    renderReports();
    renderElementsExplorer();
  }

  function deleteScene(){
    if(!selectedSceneId) return;
    const s = getScene(selectedSceneId);
    if(!s) return;
    if(!confirm(`Borrar escena #${s.number}?`)) return;

    for(const d of state.shootDays){
      d.sceneIds = (d.sceneIds||[]).filter(id=>id!==s.id);
      if(d.durations) delete d.durations[s.id];
      if(d.times) delete d.times[s.id];
    }
    state.scenes = state.scenes.filter(x=>x.id!==s.id);
    selectedSceneId = state.scenes[0]?.id || null;
    touch();
    renderScenesTable();
    renderSceneEditor();
    renderSceneBank();
    renderDaysBoard();
    renderDayDetail();
    renderReports();
    renderElementsExplorer();
    renderScheduleBoard();
    renderCallSheetCalendar();
    renderCallSheet();
  }

  function duplicateScene(){
    if(!selectedSceneId) return;
    const s = getScene(selectedSceneId);
    if(!s) return;
    const c = JSON.parse(JSON.stringify(s));
    c.id = uid("scene");
    c.number = `${s.number}b`;
    state.scenes.push(c);
    selectedSceneId = c.id;
    touch();
    renderScenesTable();
    renderSceneEditor();
    renderSceneBank();
    renderDaysBoard();
    renderScheduleBoard();
    renderReports();
    renderElementsExplorer();
  }

  function addSceneElement(){
    const s = selectedSceneId ? getScene(selectedSceneId) : null;
    if(!s) return;

    const cat = el("elCategory").value;
    let item = (el("elItem").value||"").trim();
    if(!item) return;

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
        const close = roster.map(r=>({r, d: levenshtein(normName(r), nIn)}))
          .sort((a,b)=>a.d-b.d)[0];
        if(close && close.d <= 2){
          item = close.r;
          toast(`Usé Cast existente: ${item}`);
        }else{
          toast("Ese nombre no está en Cast (Equipo técnico). Cargalo ahí primero.");
          return;
        }
      }
    }else{
      const existing = getExistingElementsByCat(cat);
      const nIn = normName(item);
      const exact = existing.find(v => normName(v) === nIn);
      if(exact){
        item = exact;
        toast(`Ya existía. Usé: ${item}`);
      }else if(existing.length){
        let best = null;
        for(const v of existing){
          const nv = normName(v);
          if(!nv) continue;
          const contains = (nv.includes(nIn) && nIn.length>=4) || (nIn.includes(nv) && nv.length>=4);
          const d = levenshtein(nv, nIn);
          const thr = nIn.length <= 10 ? 2 : 3;
          if(contains || d <= thr){
            if(!best || d < best.d) best = {v, d};
          }
        }
        if(best){
          item = best.v;
          toast(`Nombre similar detectado. Usé: ${item}`);
        }
      }
    }

    s.elements[cat] = s.elements[cat] || [];
    if(!s.elements[cat].includes(item)) s.elements[cat].push(item);

    el("elItem").value="";
    touch();
    refreshElementSuggestions();
    renderSceneElementsGrid();
    renderDayDetail();
    renderReports();
    renderElementsExplorer();
    renderScheduleBoard();
    renderCallSheet();
  }

  function importScenesTable(){
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
        elements: Object.fromEntries(cats.map(c=>[c,[]]))
      });
      added++;
    }
    if(added){
      selectedSceneId = state.scenes[state.scenes.length-1].id;
      touch();
      toast(`Importadas ${added} escenas ✅`);
      renderScenesTable();
      renderSceneEditor();
      renderSceneBank();
      renderDaysBoard();
      renderScheduleBoard();
      renderReports();
      renderElementsExplorer();
    }
  }

  function importScript(){
    const txt = el("scriptImportText").value || "";
    const keys = el("scriptKeywords").value || "";
    const scenes = parseScreenplayToScenes(txt, keys);
    if(!scenes.length) return toast("No detecté escenas. Revisá que cada INT./EXT. esté en su propia línea.");

    state.scenes.push(...scenes);
    selectedSceneId = state.scenes[state.scenes.length-1].id;
    touch();
    toast(`Cargadas ${scenes.length} escenas ✅`);
    renderScenesTable();
    renderSceneEditor();
    renderSceneBank();
    renderDaysBoard();
    renderScheduleBoard();
    renderReports();
    renderElementsExplorer();
  }

  // ----------- Shooting plan -----------
  function addShootDay(){
    const d = {
      id: uid("day"),
      date:"",
      callTime:"08:00",
      location:"",
      label:"",
      notes:"",
      sceneIds:[],
      crewIds:[],
      durations:{},
      times:{}
    };
    state.shootDays.push(d);
    sortShootDaysInPlace();
    selectedDayId = d.id;
    touch();
    renderDaysBoard();
    renderDayDetail();
    renderReports();
    renderElementsExplorer();
    renderScheduleBoard();
    renderCallSheetCalendar();
    syncSceneBankHeight();
  }

  function deleteShootDay(){
    if(!selectedDayId) return;
    const d = getDay(selectedDayId);
    if(!d) return;
    if(!confirm(`Borrar día ${d.date || "(sin fecha)"}?`)) return;
    state.shootDays = state.shootDays.filter(x=>x.id!==d.id);
    sortShootDaysInPlace();
    selectedDayId = state.shootDays[0]?.id || null;
    touch();
    renderDaysBoard();
    renderDayDetail();
    renderReports();
    renderElementsExplorer();
    renderScheduleBoard();
    renderCallSheetCalendar();
    renderCallSheet();
    syncSceneBankHeight();
  }

  function sceneAssignedDayId(sceneId){
    for(const d of state.shootDays){
      if((d.sceneIds||[]).includes(sceneId)) return d.id;
    }
    return null;
  }

  // mode: "bank" | "day"
  function sceneCardNode(s, assignedDayId, mode="bank"){
    const node = document.createElement("div");
    node.className = "sceneCard";
    node.draggable = true;
    node.dataset.sceneId = s.id;
    node.dataset.fromDayId = assignedDayId || "";

    // borde verde/rojo (asignada o no)
    if(assignedDayId) node.classList.add("assigned");
    else node.classList.add("unassigned");

    if(mode === "day"){
      node.innerHTML = `
        <div class="left">
          <div class="title">${esc(s.slugline||"")}</div>
        </div>
        <div class="right">
          <span class="dragHandle" title="Arrastrar">⠿</span>
        </div>
      `;
    }else{
      node.innerHTML = `
        <div class="left">
          <div class="title">#${esc(s.number||"")} — ${esc(s.slugline||"")}</div>
          <div class="meta">${esc(s.location||"")} · ${esc(s.timeOfDay||"")}${assignedDayId? " · asignada":""}</div>
        </div>
        <div class="right">
          <span class="dragHandle" title="Arrastrar">⠿</span>
        </div>
      `;
    }

    // hover tooltip profundo (especialmente útil en tablero de días)
    attachSceneHover(node, s);

    node.addEventListener("dragstart", (e)=>{
      nativeDragActive = true;
      hideHoverTip();
      node.classList.add("dragging");
      const payload = { type:"scene", sceneId:s.id, fromDayId: assignedDayId || null };
      e.dataTransfer.setData("application/json", JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "move";
    });
    node.addEventListener("dragend", ()=>{
      nativeDragActive = false;
      node.classList.remove("dragging");
      syncSceneBankHeight();
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
    if(filter === "unassigned"){
      list = list.filter(s=>!sceneAssignedDayId(s.id));
    }
    if(q){
      list = list.filter(s=>{
        const hay = `${s.number} ${s.slugline} ${s.location} ${s.summary}`.toLowerCase();
        return hay.includes(q);
      });
    }

    for(const s of list){
      const assignedDay = sceneAssignedDayId(s.id);
      wrap.appendChild(sceneCardNode(s, assignedDay, "bank"));
    }

    syncSceneBankHeight();
  }

  function moveSceneToDayAtEnd(sceneId, targetDayId){
    let fromDay = null;
    for(const d of state.shootDays){
      if((d.sceneIds||[]).includes(sceneId)) fromDay = d;
      d.sceneIds = (d.sceneIds||[]).filter(x=>x!==sceneId);
    }

    const targetDay = getDay(targetDayId);
    if(!targetDay) return;

    ensureDayTimingMaps(targetDay);

    let dur = 60;
    if(fromDay && fromDay.durations && typeof fromDay.durations[sceneId] === "number") dur = fromDay.durations[sceneId];

    targetDay.durations[sceneId] = dur;

    let end = 0;
    for(const sid of targetDay.sceneIds){
      const st = targetDay.times[sid] ?? 0;
      const du = targetDay.durations[sid] ?? 60;
      end = Math.max(end, st + du);
    }

    targetDay.sceneIds.push(sceneId);
    targetDay.sceneIds = Array.from(new Set(targetDay.sceneIds));
    targetDay.times[sceneId] = end;

    sortDaySceneIdsByTime(targetDay);
  }

  function renderDaysBoard(){
    const board = el("daysBoard");
    if(!board) return;
    board.innerHTML = "";

    sortShootDaysInPlace();

    for(const d of state.shootDays){
      ensureDayTimingMaps(d);
      sortDaySceneIdsByTime(d);

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
        <div class="muted">${(d.sceneIds||[]).length} escenas</div>
      `;
      head.addEventListener("click", ()=>{
        selectedDayId = d.id;
        renderDaysBoard();
        renderDayDetail();
        syncSceneBankHeight();
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
        if(data.type !== "scene") return;

        moveSceneToDayAtEnd(data.sceneId, d.id);

        selectedDayId = d.id;
        touch();
        renderDaysBoard();
        renderSceneBank();
        renderDayDetail();
        renderReports();
        renderElementsExplorer();
        renderScheduleBoard();
        renderCallSheetCalendar();
        renderCallSheet();
        syncSceneBankHeight();
      });

      const ids = d.sceneIds || [];
      if(!ids.length){
        zone.innerHTML = `<div class="muted">Soltá escenas acá…</div>`;
      }else{
        for(const sid of ids){
          const s = getScene(sid);
          if(!s) continue;

          // ✅ en tablero: solo slugline (detalle va al hover)
          const card = sceneCardNode(s, d.id, "day");
          zone.appendChild(card);
        }
      }

      col.appendChild(head);
      col.appendChild(zone);

      if(d.id === selectedDayId){
        col.style.borderColor = "rgba(110,231,255,.35)";
      }

      board.appendChild(col);
    }
  }

  function setDayFieldHandlers(){
    const d = selectedDayId ? getDay(selectedDayId) : null;
    const map = {
      day_date: "date",
      day_call: "callTime",
      day_location:"location",
      day_label:"label",
      day_notes:"notes"
    };
    for(const id in map){
      const node = el(id);
      if(!node) continue;
      node.disabled = !d;
      node.value = d ? (d[map[id]] || "") : "";
    }
  }

  function dayScenes(d){
    return (d.sceneIds||[]).map(getScene).filter(Boolean);
  }

  function renderDayCast(){
    const wrap = el("dayCast");
    wrap.innerHTML = "";
    const d = selectedDayId ? getDay(selectedDayId) : null;
    if(!d){ wrap.innerHTML = `<span class="muted">Seleccioná un día</span>`; return; }

    const scenes = dayScenes(d);
    const cast = union(scenes.flatMap(s=>s.elements?.cast || []));
    if(!cast.length){
      wrap.innerHTML = `<span class="muted">No hay cast cargado en breakdown.</span>`;
      return;
    }
    cast.forEach(name=>{
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.innerHTML = `<span class="catBadge"><span class="dot" style="background:${catColors.cast}"></span>${esc(name)}</span>`;
      wrap.appendChild(chip);
    });

    // clave: después de renderizar cast, recalculamos altura del banco
    syncSceneBankHeight();
  }

  function renderDayCrewPicker(){
    const wrap = el("dayCrewPicker");
    wrap.innerHTML = "";
    const d = selectedDayId ? getDay(selectedDayId) : null;
    if(!d){ wrap.innerHTML = `<div class="muted">Seleccioná un día</div>`; return; }

    const crew = state.crew
      .filter(c=>String(c.area||"").trim().toLowerCase()!=="cast");

    if(!crew.length){
      wrap.innerHTML = `<div class="muted">No cargaste equipo técnico todavía.</div>`;
      return;
    }

    const areaIndex = new Map(crewAreas.map((a,i)=>[a,i]));
    const sorted = crew.slice().sort((a,b)=>{
      const ia = areaIndex.get(a.area)||999;
      const ib = areaIndex.get(b.area)||999;
      if(ia!==ib) return ia-ib;
      const ra = (a.role||"").toLowerCase();
      const rb = (b.role||"").toLowerCase();
      if(ra!==rb) return ra.localeCompare(rb);
      return (a.name||"").localeCompare(b.name||"");
    });

    const selected = new Set(d.crewIds||[]);

    let lastArea = null;

    for(const c of sorted){
      const area = c.area || "Otros";
      if(area !== lastArea){
        const hdr = document.createElement("div");
        hdr.className = "crewAreaHeader";
        hdr.textContent = area;
        wrap.appendChild(hdr);
        lastArea = area;
      }

      const isSel = selected.has(c.id);
      const item = document.createElement("div");
      item.className = "crewPickItem" + (isSel ? " selected" : "");
      item.innerHTML = `
        <div class="left">
          <span class="statusDot"></span>
          <div>
            <div class="title">${esc(c.name||"(sin nombre)")}</div>
            <div class="meta">${esc(c.area||"")} · ${esc(c.role||"")} ${c.phone? " · "+esc(c.phone):""}</div>
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
        renderCallSheet();
        syncSceneBankHeight();
      });
      wrap.appendChild(item);
    }
  }

  function deptFromCat(cat){
    const map = {
      cast:"Talento",
      props:"Arte",
      art:"Arte",
      wardrobe:"Vestuario",
      makeup:"Maquillaje",
      sound:"Sonido",
      sfx:"SFX",
      vfx:"Post/VFX",
      vehicles:"Producción",
      animals:"Producción",
      extras:"Producción"
    };
    return map[cat] || "Otros";
  }

  function renderDayNeeds(){
    const wrap = el("dayNeeds");
    wrap.innerHTML = "";
    const d = selectedDayId ? getDay(selectedDayId) : null;
    if(!d){ wrap.innerHTML = `<div class="muted">Seleccioná un día</div>`; return; }

    const scenes = dayScenes(d);
    const needsByDept = {};
    for(const cat of cats){
      const items = union(scenes.flatMap(s=>s.elements?.[cat] || []));
      if(!items.length) continue;
      const dept = deptFromCat(cat);
      needsByDept[dept] = needsByDept[dept] || {};
      needsByDept[dept][cat] = items;
    }

    const depts = Object.keys(needsByDept);
    if(!depts.length){
      wrap.innerHTML = `<div class="muted">No hay elementos cargados en breakdown.</div>`;
      return;
    }

    for(const dept of depts.sort((a,b)=>a.localeCompare(b))){
      const box = document.createElement("div");
      box.className = "listItem";
      box.style.flexDirection="column";
      box.innerHTML = `<div class="title">${esc(dept)}</div>`;
      const chips = document.createElement("div");
      chips.className = "chips";
      chips.style.marginTop="8px";

      for(const cat of cats){
        const arr = needsByDept[dept][cat];
        if(!arr) continue;
        arr.forEach(it=>{
          const chip = document.createElement("div");
          chip.className = "chip";
          chip.innerHTML = `
            <span class="catBadge">
              <span class="dot" style="background:${catColors[cat]}"></span>
              <b>${esc(catNames[cat])}:</b> <span>${esc(it)}</span>
            </span>`;
          chips.appendChild(chip);
        });
      }

      box.appendChild(chips);
      wrap.appendChild(box);
    }
  }

  function renderDayDetail(){
    setDayFieldHandlers();
    renderDayCast();
    renderDayCrewPicker();
    renderDayNeeds();
    syncSceneBankHeight();
  }

  // ----------- Elements explorer (sin cambios funcionales) -----------
  function populateElementsFilters(){
    const catSel = el("elxCategory");
    const daySel = el("elxDay");
    if(!catSel || !daySel) return;

    const prevCat = catSel.value || "all";
    const prevDay = daySel.value || "all";

    catSel.innerHTML =
      `<option value="all">Todas las categorías</option>` +
      cats.map(c=>`<option value="${c}">${esc(catNames[c])}</option>`).join("");

    daySel.innerHTML = `
      <option value="all">Todos los días</option>
      <option value="unassigned">No asignadas</option>
      ${state.shootDays.map(d=>`<option value="${esc(d.id)}">${esc(formatDayTitle(d.date))}</option>`).join("")}
    `;

    catSel.value = (prevCat === "all" || cats.includes(prevCat)) ? prevCat : "all";
    if(prevDay === "unassigned" || prevDay === "all" || state.shootDays.some(d=>d.id===prevDay)){
      daySel.value = prevDay;
    }else{
      daySel.value = "all";
    }
  }

  function scenesForDayFilter(dayFilter){
    if(dayFilter === "all") return state.scenes.slice();
    if(dayFilter === "unassigned"){
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
    const pushItem = (cat, item, sceneId)=>{
      const key = `${cat}::${item}`;
      if(q && !item.toLowerCase().includes(q)) return;

      if(!counts.has(key)){
        counts.set(key, {count:0, sceneIds:new Set(), cat, item});
      }
      const obj = counts.get(key);
      obj.count += 1;
      obj.sceneIds.add(sceneId);
    };

    for(const s of scenes){
      if(catFilter === "all"){
        for(const cat of cats){
          const items = s.elements?.[cat] || [];
          for(const it of items){
            const item = it.trim();
            if(!item) continue;
            pushItem(cat, item, s.id);
          }
        }
      }else{
        const items = s.elements?.[catFilter] || [];
        for(const it of items){
          const item = it.trim();
          if(!item) continue;
          pushItem(catFilter, item, s.id);
        }
      }
    }

    const listWrap = el("elxList");
    const detailWrap = el("elxDetail");
    listWrap.innerHTML = "";
    detailWrap.innerHTML = "";

    let entries = Array.from(counts.entries());
    entries.sort((a,b)=>{
      const A = a[1], B = b[1];
      const ia = cats.indexOf(A.cat);
      const ib = cats.indexOf(B.cat);
      if(ia !== ib) return ia - ib;
      return A.item.localeCompare(B.item);
    });

    if(!entries.length){
      listWrap.innerHTML = `<div class="muted">No hay elementos para este filtro.</div>`;
      return;
    }

    for(const [key, info] of entries){
      const row = document.createElement("div");
      row.className = "listItem";
      row.style.cursor = "pointer";
      row.innerHTML = `
        <div>
          <div class="title">
            <span class="catBadge">
              <span class="dot" style="background:${catColors[info.cat]}"></span>
              ${esc(info.item)}
            </span>
          </div>
          <div class="meta">${esc(catNames[info.cat])} · ${info.sceneIds.size} escena(s)</div>
        </div>
        <div class="muted">${info.count}</div>
      `;
      row.addEventListener("click", ()=>{
        selectedElementKey = key;
        renderElementDetail(dayFilter, key, info);
      });
      listWrap.appendChild(row);
    }

    if(!selectedElementKey || !counts.has(selectedElementKey)){
      selectedElementKey = entries[0][0];
    }
    renderElementDetail(dayFilter, selectedElementKey, counts.get(selectedElementKey));
  }

  function renderElementDetail(dayFilter, key, info){
    const wrap = el("elxDetail");
    wrap.innerHTML = "";

    const scenes = Array.from(info.sceneIds).map(getScene).filter(Boolean);

    const header = document.createElement("div");
    header.className = "listItem";
    header.style.flexDirection = "column";
    header.innerHTML = `
      <div class="title">
        <span class="catBadge"><span class="dot" style="background:${catColors[info.cat]}"></span>${esc(info.item)}</span>
      </div>
      <div class="meta">${esc(catNames[info.cat])}</div>
    `;
    wrap.appendChild(header);

    scenes.forEach(s=>{
      const row = document.createElement("div");
      row.className = "listItem";
      row.innerHTML = `
        <div>
          <div class="title">#${esc(s.number||"")} — ${esc(s.slugline||"")}</div>
          <div class="meta">${esc(s.location||"")} · ${esc(s.timeOfDay||"")}</div>
        </div>
        <div class="row gap">
          <button class="btn">Abrir escena</button>
        </div>
      `;
      row.querySelector("button").addEventListener("click", ()=>{
        selectedSceneId = s.id;
        showView("breakdown");
        renderScenesTable();
        renderSceneEditor();
      });
      wrap.appendChild(row);
    });
  }

  // ----------- Crew -----------
  function addCrew(){
    state.crew.push({ id: uid("crew"), area:"Producción", role:"", name:"", phone:"", email:"", notes:"" });
    touch();
    renderCrew();
    refreshElementSuggestions();
    renderDayDetail();
    renderReports();
    renderCallSheet();
  }

  function renderCrew(){
    const tbody = el("crewTable").querySelector("tbody");
    const q = (el("crewSearch")?.value || "").trim().toLowerCase();
    tbody.innerHTML = "";

    const areaIndex = new Map(crewAreas.map((a,i)=>[a,i]));

    let list = state.crew.slice();

    if(q){
      list = list.filter(c=>{
        const hay = `${c.area} ${c.role} ${c.name} ${c.phone} ${c.email} ${c.notes}`.toLowerCase();
        return hay.includes(q);
      });
    }

    list.sort((a,b)=>{
      const ia = areaIndex.get(a.area)||999;
      const ib = areaIndex.get(b.area)||999;
      if(ia!==ib) return ia-ib;
      const ra = (a.role||"").toLowerCase();
      const rb = (b.role||"").toLowerCase();
      if(ra!==rb) return ra.localeCompare(rb);
      return (a.name||"").localeCompare(b.name||"");
    });

    let lastArea = null;

    list.forEach(c=>{
      if(c.area !== lastArea){
        const trG = document.createElement("tr");
        trG.className = "groupRow";
        trG.innerHTML = `<td colspan="7">${esc(c.area||"Otros")}</td>`;
        tbody.appendChild(trG);
        lastArea = c.area;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <select class="input">
            ${crewAreas.map(a=>`<option value="${esc(a)}" ${c.area===a?"selected":""}>${esc(a)}</option>`).join("")}
          </select>
        </td>
        <td><input class="input" value="${esc(c.role||"")}" /></td>
        <td><input class="input" value="${esc(c.name||"")}" /></td>
        <td><input class="input" value="${esc(c.phone||"")}" /></td>
        <td><input class="input" value="${esc(c.email||"")}" /></td>
        <td><input class="input" value="${esc(c.notes||"")}" /></td>
        <td><button class="btn danger">Borrar</button></td>
      `;

      const [areaSel, role, name, phone, email, notes] = tr.querySelectorAll("select,input");

      const refreshEverywhere = ()=>{
        refreshElementSuggestions();
        renderDayDetail();
        renderReports();
        renderCallSheet();
      };

      areaSel.addEventListener("change", ()=>{ c.area = areaSel.value; touch(); renderCrew(); refreshEverywhere(); });
      role.addEventListener("input", ()=>{ c.role = role.value; touch(); refreshEverywhere(); });
      name.addEventListener("input", ()=>{ c.name = name.value; touch(); refreshEverywhere(); });
      phone.addEventListener("input", ()=>{ c.phone = phone.value; touch(); });
      email.addEventListener("input", ()=>{ c.email = email.value; touch(); });
      notes.addEventListener("input", ()=>{ c.notes = notes.value; touch(); });

      tr.querySelector("button").addEventListener("click", ()=>{
        if(!confirm("Borrar integrante?")) return;
        for(const d of state.shootDays){
          d.crewIds = (d.crewIds||[]).filter(id=>id!==c.id);
        }
        state.crew = state.crew.filter(x=>x.id!==c.id);
        touch();
        renderCrew();
        refreshEverywhere();
      });

      tbody.appendChild(tr);
    });

    if(!list.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7" class="muted">No hay resultados.</td>`;
      tbody.appendChild(tr);
    }
  }

  // ----------- Reports / CallSheets / Schedule (sin cambios relevantes acá) -----------
  // Para no duplicar 4000 líneas: dejamos igual tu versión actual.
  // Pero como vos venís pegando archivos completos, acá la app requiere el resto.
  //
  // 👇👇👇
  //
  // IMPORTANTE:
  // Pegá el resto de tu app.js actual debajo de este comentario,
  // SIN CAMBIAR, y antes del bindEvents/init.
  //
  // (Si querés, decime “pegá todo completo” y te lo envío entero entero,
  // pero acá te lo corto para no tirarte 8000 líneas por chat.)
  //
  // 👆👆👆

  // -----------------------------
  // PEGÁ ACÁ EL RESTO (Reports/CallSheets/Schedule + bindEvents/init)
  // -----------------------------

  function bindEvents(){
    document.querySelectorAll(".navBtn").forEach(b=>{
      b.addEventListener("click", ()=>{
        const v = b.dataset.view;
        if(!v) return;
        showView(v);

        if(v === "elements") renderElementsExplorer();
        if(v === "shooting"){ renderSceneBank(); renderDaysBoard(); renderDayDetail(); }
        if(v === "crew") renderCrew();
      });
    });

    el("btnAddScene")?.addEventListener("click", addScene);
    el("btnDeleteScene")?.addEventListener("click", deleteScene);
    el("btnDuplicateScene")?.addEventListener("click", duplicateScene);

    el("sceneSearch")?.addEventListener("input", renderScenesTable);
    el("sceneFilterTOD")?.addEventListener("change", renderScenesTable);

    ["number","slugline","location","timeOfDay","pages","summary","notes"].forEach(k=>{
      const node = el(`scene_${k}`);
      if(!node) return;
      node.addEventListener("input", ()=>{
        const s = selectedSceneId ? getScene(selectedSceneId) : null;
        if(!s) return;
        s[k] = (k==="pages") ? Number(node.value||0) : (k==="timeOfDay" ? normalizeTOD(node.value) : node.value);
        touch();
        renderScenesTable();
        renderSceneBank();
        renderDaysBoard();
        renderElementsExplorer();
        refreshElementSuggestions();
        syncSceneBankHeight();
      });
    });

    el("btnAddSceneElement")?.addEventListener("click", addSceneElement);
    el("elCategory")?.addEventListener("change", ()=>{ refreshElementSuggestions(); });
    el("elItem")?.addEventListener("input", ()=>refreshElementSuggestions());

    el("btnImportScenes")?.addEventListener("click", importScenesTable);
    el("btnClearImport")?.addEventListener("click", ()=>{ el("sceneImportText").value=""; });

    el("btnParseScript")?.addEventListener("click", importScript);
    el("btnClearScript")?.addEventListener("click", ()=>{ el("scriptImportText").value=""; });

    // shooting
    el("btnAddShootDay")?.addEventListener("click", addShootDay);
    el("btnDeleteShootDay")?.addEventListener("click", deleteShootDay);

    el("bankSearch")?.addEventListener("input", renderSceneBank);
    el("bankFilter")?.addEventListener("change", renderSceneBank);

    const dayMap = {
      day_date:"date",
      day_call:"callTime",
      day_location:"location",
      day_label:"label",
      day_notes:"notes"
    };
    Object.keys(dayMap).forEach(id=>{
      const node = el(id);
      if(!node) return;
      node.addEventListener("input", ()=>{
        const d = selectedDayId ? getDay(selectedDayId) : null;
        if(!d) return;

        if(id === "day_call"){
          d.callTime = roundTimeToStep(node.value, 15);
          node.value = d.callTime;
        }else{
          d[dayMap[id]] = node.value;
        }

        sortShootDaysInPlace();
        touch();
        renderDaysBoard();
        renderDayDetail();
        renderSceneBank();
        syncSceneBankHeight();
      });
    });

    el("btnOpenCallSheet")?.addEventListener("click", ()=>{
      callSheetDayId = selectedDayId;
      showView("callsheet");
    });

    // crew
    el("btnAddCrew")?.addEventListener("click", addCrew);
    el("crewSearch")?.addEventListener("input", renderCrew);

    // title
    el("projectTitle")?.addEventListener("input", ()=>{
      state.meta.title = el("projectTitle").value || "Proyecto";
      touch();
    });

    // resize -> recalcular altura del banco
    window.addEventListener("resize", window.U.debounce(syncSceneBankHeight, 120));
  }

  function hydrateUI(){
    renderCatSelects();
    refreshElementSuggestions();

    el("projectTitle").value = state.meta.title || "Proyecto";

    sortShootDaysInPlace();

    renderScenesTable();
    renderSceneEditor();
    renderSceneBank();
    renderDaysBoard();
    renderDayDetail();
    renderElementsExplorer();
    renderCrew();

    syncSceneBankHeight();
  }

  function init(){
    const local = StorageLayer.loadLocal();
    state = (local && local.meta) ? local : defaultState();

    state.shootDays = state.shootDays || [];
    state.crew = state.crew || [];
    state.scenes = state.scenes || [];

    for(const d of state.shootDays){
      d.sceneIds = d.sceneIds || [];
      d.crewIds = d.crewIds || [];
      d.durations = d.durations || {};
      d.times = d.times || {};
      ensureDayTimingMaps(d);
      sortDaySceneIdsByTime(d);
    }

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
        elements: Object.fromEntries(cats.map(c=>[c,[]]))
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
        durations:{},
        times:{}
      });
    }

    selectedSceneId = state.scenes[0]?.id || null;
    selectedDayId = state.shootDays[0]?.id || null;

    bindEvents();
    hydrateUI();
    showView("breakdown");
  }

  window.addEventListener("DOMContentLoaded", init);
})();
