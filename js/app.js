(function(){
  const el = (id)=>document.getElementById(id);

  const views = ["breakdown","shooting","elements","crew","schedule","payments","settings"];

  let state = null;
  let selectedSceneId = null;
  let selectedDayId = null;
  let selectedLibItem = null;

  const saveDebouncedRemote = window.U.debounce(async ()=>{
    const cfg = StorageLayer.loadCfg();
    if(cfg.autosync !== "on") return;
    if(!cfg.binId || !cfg.accessKey) return;
    try{
      await StorageLayer.jsonbinPut(cfg.binId, cfg.accessKey, state);
      toast("Autosync: enviado a JSONBin ✅");
      updateSyncPill("JSONBin");
    }catch(err){
      toast(`Autosync falló: ${err.message}`);
      updateSyncPill("Local");
    }
  }, 1500);

  function defaultState(){
    return {
      meta: { version: 1, title: "Proyecto", updatedAt: window.U.nowISO() },
      scenes: [],
      shootDays: [],
      elementLibrary: {
        cast: [], props: [], wardrobe: [], makeup: [], sfx: [], vfx: [],
        vehicles: [], animals: [], extras: [], art: [], sound: []
      },
      crew: [],
      scheduleItems: [],
      payments: []
    };
  }

  function touch(){
    state.meta.updatedAt = window.U.nowISO();
    StorageLayer.saveLocal(state);
    el("savedAtText").textContent = new Date(state.meta.updatedAt).toLocaleString("es-AR");
    el("statusText").textContent = "Guardado";
    saveDebouncedRemote();
    renderStats();
  }

  function toast(msg){
    const t = el("toast");
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>{ t.style.display="none"; }, 2600);
  }

  function updateSyncPill(mode){
    const pill = el("syncPill");
    pill.textContent = mode;
    if(mode === "JSONBin"){
      pill.style.borderColor = "rgba(52,211,153,.45)";
      pill.style.background = "rgba(52,211,153,.10)";
      pill.style.color = "#d1fae5";
    }else{
      pill.style.borderColor = "";
      pill.style.background = "";
      pill.style.color = "";
    }
  }

  function showView(name){
    for(const v of views){
      el(`view-${v}`).classList.toggle("hidden", v !== name);
    }
    document.querySelectorAll(".navBtn").forEach(b=>{
      b.classList.toggle("active", b.dataset.view === name);
    });
  }

  // ---------- Scenes ----------
  function addScene(){
    const s = {
      id: window.U.uid("scene"),
      number: String((state.scenes.length || 0) + 1),
      slugline: "",
      location: "",
      timeOfDay: "",
      pages: 0,
      summary: "",
      notes: "",
      elements: {
        cast: [], props: [], wardrobe: [], makeup: [], sfx: [], vfx: [],
        vehicles: [], animals: [], extras: [], art: [], sound: []
      }
    };
    state.scenes.push(s);
    selectedSceneId = s.id;
    touch();
    renderScenes();
    renderSceneEditor();
  }

  function getScene(id){ return state.scenes.find(s=>s.id===id) || null; }

  function deleteScene(){
    if(!selectedSceneId) return;
    const s = getScene(selectedSceneId);
    if(!s) return;
    if(!confirm(`Borrar escena #${s.number}?`)) return;

    // quitar de días de rodaje
    for(const d of state.shootDays){
      d.sceneIds = (d.sceneIds||[]).filter(x=>x!==selectedSceneId);
    }

    state.scenes = state.scenes.filter(x=>x.id!==selectedSceneId);
    selectedSceneId = state.scenes[0]?.id || null;
    touch();
    renderScenes();
    renderSceneEditor();
    renderShootDays();
    renderDayEditor();
  }

  function duplicateScene(){
    if(!selectedSceneId) return;
    const s = getScene(selectedSceneId);
    if(!s) return;
    const c = JSON.parse(JSON.stringify(s));
    c.id = window.U.uid("scene");
    c.number = `${s.number}b`;
    state.scenes.push(c);
    selectedSceneId = c.id;
    touch();
    renderScenes();
    renderSceneEditor();
  }

  function renderScenes(){
    const q = (el("sceneSearch").value || "").toLowerCase();
    const tod = el("sceneFilterTOD").value || "";
    const tbody = el("sceneTable").querySelector("tbody");
    tbody.innerHTML = "";

    const list = state.scenes.filter(s=>{
      const hay = `${s.number} ${s.slugline} ${s.location} ${s.summary}`.toLowerCase();
      if(q && !hay.includes(q)) return false;
      if(tod && (s.timeOfDay||"") !== tod) return false;
      return true;
    });

    for(const s of list){
      const tr = document.createElement("tr");
      tr.className = (s.id === selectedSceneId) ? "selected" : "";
      tr.innerHTML = `
        <td>${escapeHtml(s.number||"")}</td>
        <td>${escapeHtml(s.slugline||"")}</td>
        <td>${escapeHtml(s.location||"")}</td>
        <td>${escapeHtml(s.timeOfDay||"")}</td>
        <td>${Number(s.pages||0) ? escapeHtml(String(s.pages)) : ""}</td>
      `;
      tr.addEventListener("click", ()=>{
        selectedSceneId = s.id;
        renderScenes();
        renderSceneEditor();
      });
      tbody.appendChild(tr);
    }
  }

  function renderSceneEditor(){
    const s = selectedSceneId ? getScene(selectedSceneId) : null;

    const hint = el("selectedSceneHint");
    hint.textContent = s ? `Editando escena #${s.number}` : "Seleccioná una escena";

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

    const cats = Object.keys(s.elements || {});
    for(const cat of cats){
      const items = s.elements[cat] || [];
      if(!items.length) continue;

      const title = document.createElement("div");
      title.className = "chip";
      title.innerHTML = `<b>${catLabel(cat)}</b><span class="muted">${items.length}</span>`;
      wrap.appendChild(title);

      for(const it of items){
        const chip = document.createElement("div");
        chip.className = "chip";
        chip.innerHTML = `<span>${escapeHtml(it)}</span><button title="Quitar">×</button>`;
        chip.querySelector("button").addEventListener("click", ()=>{
          s.elements[cat] = (s.elements[cat]||[]).filter(x=>x!==it);
          touch();
          renderSceneElementsChips();
          renderLib(); // por uso
        });
        wrap.appendChild(chip);
      }
    }
  }

  function addSceneElement(){
    const s = selectedSceneId ? getScene(selectedSceneId) : null;
    if(!s) return;

    const cat = el("elCategory").value;
    const item = (el("elItem").value || "").trim();
    if(!item) return;

    if(!s.elements[cat]) s.elements[cat] = [];
    if(!s.elements[cat].includes(item)) s.elements[cat].push(item);

    // opcional: también lo agrega a la librería
    if(state.elementLibrary[cat] && !state.elementLibrary[cat].includes(item)){
      state.elementLibrary[cat].push(item);
      state.elementLibrary[cat].sort((a,b)=>a.localeCompare(b));
    }

    el("elItem").value = "";
    touch();
    renderSceneElementsChips();
    renderLib();
  }

  function importScenes(){
    const txt = el("sceneImportText").value || "";
    const rows = window.U.parseTableText(txt);
    if(!rows.length){ toast("No hay nada para importar"); return; }

    let start = 0;
    if(rows[0] && window.U.isHeaderRow(rows[0])) start = 1;

    let added = 0;
    for(let i=start;i<rows.length;i++){
      const r = rows[i];
      if(!r.length) continue;
      const s = {
        id: window.U.uid("scene"),
        number: r[0] || "",
        slugline: r[1] || "",
        location: r[2] || "",
        timeOfDay: r[3] || "",
        pages: Number(r[4] || 0),
        summary: r[5] || "",
        notes: "",
        elements: {
          cast: [], props: [], wardrobe: [], makeup: [], sfx: [], vfx: [],
          vehicles: [], animals: [], extras: [], art: [], sound: []
        }
      };
      state.scenes.push(s);
      added++;
    }
    if(added){
      selectedSceneId = state.scenes[state.scenes.length-1].id;
      touch();
      renderScenes();
      renderSceneEditor();
      toast(`Importadas ${added} escenas ✅`);
    }else{
      toast("No pude importar (formato raro)");
    }
  }

  // ---------- Shoot Days ----------
  function addShootDay(){
    const d = {
      id: window.U.uid("day"),
      date: "",
      callTime: "",
      location: "",
      notes: "",
      sceneIds: []
    };
    state.shootDays.push(d);
    selectedDayId = d.id;
    touch();
    renderShootDays();
    renderDayEditor();
  }

  function getDay(id){ return state.shootDays.find(d=>d.id===id) || null; }

  function deleteShootDay(){
    if(!selectedDayId) return;
    const d = getDay(selectedDayId);
    if(!d) return;
    if(!confirm(`Borrar día ${d.date || "(sin fecha)"}?`)) return;
    state.shootDays = state.shootDays.filter(x=>x.id!==selectedDayId);
    selectedDayId = state.shootDays[0]?.id || null;
    touch();
    renderShootDays();
    renderDayEditor();
  }

  function renderShootDays(){
    const tbody = el("shootDayTable").querySelector("tbody");
    tbody.innerHTML = "";
    for(const d of state.shootDays){
      const tr = document.createElement("tr");
      tr.className = (d.id === selectedDayId) ? "selected" : "";
      tr.innerHTML = `
        <td>${escapeHtml(d.date||"")}</td>
        <td>${escapeHtml(d.callTime||"")}</td>
        <td>${escapeHtml(d.location||"")}</td>
        <td>${(d.sceneIds||[]).length}</td>
      `;
      tr.addEventListener("click", ()=>{
        selectedDayId = d.id;
        renderShootDays();
        renderDayEditor();
      });
      tbody.appendChild(tr);
    }
  }

  function renderDayEditor(){
    const d = selectedDayId ? getDay(selectedDayId) : null;
    el("selectedDayHint").textContent = d ? `Editando día ${d.date || ""}` : "Seleccioná un día";

    const ids = ["date","call","location","notes"];
    for(const k of ids){
      const node = el(`day_${k}`);
      node.disabled = !d;
      node.value = d ? (k==="call" ? (d.callTime||"") : (d[k]||"")) : "";
    }

    renderDaySceneList();
    renderScenePool();
  }

  function renderDaySceneList(){
    const wrap = el("daySceneList");
    wrap.innerHTML = "";
    const d = selectedDayId ? getDay(selectedDayId) : null;
    if(!d) return;

    const ids = d.sceneIds || [];
    if(!ids.length){
      wrap.innerHTML = `<div class="muted">Todavía no hay escenas asignadas.</div>`;
      return;
    }

    ids.forEach((sid, idx)=>{
      const s = getScene(sid);
      const item = document.createElement("div");
      item.className = "listItem";
      item.innerHTML = `
        <div>
          <div class="title">#${escapeHtml(s?.number||"?")} — ${escapeHtml(s?.slugline||"")}</div>
          <div class="meta">${escapeHtml(s?.location||"")} · ${escapeHtml(s?.timeOfDay||"")}</div>
        </div>
        <div class="row gap">
          <button class="btn" data-act="up">↑</button>
          <button class="btn" data-act="down">↓</button>
          <button class="btn danger" data-act="remove">Quitar</button>
        </div>
      `;
      item.querySelectorAll("button").forEach(b=>{
        b.addEventListener("click", ()=>{
          const act = b.dataset.act;
          if(act==="remove"){
            d.sceneIds = d.sceneIds.filter(x=>x!==sid);
          }else if(act==="up" && idx>0){
            const a = d.sceneIds.slice();
            [a[idx-1], a[idx]] = [a[idx], a[idx-1]];
            d.sceneIds = a;
          }else if(act==="down" && idx<d.sceneIds.length-1){
            const a = d.sceneIds.slice();
            [a[idx+1], a[idx]] = [a[idx], a[idx+1]];
            d.sceneIds = a;
          }
          touch();
          renderDaySceneList();
          renderShootDays();
        });
      });
      wrap.appendChild(item);
    });
  }

  function renderScenePool(){
    const wrap = el("scenePool");
    wrap.innerHTML = "";
    const d = selectedDayId ? getDay(selectedDayId) : null;
    if(!d) return;

    const q = (el("poolSearch").value || "").toLowerCase();
    const used = new Set(d.sceneIds || []);

    const pool = state.scenes.filter(s=>{
      if(used.has(s.id)) return false;
      const hay = `${s.number} ${s.slugline} ${s.location} ${s.summary}`.toLowerCase();
      if(q && !hay.includes(q)) return false;
      return true;
    });

    if(!pool.length){
      wrap.innerHTML = `<div class="muted">No hay escenas disponibles para agregar.</div>`;
      return;
    }

    for(const s of pool){
      const item = document.createElement("div");
      item.className = "listItem";
      item.innerHTML = `
        <div>
          <div class="title">#${escapeHtml(s.number||"")} — ${escapeHtml(s.slugline||"")}</div>
          <div class="meta">${escapeHtml(s.location||"")} · ${escapeHtml(s.timeOfDay||"")}</div>
        </div>
        <div class="row gap">
          <button class="btn primary">+ Agregar</button>
        </div>
      `;
      item.querySelector("button").addEventListener("click", ()=>{
        d.sceneIds = d.sceneIds || [];
        d.sceneIds.push(s.id);
        touch();
        renderDaySceneList();
        renderShootDays();
        renderScenePool();
      });
      wrap.appendChild(item);
    }
  }

  // ---------- Element Library ----------
  function renderLib(){
    const cat = el("libCategory").value;
    const items = state.elementLibrary[cat] || [];
    const wrap = el("libItems");
    const usage = el("libUsage");
    wrap.innerHTML = "";
    usage.innerHTML = "";

    items.forEach(it=>{
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.style.cursor = "pointer";
      chip.innerHTML = `<span>${escapeHtml(it)}</span><button title="Borrar">×</button>`;
      chip.addEventListener("click", (e)=>{
        if(e.target.tagName.toLowerCase()==="button") return;
        selectedLibItem = it;
        renderLibUsage(cat, it);
      });
      chip.querySelector("button").addEventListener("click", ()=>{
        if(!confirm(`Borrar "${it}" de la librería?`)) return;
        state.elementLibrary[cat] = (state.elementLibrary[cat]||[]).filter(x=>x!==it);
        // no borra de escenas (a propósito). Librería ≠ realidad.
        touch();
        renderLib();
      });
      wrap.appendChild(chip);
    });

    if(selectedLibItem && items.includes(selectedLibItem)){
      renderLibUsage(cat, selectedLibItem);
    }
  }

  function renderLibUsage(cat, it){
    const usage = el("libUsage");
    usage.innerHTML = "";
    const hits = state.scenes.filter(s => (s.elements?.[cat]||[]).includes(it));
    if(!hits.length){
      usage.innerHTML = `<div class="muted">No aparece en ninguna escena.</div>`;
      return;
    }
    hits.forEach(s=>{
      const li = document.createElement("div");
      li.className = "listItem";
      li.innerHTML = `
        <div>
          <div class="title">#${escapeHtml(s.number||"")} — ${escapeHtml(s.slugline||"")}</div>
          <div class="meta">${escapeHtml(s.location||"")} · ${escapeHtml(s.timeOfDay||"")}</div>
        </div>
        <div class="row gap">
          <button class="btn">Abrir</button>
        </div>
      `;
      li.querySelector("button").addEventListener("click", ()=>{
        selectedSceneId = s.id;
        showView("breakdown");
        renderScenes();
        renderSceneEditor();
      });
      usage.appendChild(li);
    });
  }

  function addLibItem(){
    const cat = el("libCategory").value;
    const it = (el("libItem").value || "").trim();
    if(!it) return;
    state.elementLibrary[cat] = state.elementLibrary[cat] || [];
    if(!state.elementLibrary[cat].includes(it)){
      state.elementLibrary[cat].push(it);
      state.elementLibrary[cat].sort((a,b)=>a.localeCompare(b));
      el("libItem").value = "";
      touch();
      renderLib();
      toast("Agregado a la librería ✅");
    }else{
      toast("Ya existe en la librería");
    }
  }

  // ---------- Crew ----------
  function addCrew(){
    state.crew.push({ id: window.U.uid("crew"), name:"", role:"", phone:"", email:"", notes:"" });
    touch();
    renderCrew();
  }

  function renderCrew(){
    const tbody = el("crewTable").querySelector("tbody");
    tbody.innerHTML = "";
    state.crew.forEach(c=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="input" value="${escapeAttr(c.name||"")}" /></td>
        <td><input class="input" value="${escapeAttr(c.role||"")}" /></td>
        <td><input class="input" value="${escapeAttr(c.phone||"")}" /></td>
        <td><input class="input" value="${escapeAttr(c.email||"")}" /></td>
        <td><input class="input" value="${escapeAttr(c.notes||"")}" /></td>
        <td><button class="btn danger">Borrar</button></td>
      `;
      const inputs = tr.querySelectorAll("input");
      const keys = ["name","role","phone","email","notes"];
      inputs.forEach((inp, i)=>{
        inp.addEventListener("input", ()=>{
          c[keys[i]] = inp.value;
          touch();
        });
      });
      tr.querySelector("button").addEventListener("click", ()=>{
        if(!confirm("Borrar integrante?")) return;
        state.crew = state.crew.filter(x=>x.id!==c.id);
        touch();
        renderCrew();
      });
      tbody.appendChild(tr);
    });
  }

  // ---------- Schedule ----------
  function addSchedule(){
    state.scheduleItems.push({
      id: window.U.uid("sch"),
      name:"", startDate:"", endDate:"", owner:"", status:"Pendiente", notes:""
    });
    touch();
    renderSchedule();
  }

  function renderSchedule(){
    const tbody = el("scheduleTable").querySelector("tbody");
    tbody.innerHTML = "";
    state.scheduleItems.forEach(it=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="input" value="${escapeAttr(it.name||"")}" /></td>
        <td><input class="input" type="date" value="${escapeAttr(it.startDate||"")}" /></td>
        <td><input class="input" type="date" value="${escapeAttr(it.endDate||"")}" /></td>
        <td><input class="input" value="${escapeAttr(it.owner||"")}" /></td>
        <td>
          <select class="input">
            ${["Pendiente","En curso","Hecho","Bloqueado"].map(s=>`<option ${it.status===s?"selected":""}>${s}</option>`).join("")}
          </select>
        </td>
        <td><input class="input" value="${escapeAttr(it.notes||"")}" /></td>
        <td><button class="btn danger">Borrar</button></td>
      `;
      const [name, start, end, owner, statusSel, notes] = tr.querySelectorAll("input,select");
      name.addEventListener("input", ()=>{ it.name=name.value; touch(); });
      start.addEventListener("input", ()=>{ it.startDate=start.value; touch(); });
      end.addEventListener("input", ()=>{ it.endDate=end.value; touch(); });
      owner.addEventListener("input", ()=>{ it.owner=owner.value; touch(); });
      statusSel.addEventListener("change", ()=>{ it.status=statusSel.value; touch(); });
      notes.addEventListener("input", ()=>{ it.notes=notes.value; touch(); });

      tr.querySelector("button").addEventListener("click", ()=>{
        if(!confirm("Borrar ítem del cronograma?")) return;
        state.scheduleItems = state.scheduleItems.filter(x=>x.id!==it.id);
        touch();
        renderSchedule();
      });

      tbody.appendChild(tr);
    });
  }

  // ---------- Payments ----------
  function addPayment(){
    state.payments.push({
      id: window.U.uid("pay"),
      vendor:"", concept:"", amount:0, dueDate:"", status:"Pendiente", link:"", notes:""
    });
    touch();
    renderPayments();
  }

  function renderPayments(){
    const tbody = el("paymentsTable").querySelector("tbody");
    tbody.innerHTML = "";
    state.payments.forEach(p=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="input" value="${escapeAttr(p.vendor||"")}" /></td>
        <td><input class="input" value="${escapeAttr(p.concept||"")}" /></td>
        <td><input class="input" type="number" step="1" value="${escapeAttr(String(p.amount||0))}" /></td>
        <td><input class="input" type="date" value="${escapeAttr(p.dueDate||"")}" /></td>
        <td>
          <select class="input">
            ${["Pendiente","Pagado","Parcial"].map(s=>`<option ${p.status===s?"selected":""}>${s}</option>`).join("")}
          </select>
        </td>
        <td><input class="input" value="${escapeAttr(p.link||"")}" placeholder="https://..." /></td>
        <td><input class="input" value="${escapeAttr(p.notes||"")}" /></td>
        <td><button class="btn danger">Borrar</button></td>
      `;
      const [vendor, concept, amount, due, statusSel, link, notes] = tr.querySelectorAll("input,select");
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
        touch();
        renderPayments();
      });

      tbody.appendChild(tr);
    });

    renderStats();
  }

  function renderStats(){
    const total = state.payments.reduce((a,p)=>a+Number(p.amount||0),0);
    const paid = state.payments.filter(p=>p.status==="Pagado").reduce((a,p)=>a+Number(p.amount||0),0);
    const pending = total - paid;
    el("statTotal").textContent = window.U.moneyARS(total);
    el("statPaid").textContent = window.U.moneyARS(paid);
    el("statPending").textContent = window.U.moneyARS(pending);
  }

  // ---------- Settings / Sync ----------
  async function doPull(){
    const cfg = StorageLayer.loadCfg();
    if(!cfg.binId || !cfg.accessKey){
      toast("Config JSONBin incompleta");
      showView("settings");
      return;
    }
    try{
      const remote = await StorageLayer.jsonbinGet(cfg.binId, cfg.accessKey);
      if(!remote || !remote.meta){
        toast("JSONBin devolvió algo raro (sin meta)");
        return;
      }

      // resolver conflicto simple por updatedAt
      const localAt = Date.parse(state?.meta?.updatedAt || 0);
      const remoteAt = Date.parse(remote.meta.updatedAt || 0);

      if(remoteAt >= localAt){
        state = remote;
        StorageLayer.saveLocal(state);
        toast("Pull OK ✅ (remoto aplicado)");
      }else{
        toast("Pull OK, pero tu local es más nuevo. No pisé nada.");
      }

      hydrateUI();
      updateSyncPill("JSONBin");
    }catch(err){
      toast(`Pull falló: ${err.message}`);
      updateSyncPill("Local");
    }
  }

  async function doPush(){
    const cfg = StorageLayer.loadCfg();
    if(!cfg.binId || !cfg.accessKey){
      toast("Config JSONBin incompleta");
      showView("settings");
      return;
    }
    try{
      await StorageLayer.jsonbinPut(cfg.binId, cfg.accessKey, state);
      toast("Push OK ✅");
      updateSyncPill("JSONBin");
    }catch(err){
      toast(`Push falló: ${err.message}`);
      updateSyncPill("Local");
    }
  }

  async function testCfg(){
    const cfg = StorageLayer.loadCfg();
    if(!cfg.binId || !cfg.accessKey){
      toast("Completá BIN ID y Access Key");
      return;
    }
    try{
      await StorageLayer.testJsonbin(cfg.binId, cfg.accessKey);
      toast("Conexión OK ✅");
      updateSyncPill("JSONBin");
    }catch(err){
      toast(`No conecta: ${err.message}`);
      updateSyncPill("Local");
    }
  }

  function saveCfgFromUI(){
    const cfg = StorageLayer.loadCfg();
    cfg.binId = (el("cfg_binId").value || "").trim();
    cfg.accessKey = (el("cfg_accessKey").value || "").trim();
    cfg.autosync = el("cfg_autosync").value || "on";
    StorageLayer.saveCfg(cfg);
    toast("Config guardada ✅");
    updateSyncPill(cfg.binId && cfg.accessKey ? "JSONBin" : "Local");
  }

  function setResetKeyFromUI(){
    const a = el("cfg_resetKey").value || "";
    const b = el("cfg_resetKeyConfirm").value || "";
    if(!a || a.length < 4){
      toast("Clave muy corta (mínimo 4)");
      return;
    }
    if(a !== b){
      toast("No coincide la confirmación");
      return;
    }
    StorageLayer.setResetKey(a);
    el("cfg_resetKey").value = "";
    el("cfg_resetKeyConfirm").value = "";
    toast("Clave de reset seteada ✅");
  }

  function doReset(){
    const savedKey = StorageLayer.getResetKey();
    if(!savedKey){
      toast("Primero seteá una clave de reset");
      return;
    }
    const entered = prompt("Ingresá la clave de reset:");
    if(entered !== savedKey){
      toast("Clave incorrecta ❌");
      return;
    }
    if(!confirm("Último aviso: se borra TODO el proyecto local. ¿Seguimos?")) return;

    state = defaultState();
    selectedSceneId = null;
    selectedDayId = null;
    StorageLayer.saveLocal(state);
    hydrateUI();
    toast("Reset hecho. Si querés borrar remoto, hacé Push.");
  }

  // ---------- UI wiring ----------
  function hydrateUI(){
    el("projectTitle").value = state.meta.title || "Proyecto";
    el("savedAtText").textContent = state.meta.updatedAt ? new Date(state.meta.updatedAt).toLocaleString("es-AR") : "—";
    el("statusText").textContent = "Listo";

    // settings fields
    const cfg = StorageLayer.loadCfg();
    el("cfg_binId").value = cfg.binId || "";
    el("cfg_accessKey").value = cfg.accessKey || "";
    el("cfg_autosync").value = cfg.autosync || "on";
    updateSyncPill(cfg.binId && cfg.accessKey ? "JSONBin" : "Local");

    renderScenes();
    renderSceneEditor();
    renderShootDays();
    renderDayEditor();
    renderLib();
    renderCrew();
    renderSchedule();
    renderPayments();
    renderStats();
  }

  function bindEvents(){
    document.querySelectorAll(".navBtn").forEach(b=>{
      b.addEventListener("click", ()=>showView(b.dataset.view));
    });

    el("btnAddScene").addEventListener("click", addScene);
    el("btnDeleteScene").addEventListener("click", deleteScene);
    el("btnDuplicateScene").addEventListener("click", duplicateScene);

    el("sceneSearch").addEventListener("input", renderScenes);
    el("sceneFilterTOD").addEventListener("change", renderScenes);

    ["number","slugline","location","timeOfDay","pages","summary","notes"].forEach(k=>{
      const node = el(`scene_${k}`);
      node.addEventListener("input", ()=>{
        const s = selectedSceneId ? getScene(selectedSceneId) : null;
        if(!s) return;
        if(k === "pages") s[k] = Number(node.value || 0);
        else s[k] = node.value;
        touch();
        renderScenes();
      });
      node.addEventListener("change", ()=>{
        const s = selectedSceneId ? getScene(selectedSceneId) : null;
        if(!s) return;
        if(k === "pages") s[k] = Number(node.value || 0);
        else s[k] = node.value;
        touch();
        renderScenes();
      });
    });

    el("btnAddSceneElement").addEventListener("click", addSceneElement);
    el("elItem").addEventListener("keydown", (e)=>{
      if(e.key==="Enter"){ e.preventDefault(); addSceneElement(); }
    });

    el("btnImportScenes").addEventListener("click", importScenes);
    el("btnClearImport").addEventListener("click", ()=>{ el("sceneImportText").value=""; });

    el("btnAddShootDay").addEventListener("click", addShootDay);
    el("btnDeleteShootDay").addEventListener("click", deleteShootDay);

    el("poolSearch").addEventListener("input", renderScenePool);

    el("day_date").addEventListener("input", ()=>{
      const d = selectedDayId ? getDay(selectedDayId) : null; if(!d) return;
      d.date = el("day_date").value; touch(); renderShootDays();
    });
    el("day_call").addEventListener("input", ()=>{
      const d = selectedDayId ? getDay(selectedDayId) : null; if(!d) return;
      d.callTime = el("day_call").value; touch(); renderShootDays();
    });
    el("day_location").addEventListener("input", ()=>{
      const d = selectedDayId ? getDay(selectedDayId) : null; if(!d) return;
      d.location = el("day_location").value; touch(); renderShootDays();
    });
    el("day_notes").addEventListener("input", ()=>{
      const d = selectedDayId ? getDay(selectedDayId) : null; if(!d) return;
      d.notes = el("day_notes").value; touch();
    });

    el("libCategory").addEventListener("change", ()=>{ selectedLibItem=null; renderLib(); });
    el("btnAddLibItem").addEventListener("click", addLibItem);
    el("libItem").addEventListener("keydown", (e)=>{
      if(e.key==="Enter"){ e.preventDefault(); addLibItem(); }
    });

    el("btnAddCrew").addEventListener("click", addCrew);
    el("btnAddSchedule").addEventListener("click", addSchedule);
    el("btnAddPayment").addEventListener("click", addPayment);

    el("projectTitle").addEventListener("input", ()=>{
      state.meta.title = el("projectTitle").value || "Proyecto";
      touch();
    });

    // Sync topbar
    el("btnPull").addEventListener("click", doPull);
    el("btnPush").addEventListener("click", doPush);

    // Settings
    el("btnSaveCfg").addEventListener("click", saveCfgFromUI);
    el("btnTestCfg").addEventListener("click", testCfg);
    el("btnSetResetKey").addEventListener("click", setResetKeyFromUI);
    el("btnReset").addEventListener("click", doReset);
  }

  function escapeHtml(s){
    return String(s||"")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
  function escapeAttr(s){ return escapeHtml(s).replaceAll("\n"," "); }

  function catLabel(cat){
    const map = {
      cast:"Cast", props:"Props", wardrobe:"Vestuario", makeup:"Maquillaje",
      sfx:"SFX", vfx:"VFX", vehicles:"Vehículos", animals:"Animales",
      extras:"Extras", art:"Arte", sound:"Sonido"
    };
    return map[cat] || cat;
  }

  function init(){
    const local = StorageLayer.loadLocal();
    state = local && local.meta ? local : defaultState();

    if(!state.scenes.length){
      // arranque con una escena y un día para que no parezca un desierto (salvo que sea el brief)
      state.scenes.push({
        id: window.U.uid("scene"),
        number: "1",
        slugline: "INT. — (completá)",
        location: "",
        timeOfDay: "",
        pages: 1,
        summary: "",
        notes: "",
        elements: {
          cast: [], props: [], wardrobe: [], makeup: [], sfx: [], vfx: [],
          vehicles: [], animals: [], extras: [], art: [], sound: []
        }
      });
      selectedSceneId = state.scenes[0].id;
      state.shootDays.push({ id: window.U.uid("day"), date:"", callTime:"", location:"", notes:"", sceneIds:[] });
      selectedDayId = state.shootDays[0].id;
      touch();
    }else{
      selectedSceneId = state.scenes[0]?.id || null;
      selectedDayId = state.shootDays[0]?.id || null;
    }

    bindEvents();
    hydrateUI();
    showView("breakdown");
  }

  window.addEventListener("DOMContentLoaded", init);
})();
