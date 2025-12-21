(function(){
  const el = (id)=>document.getElementById(id);

  const views = ["breakdown","shooting","schedule","elements","crew","reports","callsheet","settings"];

  // Orden de categorías (prioridad)
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

  // schedule resize only
  let resizing = null; // {sceneId, dayId, startY, startDur, pxPerMin, snapMin}
  let nativeDragActive = false;
  let scheduleDirty = false;

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
    if(!t) return;
    t.textContent = msg;
    t.style.display="block";
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>t.style.display="none", 2400);
  }

  function defaultState(){
    return {
      meta: { version: 7, title:"Proyecto", updatedAt: new Date().toISOString() },
      scenes: [],
      shootDays: [],
      crew: []
    };
  }

  function touch(){
    state.meta.updatedAt = new Date().toISOString();
    StorageLayer.saveLocal(state);
    const savedAt = el("savedAtText");
    if(savedAt) savedAt.textContent = new Date(state.meta.updatedAt).toLocaleString("es-AR");
    const status = el("statusText");
    if(status) status.textContent = "Guardado";
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
      requestAnimationFrame(()=>syncSceneBankHeight());
      requestAnimationFrame(()=>ensureDayTopTwoColumns());
    }
    if(name === "schedule"){
      requestAnimationFrame(()=>renderScheduleBoard());
    }
    if(name === "callsheet"){
      requestAnimationFrame(()=>{ renderCallSheetCalendar(); renderCallSheet(); });
    }
  }

  function getScene(id){ return state.scenes.find(s=>s.id===id) || null; }
  function getDay(id){ return state.shootDays.find(d=>d.id===id) || null; }

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

  // ---------- element matching ----------
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
        dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
      }
    }
    return dp[n][m];
  }

  // ---------- tooltip ----------
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
    let top = y + 14;

    if(left + w + pad > window.innerWidth) left = x - w - 14;
    if(top + h + pad > window.innerHeight) top = y - h - 14;

    tip.style.left = `${Math.max(pad, left)}px`;
    tip.style.top = `${Math.max(pad, top)}px`;
  }
  function hideHoverTip(){
    const tip = el("hoverTip");
    if(!tip) return;
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
      if(nativeDragActive || resizing) return;
      showHoverTip(buildSceneTooltipHTML(scene), e.clientX, e.clientY);
    });
    node.addEventListener("mousemove", (e)=>{
      const tip = el("hoverTip");
      if(tip && tip.style.display === "block") moveHoverTip(e.clientX, e.clientY);
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
    let maxH = (cr.top - br.top) - 14;

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

  // ---------- Time helpers ----------
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
  function fmtClock(totalMinutes){
    const days = Math.floor(totalMinutes / (24*60));
    const base = hhmmFromMinutes(totalMinutes);
    return days > 0 ? `${base} (+${days})` : base;
  }

  function snap(value, step){ return Math.round(value/step)*step; }
  function roundTimeToStep(hhmm, stepMin=15){
    if(!hhmm || !hhmm.includes(":")) return hhmm;
    const total = minutesFromHHMM(hhmm);
    const r = Math.round(total/stepMin)*stepMin;
    return hhmmFromMinutes(r);
  }
  function addMinutesHHMM(hhmm, delta){
    const total = minutesFromHHMM(hhmm);
    return hhmmFromMinutes(total + delta);
  }

  // ----------- Day timing maps for schedule (minutes since call) -----------
  function ensureDayTimingMaps(d){
    d.durations = d.durations || {};
    d.times = d.times || {};
    d.sceneIds = d.sceneIds || [];

    for(const sid of d.sceneIds){
      if(typeof d.durations[sid] !== "number") d.durations[sid] = 60;
      if(typeof d.times[sid] !== "number") d.times[sid] = 0;
    }
  }

  function sortDaySceneIdsByTime(d){
    ensureDayTimingMaps(d);
    d.sceneIds.sort((a,b)=>{
      const ta = (typeof d.times[a] === "number") ? d.times[a] : 0;
      const tb = (typeof d.times[b] === "number") ? d.times[b] : 0;
      if(ta !== tb) return ta - tb;
      return String(a).localeCompare(String(b));
    });
  }

  function computeDayGridMinutes(d){
    ensureDayTimingMaps(d);
    let maxEnd = 10*60; // mínimo 10h
    for(const sid of d.sceneIds){
      const st = d.times[sid] ?? 0;
      const dur = d.durations[sid] ?? 60;
      maxEnd = Math.max(maxEnd, st + dur + 120);
    }
    return maxEnd;
  }

  // ✅ Empujar escenas hacia abajo para que nunca se superpongan
  // No "arrastra para arriba" (si achicás duración, deja huecos)
  function resolveDayOverlapsPushDown(d, snapMin){
    ensureDayTimingMaps(d);
    sortDaySceneIdsByTime(d);

    let cursorEnd = 0;
    for(const sid of d.sceneIds){
      let st = d.times[sid] ?? 0;
      const du = d.durations[sid] ?? 60;

      if(st < cursorEnd){
        st = snap(cursorEnd, snapMin);
        d.times[sid] = st;
      }
      cursorEnd = st + du;
    }
  }

  // ----------- Script parser (INT./EXT.) -----------
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

  // ----------- Breakdown render -----------
  function renderCatSelects(){
    const sel = el("elCategory");
    if(sel){
      sel.innerHTML = cats.map(c=>`<option value="${c}">${esc(catNames[c])}</option>`).join("");
    }
  }

  function renderScenesTable(){
    const sceneTable = el("sceneTable");
    if(!sceneTable) return;
    const tbody = sceneTable.querySelector("tbody");
    const q = (el("sceneSearch")?.value||"").toLowerCase();
    const tod = (el("sceneFilterTOD")?.value||"");
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
  }

  function renderSceneElementsGrid(){
    const wrap = el("sceneElementsGrid");
    if(!wrap) return;
    wrap.innerHTML = "";
    const s = selectedSceneId ? getScene(selectedSceneId) : null;
    if(!s) return;

    const nonEmptyCats = cats.filter(cat => (s.elements?.[cat] || []).length > 0);

    if(nonEmptyCats.length === 0){
      wrap.innerHTML = `
        <div class="emptyBox">
          No hay elementos cargados todavía.<br/>
          <b>Tip:</b> elegí una categoría arriba y agregá necesidades de la escena.
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

    if(el("elItem")) el("elItem").value="";
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
    const txt = el("sceneImportText")?.value || "";
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
    const txt = el("scriptImportText")?.value || "";
    const keys = el("scriptKeywords")?.value || "";
    const scenes = parseScreenplayToScenes(txt, keys);
    if(!scenes.length) return toast("No detecté escenas. Chequeá que cada INT./EXT. esté en su propia línea.");

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
    ensureDayTopTwoColumns();
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
    ensureDayTopTwoColumns();
  }

  function sceneAssignedDayId(sceneId){
    for(const d of state.shootDays){
      if((d.sceneIds||[]).includes(sceneId)) return d.id;
    }
    return null;
  }

  // mode: "bank" | "day"
  function sceneCardNode(s, mode="bank"){
    const node = document.createElement("div");
    node.className = "sceneCard";
    node.draggable = true;
    node.dataset.sceneId = s.id;

    // color SOLO en Banco de Escenas
    if(mode === "bank"){
      const isAssigned = !!sceneAssignedDayId(s.id);
      node.classList.add(isAssigned ? "assigned" : "unassigned");
    }

    if(mode === "day"){
      node.innerHTML = `
        <div class="left">
          <div class="title">#${esc(s.number||"")} — ${esc(s.slugline||"")}</div>
        </div>
        <div class="right">
          <span class="dragHandle" title="Arrastrar">⠿</span>
        </div>
      `;
    }else{
      const assigned = sceneAssignedDayId(s.id);
      node.innerHTML = `
        <div class="left">
          <div class="title">#${esc(s.number||"")} — ${esc(s.slugline||"")}</div>
          <div class="meta">${esc(s.location||"")} · ${esc(s.timeOfDay||"")}${assigned? " · asignada":""}</div>
        </div>
        <div class="right">
          <span class="dragHandle" title="Arrastrar">⠿</span>
        </div>
      `;
    }

    attachSceneHover(node, s);

    node.addEventListener("dragstart", (e)=>{
      nativeDragActive = true;
      hideHoverTip();
      node.classList.add("dragging");
      const payload = { type:"scene", sceneId:s.id };
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
      wrap.appendChild(sceneCardNode(s, "bank"));
    }

    syncSceneBankHeight();
  }

  function removeSceneFromAllDays(sceneId){
    for(const d of state.shootDays){
      d.sceneIds = (d.sceneIds||[]).filter(x=>x!==sceneId);
      if(d.times) delete d.times[sceneId];
      // duraciones: se conservan para si vuelve
    }
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
        ensureDayTopTwoColumns();
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

        removeSceneFromAllDays(data.sceneId);
        ensureDayTimingMaps(d);

        if(!d.sceneIds.includes(data.sceneId)) d.sceneIds.push(data.sceneId);
        if(typeof d.durations[data.sceneId] !== "number") d.durations[data.sceneId] = 60;

        // al final del día
        let end = 0;
        for(const sid of d.sceneIds){
          const st = d.times[sid] ?? 0;
          const du = d.durations[sid] ?? 60;
          end = Math.max(end, st + du);
        }
        d.times[data.sceneId] = end;
        sortDaySceneIdsByTime(d);

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
        ensureDayTopTwoColumns();
      });

      const ids = d.sceneIds || [];
      if(!ids.length){
        zone.innerHTML = `<div class="muted">Soltá escenas acá…</div>`;
      }else{
        for(const sid of ids){
          const s = getScene(sid);
          if(!s) continue;
          zone.appendChild(sceneCardNode(s, "day"));
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
    const map = { day_date:"date", day_call:"callTime", day_location:"location", day_label:"label", day_notes:"notes" };
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
    if(!wrap) return;
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

    syncSceneBankHeight();
  }

  function renderDayCrewPicker(){
    const wrap = el("dayCrewPicker");
    if(!wrap) return;
    wrap.innerHTML = "";
    const d = selectedDayId ? getDay(selectedDayId) : null;
    if(!d){ wrap.innerHTML = `<div class="muted">Seleccioná un día</div>`; return; }

    const crew = state.crew.filter(c=>String(c.area||"").trim().toLowerCase()!=="cast");
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
      needs[cat] = items;
    }

    const keys = Object.keys(needs);
    if(!keys.length){
      wrap.innerHTML = `<div class="muted">No hay elementos cargados en breakdown.</div>`;
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

  function renderDayDetail(){
    setDayFieldHandlers();
    renderDayCast();
    renderDayCrewPicker();
    renderDayNeeds();
    syncSceneBankHeight();
    ensureDayTopTwoColumns();
  }

  // ----------- Elements explorer -----------
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
      row.className = "sceneCard";
      row.style.cursor = "pointer";
      row.innerHTML = `
        <div class="left">
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
        renderElementDetail(key, info);
      });
      listWrap.appendChild(row);
    }

    if(!selectedElementKey || !counts.has(selectedElementKey)){
      selectedElementKey = entries[0][0];
    }
    renderElementDetail(selectedElementKey, counts.get(selectedElementKey));
  }

  function renderElementDetail(key, info){
    const wrap = el("elxDetail");
    wrap.innerHTML = "";
    const scenes = Array.from(info.sceneIds).map(getScene).filter(Boolean);

    const header = document.createElement("div");
    header.className = "catBlock";
    header.innerHTML = `
      <div class="hdr">
        <span class="dot" style="background:${catColors[info.cat]}"></span>
        ${esc(info.item)}
      </div>
      <div class="items">${esc(catNames[info.cat])}</div>
    `;
    wrap.appendChild(header);

    scenes.forEach(s=>{
      const row = document.createElement("div");
      row.className = "sceneCard";
      row.innerHTML = `
        <div class="left">
          <div class="title">#${esc(s.number||"")} — ${esc(s.slugline||"")}</div>
          <div class="meta">${esc(s.location||"")} · ${esc(s.timeOfDay||"")}</div>
        </div>
        <div class="row gap">
          <button class="btn">Abrir</button>
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
    const crewTable = el("crewTable");
    if(!crewTable) return;
    const tbody = crewTable.querySelector("tbody");
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

  // ----------- Schedule (Cronograma) -----------
  function sceneCatsWithItems(scene){
    const list = [];
    for(const cat of cats){
      const items = scene.elements?.[cat] || [];
      if(items.length) list.push(cat);
    }
    return list.length ? list : ["cast"];
  }

  // Drag & drop nativo
  function handleSchedDrop(e, targetDayId, gridEl){
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/json");
    if(!raw) return;
    let data;
    try{ data = JSON.parse(raw); }catch{ return; }
    if(data.type !== "sched") return;

    const sceneId = data.sceneId;
    const fromDayId = data.fromDayId;

    const fromDay = getDay(fromDayId);
    const toDay = getDay(targetDayId);
    if(!toDay) return;

    ensureDayTimingMaps(toDay);

    const durKeep =
      (typeof toDay.durations?.[sceneId] === "number") ? toDay.durations[sceneId] :
      (typeof fromDay?.durations?.[sceneId] === "number") ? fromDay.durations[sceneId] : 60;

    const zoom = Number(el("schedZoom")?.value || 90);
    const snapMin = Number(el("schedSnap")?.value || 15);
    const pxPerMin = zoom / 60;

    const gr = gridEl.getBoundingClientRect();
    const y = Math.max(0, e.clientY - gr.top);
    const desiredStart = snap(y / pxPerMin, snapMin);

    // mover: único día
    removeSceneFromAllDays(sceneId);
    if(!toDay.sceneIds.includes(sceneId)) toDay.sceneIds.push(sceneId);

    toDay.durations[sceneId] = durKeep;
    toDay.times[sceneId] = Math.max(0, desiredStart);

    // ✅ empujar hacia abajo para evitar superposición
    resolveDayOverlapsPushDown(toDay, snapMin);
    sortDaySceneIdsByTime(toDay);

    touch();
    renderScheduleBoard();
    renderDaysBoard();
    renderSceneBank();
    renderDayDetail();
    renderReports();
    renderCallSheetCalendar();
    renderCallSheet();
  }

  function renderScheduleBoard(){
    const board = el("schedBoard");
    if(!board) return;
    board.innerHTML = "";

    const zoom = Number(el("schedZoom")?.value || 90); // px por hora
    const snapMin = Number(el("schedSnap")?.value || 15);
    const pxPerMin = zoom / 60;

    sortShootDaysInPlace();

    if(!state.shootDays.length){
      board.innerHTML = `<div class="muted">No hay días cargados.</div>`;
      return;
    }

    for(const d of state.shootDays){
      ensureDayTimingMaps(d);
      sortDaySceneIdsByTime(d);

      const dayWrap = document.createElement("div");
      dayWrap.className = "schedDay";
      dayWrap.dataset.dayId = d.id;

      const head = document.createElement("div");
      head.className = "schedHead";
      head.innerHTML = `
        <div class="t">${esc(formatDayTitle(d.date))}${d.label? " · "+esc(d.label):""}</div>
        <div class="m">Call ${esc(d.callTime||"")} · ${esc(d.location||"")}</div>
      `;

      const grid = document.createElement("div");
      grid.className = "schedGrid";
      grid.dataset.dayId = d.id;

      // drop handlers
      const onDragOver = (e)=>{ e.preventDefault(); dayWrap.classList.add("dropTarget"); };
      const onDragLeave = ()=>dayWrap.classList.remove("dropTarget");
      const onDrop = (e)=>{
        dayWrap.classList.remove("dropTarget");
        handleSchedDrop(e, d.id, grid);
      };
      dayWrap.addEventListener("dragover", onDragOver);
      dayWrap.addEventListener("dragleave", onDragLeave);
      dayWrap.addEventListener("drop", onDrop);

      const gridMin = computeDayGridMinutes(d);
      grid.style.height = `${Math.ceil(gridMin * pxPerMin)}px`;

      // hour lines
      const callBase = minutesFromHHMM(d.callTime||"08:00");
      const hours = Math.ceil(gridMin / 60);
      for(let h=0; h<=hours; h++){
        const y = h * 60 * pxPerMin;
        const line = document.createElement("div");
        line.className = "hourLine";
        line.style.top = `${y}px`;
        grid.appendChild(line);

        const lab = document.createElement("div");
        lab.className = "hourLabel";
        lab.style.top = `${y}px`;
        lab.textContent = fmtClock(callBase + h*60);
        grid.appendChild(lab);
      }

      // blocks
      for(const sid of d.sceneIds){
        const s = getScene(sid);
        if(!s) continue;

        const startMin = d.times[sid] ?? 0;
        const durMin = d.durations[sid] ?? 60;

        const top = startMin * pxPerMin;
        const height = Math.max(32, durMin * pxPerMin);

        const block = document.createElement("div");
        block.className = "schedBlock";
        block.dataset.sceneId = sid;
        block.dataset.dayId = d.id;
        block.style.top = `${top}px`;
        block.style.height = `${height}px`;

        // ✅ múltiples líneas por categoría con elementos
        const involved = sceneCatsWithItems(s);
        const lineH = 3;
        const linesHtml = involved.map(cat=>`<div class="schedLine" style="background:${catColors[cat]}"></div>`).join("");
        const linesWrap = `<div class="schedLines" style="height:${lineH*involved.length}px">${linesHtml}</div>`;
        block.style.paddingTop = `${8 + (lineH*involved.length)}px`;

        block.innerHTML = `
          ${linesWrap}
          <div class="title">#${esc(s.number||"")} — ${esc(s.slugline||"")}</div>
          <div class="meta">${esc(fmtClock(callBase + startMin))} · ${durMin} min</div>
          <div class="resize" title="Cambiar duración"></div>
        `;

        attachSceneHover(block, s);

        // dblclick -> breakdown
        block.addEventListener("dblclick", ()=>{
          selectedSceneId = sid;
          showView("breakdown");
          renderScenesTable();
          renderSceneEditor();
        });

        // draggable nativo
        block.draggable = true;
        block.addEventListener("dragstart", (e)=>{
          nativeDragActive = true;
          hideHoverTip();
          block.classList.add("dragging");
          const payload = { type:"sched", sceneId:sid, fromDayId:d.id };
          e.dataTransfer.setData("application/json", JSON.stringify(payload));
          e.dataTransfer.effectAllowed = "move";
        });
        block.addEventListener("dragend", ()=>{
          nativeDragActive = false;
          block.classList.remove("dragging");
          document.querySelectorAll(".schedDay").forEach(n=>n.classList.remove("dropTarget"));
        });

        // resize
        block.addEventListener("mousedown", (e)=>{
          if(e.button !== 0) return;
          const isResize = e.target && e.target.classList.contains("resize");
          if(!isResize) return;
          resizing = { sceneId:sid, dayId:d.id, startY:e.clientY, startDur:durMin, pxPerMin, snapMin };
          scheduleDirty = false;
          e.preventDefault();
        });

        grid.appendChild(block);
      }

      dayWrap.appendChild(head);
      dayWrap.appendChild(grid);
      board.appendChild(dayWrap);
    }
  }

  function scheduleResizeMouseMove(e){
    if(!resizing) return;
    const d = getDay(resizing.dayId);
    if(!d) return;

    const dy = e.clientY - resizing.startY;
    const deltaMin = snap(dy / resizing.pxPerMin, resizing.snapMin);
    const newDur = Math.max(15, resizing.startDur + deltaMin);

    if(d.durations[resizing.sceneId] === newDur) return;

    d.durations[resizing.sceneId] = newDur;

    // ✅ empujar todas las que siguen hacia abajo para evitar superposición
    resolveDayOverlapsPushDown(d, resizing.snapMin);
    sortDaySceneIdsByTime(d);

    scheduleDirty = true;
    renderScheduleBoard();
    renderReports();
    renderCallSheet();
  }

  function scheduleResizeMouseUp(){
    if(!resizing) return;
    resizing = null;
    document.querySelectorAll(".schedDay").forEach(n=>n.classList.remove("dropTarget"));
    if(scheduleDirty){
      touch();
      renderDaysBoard();
      renderSceneBank();
      renderCallSheetCalendar();
      scheduleDirty = false;
    }
  }

  // ----------- Reports -----------
  function linesDiv(items, empty="—"){
    if(!items || !items.length) return `<div class="rLines"><div class="muted">${esc(empty)}</div></div>`;
    return `<div class="rLines">${items.map(x=>`<div>${esc(x)}</div>`).join("")}</div>`;
  }

  function renderReports(){
    const board = el("reportsBoard");
    if(!board) return;
    board.innerHTML = "";

    sortShootDaysInPlace();

    for(const d of state.shootDays){
      const col = document.createElement("div");
      col.className = "reportCol";

      const head = document.createElement("div");
      head.className = "reportHead";
      head.innerHTML = `
        <div class="t">${esc(formatDayTitle(d.date))}${d.label? " · "+esc(d.label):""}</div>
        <div class="m">Call ${esc(d.callTime||"")} · ${esc(d.location||"")}</div>
      `;

      const body = document.createElement("div");
      body.className = "reportBody";

      const scenes = (d.sceneIds||[]).map(getScene).filter(Boolean);
      const cast = union(scenes.flatMap(s=>s.elements?.cast||[]));
      const crew = (d.crewIds||[]).map(id=>state.crew.find(c=>c.id===id)).filter(Boolean);

      const scenesBox = document.createElement("div");
      scenesBox.className = "catBlock";
      scenesBox.innerHTML = `
        <div class="hdr"><span class="dot" style="background:var(--cat-props)"></span>Escenas</div>
        <div class="items">${linesDiv(scenes.map(s=>`#${s.number} ${s.slugline}`))}</div>
      `;

      const castBox = document.createElement("div");
      castBox.className = "catBlock";
      castBox.innerHTML = `
        <div class="hdr"><span class="dot" style="background:${catColors.cast}"></span>Cast</div>
        <div class="items">${linesDiv(cast)}</div>
      `;

      const crewBox = document.createElement("div");
      crewBox.className = "catBlock";
      crewBox.innerHTML = `
        <div class="hdr"><span class="dot" style="background:var(--cat-sound)"></span>Crew citado</div>
        <div class="items">${linesDiv(crew.map(c=>`${c.area}: ${c.name}${c.role? " ("+c.role+")":""}`))}</div>
      `;

      body.appendChild(scenesBox);
      body.appendChild(castBox);
      body.appendChild(crewBox);

      for(const cat of cats){
        const items = union(scenes.flatMap(s=>s.elements?.[cat]||[]));
        if(!items.length) continue;
        const box = document.createElement("div");
        box.className = "catBlock";
        box.innerHTML = `
          <div class="hdr"><span class="dot" style="background:${catColors[cat]}"></span>${esc(catNames[cat])}</div>
          <div class="items">${linesDiv(items)}</div>
        `;
        body.appendChild(box);
      }

      col.appendChild(head);
      col.appendChild(body);
      board.appendChild(col);
    }
  }

  // ----------- Call sheets -----------
  function renderCallSheetCalendar(){
    const grid = el("calGrid");
    const title = el("calTitle");
    if(!grid || !title) return;

    const y = calCursor.year;
    const m = calCursor.month;
    title.textContent = new Intl.DateTimeFormat("es-AR",{month:"long",year:"numeric"}).format(new Date(y,m,1));

    grid.innerHTML = "";

    const first = new Date(y,m,1);
    const startDow = (first.getDay()+6)%7; // lunes=0
    const daysInMonth = new Date(y,m+1,0).getDate();

    const shootByDate = new Map();
    for(const d of state.shootDays){
      if(d.date) shootByDate.set(d.date, d.id);
    }

    for(let i=0;i<startDow;i++){
      const cell = document.createElement("div");
      cell.className = "calCell";
      cell.style.opacity = "0";
      cell.style.pointerEvents = "none";
      grid.appendChild(cell);
    }

    for(let day=1; day<=daysInMonth; day++){
      const ds = `${y}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      const hasShoot = shootByDate.has(ds);
      const cell = document.createElement("div");
      cell.className = "calCell" + (hasShoot ? " hasShoot" : "");
      const isSel = hasShoot && (callSheetDayId === shootByDate.get(ds));
      if(isSel) cell.classList.add("selected");
      cell.innerHTML = `
        <div class="d">${day}</div>
        <div class="tag">${hasShoot ? "Rodaje" : ""}</div>
      `;
      cell.addEventListener("click", ()=>{
        if(hasShoot){
          callSheetDayId = shootByDate.get(ds);
          renderCallSheetCalendar();
          renderCallSheet();
        }
      });
      grid.appendChild(cell);
    }
  }

  function groupCrewByArea(list){
    const map = new Map();
    for(const c of list){
      const a = c.area || "Otros";
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

  function renderCallSheet(){
    const wrap = el("callSheetWrap");
    if(!wrap) return;
    wrap.innerHTML = "";

    const d = callSheetDayId ? getDay(callSheetDayId) : (selectedDayId ? getDay(selectedDayId) : null);
    if(!d){
      wrap.innerHTML = `<div class="muted">Elegí un día con rodaje.</div>`;
      return;
    }

    ensureDayTimingMaps(d);
    sortDaySceneIdsByTime(d);

    const proj = state.meta.title || "Proyecto";
    const dayTitle = formatDayTitle(d.date);
    const callBase = minutesFromHHMM(d.callTime||"08:00");

    const scenes = (d.sceneIds||[]).map(getScene).filter(Boolean);
    const cast = union(scenes.flatMap(s=>s.elements?.cast||[]));
    const crewAll = (d.crewIds||[]).map(id=>state.crew.find(c=>c.id===id)).filter(Boolean);
    const crew = crewAll.filter(c=>String(c.area||"").trim().toLowerCase()!=="cast");
    const crewByArea = groupCrewByArea(crew);

    // schedule rows
    const schedRows = scenes.map(s=>{
      const st = d.times[s.id] ?? 0;
      const du = d.durations[s.id] ?? 60;
      const t0 = fmtClock(callBase + st);
      const t1 = fmtClock(callBase + st + du);
      return `
        <tr>
          <td class="csT">${esc(t0)}</td>
          <td class="csT">${esc(t1)}</td>
          <td class="csT">${esc(du)}m</td>
          <td>
            <div class="csScene"><b>#${esc(s.number||"")}</b> ${esc(s.slugline||"")}</div>
            <div class="csMeta">${esc(s.location||"")} · ${esc(s.timeOfDay||"")} ${s.pages? "· Pág "+esc(String(s.pages)):""}</div>
          </td>
        </tr>
      `;
    }).join("");

    // needs by category
    let needsHTML = "";
    for(const cat of cats){
      const items = union(scenes.flatMap(s=>s.elements?.[cat]||[]));
      if(!items.length) continue;
      needsHTML += `
        <div class="csNeed">
          <div class="csNeedHdr"><span class="dot" style="background:${catColors[cat]}"></span>${esc(catNames[cat])}</div>
          <div class="csNeedBody">${items.map(it=>`<span class="csPill">${esc(it)}</span>`).join("")}</div>
        </div>
      `;
    }
    if(!needsHTML) needsHTML = `<div class="muted">Sin necesidades cargadas.</div>`;

    // crew html
    const crewHTML = crewByArea.map(([area, arr])=>{
      return `
        <div class="csCrewBlock">
          <div class="csCrewHdr">${esc(area)}</div>
          <div class="csCrewList">
            ${arr.map(c=>`<div class="csCrewItem"><b>${esc(c.name||"")}</b>${c.role? `<span class="muted"> — ${esc(c.role)}</span>`:""}</div>`).join("")}
          </div>
        </div>
      `;
    }).join("") || `<div class="muted">—</div>`;

    const castHTML = cast.length
      ? `<div class="csCastList">${cast.map(n=>`<span class="csPill csPillCast">${esc(n)}</span>`).join("")}</div>`
      : `<div class="muted">—</div>`;

    const notes = (d.notes||"").trim();

    const card = document.createElement("div");
    card.className = "card csPage";

    card.innerHTML = `
      <div class="csHeader">
        <div class="csBrand">
          <div class="csProj">${esc(proj)}</div>
          <div class="csSub">${esc(dayTitle)}${d.label? " · "+esc(d.label):""}</div>
        </div>
        <div class="csRight">
          <div class="csKey"><span class="k">Call</span> <span class="v">${esc(d.callTime||"")}</span></div>
          <div class="csKey"><span class="k">Locación</span> <span class="v">${esc(d.location||"—")}</span></div>
        </div>
      </div>

      <div class="csSection">
        <div class="csH">Schedule</div>
        <table class="csTable">
          <thead>
            <tr><th>Inicio</th><th>Fin</th><th>Dur</th><th>Escena</th></tr>
          </thead>
          <tbody>
            ${schedRows || `<tr><td colspan="4" class="muted">—</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="csGrid2">
        <div class="csSection">
          <div class="csH">Cast citado</div>
          ${castHTML}
        </div>
        <div class="csSection">
          <div class="csH">Crew citado</div>
          ${crewHTML}
        </div>
      </div>

      <div class="csSection">
        <div class="csH">Necesidades</div>
        <div class="csNeeds">
          ${needsHTML}
        </div>
      </div>

      ${notes ? `
        <div class="csSection">
          <div class="csH">Notas</div>
          <div class="csNotes">${esc(notes)}</div>
        </div>
      ` : ""}

      <div class="csFooter">
        <div class="csSign"><div class="line"></div><div class="lbl">Producción</div></div>
        <div class="csSign"><div class="line"></div><div class="lbl">Dirección</div></div>
      </div>
    `;

    wrap.appendChild(card);
  }

  // ----------- Settings (JSONBin + reset) -----------
  function loadCfgToUI(){
    const cfg = StorageLayer.loadCfg();
    if(el("cfg_binId")) el("cfg_binId").value = cfg.binId || "";
    if(el("cfg_accessKey")) el("cfg_accessKey").value = cfg.accessKey || "";
    if(el("cfg_autosync")) el("cfg_autosync").value = cfg.autosync || "off";
  }

  async function saveCfgFromUI(){
    const cfg = StorageLayer.loadCfg();
    cfg.binId = (el("cfg_binId")?.value||"").trim();
    cfg.accessKey = (el("cfg_accessKey")?.value||"").trim();
    cfg.autosync = el("cfg_autosync")?.value || "off";
    StorageLayer.saveCfg(cfg);
    toast("Config guardada ✅");
  }

  async function testCfg(){
    const cfg = StorageLayer.loadCfg();
    if(!cfg.binId || !cfg.accessKey) return toast("Falta BIN ID o Access Key");
    try{
      await StorageLayer.jsonbinGet(cfg.binId, cfg.accessKey);
      toast("Conexión JSONBin OK ✅");
    }catch(err){
      toast("Conexión falló ❌");
      console.error(err);
    }
  }

  async function pullRemote(){
    const cfg = StorageLayer.loadCfg();
    if(!cfg.binId || !cfg.accessKey) return toast("Falta BIN ID o Access Key");
    try{
      const remote = await StorageLayer.jsonbinGet(cfg.binId, cfg.accessKey);
      if(remote && remote.meta && remote.scenes){
        state = remote;
        StorageLayer.saveLocal(state);
        toast("Pull OK ✅");
        hydrateUI();
      }else{
        toast("El bin no parece tener un proyecto válido");
      }
    }catch(err){
      toast("Pull falló ❌");
      console.error(err);
    }
  }

  async function pushRemote(){
    const cfg = StorageLayer.loadCfg();
    if(!cfg.binId || !cfg.accessKey) return toast("Falta BIN ID o Access Key");
    try{
      await StorageLayer.jsonbinPut(cfg.binId, cfg.accessKey, state);
      toast("Push OK ✅");
      updateSyncPill("JSONBin");
    }catch(err){
      toast("Push falló ❌");
      console.error(err);
    }
  }

  async function setResetKey(){
    const k1 = el("cfg_resetKey")?.value;
    const k2 = el("cfg_resetKeyConfirm")?.value;
    if(!k1 || k1.length < 4) return toast("Clave muy corta");
    if(k1 !== k2) return toast("Las claves no coinciden");
    const hash = await StorageLayer.sha256(k1);
    const cfg = StorageLayer.loadCfg();
    cfg.resetKeyHash = hash;
    StorageLayer.saveCfg(cfg);
    if(el("cfg_resetKey")) el("cfg_resetKey").value = "";
    if(el("cfg_resetKeyConfirm")) el("cfg_resetKeyConfirm").value = "";
    toast("Clave seteada ✅");
  }

  async function resetAll(){
    const cfg = StorageLayer.loadCfg();
    if(!cfg.resetKeyHash) return toast("Primero seteá una clave");
    const k = prompt("Clave de reset:");
    if(!k) return;
    const h = await StorageLayer.sha256(k);
    if(h !== cfg.resetKeyHash) return toast("Clave incorrecta ❌");

    state = defaultState();
    StorageLayer.saveLocal(state);
    toast("Reset OK ✅");
    hydrateUI();
  }

  // ----------- Layout helpers (sin tocar HTML) -----------
  function ensureExtraStyles(){
    if(document.getElementById("gb_extra_styles_v7")) return;
    const css = `
/* ===== extras v7 ===== */

/* Cronograma: líneas de color por categoría */
.schedBlock{ position:absolute; left:48px; right:10px; border-radius:12px; overflow:hidden; }
.schedLines{ position:absolute; left:0; top:0; right:0; display:flex; flex-direction:column; z-index:2; }
.schedLine{ height:3px; }

/* Reports: listas verticales */
.rLines{ display:flex; flex-direction:column; gap:6px; }
.rLines > div{ line-height:1.25; }

/* Crew: headers con más contraste */
.groupRow td{
  background: rgba(110,231,255,.14) !important;
  color: rgba(235,246,255,.95) !important;
  font-weight: 800 !important;
  letter-spacing: .2px;
}
.crewAreaHeader{
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(110,231,255,.14);
  color: rgba(235,246,255,.95);
  font-weight: 800;
}

/* Plan de rodaje: top en 2 columnas */
.dayTopTwoCol{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom: 10px; }
.dayTopTwoCol .col{ display:flex; flex-direction:column; gap:10px; }

/* Call Sheet: look pro */
.csPage{ padding: 18px; }
.csHeader{ display:flex; justify-content:space-between; gap:18px; align-items:flex-start; margin-bottom: 14px; }
.csProj{ font-size: 20px; font-weight: 900; letter-spacing: .2px; }
.csSub{ opacity:.85; margin-top: 2px; }
.csRight{ text-align:right; display:flex; flex-direction:column; gap:6px; }
.csKey .k{ opacity:.75; margin-right: 8px; }
.csKey .v{ font-weight: 800; }
.csSection{ margin-top: 14px; }
.csH{ font-weight: 900; letter-spacing:.2px; margin-bottom: 8px; }
.csGrid2{ display:grid; grid-template-columns: 1fr 1fr; gap:14px; }
.csTable{ width:100%; border-collapse: collapse; }
.csTable th, .csTable td{ border-bottom: 1px solid rgba(255,255,255,.10); padding: 8px 8px; vertical-align: top; }
.csTable th{ text-align:left; font-weight:900; opacity:.9; }
.csT{ white-space: nowrap; font-weight: 900; }
.csScene{ line-height:1.2; }
.csMeta{ opacity:.75; font-size: 12px; margin-top: 2px; }
.csNeeds{ display:flex; flex-direction:column; gap:10px; }
.csNeed{ border:1px solid rgba(255,255,255,.10); border-radius: 12px; padding: 10px; }
.csNeedHdr{ font-weight: 900; display:flex; align-items:center; gap:8px; margin-bottom: 8px; }
.csNeedBody{ display:flex; flex-wrap:wrap; gap:6px; }
.csPill{ display:inline-block; padding:6px 8px; border-radius: 999px; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); font-size: 12px; }
.csPillCast{ border-color: rgba(110,231,255,.25); }
.csCrewHdr{ font-weight: 900; margin-bottom: 6px; padding: 6px 8px; border-radius: 10px; background: rgba(110,231,255,.10); }
.csCrewList{ display:flex; flex-direction:column; gap:6px; }
.csNotes{ white-space: pre-wrap; opacity: .92; }
.csFooter{ display:flex; gap:16px; margin-top: 18px; }
.csSign{ flex:1; }
.csSign .line{ height:1px; background: rgba(255,255,255,.35); margin-bottom: 6px; }
.csSign .lbl{ font-size: 12px; opacity: .75; }

/* PRINT: solo call sheet, sin calendario */
@media print{
  body{ background:#fff !important; color:#000 !important; }
  header, nav, .sidebar, #syncCorner, #toast, .navBtn, .btn, .tabs, #callSheetCalendar, #calWrap { display:none !important; }
  #view-callsheet{ display:block !important; }
  #callSheetWrap{ padding: 0 !important; }
  .card{ box-shadow:none !important; border: 1px solid #000 !important; }
  .csTable th, .csTable td{ border-bottom: 1px solid #000 !important; }
  .csNeed{ border: 1px solid #000 !important; }
  .csPill{ border: 1px solid #000 !important; background: transparent !important; }
  .csCrewHdr{ background: transparent !important; border: 1px solid #000 !important; }
  .csSign .line{ background:#000 !important; }
}
`;
    const style = document.createElement("style");
    style.id = "gb_extra_styles_v7";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function fieldWrapFor(input){
    if(!input) return null;
    return input.closest(".field") || input.closest(".formRow") || input.parentElement;
  }

  // ✅ rearmar el top de Detalle del día en 2 columnas (sin tocar HTML)
  function ensureDayTopTwoColumns(){
    const date = el("day_date");
    const call = el("day_call");
    const loc = el("day_location");
    const label = el("day_label");
    const notes = el("day_notes");
    if(!date || !call || !loc || !label || !notes) return;

    // Si ya existe, listo
    const already = date.closest(".dayTopTwoCol");
    if(already) return;

    // Buscar un contenedor común razonable (el más chico que contiene a todos)
    const nodes = [date, call, loc, label, notes];
    let root = date.parentElement;
    while(root && !nodes.every(n=>root.contains(n))) root = root.parentElement;
    if(!root) return;

    // crear wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "dayTopTwoCol";
    const c1 = document.createElement("div"); c1.className = "col";
    const c2 = document.createElement("div"); c2.className = "col";
    wrapper.append(c1,c2);

    const wDate = fieldWrapFor(date);
    const wCall = fieldWrapFor(call);
    const wLoc = fieldWrapFor(loc);
    const wLabel = fieldWrapFor(label);
    const wNotes = fieldWrapFor(notes);
    if(!wDate || !wCall || !wLoc || !wLabel || !wNotes) return;

    // Insertar wrapper antes del primer campo top
    root.insertBefore(wrapper, wDate);

    // Mover a col 1: Fecha + Call time
    c1.appendChild(wDate);
    if(wCall !== wDate) c1.appendChild(wCall);

    // Mover a col 2: Locación + Nombre + Notas
    c2.appendChild(wLoc);
    if(wLabel !== wLoc) c2.appendChild(wLabel);
    if(wNotes !== wLabel && wNotes !== wLoc) c2.appendChild(wNotes);
  }

  // ----------- Events / init -----------
  function bindEvents(){
    document.querySelectorAll(".navBtn").forEach(b=>{
      b.addEventListener("click", ()=>{
        const v = b.dataset.view;
        if(!v) return;
        showView(v);

        if(v === "elements") renderElementsExplorer();
        if(v === "shooting"){ renderSceneBank(); renderDaysBoard(); renderDayDetail(); ensureDayTopTwoColumns(); }
        if(v === "crew") renderCrew();
        if(v === "reports") renderReports();
        if(v === "schedule") renderScheduleBoard();
        if(v === "settings") loadCfgToUI();
      });
    });

    // Breakdown
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
        renderScheduleBoard();
        renderReports();
        renderCallSheet();
      });
    });

    el("btnAddSceneElement")?.addEventListener("click", addSceneElement);
    el("elCategory")?.addEventListener("change", refreshElementSuggestions);

    el("btnImportScenes")?.addEventListener("click", importScenesTable);
    el("btnClearImport")?.addEventListener("click", ()=>{ if(el("sceneImportText")) el("sceneImportText").value=""; });

    el("btnParseScript")?.addEventListener("click", importScript);
    el("btnClearScript")?.addEventListener("click", ()=>{ if(el("scriptImportText")) el("scriptImportText").value=""; });

    // Shooting
    el("btnAddShootDay")?.addEventListener("click", addShootDay);
    el("btnDeleteShootDay")?.addEventListener("click", deleteShootDay);

    el("bankSearch")?.addEventListener("input", renderSceneBank);
    el("bankFilter")?.addEventListener("change", renderSceneBank);

    const dayMap = { day_date:"date", day_call:"callTime", day_location:"location", day_label:"label", day_notes:"notes" };
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
        renderScheduleBoard();
        renderReports();
        renderCallSheetCalendar();
        renderCallSheet();
        syncSceneBankHeight();
        ensureDayTopTwoColumns();
      });
    });

    // botoncitos ±15
    el("day_call_minus")?.addEventListener("click", ()=>{
      const d = selectedDayId ? getDay(selectedDayId) : null;
      if(!d) return;
      d.callTime = roundTimeToStep(addMinutesHHMM(d.callTime||"08:00", -15), 15);
      if(el("day_call")) el("day_call").value = d.callTime;
      touch();
      renderDaysBoard();
      renderScheduleBoard();
      renderReports();
      renderCallSheet();
    });
    el("day_call_plus")?.addEventListener("click", ()=>{
      const d = selectedDayId ? getDay(selectedDayId) : null;
      if(!d) return;
      d.callTime = roundTimeToStep(addMinutesHHMM(d.callTime||"08:00", +15), 15);
      if(el("day_call")) el("day_call").value = d.callTime;
      touch();
      renderDaysBoard();
      renderScheduleBoard();
      renderReports();
      renderCallSheet();
    });

    el("btnOpenCallSheet")?.addEventListener("click", ()=>{
      callSheetDayId = selectedDayId;
      showView("callsheet");
      renderCallSheetCalendar();
      renderCallSheet();
    });

    // Elements
    el("elxCategory")?.addEventListener("change", renderElementsExplorer);
    el("elxDay")?.addEventListener("change", renderElementsExplorer);
    el("elxSearch")?.addEventListener("input", renderElementsExplorer);

    // Crew
    el("btnAddCrew")?.addEventListener("click", addCrew);
    el("crewSearch")?.addEventListener("input", renderCrew);

    // Reports
    el("btnRefreshReports")?.addEventListener("click", renderReports);

    // Schedule
    el("schedZoom")?.addEventListener("change", renderScheduleBoard);
    el("schedSnap")?.addEventListener("change", renderScheduleBoard);
    el("btnTimingAll1h")?.addEventListener("click", ()=>{
      for(const d of state.shootDays){
        ensureDayTimingMaps(d);
        for(const sid of d.sceneIds){
          d.durations[sid] = 60;
        }
        resolveDayOverlapsPushDown(d, Number(el("schedSnap")?.value || 15));
      }
      touch();
      renderScheduleBoard();
      renderReports();
      renderCallSheet();
    });

    window.addEventListener("mousemove", scheduleResizeMouseMove);
    window.addEventListener("mouseup", scheduleResizeMouseUp);

    // Call sheet calendar nav + print
    el("calPrev")?.addEventListener("click", ()=>{
      calCursor.month--;
      if(calCursor.month<0){ calCursor.month=11; calCursor.year--; }
      renderCallSheetCalendar();
    });
    el("calNext")?.addEventListener("click", ()=>{
      calCursor.month++;
      if(calCursor.month>11){ calCursor.month=0; calCursor.year++; }
      renderCallSheetCalendar();
    });
    el("btnPrintCallSheet")?.addEventListener("click", ()=>window.print());

    // Settings
    el("btnSaveCfg")?.addEventListener("click", saveCfgFromUI);
    el("btnTestCfg")?.addEventListener("click", testCfg);
    el("btnPull")?.addEventListener("click", pullRemote);
    el("btnPush")?.addEventListener("click", pushRemote);
    el("btnSetResetKey")?.addEventListener("click", setResetKey);
    el("btnReset")?.addEventListener("click", resetAll);

    // title
    el("projectTitle")?.addEventListener("input", ()=>{
      state.meta.title = el("projectTitle").value || "Proyecto";
      touch();
    });

    window.addEventListener("resize", window.U.debounce(syncSceneBankHeight, 120));
  }

  function hydrateUI(){
    renderCatSelects();
    refreshElementSuggestions();

    if(el("projectTitle")) el("projectTitle").value = state.meta.title || "Proyecto";

    sortShootDaysInPlace();

    renderScenesTable();
    renderSceneEditor();
    renderSceneBank();
    renderDaysBoard();
    renderDayDetail();
    renderElementsExplorer();
    renderCrew();
    renderReports();
    renderScheduleBoard();
    renderCallSheetCalendar();
    renderCallSheet();

    syncSceneBankHeight();
    ensureDayTopTwoColumns();
  }

  function init(){
    ensureExtraStyles();

    const local = StorageLayer.loadLocal();
    state = (local && local.meta) ? local : defaultState();

    state.shootDays = state.shootDays || [];
    state.crew = state.crew || [];
    state.scenes = state.scenes || [];

    for(const d of state.shootDays){
      d.sceneIds = d.sceneIds || [];
      d.crewIds = d.crewIds || [];
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
    callSheetDayId = selectedDayId;

    bindEvents();
    hydrateUI();
    showView("breakdown");
  }

  window.addEventListener("DOMContentLoaded", init);
})();
