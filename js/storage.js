window.StorageLayer = (function(){
  const KEY_ACTIVE_PROJECT = "gb_active_project_v2";
  const KEY_PROJECTS = "gb_projects_v2";
  const KEY_STATE_PREFIX = "gb_prod_state_v2__";
  const KEY_CFG = "gb_prod_cfg_v2";
  const KEY_REMOTE_STAMP_PREFIX = "gb_remote_stamp_v2__";
  const KEY_AUTOSYNC_PREF = "gb_autosync_pref_v2";

  const LEGACY_STATE_PREFIX = "gb_prod_state_v1__";
  const DEFAULT_EDIT_PASSWORD = "1812";
  const DEFAULT_COLLECTION = "production_projects";
  const SCRIPT_SUFFIX = "__script";
  const SDK_VERSION = "10.12.5";

  const LEGACY_PROJECTS = [
    { id:"casona", name:"LA CASONA", binId:"6945d8e2ae596e708fa5c4d9", scriptBinId:"69605c5dae596e708fcee467", theme:"default", editPassword:"1812" },
    { id:"jyp", name:"JUBILADA Y PELIGROSA", binId:"694b0c25ae596e708fad1e75", scriptBinId:"69605cc5ae596e708fcee544", theme:"pink", editPassword:"3232" }
  ];

  let projectsCache = null;
  let initPromise = null;
  let firebaseReady = false;
  let firebaseError = "";
  let fb = null;

  function nowIso(){ return new Date().toISOString(); }
  function safeJsonClone(v){ return JSON.parse(JSON.stringify(v || {})); }

  function hasFirebaseConfig(){
    const cfg = window.GB_FIREBASE_CONFIG;
    return !!(cfg && cfg.apiKey && cfg.projectId && cfg.appId);
  }

  function firebaseCollectionName(){
    return String(window.GB_FIREBASE_COLLECTION || DEFAULT_COLLECTION).trim() || DEFAULT_COLLECTION;
  }

  function projectDocPath(projectId, part){
    return { collectionName: firebaseCollectionName(), projectId: String(projectId||""), part: part || "core" };
  }

  function slugifyProjectId(name){
    const base = String(name || "proyecto")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 42) || "proyecto";
    const rand = Math.random().toString(36).slice(2, 7);
    return `${base}-${Date.now().toString(36)}-${rand}`;
  }

  function normalizeProject(raw){
    const p = raw || {};
    const id = String(p.id || p.projectId || p.binId || "").trim();
    const name = String(p.name || p.title || "Proyecto").trim() || "Proyecto";
    return {
      id,
      name,
      theme: String(p.theme || "default"),
      editPassword: String(p.editPassword || DEFAULT_EDIT_PASSWORD),
      createdAt: String(p.createdAt || nowIso()),
      updatedAt: String(p.updatedAt || p.clientUpdatedAt || p.createdAt || nowIso()),
      remote: !!p.remote,
      localOnly: !!p.localOnly,
      legacyBinId: p.legacyBinId || p.binId || "",
      legacyScriptBinId: p.legacyScriptBinId || p.scriptBinId || ""
    };
  }

  function projectForCfg(p){
    return {
      id: p.id,
      name: p.name,
      theme: p.theme || "default",
      binId: p.id,
      scriptBinId: `${p.id}${SCRIPT_SUFFIX}`,
      remote: !!p.remote,
      localOnly: !!p.localOnly
    };
  }

  function readStoredProjects(){
    try{
      const raw = localStorage.getItem(KEY_PROJECTS);
      const arr = raw ? JSON.parse(raw) : [];
      if(Array.isArray(arr)){
        return arr.map(normalizeProject).filter(p=>p.id);
      }
    }catch(_e){}
    return [];
  }

  function legacyProjectsWithLocalData(){
    const out = [];
    for(const p of LEGACY_PROJECTS){
      try{
        const raw = localStorage.getItem(LEGACY_STATE_PREFIX + p.binId);
        if(!raw) continue;
        out.push(normalizeProject({
          id: p.id,
          name: p.name,
          theme: p.theme,
          editPassword: p.editPassword,
          legacyBinId: p.binId,
          legacyScriptBinId: p.scriptBinId,
          localOnly: true
        }));
      }catch(_e){}
    }
    return out;
  }

  function defaultLocalProject(){
    return normalizeProject({
      id: "local-default",
      name: "Proyecto nuevo",
      theme: "default",
      editPassword: DEFAULT_EDIT_PASSWORD,
      localOnly: true
    });
  }

  function persistProjects(projects){
    const clean = (projects || [])
      .map(normalizeProject)
      .filter(p=>p.id)
      .map(p=>({
        id: p.id,
        name: p.name,
        theme: p.theme,
        editPassword: p.editPassword,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        remote: !!p.remote,
        localOnly: !!p.localOnly,
        legacyBinId: p.legacyBinId || "",
        legacyScriptBinId: p.legacyScriptBinId || ""
      }));
    try{ localStorage.setItem(KEY_PROJECTS, JSON.stringify(clean)); }catch(_e){}
  }

  function loadLocalProjects(){
    const stored = readStoredProjects();
    if(stored.length) return stored;
    const legacy = legacyProjectsWithLocalData();
    if(legacy.length){
      persistProjects(legacy);
      return legacy;
    }
    return [defaultLocalProject()];
  }

  function ensureProjects(){
    if(!projectsCache || !projectsCache.length) projectsCache = loadLocalProjects();
    return projectsCache;
  }

  function upsertProjectLocal(project){
    const p = normalizeProject(project);
    if(!p.id) return null;
    const list = ensureProjects().filter(x=>x.id !== p.id);
    projectsCache = [...list, p].sort(sortProjects);
    persistProjects(projectsCache);
    return p;
  }

  function sortProjects(a,b){
    const ta = Date.parse(a.updatedAt || a.createdAt || "") || 0;
    const tb = Date.parse(b.updatedAt || b.createdAt || "") || 0;
    if(tb !== ta) return tb - ta;
    return String(a.name||"").localeCompare(String(b.name||""), "es");
  }

  function getActiveProjectId(){
    const projects = ensureProjects();
    try{
      const raw = localStorage.getItem(KEY_ACTIVE_PROJECT);
      if(raw && projects.some(p=>p.id === raw)) return raw;
    }catch(_e){}
    const first = projects[0]?.id || defaultLocalProject().id;
    try{ localStorage.setItem(KEY_ACTIVE_PROJECT, first); }catch(_e){}
    return first;
  }

  function setActiveProjectId(id){
    const projects = ensureProjects();
    if(!projects.some(p=>p.id === id)) return false;
    try{ localStorage.setItem(KEY_ACTIVE_PROJECT, id); }catch(_e){}
    saveCfg({});
    return true;
  }

  function getActiveProject(){
    const id = getActiveProjectId();
    return ensureProjects().find(p=>p.id === id) || ensureProjects()[0] || defaultLocalProject();
  }

  function getProjects(){
    return ensureProjects().map(projectForCfg);
  }

  function getEditPassword(){
    const p = getActiveProject();
    return String(p && p.editPassword ? p.editPassword : DEFAULT_EDIT_PASSWORD);
  }

  function keyState(projectId){
    const p = projectId ? ensureProjects().find(x=>x.id === projectId) : getActiveProject();
    return KEY_STATE_PREFIX + String(p?.id || "local-default");
  }

  function legacyStateKeyForProject(projectId){
    const p = ensureProjects().find(x=>x.id === projectId) || getActiveProject();
    if(p?.legacyBinId) return LEGACY_STATE_PREFIX + p.legacyBinId;
    const legacy = LEGACY_PROJECTS.find(x=>x.id === p?.id);
    return legacy ? LEGACY_STATE_PREFIX + legacy.binId : "";
  }

  function loadLocal(){
    try{
      const raw = localStorage.getItem(keyState());
      if(raw) return JSON.parse(raw);
    }catch(_e){}

    try{
      const legacyKey = legacyStateKeyForProject(getActiveProjectId());
      const legacyRaw = legacyKey ? localStorage.getItem(legacyKey) : "";
      if(legacyRaw){
        const parsed = JSON.parse(legacyRaw);
        saveLocal(parsed);
        return parsed;
      }
    }catch(_e){}

    return null;
  }

  function saveLocal(state){
    try{
      localStorage.setItem(keyState(), JSON.stringify(state));
    }catch(_e){}

    try{
      const title = String(state?.meta?.title || "").trim();
      if(title) updateActiveProjectMeta({ name: title, updatedAt: state?.meta?.updatedAt || nowIso() });
    }catch(_e){}
  }

  function loadCfg(){
    const p = getActiveProject();
    const remoteEnabled = firebaseReady && !!p.remote;
    const safe = {
      backend: remoteEnabled ? "firebase" : "local",
      backendLabel: remoteEnabled ? "Firebase" : "Local",
      syncLabel: remoteEnabled ? "Firebase" : "Local",
      projectId: p.id,
      projectName: p.name,
      theme: p.theme || "default",
      binId: p.id,
      scriptBinId: remoteEnabled ? `${p.id}${SCRIPT_SUFFIX}` : "",
      accessKey: remoteEnabled ? "firebase" : "",
      autosync: getAutosyncPref(),
      firebaseReady,
      firebaseError,
      projects: getProjects()
    };
    try{ localStorage.setItem(KEY_CFG, JSON.stringify(safe)); }catch(_e){}
    return safe;
  }

  function saveCfg(cfg){
    if(cfg && typeof cfg === "object"){
      if(typeof cfg.projectId === "string") setActiveProjectId(cfg.projectId);
      if(typeof cfg.autosync === "string") setAutosyncPref(cfg.autosync);
    }
    loadCfg();
  }

  function getAutosyncPref(){
    try{
      const v = (localStorage.getItem(KEY_AUTOSYNC_PREF) || "on").trim().toLowerCase();
      return (v === "off" || v === "0" || v === "false") ? "off" : "on";
    }catch(_e){ return "on"; }
  }

  function setAutosyncPref(v){
    try{
      const norm = String(v||"").trim().toLowerCase();
      localStorage.setItem(KEY_AUTOSYNC_PREF, (norm === "off" || norm === "0" || norm === "false") ? "off" : "on");
    }catch(_e){}
  }

  function keyRemoteStamp(id){
    return KEY_REMOTE_STAMP_PREFIX + String(id||"");
  }

  function getRemoteStamp(id){
    try{ return localStorage.getItem(keyRemoteStamp(id)) || ""; }catch(_e){ return ""; }
  }

  function setRemoteStamp(id, stamp){
    try{ localStorage.setItem(keyRemoteStamp(id), String(stamp||"")); }catch(_e){}
  }

  function hardResetLocal(){
    try{ localStorage.removeItem(keyState()); }catch(_e){}
  }

  function parseRemoteId(id){
    const raw = String(id || getActiveProjectId());
    if(raw.endsWith(SCRIPT_SUFFIX)){
      return { projectId: raw.slice(0, -SCRIPT_SUFFIX.length), part: "script" };
    }
    return { projectId: raw, part: "core" };
  }

  async function initFirebase(){
    if(!hasFirebaseConfig()){
      firebaseReady = false;
      firebaseError = "Falta js/firebase-config.js";
      return false;
    }

    try{
      const [appMod, storeMod] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`)
      ]);

      let authMod = null;
      if(window.GB_FIREBASE_OPTIONS && window.GB_FIREBASE_OPTIONS.useAnonymousAuth){
        authMod = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`);
      }

      const app = appMod.initializeApp(window.GB_FIREBASE_CONFIG);
      const db = storeMod.getFirestore(app);

      if(authMod){
        try{
          const auth = authMod.getAuth(app);
          await authMod.signInAnonymously(auth);
        }catch(authErr){
          console.warn("Firebase anonymous auth failed", authErr);
        }
      }

      fb = { appMod, storeMod, authMod, app, db };
      firebaseReady = true;
      firebaseError = "";
      return true;
    }catch(err){
      console.error("Firebase init failed", err);
      firebaseReady = false;
      firebaseError = String(err?.message || err || "Firebase init failed");
      return false;
    }
  }

  function firestoreProjectFromSnapshot(snap){
    const data = snap.data() || {};
    const ts = data.clientUpdatedAt || data.updatedAt;
    let updatedAt = nowIso();
    try{
      if(ts && typeof ts.toDate === "function") updatedAt = ts.toDate().toISOString();
      else if(ts && typeof ts.toMillis === "function") updatedAt = new Date(ts.toMillis()).toISOString();
      else if(typeof ts === "string") updatedAt = ts;
    }catch(_e){}
    return normalizeProject({
      id: snap.id,
      name: data.name || data.title || snap.id,
      theme: data.theme || "default",
      editPassword: data.editPassword || DEFAULT_EDIT_PASSWORD,
      createdAt: data.createdAt || updatedAt,
      updatedAt,
      remote: true,
      localOnly: false
    });
  }

  async function refreshProjects(){
    const local = loadLocalProjects();
    if(!firebaseReady || !fb){
      projectsCache = local;
      return projectsCache;
    }

    try{
      const s = fb.storeMod;
      const ref = s.collection(fb.db, firebaseCollectionName());
      const qs = await s.getDocs(ref);
      const remote = [];
      qs.forEach(docSnap=>{
        const data = docSnap.data() || {};
        if(data.archived === true) return;
        remote.push(firestoreProjectFromSnapshot(docSnap));
      });

      if(remote.length){
        projectsCache = remote.sort(sortProjects);
        persistProjects(projectsCache);
      }else{
        projectsCache = local;
      }
    }catch(err){
      console.warn("Could not list Firebase projects", err);
      firebaseError = String(err?.message || err || "");
      projectsCache = local;
    }

    const active = getActiveProjectId();
    if(!projectsCache.some(p=>p.id === active)){
      try{ localStorage.setItem(KEY_ACTIVE_PROJECT, projectsCache[0]?.id || defaultLocalProject().id); }catch(_e){}
    }
    return projectsCache;
  }

  async function init(){
    if(initPromise) return initPromise;
    initPromise = (async ()=>{
      projectsCache = loadLocalProjects();
      await initFirebase();
      await refreshProjects();
      getActiveProjectId();
      loadCfg();
      return loadCfg();
    })();
    return initPromise;
  }

  async function jsonbinGet(id){
    if(!firebaseReady || !fb) throw new Error("Firebase no configurado");
    const parsed = parseRemoteId(id);
    const path = projectDocPath(parsed.projectId, parsed.part);
    const s = fb.storeMod;
    const ref = s.doc(fb.db, path.collectionName, path.projectId, "data", path.part);
    const snap = await s.getDoc(ref);
    if(!snap.exists()) return null;
    const data = snap.data() || {};
    return data.payload || null;
  }

  async function jsonbinPut(id, _accessKey, record){
    if(!firebaseReady || !fb) throw new Error("Firebase no configurado");
    const parsed = parseRemoteId(id);
    const path = projectDocPath(parsed.projectId, parsed.part);
    const s = fb.storeMod;
    const clean = safeJsonClone(record);
    const clientUpdatedAt = String(clean?.meta?.updatedAt || nowIso());

    const dataRef = s.doc(fb.db, path.collectionName, path.projectId, "data", path.part);
    await s.setDoc(dataRef, {
      payload: clean,
      clientUpdatedAt,
      updatedAt: s.serverTimestamp()
    });

    const projectRef = s.doc(fb.db, path.collectionName, path.projectId);
    const active = ensureProjects().find(p=>p.id === path.projectId);
    const nextName = String(clean?.meta?.title || active?.name || "Proyecto").trim() || "Proyecto";
    await s.setDoc(projectRef, {
      name: nextName,
      theme: active?.theme || "default",
      editPassword: active?.editPassword || DEFAULT_EDIT_PASSWORD,
      clientUpdatedAt,
      updatedAt: s.serverTimestamp(),
      createdAt: active?.createdAt || clientUpdatedAt,
      archived: false
    }, { merge:true });

    upsertProjectLocal({
      ...(active || {}),
      id: path.projectId,
      name: nextName,
      updatedAt: clientUpdatedAt,
      remote: true,
      localOnly: false
    });

    return { ok:true, record: clean };
  }

  async function createProject(input){
    const opts = (typeof input === "string") ? { name: input } : (input || {});
    const name = String(opts.name || "").trim();
    if(!name) throw new Error("El proyecto necesita nombre");

    const project = normalizeProject({
      id: opts.id || slugifyProjectId(name),
      name,
      theme: opts.theme || "default",
      editPassword: opts.editPassword || DEFAULT_EDIT_PASSWORD,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      remote: firebaseReady,
      localOnly: !firebaseReady
    });

    upsertProjectLocal(project);

    if(firebaseReady && fb){
      const s = fb.storeMod;
      const ref = s.doc(fb.db, firebaseCollectionName(), project.id);
      await s.setDoc(ref, {
        name: project.name,
        theme: project.theme,
        editPassword: project.editPassword,
        clientUpdatedAt: project.updatedAt,
        createdAt: project.createdAt,
        updatedAt: s.serverTimestamp(),
        archived: false
      }, { merge:true });
    }

    setActiveProjectId(project.id);
    return projectForCfg(project);
  }

  function updateActiveProjectMeta(meta){
    const p = getActiveProject();
    const next = normalizeProject({
      ...p,
      name: meta?.name || p.name,
      theme: meta?.theme || p.theme,
      updatedAt: meta?.updatedAt || p.updatedAt || nowIso()
    });
    upsertProjectLocal(next);
    return projectForCfg(next);
  }

  return {
    init,
    refreshProjects,
    createProject,
    updateActiveProjectMeta,
    loadLocal,
    saveLocal,
    loadCfg,
    saveCfg,
    jsonbinGet,
    jsonbinPut,
    getRemoteStamp,
    setRemoteStamp,
    hardResetLocal,
    getProjects,
    getActiveProjectId,
    setActiveProjectId,
    getActiveProject,
    getEditPassword
  };
})();
