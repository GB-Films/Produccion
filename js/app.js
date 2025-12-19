(function(){
  const el = (id)=>document.getElementById(id);
  const views = ["breakdown","shooting","elements","crew","schedule","payments","reports","callsheet","settings"];

  let state = null;
  let selectedSceneId = null;
  let selectedDayId = null;
  let callSheetDayId = null;

  const saveDebouncedRemote = window.U.debounce(async ()=>{
    const cfg = StorageLayer.loadCfg();
    if(cfg.autosync !== "on") return;
    if(!cfg.binId || !cfg.accessKey) return;
    try{
      await StorageLayer.jsonbinPut(cfg.binId, cfg.accessKey, state);
      toast("Autosync: JSONBin ✅");
      updateSyncPill("JSONBin");
    }catch(e){
      toast("Autosync falló (quedó local)");
      updateSyncPill("Local");
    }
  }, 1200);

  function defaultState(){
    return {
      meta: { version: 2, title:"Proyecto", updatedAt: new Date().toISOString() },
      scenes: [],
      shootDays: [], // {id,date,callTime,location,label,notes,sceneIds[],crewIds[]}
      elementLibrary: {
        cast: [], props: [], wardrobe: [], makeup: [], sfx: [], vfx: [],
        vehicles: [], animals: [], extras: [], art: [], sound: []
      },
      crew: [], // {id,area,role,name,phone,email,notes}
      scheduleItems: [],
      payments: []
    };
  }

  function touch(){
    state.meta.updatedAt = new Date().toISOString();
    StorageLayer.saveLocal(state);
    el("savedAtText").textContent = new Date(state.meta.updatedAt).toLocaleString("es-AR");
    el("statusText").textContent = "Guardado";
    saveDebouncedRemote();
  }

  function toast(msg){
    const t = el("toast");
    t.textContent = msg;
    t.style.display="block";
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>t.style.display="none", 2500);
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

  function updateSyncPill(mode){
    const pill = el("syncPill");
    if(!pill) return;
    pill.textContent = mode;
  }

  // ---------- helpers ----------
  const cats = ["cast","props","wardrobe","makeup","sfx","vfx","vehicles","animals","extras","art","sound"];
  const catNames = {
    cast:"Cast", props:"Props", wardrobe:"Vestuario", makeup:"Maquillaje",
    sfx:"SFX", vfx:"VFX", vehicles:"Vehículos", animals:"Animales",
    extras:"Extras", art:"Arte", sound:"Sonido"
  };
  const areaOrder = ["Producción","Dirección","Foto","Arte","Vestuario","Maquillaje","Sonido","Eléctrica/Grip","Post/VFX","Otros"];

  function esc(s){
    return String(s||"")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function uid(p="id"){ return `${p}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`; }
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

  // ---------- screenplay parser (fix de "1 línea = 1 escena") ----------
  function parseScreenplayToScenes(text, extraKeywordsCsv=""){
    const lines = (text||"").split(/\r?\n/).map(l=>l.replace(/\s+$/,"")).filter(l=>l.trim()!=="");
    if(!lines.length) return [];

    const extras = (extraKeywordsCsv||"")
      .split(",")
      .map(x=>x.trim())
      .filter(Boolean)
      .map(x=>x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

    const baseHeads = [
      "INT\\.", "EXT\\.", "INT\\/EXT\\.", "I\\/E\\.", "INT\\.\\/EXT\\.",
      "INTERIOR", "EXTERIOR"
    ];

    const headRe = new RegExp(
      "^\\s*(?:\\d+\\s*[\\).:-]\\s*)?(?:" + baseHeads.concat(extras).join("|") + ")\\b",
      "i"
    );

    function isHeading(line){
      // evita falsos positivos típicos
      const up = line.trim().toUpperCase();
      if(up.endsWith("TO:") && up.length < 18) return false; // CUT TO:
      return headRe.test(line);
    }

    const scenes = [];
    let current = null;
    let n = 1;

    for(const line of lines){
      if(isHeading(line)){
        if(current) scenes.push(finalizeScene(current));
        current = { rawHeading: line.trim(), body: [] , autoNumber: n++ };
      }else{
        if(!current){
          // si el guion arranca sin heading, lo colgamos de una escena 1 "SIN ENCABEZADO"
          current = { rawHeading: "ESCENA", body: [], autoNumber: n++ };
        }
        current.body.push(line);
      }
    }
    if(current) scenes.push(finalizeScene(current));

    // arma escenas con summary desde body
    return scenes.map(s => ({
      id: uid("scene"),
      number: String(s.number),
      slugline: s.slugline,
      location: s.location,
      timeOfDay: s.timeOfDay,
      pages: 0,
      summary: s.summary,
      notes: "",
      elements: Object.fromEntries(cats.map(c=>[c,[]]))
    }));

    function finalizeScene(s){
      const heading = s.rawHeading;

      // intenta detectar número al inicio: "12. INT..."
      let num = s.autoNumber;
      const mNum = heading.match(/^\s*(\d+)\s*[.)-:]\s*/);
      if(mNum) num = Number(mNum[1]);

      const slugline = heading.replace(/^\s*\d+\s*[.)-:]\s*/,"").trim();

      // parse básico: "INT. CASA - NOCHE"
      const parts = slugline.split(" - ").map(p=>p.trim()).filter(Boolean);

      let location = "";
      let tod = "";

      if(parts.length >= 2){
        const last = parts[parts.length-1];
        // si el último parece horario, lo usamos
        const cand = normalizeTOD(last);
        if(cand) tod = cand;
        // location: la parte del medio (quita INT./EXT.)
        const mid = parts.slice(0, parts.length-1).join(" - ");
        location = mid.replace(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|INT\.\/EXT\.|INTERIOR|EXTERIOR)\s*/i,"").trim();
      }else{
        location = slugline.replace(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|INT\.\/EXT\.|INTERIOR|EXTERIOR)\s*/i,"").trim();
      }

      const bodyText = (s.body||[]).join(" ");
      const summary = bodyText.slice(0, 220); // corto y útil

      return { number:num, slugline, location, timeOfDay:tod, summary };
    }
  }

  // ---------- Breakdown ----------
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
    renderSceneElementsChips();
  }

  function renderSceneElementsChips(){
    const wrap = el("sceneElementsChips");
    wrap.innerHTML = "";
    const s = selectedSceneId ? getScene(selectedSceneId) : null;
    if(!s) return;

    for(const cat of cats){
      const items = s.elements?.[cat] || [];
      if(!items.length) continue;

      const head = document.createElement("div");
      head.className = "chip";
      head.innerHTML = `<b>${esc(catNames[cat])}</b><span class="muted">${items.length}</span>`;
      wrap.appendChild(head);

      for(const it of items){
        const chip = document.createElement("div");
        chip.className = "chip";
        chip.innerHTML = `<span>${esc(it)}</span><button title="Quitar">×</button>`;
        chip.querySelector("button").addEventListener("click", ()=>{
          s.elements[cat] = (s.elements[cat]||[]).filter(x=>x!==it);
          touch();
          renderSceneElementsChips();
          renderReports();
          renderDayDetail();
        });
        wrap.appendChild(chip);
      }
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
  }

  function deleteScene(){
    if(!selectedSceneId) return;
    const s = getScene(selectedSceneId);
    if(!s) return;
    if(!confirm(`Borrar escena #${s.number}?`)) return;

    // remove from all days
    for(const d of state.shootDays){
      d.sceneIds = (d.sceneIds||[]).filter(id=>id!==s.id);
    }
    state.scenes = state.scenes.filter(x=>x.id!==s.id);
    selectedSceneId = state.scenes[0]?.id || null;
    touch();
    renderScenesTable();
    renderSceneEditor();
    renderSceneBank();
    renderDaysBoard();
    renderReports();
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
  }

  function addSceneElement(){
    const s = selectedSceneId ? getScene(selectedSceneId) : null;
    if(!s) return;
    const cat = el("elCategory").value;
    const item = (el("elItem").value||"").trim();
    if(!item) return;

    s.elements[cat] = s.elements[cat] || [];
    if(!s.elements[cat].includes(item)) s.elements[cat].push(item);

    // optional: add to library
    if(state.elementLibrary[cat] && !state.elementLibrary[cat].includes(item)){
      state.elementLibrary[cat].push(item);
      state.elementLibrary[cat].sort((a,b)=>a.localeCompare(b));
    }

    el("elItem").value="";
    touch();
    renderSceneElementsChips();
    renderReports();
    renderDayDetail();
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
        timeOfDay: r[3]||"",
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
    toast(`Cargadas ${scenes.length} escenas desde guion ✅`);
    renderScenesTable();
    renderSceneEditor();
    renderSceneBank();
    renderDaysBoard();
  }

  // ---------- Shooting: days + drag & drop ----------
  function addShootDay(){
    const d = {
      id: uid("day"),
      date:"",
      callTime:"",
      location:"",
      label:"",
      notes:"",
      sceneIds:[],
      crewIds:[]
    };
    state.shootDays.push(d);
    selectedDayId = d.id;
    touch();
    renderDaysBoard();
    renderDayDetail();
    renderReports();
  }

  function deleteShootDay(){
    if(!selectedDayId) return;
    const d = getDay(selectedDayId);
    if(!d) return;
    if(!confirm(`Borrar día ${d.date || "(sin fecha)"}?`)) return;
    state.shootDays = state.shootDays.filter(x=>x.id!==d.id);
    selectedDayId = state.shootDays[0]?.id || null;
    touch();
    renderDaysBoard();
    renderDayDetail();
    renderReports();
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
      const card = sceneCardNode(s, fromDay);
      wrap.appendChild(card);
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

  function renderDaysBoard(){
    const board = el("daysBoard");
    if(!board) return;
    board.innerHTML = "";

    for(const d of state.shootDays){
      const col = document.createElement("div");
      col.className = "dayCol";
      col.dataset.dayId = d.id;

      const head = document.createElement("div");
      head.className = "dayHeader";
      head.innerHTML = `
        <div>
          <div class="t">${esc(d.label || "Día")}</div>
          <div class="m">${esc(d.date||"")} · Call ${esc(d.callTime||"")} · ${esc(d.location||"")}</div>
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

      // drop handlers
      zone.addEventListener("dragover", (e)=>{ e.preventDefault(); zone.classList.add("over"); });
      zone.addEventListener("dragleave", ()=>zone.classList.remove("over"));
      zone.addEventListener("drop", (e)=>{
        e.preventDefault();
        zone.classList.remove("over");
        const raw = e.dataTransfer.getData("application/json");
        if(!raw) return;
        const data = JSON.parse(raw);
        if(data.type !== "scene") return;

        const targetDay = getDay(d.id);
        if(!targetDay) return;

        // remove from previous day if exists
        if(data.fromDayId){
          const prev = getDay(data.fromDayId);
          if(prev) prev.sceneIds = (prev.sceneIds||[]).filter(x=>x!==data.sceneId);
        }else{
          // ensure removed from any day (si estaba asignada y venía del bank sin fromDay por algún motivo)
          for(const dd of state.shootDays){
            dd.sceneIds = (dd.sceneIds||[]).filter(x=>x!==data.sceneId);
          }
        }

        // reorder if dropped on top of another card
        const after = e.target.closest(".sceneCard");
        targetDay.sceneIds = targetDay.sceneIds || [];
        if(after && after.dataset.sceneId){
          const idx = targetDay.sceneIds.indexOf(after.dataset.sceneId);
          if(idx >= 0){
            targetDay.sceneIds.splice(idx, 0, data.sceneId);
          }else{
            targetDay.sceneIds.push(data.sceneId);
          }
        }else{
          targetDay.sceneIds.push(data.sceneId);
        }

        // de-dup
        targetDay.sceneIds = Array.from(new Set(targetDay.sceneIds));

        selectedDayId = targetDay.id;
        touch();
        renderDaysBoard();
        renderSceneBank();
        renderDayDetail();
        renderReports();
      });

      // render scene cards in day
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

      // highlight selected
      if(d.id === selectedDayId){
        col.style.borderColor = "rgba(110,231,255,.35)";
      }

      board.appendChild(col);
    }
  }

  function setDayFieldHandlers(){
    const d = selectedDayId ? getDay(selectedDayId) : null;
    const fields = ["day_date","day_call","day_location","day_label","day_notes"];
    for(const f of fields){
      const node = el(f);
      if(!node) continue;
      node.disabled = !d;
      node.value = d ? (f==="day_call"? (d.callTime||"") : (d[f.replace("day_","")]||"")) : "";
    }
  }

  function renderDayDetail(){
    const d = selectedDayId ? getDay(selectedDayId) : null;
    setDayFieldHandlers();
    renderDayCast();
    renderDayCrewPicker();
    renderDayNeeds();
    renderDaySchedule();
  }

  function dayScenes(d){
    return (d.sceneIds||[]).map(getScene).filter(Boolean);
  }

  function union(list){ return Array.from(new Set(list.filter(Boolean))); }

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
      chip.textContent = name;
      wrap.appendChild(chip);
    });
  }

  function renderDayCrewPicker(){
    const wrap = el("dayCrewPicker");
    if(!wrap) return;
    wrap.innerHTML = "";
    const d = selectedDayId ? getDay(selectedDayId) : null;
    if(!d){ wrap.innerHTML = `<div class="muted">Seleccioná un día</div>`; return; }

    const byArea = {};
    for(const c of state.crew){
      const a = c.area || "Otros";
      byArea[a] = byArea[a] || [];
      byArea[a].push(c);
    }

    const areas = Object.keys(byArea).sort((a,b)=>{
      const ia = areaOrder.indexOf(a); const ib = areaOrder.indexOf(b);
      return (ia<0?999:ia) - (ib<0?999:ib) || a.localeCompare(b);
    });

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
    if(!wrap) return;
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
          chip.innerHTML = `<b>${esc(catNames[cat])}:</b> <span>${esc(it)}</span>`;
          chips.appendChild(chip);
        });
      }

      box.appendChild(chips);
      wrap.appendChild(box);
    }
  }

  function renderDaySchedule(){
    const wrap = el("daySchedule");
    if(!wrap) return;
    wrap.innerHTML = "";
    const d = selectedDayId ? getDay(selectedDayId) : null;
    if(!d || !d.date){
      wrap.innerHTML = `<div class="muted">Poné fecha al día para filtrar cronograma.</div>`;
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

  // ---------- Reports ----------
  function renderReports(){
    const wrap = el("reportsList");
    if(!wrap) return;
    wrap.innerHTML = "";

    if(!state.shootDays.length){
      wrap.innerHTML = `<div class="muted">Todavía no creaste días de rodaje.</div>`;
      return;
    }

    for(const d of state.shootDays){
      const scenes = dayScenes(d);
      const cast = union(scenes.flatMap(s=>s.elements?.cast || []));
      const crew = (d.crewIds||[]).map(getCrew).filter(Boolean);

      const needs = {};
      for(const cat of cats){
        const items = union(scenes.flatMap(s=>s.elements?.[cat] || []));
        if(items.length) needs[cat] = items;
      }

      const card = document.createElement("div");
      card.className = "listItem";
      card.style.flexDirection="column";

      const header = document.createElement("div");
      header.innerHTML = `
        <div class="title">${esc(d.label || "Día")} — ${esc(d.date||"(sin fecha)")}</div>
        <div class="meta">${(scenes.length)} escenas · ${cast.length} cast · ${crew.length} crew</div>
      `;

      const details = document.createElement("details");
      details.style.marginTop="8px";
      details.innerHTML = `<summary class="muted">Ver detalle</summary>`;

      const inner = document.createElement("div");
      inner.style.marginTop="10px";

      inner.innerHTML += `<div class="muted"><b>Escenas:</b> ${esc(scenes.map(s=>`#${s.number}`).join(", ") || "-")}</div>`;
      inner.innerHTML += `<div class="muted" style="margin-top:6px;"><b>Cast:</b> ${esc(cast.join(", ") || "-")}</div>`;
      inner.innerHTML += `<div class="muted" style="margin-top:6px;"><b>Crew:</b> ${esc(crew.map(c=>`${c.area||"Otros"} - ${c.role||""} - ${c.name||""}`).join(" | ") || "-")}</div>`;

      // Needs grouped by dept-ish
      const needsRows = [];
      for(const cat of Object.keys(needs)){
        for(const it of needs[cat]){
          needsRows.push(`${catNames[cat]}: ${it}`);
        }
      }
      inner.innerHTML += `<div class="muted" style="margin-top:6px;"><b>Necesidades:</b> ${esc(needsRows.join(" · ") || "-")}</div>`;

      const actions = document.createElement("div");
      actions.className = "row gap";
      actions.style.marginTop="10px";
      actions.innerHTML = `<button class="btn">Abrir día</button><button class="btn">Ver Call Sheet</button>`;
      const [bOpen,bCS] = actions.querySelectorAll("button");
      bOpen.addEventListener("click", ()=>{
        selectedDayId = d.id;
        showView("shooting");
        renderDaysBoard();
        renderDayDetail();
      });
      bCS.addEventListener("click", ()=>{
        callSheetDayId = d.id;
        showView("callsheet");
        renderCallSheet();
      });

      details.appendChild(inner);
      details.appendChild(actions);

      card.appendChild(header);
      card.appendChild(details);

      wrap.appendChild(card);
    }
  }

  // ---------- Call Sheet ----------
  function renderCallSheet(){
    const wrap = el("callSheetWrap");
    if(!wrap) return;
    wrap.innerHTML = "";

    const d = callSheetDayId ? getDay(callSheetDayId) : (selectedDayId ? getDay(selectedDayId) : null);
    if(!d){
      wrap.innerHTML = `<div class="muted">Seleccioná un día primero.</div>`;
      return;
    }

    const scenes = dayScenes(d);
    const cast = union(scenes.flatMap(s=>s.elements?.cast || []));
    const crew = (d.crewIds||[]).map(getCrew).filter(Boolean);

    // crew grouped by area
    const crewByArea = {};
    for(const c of crew){
      const a = c.area || "Otros";
      crewByArea[a] = crewByArea[a] || [];
      crewByArea[a].push(c);
    }

    // needs
    const needsByDept = {};
    for(const cat of cats){
      const items = union(scenes.flatMap(s=>s.elements?.[cat] || []));
      if(!items.length) continue;
      const dept = deptFromCat(cat);
      needsByDept[dept] = needsByDept[dept] || [];
      for(const it of items){
        needsByDept[dept].push(`${catNames[cat]}: ${it}`);
      }
    }

    const html = `
      <div class="printOnly"><h1>${esc(state.meta.title||"Proyecto")} — CALL SHEET</h1></div>

      <div class="pairs">
        <div class="stat"><div class="statK">Día</div><div class="statV">${esc(d.label||"Día")}</div></div>
        <div class="stat"><div class="statK">Fecha</div><div class="statV">${esc(d.date||"-")}</div></div>
        <div class="stat"><div class="statK">Call</div><div class="statV">${esc(d.callTime||"-")}</div></div>
        <div class="stat"><div class="statK">Locación</div><div class="statV">${esc(d.location||"-")}</div></div>
      </div>

      <div class="hr"></div>

      <h3>Escenas</h3>
      <div class="tableWrap">
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
      <div class="chips">${cast.length ? cast.map(n=>`<div class="chip">${esc(n)}</div>`).join("") : `<span class="muted">-</span>`}</div>

      <div class="hr"></div>

      <h3>Equipo técnico (por área)</h3>
      ${Object.keys(crewByArea).sort((a,b)=>a.localeCompare(b)).map(area=>`
        <div class="card" style="margin:10px 0; background: rgba(255,255,255,.02);">
          <div class="title"><b>${esc(area)}</b></div>
          <div class="muted" style="margin-top:6px;">
            ${crewByArea[area].map(c=>esc(`${c.role||""} — ${c.name||""} ${c.phone? "("+c.phone+")":""}`)).join("<br/>")}
          </div>
        </div>
      `).join("")}

      <div class="hr"></div>

      <h3>Necesidades por área</h3>
      ${Object.keys(needsByDept).length ? Object.keys(needsByDept).sort((a,b)=>a.localeCompare(b)).map(dept=>`
        <div class="card" style="margin:10px 0; background: rgba(255,255,255,.02);">
          <div class="title"><b>${esc(dept)}</b></div>
          <div class="muted" style="margin-top:6px;">${needsByDept[dept].map(esc).join("<br/>")}</div>
        </div>
      `).join("") : `<div class="muted">-</div>`}

      <div class="hr"></div>

      <h3>Notas</h3>
      <div class="muted">${esc(d.notes||"-")}</div>
    `;

    wrap.innerHTML = html;
  }

  // ---------- Crew (con área) ----------
  function addCrew(){
    state.crew.push({ id: uid("crew"), area:"Producción", role:"", name:"", phone:"", email:"", notes:"" });
    touch();
    renderCrew();
    renderDayDetail();
    renderReports();
  }

  function renderCrew(){
    const tbody = el("crewTable").querySelector("tbody");
    tbody.innerHTML = "";
    state.crew.forEach(c=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="input" value="${esc(c.area||"")}" /></td>
        <td><input class="input" value="${esc(c.role||"")}" /></td>
        <td><input class="input" value="${esc(c.name||"")}" /></td>
        <td><input class="input" value="${esc(c.phone||"")}" /></td>
        <td><input class="input" value="${esc(c.email||"")}" /></td>
        <td><input class="input" value="${esc(c.notes||"")}" /></td>
        <td><button class="btn danger">Borrar</button></td>
      `;
      const inputs = tr.querySelectorAll("input");
      const keys = ["area","role","name","phone","email","notes"];
      inputs.forEach((inp,i)=>{
        inp.addEventListener("input", ()=>{
          c[keys[i]] = inp.value;
          touch();
          renderDayDetail();
          renderReports();
        });
      });
      tr.querySelector("button").addEventListener("click", ()=>{
        if(!confirm("Borrar integrante?")) return;
        // remove from day crew selections
        for(const d of state.shootDays){
          d.crewIds = (d.crewIds||[]).filter(id=>id!==c.id);
        }
        state.crew = state.crew.filter(x=>x.id!==c.id);
        touch();
        renderCrew();
        renderDayDetail();
        renderReports();
      });
      tbody.appendChild(tr);
    });
  }

  // ---------- Schedule / Payments (lo que ya tenías, sin tocar de más) ----------
  function addSchedule(){
    state.scheduleItems.push({ id: uid("sch"), name:"", startDate:"", endDate:"", owner:"", status:"Pendiente", notes:"" });
    touch(); renderSchedule(); renderDaySchedule();
  }
  function renderSchedule(){
    const tbody = el("scheduleTable").querySelector("tbody");
    tbody.innerHTML = "";
    state.scheduleItems.forEach(it=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="input" value="${esc(it.name||"")}" /></td>
        <td><input class="input" type="date" value="${esc(it.startDate||"")}" /></td>
        <td><input class="input" type="date" value="${esc(it.endDate||"")}" /></td>
        <td><input class="input" value="${esc(it.owner||"")}" /></td>
        <td>
          <select class="input">
            ${["Pendiente","En curso","Hecho","Bloqueado"].map(s=>`<option ${it.status===s?"selected":""}>${s}</option>`).join("")}
          </select>
        </td>
        <td><input class="input" value="${esc(it.notes||"")}" /></td>
        <td><button class="btn danger">Borrar</button></td>
      `;
      const [name,start,end,owner,statusSel,notes] = tr.querySelectorAll("input,select");
      name.addEventListener("input", ()=>{ it.name=name.value; touch(); renderDaySchedule(); });
      start.addEventListener("input", ()=>{ it.startDate=start.value; touch(); renderDaySchedule(); });
      end.addEventListener("input", ()=>{ it.endDate=end.value; touch(); renderDaySchedule(); });
      owner.addEventListener("input", ()=>{ it.owner=owner.value; touch(); });
      statusSel.addEventListener("change", ()=>{ it.status=statusSel.value; touch(); });
      notes.addEventListener("input", ()=>{ it.notes=notes.value; touch(); });

      tr.querySelector("button").addEventListener("click", ()=>{
        if(!confirm("Borrar ítem?")) return;
        state.scheduleItems = state.scheduleItems.filter(x=>x.id!==it.id);
        touch(); renderSchedule(); renderDaySchedule();
      });
      tbody.appendChild(tr);
    });
  }

  function addPayment(){
    state.payments.push({ id: uid("pay"), vendor:"", concept:"", amount:0, dueDate:"", status:"Pendiente", link:"", notes:"" });
    touch(); renderPayments();
  }
  function renderPayments(){
    const tbody = el("paymentsTable").querySelector("tbody");
    tbody.innerHTML = "";
    state.payments.forEach(p=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="input" value="${esc(p.vendor||"")}" /></td>
        <td><input class="input" value="${esc(p.concept||"")}" /></td>
        <td><input class="input" type="number" value="${esc(String(p.amount||0))}" /></td>
        <td><input class="input" type="date" value="${esc(p.dueDate||"")}" /></td>
        <td>
          <select class="input">
            ${["Pendiente","Pagado","Parcial"].map(s=>`<option ${p.status===s?"selected":""}>${s}</option>`).join("")}
          </select>
        </td>
        <td><input class="input" value="${esc(p.link||"")}" /></td>
        <td><input class="input" value="${esc(p.notes||"")}" /></td>
        <td><button class="btn danger">Borrar</button></td>
      `;
      const [vendor,concept,amount,due,statusSel,link,notes] = tr.querySelectorAll("input,select");
      vendor.addEventListener("input", ()=>{ p.vendor=vendor.value; touch(); });
      concept.addEventListener("input", ()=>{ p.concept=concept.value; touch(); });
      amount.addEventListener("input", ()=>{ p.amount=Number(amount.value||0); touch(); });
      due.addEventListener("input", ()=>{ p.dueDate=due.value; touch(); });
      statusSel.addEventListener("change", ()=>{ p.status=statusSel.value; touch(); });
      link.addEventListener("input", ()=>{ p.link=link.value; touch(); });
      notes.addEventListener("input", ()=>{ p.notes=notes.value; touch(); });

      tr.querySelector("button").addEventListener("click", ()=>{
        if(!confirm("Borrar pago?")) return;
        state.payments = state.payments.filter(x=>x.id!==p.id);
        touch(); renderPayments();
      });
      tbody.appendChild(tr);
    });

    // stats si existen
    if(el("statTotal")){
      const total = state.payments.reduce((a,p)=>a+Number(p.amount||0),0);
      const paid = state.payments.filter(p=>p.status==="Pagado").reduce((a,p)=>a+Number(p.amount||0),0);
      const pending = total - paid;
      el("statTotal").textContent = window.U.moneyARS(total);
      el("statPaid").textContent = window.U.moneyARS(paid);
      el("statPending").textContent = window.U.moneyARS(pending);
    }
  }

  // ---------- JSONBin / Settings (igual que antes, pero sin pisarte) ----------
  async function doPull(){
    const cfg = StorageLayer.loadCfg();
    if(!cfg.binId || !cfg.accessKey){ toast("Config JSONBin incompleta"); showView("settings"); return; }
    try{
      const remote = await StorageLayer.jsonbinGet(cfg.binId, cfg.accessKey);
      if(!remote?.meta){ toast("JSONBin devolvió algo raro"); return; }
      const localAt = Date.parse(state?.meta?.updatedAt || 0);
      const remoteAt = Date.parse(remote.meta.updatedAt || 0);
      if(remoteAt >= localAt){
        state = remote;
        StorageLayer.saveLocal(state);
        toast("Pull OK ✅");
      }else{
        toast("Tu local es más nuevo. No pisé nada.");
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
    if(!a || a.length < 4) return toast("Clave muy corta (mínimo 4)");
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
    toast("Reset OK. (Para borrar remoto: Push)");
  }

  // ---------- Wiring ----------
  function hydrateUI(){
    el("projectTitle").value = state.meta.title || "Proyecto";

    const cfg = StorageLayer.loadCfg();
    el("cfg_binId").value = cfg.binId || "";
    el("cfg_accessKey").value = cfg.accessKey || "";
    el("cfg_autosync").value = cfg.autosync || "on";
    updateSyncPill(cfg.binId && cfg.accessKey ? "JSONBin" : "Local");

    el("savedAtText").textContent = state.meta.updatedAt ? new Date(state.meta.updatedAt).toLocaleString("es-AR") : "—";
    el("statusText").textContent = "Listo";

    renderScenesTable();
    renderSceneEditor();
    renderSceneBank();
    renderDaysBoard();
    renderDayDetail();
    renderCrew();
    renderSchedule();
    renderPayments();
    renderReports();
    renderCallSheet();
  }

  function bindEvents(){
    document.querySelectorAll(".navBtn").forEach(b=>{
      b.addEventListener("click", ()=>showView(b.dataset.view));
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
        s[k] = (k==="pages") ? Number(node.value||0) : node.value;
        touch();
        renderScenesTable();
        renderSceneBank();
        renderDaysBoard();
        renderReports();
        renderDayDetail();
      });
    });

    el("btnAddSceneElement")?.addEventListener("click", addSceneElement);

    el("btnImportScenes")?.addEventListener("click", importScenesTable);
    el("btnClearImport")?.addEventListener("click", ()=>{ el("sceneImportText").value=""; });

    el("btnParseScript")?.addEventListener("click", importScript);
    el("btnClearScript")?.addEventListener("click", ()=>{ el("scriptImportText").value=""; });

    // Shooting
    el("btnAddShootDay")?.addEventListener("click", addShootDay);
    el("btnDeleteShootDay")?.addEventListener("click", deleteShootDay);

    el("bankSearch")?.addEventListener("input", renderSceneBank);
    el("bankFilter")?.addEventListener("change", renderSceneBank);

    ["day_date","day_call","day_location","day_label","day_notes"].forEach(id=>{
      const node = el(id);
      if(!node) return;
      node.addEventListener("input", ()=>{
        const d = selectedDayId ? getDay(selectedDayId) : null;
        if(!d) return;
        const key = id.replace("day_","");
        if(key==="call") d.callTime = node.value;
        else d[key] = node.value;
        touch();
        renderDaysBoard();
        renderDayDetail();
        renderReports();
      });
    });

    el("btnOpenCallSheet")?.addEventListener("click", ()=>{
      callSheetDayId = selectedDayId;
      showView("callsheet");
      renderCallSheet();
    });
    el("btnPrintCallSheet")?.addEventListener("click", ()=>window.print());

    // Crew / schedule / payments
    el("btnAddCrew")?.addEventListener("click", addCrew);
    el("btnAddSchedule")?.addEventListener("click", addSchedule);
    el("btnAddPayment")?.addEventListener("click", addPayment);

    // Reports
    el("btnRefreshReports")?.addEventListener("click", renderReports);

    // Title
    el("projectTitle")?.addEventListener("input", ()=>{
      state.meta.title = el("projectTitle").value || "Proyecto";
      touch();
    });

    // Sync
    el("btnPull")?.addEventListener("click", doPull);
    el("btnPush")?.addEventListener("click", doPush);

    // Settings
    el("btnSaveCfg")?.addEventListener("click", saveCfgFromUI);
    el("btnTestCfg")?.addEventListener("click", testCfg);
    el("btnSetResetKey")?.addEventListener("click", setResetKeyFromUI);
    el("btnReset")?.addEventListener("click", doReset);
  }

  function init(){
    const local = StorageLayer.loadLocal();
    state = (local && local.meta) ? local : defaultState();

    if(!state.scenes.length){
      state.scenes.push({
        id: uid("scene"),
        number:"1",
        slugline:"INT. — (completá)",
        location:"",
        timeOfDay:"",
        pages:1,
        summary:"",
        notes:"",
        elements: Object.fromEntries(cats.map(c=>[c,[]]))
      });
    }
    if(!state.shootDays.length){
      state.shootDays.push({ id: uid("day"), date:"", callTime:"", location:"", label:"Día 1", notes:"", sceneIds:[], crewIds:[] });
    }

    selectedSceneId = state.scenes[0]?.id || null;
    selectedDayId = state.shootDays[0]?.id || null;

    bindEvents();
    hydrateUI();
    showView("breakdown");
  }

  window.addEventListener("DOMContentLoaded", init);
})();
