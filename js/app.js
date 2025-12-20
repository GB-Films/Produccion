(function(){
  const el = (id)=>document.getElementById(id);

  const views = ["breakdown","shooting","schedule","elements","crew","reports","callsheet","settings"];

  // Category order requested
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

  // ✅ Cast ahora es un Área más para cargar gente
  const crewAreas = ["Producción","Dirección","Foto","Arte","Vestuario","Maquillaje","Sonido","Eléctrica/Grip","Post/VFX","Cast","Otros"];

  let state = null;
  let selectedSceneId = null;
  let selectedDayId = null;
  let callSheetDayId = null;

  let selectedElementKey = null; // key, no solo nombre

  let resizing = null; // schedule resize
  let calCursor = { year: new Date().getFullYear(), month: new Date().getMonth() };

  // drag schedule
  let schedDrag = null; // {sceneId, fromDayId, pxPerMin, snapMin, ghostEl, targetDayId, targetIndex}

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
    toast._t = setTimeout(()=>t.style.display="none", 2200);
  }

  function defaultState(){
    return {
      meta: { version: 2, title:"Proyecto", updatedAt: new Date().toISOString() },
      scenes: [],
      shootDays: [], // {id,date,callTime,location,label,notes,sceneIds[],crewIds[],durations:{}}
      crew: [],      // {id,area,role,name,phone,email,notes}  (incluye Cast si querés)
      scheduleItems: []
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

  // ✅ Cast roster desde Crew (Área "Cast")
  function getCastRoster(){
    return union(
      state.crew
        .filter(c=>String(c.area||"").trim().toLowerCase()==="cast")
        .map(c=>(c.name||"").trim())
        .filter(Boolean)
    ).sort((a,b)=>a.localeCompare(b));
  }

  function renderCastDatalist(){
    const dl = el("castDatalist");
    if(!dl) return;
    const names = getCastRoster();
    dl.innerHTML = names.map(n=>`<option value="${esc(n)}"></option>`).join("");
  }

  function updateAddElementUI(){
    const catSel = el("elCategory");
    const itemInp = el("elItem");
    if(!catSel || !itemInp) return;

    if(catSel.value === "cast"){
      itemInp.setAttribute("list", "castDatalist");
      itemInp.placeholder = "Elegí del Cast cargado en Equipo técnico…";
    }else{
      itemInp.removeAttribute("list");
      itemInp.placeholder = "Ej: Lucio / Pistola / Saco…";
    }
  }

  // ----------- Script parser -----------
  function parseScreenplayToScenes(text, extraKeywordsCsv=""){
    const lines = (text||"").split(/\r?\n/).map(l=>l.replace(/\s+$/,"")).filter(l=>l.trim()!=="");
    if(!lines.length) return [];

    const extras = (extraKeywordsCsv||"")
      .split(",")
      .map(x=>x.trim())
      .filter(Boolean)
      .map(x=>x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

    const baseHeads = ["INT\\.", "EXT\\.", "INT\\/EXT\\.", "I\\/E\\.", "INT\\.\\/EXT\\.", "INTERIOR", "EXTERIOR"];
    const headRe = new RegExp("^\\s*(?:\\d+\\s*[\\).:-]\\s*)?(?:" + baseHeads.concat(extras).join("|") + ")\\b","i");

    function isHeading(line){
      const up = line.trim().toUpperCase();
      if(up.endsWith("TO:") && up.length < 18) return false;
      return headRe.test(line);
    }

    const out = [];
    let current = null;
    let n=1;

    for(const line of lines){
      if(isHeading(line)){
        if(current) out.push(finalize(current));
        current = { rawHeading: line.trim(), body:[], autoNumber:n++ };
      }else{
        if(!current) current = { rawHeading:"ESCENA", body:[], autoNumber:n++ };
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

      const slugline = heading.replace(/^\s*\d+\s*[.)-:]\s*/,"").trim();
      const parts = slugline.split(" - ").map(p=>p.trim()).filter(Boolean);

      let location = "";
      let tod = "";

      if(parts.length >= 2){
        const last = parts[parts.length-1];
        tod = normalizeTOD(last);
        const mid = parts.slice(0, parts.length-1).join(" - ");
        location = mid.replace(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|INT\.\/EXT\.|INTERIOR|EXTERIOR)\s*/i,"").trim();
      }else{
        location = slugline.replace(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|INT\.\/EXT\.|INTERIOR|EXTERIOR)\s*/i,"").trim();
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
    renderSceneElementsGrid();
  }

  function renderSceneElementsGrid(){
    const wrap = el("sceneElementsGrid");
    wrap.innerHTML = "";
    const s = selectedSceneId ? getScene(selectedSceneId) : null;
    if(!s) return;

    for(const cat of cats){
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
      if(!items.length){
        const empty = document.createElement("div");
        empty.className = "muted small";
        empty.textContent = "—";
        chipsWrap.appendChild(empty);
      }else{
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
      }

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
    const item = (el("elItem").value||"").trim();
    if(!item) return;

    // ✅ Cast solo puede ser alguien del roster (si hay roster)
    if(cat === "cast"){
      const roster = getCastRoster();
      if(!roster.length){
        toast("No hay Cast cargado. Cargalo en Equipo técnico (Área Cast).");
        return;
      }
      const ok = roster.includes(item);
      if(!ok){
        toast("Ese nombre no está en Cast (Equipo técnico). Cargalo ahí primero.");
        return;
      }
    }

    s.elements[cat] = s.elements[cat] || [];
    if(!s.elements[cat].includes(item)) s.elements[cat].push(item);

    el("elItem").value="";
    touch();
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
    if(!scenes.length) return toast("No detecté escenas. Revisá headings/keywords.");

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

  // ----------- Shooting plan (drag drop) -----------
  function addShootDay(){
    const d = {
      id: uid("day"),
      date:"",
      callTime:"",
      location:"",
      label:"",
      notes:"",
      sceneIds:[],
      crewIds:[],
      durations:{}
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
  }

  function sceneAssignedDayId(sceneId){
    for(const d of state.shootDays){
      if((d.sceneIds||[]).includes(sceneId)) return d.id;
    }
    return null;
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
      const fromDay = sceneAssignedDayId(s.id);
      wrap.appendChild(sceneCardNode(s, fromDay));
    }
  }

  function sceneCardNode(s, fromDayId){
    const node = document.createElement("div");
    node.className = "sceneCard";
    node.draggable = true;
    node.dataset.sceneId = s.id;
    node.dataset.fromDayId = fromDayId || "";
    node.innerHTML = `
      <div class="left">
        <div class="title">#${esc(s.number||"")} — ${esc(s.slugline||"")}</div>
        <div class="meta">${esc(s.location||"")} · ${esc(s.timeOfDay||"")}${fromDayId? " · asignada":""}</div>
      </div>
      <div class="right">
        <span class="dragHandle" title="Arrastrar">⠿</span>
      </div>
    `;
    node.addEventListener("dragstart", (e)=>{
      node.classList.add("dragging");
      const payload = { type:"scene", sceneId:s.id, fromDayId: fromDayId || null };
      e.dataTransfer.setData("application/json", JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "move";
    });
    node.addEventListener("dragend", ()=>node.classList.remove("dragging"));
    return node;
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

  function renderDaysBoard(){
    const board = el("daysBoard");
    if(!board) return;
    board.innerHTML = "";

    sortShootDaysInPlace();

    for(const d of state.shootDays){
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

        moveSceneToDayWithIndex(data.sceneId, d.id, null);

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
      });

      const ids = d.sceneIds || [];
      if(!ids.length){
        zone.innerHTML = `<div class="muted">Soltá escenas acá…</div>`;
      }else{
        for(const sid of ids){
          const s = getScene(sid);
          if(!s) continue;
          zone.appendChild(sceneCardNode(s, d.id));
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
  }

  // ✅ No mostramos Cast en picker de “Equipo técnico” del día (porque el cast ya se cita auto)
  function renderDayCrewPicker(){
    const wrap = el("dayCrewPicker");
    wrap.innerHTML = "";
    const d = selectedDayId ? getDay(selectedDayId) : null;
    if(!d){ wrap.innerHTML = `<div class="muted">Seleccioná un día</div>`; return; }

    const byArea = {};
    for(const c of state.crew){
      const a = c.area || "Otros";
      if(String(a).trim().toLowerCase() === "cast") continue;
      byArea[a] = byArea[a] || [];
      byArea[a].push(c);
    }
    const areas = Object.keys(byArea).sort((a,b)=>a.localeCompare(b));

    if(!areas.length){
      wrap.innerHTML = `<div class="muted">No cargaste equipo técnico todavía.</div>`;
      return;
    }

    for(const area of areas){
      const box = document.createElement("div");
      box.className = "listItem";
      box.style.flexDirection = "column";
      box.innerHTML = `<div class="title">${esc(area)}</div>`;
      const inner = document.createElement("div");
      inner.className = "list";
      inner.style.marginTop = "8px";

      byArea[area].forEach(c=>{
        const row = document.createElement("div");
        row.className = "listItem";
        row.style.alignItems = "center";
        row.innerHTML = `
          <div style="display:flex;gap:10px;align-items:center;">
            <input type="checkbox" ${ (d.crewIds||[]).includes(c.id) ? "checked":"" } />
            <div>
              <div class="title">${esc(c.name||"(sin nombre)")}</div>
              <div class="meta">${esc(c.role||"")} · ${esc(c.phone||"")}</div>
            </div>
          </div>
        `;
        const cb = row.querySelector("input");
        cb.addEventListener("change", ()=>{
          d.crewIds = d.crewIds || [];
          if(cb.checked) d.crewIds.push(c.id);
          else d.crewIds = d.crewIds.filter(x=>x!==c.id);
          d.crewIds = Array.from(new Set(d.crewIds));
          touch();
          renderReports();
          renderCallSheet();
        });
        inner.appendChild(row);
      });

      box.appendChild(inner);
      wrap.appendChild(box);
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

      for(const cat of Object.keys(needsByDept[dept])){
        needsByDept[dept][cat].forEach(it=>{
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

  function renderDaySchedule(){
    const wrap = el("daySchedule");
    wrap.innerHTML = "";
    const d = selectedDayId ? getDay(selectedDayId) : null;
    if(!d || !d.date){
      wrap.innerHTML = `<div class="muted">Poné fecha al día para filtrar cronograma (rangos).</div>`;
      return;
    }
    const day = d.date;

    const hits = state.scheduleItems.filter(it=>{
      if(!it.startDate && !it.endDate) return false;
      const a = it.startDate || it.endDate;
      const b = it.endDate || it.startDate;
      return (a <= day && day <= b);
    });

    if(!hits.length){
      wrap.innerHTML = `<div class="muted">No hay ítems del cronograma para este día.</div>`;
      return;
    }

    hits.forEach(it=>{
      const row = document.createElement("div");
      row.className = "listItem";
      row.innerHTML = `
        <div>
          <div class="title">${esc(it.name||"")}</div>
          <div class="meta">${esc(it.startDate||"")} → ${esc(it.endDate||"")} · ${esc(it.status||"")}</div>
        </div>
      `;
      wrap.appendChild(row);
    });
  }

  function renderDayDetail(){
    setDayFieldHandlers();
    renderDayCast();
    renderDayCrewPicker();
    renderDayNeeds();
    renderDaySchedule();
  }

  // ----------- Elements explorer (all categories) -----------
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
      <div class="meta">${esc(catNames[info.cat])} · ${esc(dayFilter==="all"?"Todos los días":(dayFilter==="unassigned"?"No asignadas":formatDayTitle(getDay(dayFilter)?.date)))}</div>
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
    renderCastDatalist();
    updateAddElementUI();
    renderDayDetail();
    renderReports();
    renderCallSheet();
  }

  function renderCrew(){
    const tbody = el("crewTable").querySelector("tbody");
    tbody.innerHTML = "";

    state.crew.forEach(c=>{
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

      const refreshCastEverywhere = ()=>{
        renderCastDatalist();
        updateAddElementUI();
        renderDayDetail();
        renderReports();
        renderCallSheet();
      };

      areaSel.addEventListener("change", ()=>{ c.area = areaSel.value; touch(); refreshCastEverywhere(); });
      role.addEventListener("input", ()=>{ c.role = role.value; touch(); refreshCastEverywhere(); });
      name.addEventListener("input", ()=>{ c.name = name.value; touch(); refreshCastEverywhere(); });
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
        refreshCastEverywhere();
      });

      tbody.appendChild(tr);
    });
  }

  // ----------- Reports / CallSheets / Schedule
  // (desde acá para abajo es igual a tu versión anterior, no lo recorto para evitar errores)

  function renderReports(){
    const board = el("reportsBoard");
    if(!board) return;
    board.innerHTML = "";

    sortShootDaysInPlace();

    if(!state.shootDays.length){
      board.innerHTML = `<div class="muted">Todavía no hay días.</div>`;
      return;
    }

    for(const d of state.shootDays){
      const scenes = (d.sceneIds||[]).map(getScene).filter(Boolean);
      const cast = union(scenes.flatMap(s=>s.elements?.cast || []));
      const crew = (d.crewIds||[]).map(getCrew).filter(Boolean);

      const needsByCat = {};
      for(const cat of cats){
        if(cat === "cast") continue;
        const items = union(scenes.flatMap(s=>s.elements?.[cat] || []));
        if(items.length) needsByCat[cat] = items;
      }

      const needsHtml = Object.keys(needsByCat).length ? `
        <div class="needsStack">
          ${cats.filter(c=>needsByCat[c]).map(cat=>`
            <div class="needCatBlock">
              <div class="needCatHead">
                <div class="name">
                  <span class="catBadge"><span class="dot" style="background:${catColors[cat]}"></span>${esc(catNames[cat])}</span>
                </div>
                <div class="muted small">${needsByCat[cat].length}</div>
              </div>
              <div class="needItems">
                ${needsByCat[cat].map(it=>`
                  <div class="chip"><span>${esc(it)}</span></div>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      ` : `<div class="muted">-</div>`;

      const col = document.createElement("div");
      col.className = "reportCol";
      col.innerHTML = `
        <div class="title">${esc(formatDayTitle(d.date))}</div>
        <div class="meta">Call ${esc(d.callTime||"")} · ${esc(d.location||"")}</div>
        <div class="hr"></div>

        <div class="muted"><b>Escenas:</b> ${esc(scenes.map(s=>`#${s.number}`).join(", ") || "-")}</div>
        <div class="muted" style="margin-top:6px;"><b>Cast:</b> ${esc(cast.join(", ") || "-")}</div>
        <div class="muted" style="margin-top:6px;"><b>Crew:</b> ${esc(crew.map(c=>`${c.area} · ${c.role} · ${c.name}`).join(" | ") || "-")}</div>

        <details style="margin-top:10px;">
          <summary class="muted">Necesidades</summary>
          ${needsHtml}
        </details>

        <div class="row gap" style="margin-top:12px;">
          <button class="btn">Abrir día</button>
          <button class="btn">Call Sheet</button>
        </div>
      `;
      const [bOpen,bCS] = col.querySelectorAll("button");
      bOpen.addEventListener("click", ()=>{
        selectedDayId = d.id;
        showView("shooting");
        renderDaysBoard();
        renderDayDetail();
      });
      bCS.addEventListener("click", ()=>{
        callSheetDayId = d.id;
        showView("callsheet");
        renderCallSheetCalendar();
        renderCallSheet();
      });

      board.appendChild(col);
    }
  }

  function monthTitle(year, month){
    const d = new Date(year, month, 1);
    const m = new Intl.DateTimeFormat("es-AR",{month:"long"}).format(d);
    return m.charAt(0).toUpperCase() + m.slice(1) + " " + year;
  }
  function ymd(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${dd}`;
  }

  function renderCallSheetCalendar(){
    const grid = el("calGrid");
    const title = el("calTitle");
    if(!grid || !title) return;

    title.textContent = monthTitle(calCursor.year, calCursor.month);
    grid.innerHTML = "";

    const dows = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
    dows.forEach(x=>{
      const h = document.createElement("div");
      h.className = "calDow";
      h.textContent = x;
      grid.appendChild(h);
    });

    const first = new Date(calCursor.year, calCursor.month, 1);
    const firstDow = (first.getDay() + 6) % 7; // monday=0

    const shootByDate = new Map();
    for(const sd of state.shootDays){
      if(sd.date) shootByDate.set(sd.date, sd);
    }

    for(let i=0;i<42;i++){
      const cellDate = new Date(first);
      cellDate.setDate(1 - firstDow + i);

      const inMonth = cellDate.getMonth() === calCursor.month;
      const key = ymd(cellDate);
      const sd = shootByDate.get(key);

      const cell = document.createElement("div");
      cell.className = "calCell" + (sd ? " hasShoot" : "") + (callSheetDayId===sd?.id ? " selected" : "");
      cell.style.opacity = inMonth ? "1" : "0.35";
      cell.innerHTML = `
        <div class="d">${cellDate.getDate()}</div>
        <div class="tag">${sd ? `${esc(formatDayTitle(sd.date))} · ${esc(sd.callTime||"")}` : ""}</div>
      `;
      cell.addEventListener("click", ()=>{
        if(!sd) return;
        callSheetDayId = sd.id;
        renderCallSheetCalendar();
        renderCallSheet();
      });

      grid.appendChild(cell);
    }
  }

  function renderCallSheet(){
    const wrap = el("callSheetWrap");
    if(!wrap) return;
    wrap.innerHTML = "";

    const d = callSheetDayId ? getDay(callSheetDayId) : (selectedDayId ? getDay(selectedDayId) : null);
    if(!d){
      wrap.innerHTML = `<div class="muted">Seleccioná un día en el calendario.</div>`;
      return;
    }

    const scenes = dayScenes(d);
    const cast = union(scenes.flatMap(s=>s.elements?.cast || []));
    const crew = (d.crewIds||[]).map(getCrew).filter(Boolean);

    const crewByArea = {};
    for(const c of crew){
      const a = c.area || "Otros";
      crewByArea[a] = crewByArea[a] || [];
      crewByArea[a].push(c);
    }

    const needsByCat = {};
    for(const cat of cats){
      const items = union(scenes.flatMap(s=>s.elements?.[cat] || []));
      if(items.length) needsByCat[cat] = items;
    }

    wrap.innerHTML = `
      <div class="pairs">
        <div class="listItem" style="flex-direction:column;">
          <div class="title">${esc(formatDayTitle(d.date))}${d.label? " · "+esc(d.label):""}</div>
          <div class="meta">Call ${esc(d.callTime||"-")} · ${esc(d.location||"-")}</div>
        </div>
        <div class="listItem" style="flex-direction:column;">
          <div class="title">${esc(state.meta.title||"Proyecto")}</div>
          <div class="meta">Actualizado ${esc(new Date(state.meta.updatedAt).toLocaleString("es-AR"))}</div>
        </div>
      </div>

      <div class="hr"></div>

      <h3>Escenas</h3>
      <div class="tableWrap" style="max-height:520px;">
        <table class="table" style="min-width:600px;">
          <thead><tr><th>#</th><th>Slugline</th><th>Locación</th><th>Horario</th><th>Pág</th></tr></thead>
          <tbody>
            ${scenes.map(s=>`
              <tr>
                <td>${esc(s.number||"")}</td>
                <td>${esc(s.slugline||"")}</td>
                <td>${esc(s.location||"")}</td>
                <td>${esc(s.timeOfDay||"")}</td>
                <td>${s.pages? esc(String(s.pages)):""}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="hr"></div>

      <h3>Cast citado</h3>
      <div class="chips">
        ${cast.length ? cast.map(n=>`
          <div class="chip"><span class="catBadge"><span class="dot" style="background:${catColors.cast}"></span>${esc(n)}</span></div>
        `).join("") : `<span class="muted">-</span>`}
      </div>

      <div class="hr"></div>

      <h3>Equipo técnico (por área)</h3>
      ${Object.keys(crewByArea).length ? Object.keys(crewByArea).sort().map(area=>`
        <div class="listItem" style="flex-direction:column; margin:10px 0;">
          <div class="title">${esc(area)}</div>
          <div class="meta">
            ${crewByArea[area].map(c=>esc(`${c.role||""} — ${c.name||""} ${c.phone? "("+c.phone+")":""}`)).join("<br/>")}
          </div>
        </div>
      `).join("") : `<div class="muted">-</div>`}

      <div class="hr"></div>

      <h3>Necesidades (por categoría)</h3>
      ${cats.filter(c=>needsByCat[c] && needsByCat[c].length).length ? `
        <div class="needsStack">
          ${cats.filter(c=>needsByCat[c] && needsByCat[c].length).map(cat=>`
            <div class="needCatBlock">
              <div class="needCatHead">
                <div class="name"><span class="catBadge"><span class="dot" style="background:${catColors[cat]}"></span>${esc(catNames[cat])}</span></div>
                <div class="muted small">${needsByCat[cat].length}</div>
              </div>
              <div class="needItems">
                ${needsByCat[cat].map(it=>`<div class="chip"><span>${esc(it)}</span></div>`).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      ` : `<div class="muted">-</div>`}

      <div class="hr"></div>
      <h3>Notas</h3>
      <div class="muted">${esc(d.notes||"-")}</div>
    `;
  }

  // ----------- Schedule drag helpers (igual que tu versión anterior)
  function hhmmFromMinutes(m){
    const h = Math.floor(m/60);
    const mm = String(m%60).padStart(2,"0");
    return `${String(h).padStart(2,"0")}:${mm}`;
  }
  function minutesFromHHMM(hhmm){
    if(!hhmm) return 8*60;
    const [h,m] = hhmm.split(":").map(Number);
    return (h*60 + (m||0));
  }
  function snap(value, step){ return Math.round(value/step)*step; }

  function ensureDayDurations(d){
    d.durations = d.durations || {};
    for(const sid of (d.sceneIds||[])){
      if(!d.durations[sid]) d.durations[sid] = 60;
    }
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

  function clearSchedDropTargets(){
    document.querySelectorAll(".schedDay.dropTarget").forEach(n=>n.classList.remove("dropTarget"));
  }

  function computeInsertIndexByY(day, yMin){
    ensureDayDurations(day);
    const ids = day.sceneIds || [];
    let cursor = 0;
    for(let i=0;i<ids.length;i++){
      const sid = ids[i];
      const dur = day.durations[sid] || 60;
      const mid = cursor + dur/2;
      if(yMin < mid) return i;
      cursor += dur;
    }
    return ids.length;
  }

  function moveSceneToDayWithIndex(sceneId, targetDayId, targetIndex){
    let fromDay = null;
    for(const d of state.shootDays){
      const had = (d.sceneIds||[]).includes(sceneId);
      if(had) fromDay = d;
      d.sceneIds = (d.sceneIds||[]).filter(x=>x!==sceneId);
    }

    const targetDay = getDay(targetDayId);
    if(!targetDay) return;

    targetDay.sceneIds = targetDay.sceneIds || [];
    ensureDayDurations(targetDay);

    let dur = 60;
    if(fromDay && fromDay.durations && fromDay.durations[sceneId]) dur = fromDay.durations[sceneId];
    targetDay.durations[sceneId] = targetDay.durations[sceneId] || dur;

    if(fromDay && fromDay.durations) delete fromDay.durations[sceneId];

    if(targetIndex === null || targetIndex === undefined){
      targetDay.sceneIds.push(sceneId);
    }else{
      const idx = Math.max(0, Math.min(targetIndex, targetDay.sceneIds.length));
      targetDay.sceneIds.splice(idx, 0, sceneId);
    }

    targetDay.sceneIds = Array.from(new Set(targetDay.sceneIds));
  }

  function renderScheduleBoard(){
    const board = el("schedBoard");
    if(!board) return;
    board.innerHTML = "";

    sortShootDaysInPlace();

    if(!state.shootDays?.length){
      board.innerHTML = `<div class="muted">No hay días de rodaje creados.</div>`;
      return;
    }

    const pxPerHour = Number(el("schedZoom")?.value || 60);
    const snapMin = Number(el("schedSnap")?.value || 15);
    const pxPerMin = pxPerHour / 60;

    for(const d of state.shootDays){
      ensureDayDurations(d);
      const dayStartMin = minutesFromHHMM(d.callTime || "08:00");

      const totalMin = (d.sceneIds||[]).reduce((a,sid)=>a + (d.durations[sid]||60), 0);
      const gridMin = Math.max(10*60, totalMin + 60);
      const gridHeight = gridMin * pxPerMin;

      const col = document.createElement("div");
      col.className = "schedDay";
      col.dataset.dayId = d.id;

      col.innerHTML = `
        <div class="schedHead">
          <div class="t">${esc(formatDayTitle(d.date))}${d.label? " · "+esc(d.label):""}</div>
          <div class="m">Call ${esc(d.callTime||"")} · ${esc(d.location||"")}</div>
        </div>
        <div class="schedGrid" data-dayid="${esc(d.id)}" style="height:${gridHeight + 20}px;"></div>
      `;
      const grid = col.querySelector(".schedGrid");

      for(let t=0; t<=gridMin; t+=60){
        const y = t * pxPerMin + 10;
        const line = document.createElement("div");
        line.className = "hourLine";
        line.style.top = `${y}px`;

        const lbl = document.createElement("div");
        lbl.className = "hourLabel";
        lbl.style.top = `${y}px`;
        lbl.textContent = hhmmFromMinutes(dayStartMin + t);

        grid.appendChild(line);
        grid.appendChild(lbl);
      }

      let cursor = 0;
      for(const sid of (d.sceneIds||[])){
        const s = getScene(sid);
        if(!s) continue;

        const dur = d.durations[sid] || 60;
        const top = cursor * pxPerMin + 10;
        const height = dur * pxPerMin;

        const start = dayStartMin + cursor;
        const end = start + dur;

        const block = document.createElement("div");
        block.className = "schedBlock";
        block.style.top = `${top}px`;
        block.style.height = `${height}px`;
        block.dataset.dayId = d.id;
        block.dataset.sceneId = sid;

        block.innerHTML = `
          <div class="bar" style="background:${catColors.cast}"></div>
          <div class="title">#${esc(s.number||"")} — ${esc(s.slugline||"")}</div>
          <div class="meta">${hhmmFromMinutes(start)} → ${hhmmFromMinutes(end)} · ${dur} min</div>
          <div class="resize" title="Arrastrá para cambiar duración"></div>
        `;

        block.addEventListener("mouseenter", (e)=>{
          if(schedDrag) return;
          showHoverTip(buildSceneTooltipHTML(s), e.clientX, e.clientY);
        });
        block.addEventListener("mousemove", (e)=>{
          if(el("hoverTip").style.display === "block") moveHoverTip(e.clientX, e.clientY);
        });
        block.addEventListener("mouseleave", ()=>{
          hideHoverTip();
        });

        block.addEventListener("click", (e)=>{
          if(e.target.classList.contains("resize")) return;
          if(schedDrag) return;
          selectedSceneId = sid;
          showView("breakdown");
          renderScenesTable();
          renderSceneEditor();
        });

        const handle = block.querySelector(".resize");
        handle.addEventListener("mousedown", (e)=>{
          e.preventDefault();
          e.stopPropagation();
          resizing = {
            dayId: d.id,
            sceneId: sid,
            startY: e.clientY,
            startDur: dur,
            pxPerMin,
            snapMin
          };
          document.body.style.userSelect = "none";
          hideHoverTip();
        });

        block.addEventListener("mousedown", (e)=>{
          if(e.button !== 0) return;
          if(e.target.classList.contains("resize")) return;
          if(resizing) return;

          e.preventDefault();
          hideHoverTip();

          const rect = block.getBoundingClientRect();
          const ghost = document.createElement("div");
          ghost.className = "dragGhost";
          ghost.innerHTML = `<div style="font-weight:900;">#${esc(s.number||"")} — ${esc(s.slugline||"")}</div><div style="color:var(--muted);font-size:12px;margin-top:4px;">${esc(formatDayTitle(d.date))}</div>`;
          document.body.appendChild(ghost);

          schedDrag = {
            sceneId: sid,
            fromDayId: d.id,
            pxPerMin,
            snapMin,
            ghostEl: ghost,
            targetDayId: d.id,
            targetIndex: (d.sceneIds||[]).indexOf(sid),
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top
          };

          block.classList.add("dragging");
          document.body.style.userSelect = "none";
        });

        grid.appendChild(block);
        cursor += dur;
      }

      board.appendChild(col);
    }
  }

  window.addEventListener("mousemove", (e)=>{
    if(resizing){
      const d = getDay(resizing.dayId);
      if(!d) return;

      const deltaPx = e.clientY - resizing.startY;
      const deltaMin = deltaPx / resizing.pxPerMin;

      let newDur = resizing.startDur + deltaMin;
      newDur = snap(newDur, resizing.snapMin);
      newDur = Math.max(resizing.snapMin, Math.min(newDur, 6*60));

      d.durations = d.durations || {};
      d.durations[resizing.sceneId] = newDur;

      touch();
      renderScheduleBoard();
      renderReports();
      return;
    }

    if(!schedDrag) return;

    const g = schedDrag.ghostEl;
    g.style.left = `${e.clientX - schedDrag.offsetX}px`;
    g.style.top  = `${e.clientY - schedDrag.offsetY}px`;

    const under = document.elementFromPoint(e.clientX, e.clientY);
    const grid = under ? under.closest(".schedGrid") : null;
    const dayId = grid ? grid.dataset.dayid : schedDrag.fromDayId;

    clearSchedDropTargets();
    (grid ? grid.closest(".schedDay") : null)?.classList.add("dropTarget");

    const targetDay = getDay(dayId);
    if(!targetDay){
      schedDrag.targetDayId = schedDrag.fromDayId;
      schedDrag.targetIndex = null;
      return;
    }

    ensureDayDurations(targetDay);

    let yMin = 0;
    if(grid){
      const r = grid.getBoundingClientRect();
      const yPx = e.clientY - r.top - 10;
      yMin = yPx / schedDrag.pxPerMin;
      yMin = Math.max(0, yMin);
    }
    const idx = computeInsertIndexByY(targetDay, yMin);

    schedDrag.targetDayId = dayId;
    schedDrag.targetIndex = idx;
  });

  window.addEventListener("mouseup", ()=>{
    if(resizing){
      resizing = null;
      document.body.style.userSelect = "";
      return;
    }

    if(!schedDrag) return;

    const { sceneId, fromDayId, targetDayId, targetIndex, ghostEl } = schedDrag;

    ghostEl?.remove();
    document.body.style.userSelect = "";
    clearSchedDropTargets();

    document.querySelectorAll(".schedBlock.dragging").forEach(n=>n.classList.remove("dragging"));

    if(targetDayId){
      if(fromDayId === targetDayId){
        const d = getDay(fromDayId);
        if(d){
          const oldIdx = (d.sceneIds||[]).indexOf(sceneId);
          let newIdx = targetIndex ?? oldIdx;
          d.sceneIds = (d.sceneIds||[]).filter(x=>x!==sceneId);
          newIdx = Math.max(0, Math.min(newIdx, d.sceneIds.length));
          d.sceneIds.splice(newIdx, 0, sceneId);
          d.sceneIds = Array.from(new Set(d.sceneIds));
        }
      }else{
        moveSceneToDayWithIndex(sceneId, targetDayId, targetIndex);
      }

      selectedDayId = targetDayId;
      touch();
      renderScheduleBoard();
      renderDaysBoard();
      renderSceneBank();
      renderDayDetail();
      renderReports();
      renderElementsExplorer();
      renderCallSheetCalendar();
      renderCallSheet();
    }

    schedDrag = null;
  });

  function resetAllTimings1h(){
    for(const d of state.shootDays){
      d.durations = d.durations || {};
      for(const sid of (d.sceneIds||[])){
        d.durations[sid] = 60;
      }
    }
    touch();
    renderScheduleBoard();
  }

  // ----------- Settings / JSONBin -----------
  async function doPull(){
    const cfg = StorageLayer.loadCfg();
    if(!cfg.binId || !cfg.accessKey){ toast("Config JSONBin incompleta"); showView("settings"); return; }
    try{
      const remote = await StorageLayer.jsonbinGet(cfg.binId, cfg.accessKey);
      const localAt = Date.parse(state?.meta?.updatedAt || 0);
      const remoteAt = Date.parse(remote?.meta?.updatedAt || 0);
      if(remote && remoteAt >= localAt){
        state = remote;
        StorageLayer.saveLocal(state);
        toast("Pull OK ✅");
      }else{
        toast("Local más nuevo. No pisé nada.");
      }
      hydrateUI();
      updateSyncPill("JSONBin");
    }catch(e){
      toast(`Pull falló: ${e.message}`);
      updateSyncPill("Local");
    }
  }

  async function doPush(){
    const cfg = StorageLayer.loadCfg();
    if(!cfg.binId || !cfg.accessKey){ toast("Config JSONBin incompleta"); showView("settings"); return; }
    try{
      await StorageLayer.jsonbinPut(cfg.binId, cfg.accessKey, state);
      toast("Push OK ✅");
      updateSyncPill("JSONBin");
    }catch(e){
      toast(`Push falló: ${e.message}`);
      updateSyncPill("Local");
    }
  }

  async function testCfg(){
    const binId = (el("cfg_binId").value||"").trim();
    const accessKey = (el("cfg_accessKey").value||"").trim();
    if(!binId || !accessKey){ toast("Completá BIN ID y Access Key"); return; }
    try{
      await StorageLayer.testJsonbin(binId, accessKey);
      toast("Conexión OK ✅");
      updateSyncPill("JSONBin");
    }catch(e){
      toast(`No conecta: ${e.message}`);
      updateSyncPill("Local");
    }
  }

  function saveCfgFromUI(){
    const cfg = StorageLayer.loadCfg();
    cfg.binId = (el("cfg_binId").value||"").trim();
    cfg.accessKey = (el("cfg_accessKey").value||"").trim();
    cfg.autosync = el("cfg_autosync").value || "on";
    StorageLayer.saveCfg(cfg);
    toast("Config guardada ✅");
    updateSyncPill(cfg.binId && cfg.accessKey ? "JSONBin" : "Local");
  }

  function setResetKeyFromUI(){
    const a = el("cfg_resetKey").value || "";
    const b = el("cfg_resetKeyConfirm").value || "";
    if(!a || a.length < 4) return toast("Clave muy corta (mín 4)");
    if(a !== b) return toast("No coincide la confirmación");
    StorageLayer.setResetKey(a);
    el("cfg_resetKey").value="";
    el("cfg_resetKeyConfirm").value="";
    toast("Clave de reset seteada ✅");
  }

  function doReset(){
    const saved = StorageLayer.getResetKey();
    if(!saved) return toast("Primero seteá una clave");
    const entered = prompt("Ingresá la clave de reset:");
    if(entered !== saved) return toast("Clave incorrecta ❌");
    if(!confirm("Se borra TODO local. ¿Seguimos?")) return;
    state = defaultState();
    StorageLayer.saveLocal(state);
    selectedSceneId=null; selectedDayId=null; callSheetDayId=null;
    hydrateUI();
    toast("Reset OK (para remoto: Push)");
  }

  // ----------- Wiring / hydrate -----------
  function bindEvents(){
    document.querySelectorAll(".navBtn").forEach(b=>{
      b.addEventListener("click", ()=>{
        const v = b.dataset.view;
        showView(v);

        if(v === "elements") renderElementsExplorer();
        if(v === "shooting"){ renderSceneBank(); renderDaysBoard(); renderDayDetail(); }
        if(v === "schedule") renderScheduleBoard();
        if(v === "reports") renderReports();
        if(v === "callsheet"){ renderCallSheetCalendar(); renderCallSheet(); }
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
        renderReports();
        renderElementsExplorer();
        renderScheduleBoard();
        renderCallSheet();
      });
    });

    el("btnAddSceneElement")?.addEventListener("click", addSceneElement);

    // ✅ UI switch para input de Cast
    el("elCategory")?.addEventListener("change", ()=>{
      updateAddElementUI();
    });

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
        d[dayMap[id]] = node.value;
        sortShootDaysInPlace();
        touch();
        renderDaysBoard();
        renderDayDetail();
        renderReports();
        renderElementsExplorer();
        renderScheduleBoard();
        renderCallSheetCalendar();
        renderCallSheet();
      });
    });

    el("btnOpenCallSheet")?.addEventListener("click", ()=>{
      callSheetDayId = selectedDayId;
      showView("callsheet");
      renderCallSheetCalendar();
      renderCallSheet();
    });

    // schedule controls
    el("schedZoom")?.addEventListener("change", renderScheduleBoard);
    el("schedSnap")?.addEventListener("change", renderScheduleBoard);
    el("btnTimingAll1h")?.addEventListener("click", resetAllTimings1h);

    // elements
    el("elxCategory")?.addEventListener("change", ()=>{ selectedElementKey=null; renderElementsExplorer(); });
    el("elxDay")?.addEventListener("change", ()=>{ selectedElementKey=null; renderElementsExplorer(); });
    el("elxSearch")?.addEventListener("input", ()=>{ selectedElementKey=null; renderElementsExplorer(); });

    // crew
    el("btnAddCrew")?.addEventListener("click", addCrew);

    // reports
    el("btnRefreshReports")?.addEventListener("click", renderReports);

    // call sheet calendar
    el("calPrev")?.addEventListener("click", ()=>{
      calCursor.month--;
      if(calCursor.month < 0){ calCursor.month = 11; calCursor.year--; }
      renderCallSheetCalendar();
    });
    el("calNext")?.addEventListener("click", ()=>{
      calCursor.month++;
      if(calCursor.month > 11){ calCursor.month = 0; calCursor.year++; }
      renderCallSheetCalendar();
    });
    el("btnPrintCallSheet")?.addEventListener("click", ()=>window.print());

    // settings
    el("btnPull")?.addEventListener("click", doPull);
    el("btnPush")?.addEventListener("click", doPush);
    el("btnSaveCfg")?.addEventListener("click", saveCfgFromUI);
    el("btnTestCfg")?.addEventListener("click", testCfg);
    el("btnSetResetKey")?.addEventListener("click", setResetKeyFromUI);
    el("btnReset")?.addEventListener("click", doReset);

    // title
    el("projectTitle")?.addEventListener("input", ()=>{
      state.meta.title = el("projectTitle").value || "Proyecto";
      touch();
    });
  }

  function hydrateUI(){
    renderCatSelects();
    renderCastDatalist();
    updateAddElementUI();

    el("projectTitle").value = state.meta.title || "Proyecto";

    const cfg = StorageLayer.loadCfg();
    el("cfg_binId").value = cfg.binId || "";
    el("cfg_accessKey").value = cfg.accessKey || "";
    el("cfg_autosync").value = cfg.autosync || "on";
    updateSyncPill(cfg.binId && cfg.accessKey ? "JSONBin" : "Local");

    el("savedAtText").textContent = state.meta.updatedAt ? new Date(state.meta.updatedAt).toLocaleString("es-AR") : "—";
    el("statusText").textContent = "Listo";

    sortShootDaysInPlace();

    renderScenesTable();
    renderSceneEditor();
    renderSceneBank();
    renderDaysBoard();
    renderDayDetail();
    renderElementsExplorer();
    renderCrew();
    renderReports();
    renderCallSheetCalendar();
    renderCallSheet();
    renderScheduleBoard();
  }

  function init(){
    const local = StorageLayer.loadLocal();
    state = (local && local.meta) ? local : defaultState();

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
        durations:{}
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
