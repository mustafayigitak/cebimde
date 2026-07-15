(() => {
  "use strict";

  const STORAGE_KEY = "kelimem_data_v1";
  const SESSION_SIZE = 20;
  const DUE_SESSION_SIZE = 30;
  // Leitner-box style spaced repetition intervals (days), indexed by box 0..6.
  // Expanding spacing (1,2,4,7,14,30,90) follows the spacing-effect research
  // (Cepeda et al.) — each successful recall pushes the word further out.
  const INTERVALS = [1, 2, 4, 7, 14, 30, 90];

  const LEVELS = [
    { id: "a1", name: "A1", desc: "Başlangıç", c1: "#34C759", c2: "#30D158" },
    { id: "a2", name: "A2", desc: "Temel", c1: "#00BFA6", c2: "#2DE6C9" },
    { id: "b1", name: "B1", desc: "Orta", c1: "#007AFF", c2: "#409CFF" },
    { id: "b2", name: "B2", desc: "Orta-Üstü", c1: "#5B5FEF", c2: "#7B7FFF" },
    { id: "c1", name: "C1", desc: "İleri", c1: "#AF52DE", c2: "#C77DFF" },
  ];
  const MIXED_LEVEL = { id: "mixed", name: "Karışık", desc: "Tüm seviyeler birlikte", c1: "#FF9F0A", c2: "#FFB340" };

  const POS_LABELS = {
    n: "isim", v: "fiil", adj: "sıfat", adv: "zarf", prep: "edat",
    pron: "zamir", conj: "bağlaç", art: "tanımlık", interj: "ünlem",
    num: "sayı", det: "belirteç", phr: "deyim",
  };

  function getLevelData(id) {
    return window["OXFORD_" + id.toUpperCase()] || [];
  }

  function todayISO() { return isoDate(new Date()); }
  function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function addDays(iso, n) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return isoDate(d);
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function primaryMeaning(t) {
    return t.split(",")[0].split("/")[0].trim();
  }
  function posLabel(p) { return POS_LABELS[p] || ""; }
  function levelMeta(id) { return LEVELS.find((l) => l.id === id) || MIXED_LEVEL; }

  // Word identity for progress tracking must be stable across word-list edits/reorders,
  // so we key by the word's own text rather than its array index (indices shift whenever
  // the list is re-sorted or new entries are inserted, silently corrupting old progress).
  const WORD_INDEX = {};
  function buildWordIndex() {
    LEVELS.forEach((l) => {
      const map = new Map();
      getLevelData(l.id).forEach((w) => { if (!map.has(w.w)) map.set(w.w, w); });
      WORD_INDEX[l.id] = map;
    });
  }
  function wordByText(level, word) {
    const map = WORD_INDEX[level];
    return map ? map.get(word) : undefined;
  }
  function makeKey(level, word, dir) { return `${level}::${word}|${dir}`; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- state ----------
  let state = loadState();
  function loadState() {
    let s;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      s = raw ? JSON.parse(raw) : {};
    } catch (e) {
      s = {};
    }
    if (!s.progress) s.progress = {};
    // One-time migration: progress used to be keyed by array index ("b2_47|en_tr"),
    // which breaks silently whenever the word list is reordered or extended (index 47
    // now points at a different word). Keys are now word-text based ("b2::advocate|en_tr").
    // Legacy index-based entries can no longer be trusted to refer to the right word, so
    // they're dropped rather than migrated.
    const cleanProgress = {};
    for (const k in s.progress) {
      if (/\|(en_tr|tr_en)$/.test(k) && k.indexOf("::") !== -1) cleanProgress[k] = s.progress[k];
    }
    s.progress = cleanProgress;
    if (!s.streak) s.streak = { count: 0, last: null };
    if (!s.settings) s.settings = { theme: "system", tts: true };
    if (s.settings.tts === undefined) s.settings.tts = true;
    return s;
  }
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function parseKey(key) {
    const [wordPart, dir] = key.split("|");
    const sep = wordPart.indexOf("::");
    const level = wordPart.slice(0, sep);
    const word = wordPart.slice(sep + 2);
    return { level, word, dir };
  }

  function updateProgress(level, word, dir, correct) {
    const key = makeKey(level, word, dir);
    const p = state.progress[key] || { box: -1, due: todayISO(), wrong: false };
    if (correct) {
      p.box = Math.min(p.box + 1, INTERVALS.length - 1);
      p.due = addDays(todayISO(), INTERVALS[p.box]);
      p.wrong = false;
    } else {
      p.box = 0;
      p.due = addDays(todayISO(), 1);
      p.wrong = true;
    }
    state.progress[key] = p;
    bumpStreak();
    saveState();
  }

  function markKnownDirect(key) {
    const p = state.progress[key];
    if (!p) return;
    p.wrong = false;
    p.box = Math.max(p.box, 1);
    p.due = addDays(todayISO(), 3);
    saveState();
  }

  function bumpStreak() {
    const t = todayISO();
    if (state.streak.last === t) return;
    const yesterday = addDays(t, -1);
    state.streak.count = state.streak.last === yesterday ? state.streak.count + 1 : 1;
    state.streak.last = t;
  }

  function levelLearnedCount(levelId) {
    const data = getLevelData(levelId);
    let n = 0;
    for (let i = 0; i < data.length; i++) {
      const e1 = state.progress[makeKey(levelId, data[i].w, "en_tr")];
      const e2 = state.progress[makeKey(levelId, data[i].w, "tr_en")];
      if ((e1 && !e1.wrong) || (e2 && !e2.wrong)) n++;
    }
    return n;
  }
  function dueCount() {
    const t = todayISO();
    let n = 0;
    for (const k in state.progress) if (state.progress[k].due <= t) n++;
    return n;
  }
  function wrongCount() {
    let n = 0;
    for (const k in state.progress) if (state.progress[k].wrong) n++;
    return n;
  }

  // ---------- pools ----------
  let ALL_POOL = [];
  function buildPool(levelId) {
    if (levelId === "mixed") {
      let pool = [];
      LEVELS.forEach((l) => {
        getLevelData(l.id).forEach((w) => pool.push({ level: l.id, word: w.w }));
      });
      return pool;
    }
    return getLevelData(levelId).map((w) => ({ level: levelId, word: w.w }));
  }

  function sessionPool(levelId, dir) {
    const pool = buildPool(levelId);
    const t = todayISO();
    let filtered = pool.filter((item) => {
      const key = makeKey(item.level, item.word, dir);
      const p = state.progress[key];
      if (!p) return true;
      if (p.wrong) return false;
      return p.due <= t;
    });
    if (filtered.length === 0) filtered = pool;
    return shuffle(filtered).slice(0, SESSION_SIZE);
  }

  function buildOptions(contextPool, correctText, dir) {
    const texts = new Set([correctText]);
    const options = [correctText];
    const tryPools = [contextPool, ALL_POOL];
    for (const pool of tryPools) {
      if (options.length >= 4) break;
      const shuffled = shuffle(pool);
      for (const c of shuffled) {
        if (options.length >= 4) break;
        const w = wordByText(c.level, c.word);
        if (!w) continue;
        const text = dir === "en_tr" ? primaryMeaning(w.t) : w.w;
        if (!texts.has(text)) {
          texts.add(text);
          options.push(text);
        }
      }
    }
    return shuffle(options);
  }

  // ---------- navigation ----------
  const TAB_VIEWS = ["view-home", "view-study-levels", "view-test-levels", "view-review"];
  const appEl = document.getElementById("app");
  let lastTabView = "view-home";

  function showView(id) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    appEl.classList.toggle("hide-tabbar", !TAB_VIEWS.includes(id));
  }
  function goTab(tab) {
    const id = "view-" + tab;
    lastTabView = id;
    showView(id);
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    if (tab === "home") renderHome();
    if (tab === "review") renderReview();
    if (tab === "study-levels") renderLevelGrid("study");
    if (tab === "test-levels") renderLevelGrid("test");
  }

  // ---------- toast ----------
  const toastEl = document.getElementById("toast");
  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
  }

  // ---------- sheet ----------
  const sheetOverlay = document.getElementById("sheetOverlay");
  const sheetEl = document.getElementById("sheet");
  function openSheet(innerHTML, onMount) {
    sheetEl.innerHTML = `<div class="sheet-handle"></div>${innerHTML}`;
    sheetOverlay.classList.add("open");
    if (onMount) onMount(sheetEl);
  }
  function closeSheet() { sheetOverlay.classList.remove("open"); }
  sheetOverlay.addEventListener("click", (e) => { if (e.target === sheetOverlay) closeSheet(); });

  // ---------- theme ----------
  function applyTheme() {
    const t = state.settings.theme;
    if (!t || t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }

  function openSettingsSheet() {
    const theme = state.settings.theme || "system";
    const tts = state.settings.tts !== false;
    openSheet(
      `
      <div class="sheet-title">Ayarlar</div>
      <div class="field-group">
        <span class="field-label">Görünüm</span>
        <div class="chip-row" id="themeChips">
          <button class="chip ${theme === "system" ? "selected" : ""}" data-theme="system">Sistem</button>
          <button class="chip ${theme === "light" ? "selected" : ""}" data-theme="light">Açık</button>
          <button class="chip ${theme === "dark" ? "selected" : ""}" data-theme="dark">Koyu</button>
        </div>
      </div>
      <div class="field-group">
        <span class="field-label">Telaffuz Sesi</span>
        <div class="chip-row" id="ttsChips">
          <button class="chip ${tts ? "selected" : ""}" data-tts="on">Açık</button>
          <button class="chip ${!tts ? "selected" : ""}" data-tts="off">Kapalı</button>
        </div>
      </div>
      <div class="settings-group" style="margin-top:22px">
        <button class="settings-row as-button" id="exportBtn">
          <div><div class="settings-label">Verileri Dışa Aktar</div><div class="settings-sub">JSON yedek dosyası indir</div></div>
        </button>
        <button class="settings-row as-button" id="importBtn">
          <div><div class="settings-label">Verileri İçe Aktar</div><div class="settings-sub">Yedek dosyasından geri yükle</div></div>
        </button>
        <input type="file" id="importFile" accept="application/json" hidden />
      </div>
      <button class="text-btn danger" id="resetProgressBtn">İlerlemeyi Sıfırla</button>
      `,
      (root) => {
        root.querySelectorAll("#themeChips .chip").forEach((b) => {
          b.onclick = () => { state.settings.theme = b.dataset.theme; applyTheme(); saveState(); openSettingsSheet(); };
        });
        root.querySelectorAll("#ttsChips .chip").forEach((b) => {
          b.onclick = () => { state.settings.tts = b.dataset.tts === "on"; saveState(); openSettingsSheet(); };
        });
        root.querySelector("#exportBtn").onclick = exportData;
        root.querySelector("#importBtn").onclick = () => root.querySelector("#importFile").click();
        root.querySelector("#importFile").addEventListener("change", (e) => {
          if (e.target.files[0]) importDataFromFile(e.target.files[0]);
        });
        root.querySelector("#resetProgressBtn").onclick = () => {
          if (confirm("Tüm ilerleme silinsin mi? Bu işlem geri alınamaz.")) {
            state.progress = {};
            state.streak = { count: 0, last: null };
            saveState();
            closeSheet();
            renderHome();
            renderReview();
            renderLevelGrid("study");
            renderLevelGrid("test");
            showToast("İlerleme sıfırlandı");
          }
        };
      }
    );
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kelimem-yedek-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function importDataFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (e) {
        showToast("Dosya okunamadı, geçerli bir yedek değil");
        return;
      }
      if (!parsed || typeof parsed.progress !== "object" || parsed.progress === null) {
        showToast("Dosya formatı tanınmadı");
        return;
      }
      if (!confirm("Mevcut tüm ilerlemenin yerine bu yedek yüklenecek. Emin misin?")) return;
      state = {
        progress: parsed.progress,
        streak: parsed.streak && typeof parsed.streak === "object" ? parsed.streak : { count: 0, last: null },
        settings: parsed.settings && typeof parsed.settings === "object" ? parsed.settings : { theme: "system", tts: true },
      };
      if (state.settings.tts === undefined) state.settings.tts = true;
      if (!state.settings.theme) state.settings.theme = "system";
      saveState();
      applyTheme();
      closeSheet();
      renderHome();
      renderReview();
      renderLevelGrid("study");
      renderLevelGrid("test");
      showToast("Veriler geri yüklendi");
    };
    reader.readAsText(file);
  }
  document.getElementById("settingsBtn").addEventListener("click", openSettingsSheet);

  // ---------- home ----------
  function renderHome() {
    const due = dueCount();
    document.getElementById("hDueCount").textContent = String(due);
    document.getElementById("hDueSub").textContent = due > 0 ? "Şimdi tekrar edersen daha kalıcı öğrenirsin" : "Harika, bugün tekrar yok";
    document.getElementById("hStreak").textContent = `🔥 ${state.streak.count || 0}`;

    let learned = 0, total = 0;
    LEVELS.forEach((l) => { learned += levelLearnedCount(l.id); total += getLevelData(l.id).length; });
    document.getElementById("hLearnedTotal").textContent = `${learned} / ${total}`;
    document.getElementById("hLearnedFill").style.width = total ? `${(learned / total) * 100}%` : "0%";

    const grid = document.getElementById("hLevelGrid");
    grid.innerHTML = LEVELS.map((l) => {
      const t = getLevelData(l.id).length;
      const n = levelLearnedCount(l.id);
      const pct = t ? Math.round((n / t) * 100) : 0;
      return `<div class="level-mini-tile"><span class="level-mini-badge" style="color:${l.c1}">${l.name}</span><div class="level-mini-track"><div class="level-mini-fill" style="width:${pct}%;background:${l.c1}"></div></div></div>`;
    }).join("");

    document.getElementById("hWrongCount").textContent = `${wrongCount()} kelime`;
  }
  document.getElementById("qaStudy").addEventListener("click", () => goTab("study-levels"));
  document.getElementById("qaTest").addEventListener("click", () => goTab("test-levels"));
  document.getElementById("qaMixed").addEventListener("click", () => {
    flow.mode = "test";
    flow.level = "mixed";
    openDirectionView();
  });
  document.getElementById("hWrongCard").addEventListener("click", () => goTab("review"));
  document.getElementById("hReviewBtn").addEventListener("click", goToDueReview);

  function goToDueReview() {
    const t = todayISO();
    const items = Object.keys(state.progress)
      .filter((k) => state.progress[k].due <= t)
      .map(parseKey);
    if (items.length === 0) { showToast("Bugün tekrar edilecek kelime yok"); return; }
    startCustomSession(shuffle(items).slice(0, DUE_SESSION_SIZE), "test");
  }

  // ---------- level grids ----------
  function renderLevelGrid(kind) {
    const gridEl = document.getElementById(kind === "study" ? "studyLevelGrid" : "testLevelGrid");
    const all = LEVELS.concat([MIXED_LEVEL]);
    gridEl.innerHTML = all.map((l) => {
      const total = l.id === "mixed" ? LEVELS.reduce((s, x) => s + getLevelData(x.id).length, 0) : getLevelData(l.id).length;
      const learned = l.id === "mixed" ? LEVELS.reduce((s, x) => s + levelLearnedCount(x.id), 0) : levelLearnedCount(l.id);
      return `
        <button class="level-tile" data-level="${l.id}" data-kind="${kind}">
          <span class="level-tile-badge" style="background:linear-gradient(135deg,${l.c1},${l.c2})">${l.id === "mixed" ? "🔀" : l.name}</span>
          <span class="level-tile-info">
            <span class="level-tile-name">${l.name}</span>
            <span class="level-tile-desc">${l.desc}</span>
          </span>
          <span class="level-tile-count">${learned}/${total}</span>
        </button>`;
    }).join("");
    gridEl.querySelectorAll(".level-tile").forEach((btn) => {
      btn.addEventListener("click", () => {
        flow.mode = btn.dataset.kind === "study" ? "study" : "test";
        flow.level = btn.dataset.level;
        openDirectionView();
      });
    });
  }

  // ---------- direction select ----------
  const flow = { mode: "study", level: "a1", direction: null };
  function openDirectionView() {
    const meta = levelMeta(flow.level);
    document.getElementById("directionTitle").textContent = `${meta.name} — ${flow.mode === "study" ? "Öğren" : "Test"}`;
    showView("view-direction");
  }
  document.getElementById("backFromDirection").addEventListener("click", () => showView(lastTabView));
  document.getElementById("dirEnTr").addEventListener("click", () => { flow.direction = "en_tr"; startFlowSession(); });
  document.getElementById("dirTrEn").addEventListener("click", () => { flow.direction = "tr_en"; startFlowSession(); });

  function startFlowSession() {
    const pool = sessionPool(flow.level, flow.direction);
    if (pool.length === 0) { showToast("Bu seviyede kelime bulunamadı"); return; }
    const items = pool.map((p) => ({ level: p.level, word: p.word, dir: flow.direction }));
    session.contextPool = buildPool(flow.level);
    beginSession(items, flow.mode);
  }

  function startCustomSession(items, mode) {
    session.contextPool = ALL_POOL;
    beginSession(items, mode);
  }

  // ---------- session ----------
  const session = { mode: "study", items: [], pointer: 0, know: 0, dontKnow: 0, wrongThisSession: [], answered: false, contextPool: [] };

  function beginSession(items, mode) {
    session.mode = mode;
    session.items = items;
    session.pointer = 0;
    session.know = 0;
    session.dontKnow = 0;
    session.wrongThisSession = [];
    session.answered = false;
    showView("view-session");
    renderSessionItem();
  }

  const wordMainEl = document.getElementById("wordMain");
  const wordPosEl = document.getElementById("wordPos");
  const wordMeaningBlockEl = document.getElementById("wordMeaningBlock");
  const wordMeaningEl = document.getElementById("wordMeaning");
  const wordExampleEl = document.getElementById("wordExample");
  const optionsGridEl = document.getElementById("optionsGrid");
  const studyActionsEl = document.getElementById("studyActions");
  const sessionProgressText = document.getElementById("sessionProgressText");
  const sessionProgressFill = document.getElementById("sessionProgressFill");

  function currentItem() { return session.items[session.pointer]; }

  function renderSessionItem() {
    const it = currentItem();
    const w = wordByText(it.level, it.word);
    sessionProgressText.textContent = `${session.pointer + 1} / ${session.items.length}`;
    sessionProgressFill.style.width = `${(session.pointer / session.items.length) * 100}%`;

    if (!w) { advance(); return; }

    const prompt = it.dir === "en_tr" ? w.w : primaryMeaning(w.t);
    wordMainEl.textContent = prompt;
    wordPosEl.textContent = posLabel(w.p);

    if (session.mode === "study") {
      wordMeaningBlockEl.hidden = false;
      optionsGridEl.hidden = true;
      studyActionsEl.hidden = false;
      wordMeaningEl.textContent = it.dir === "en_tr" ? w.t : w.w;
      wordExampleEl.textContent = w.ex ? `Örnek: ${w.ex}` : "";
    } else {
      wordMeaningBlockEl.hidden = true;
      studyActionsEl.hidden = true;
      optionsGridEl.hidden = false;
      session.answered = false;
      const correctText = it.dir === "en_tr" ? primaryMeaning(w.t) : w.w;
      const options = buildOptions(session.contextPool, correctText, it.dir);
      optionsGridEl.innerHTML = options.map((o) => `<button class="option-btn" data-text="${o.replace(/"/g, "&quot;")}">${o}</button>`).join("");
      optionsGridEl.dataset.correct = correctText;
    }
  }

  function advance() {
    session.pointer++;
    if (session.pointer >= session.items.length) showSessionEnd();
    else renderSessionItem();
  }

  document.getElementById("btnKnow").addEventListener("click", () => handleStudyAnswer(true));
  document.getElementById("btnDontKnow").addEventListener("click", () => handleStudyAnswer(false));
  function handleStudyAnswer(known) {
    const it = currentItem();
    updateProgress(it.level, it.word, it.dir, known);
    if (known) session.know++;
    else { session.dontKnow++; session.wrongThisSession.push({ level: it.level, word: it.word, dir: it.dir }); }
    advance();
  }

  optionsGridEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".option-btn");
    if (!btn || session.answered) return;
    session.answered = true;
    const it = currentItem();
    const correctText = optionsGridEl.dataset.correct;
    const chosen = btn.dataset.text;
    const correct = chosen === correctText;
    optionsGridEl.querySelectorAll(".option-btn").forEach((b) => {
      b.classList.add("disabled");
      if (b.dataset.text === correctText) b.classList.add("correct");
      else if (b === btn) b.classList.add("wrong");
    });
    updateProgress(it.level, it.word, it.dir, correct);
    if (correct) session.know++;
    else { session.dontKnow++; session.wrongThisSession.push({ level: it.level, word: it.word, dir: it.dir }); }
    setTimeout(advance, 850);
  });

  document.getElementById("backFromSession").addEventListener("click", () => {
    showView(lastTabView);
    renderHome(); renderReview(); renderLevelGrid("study"); renderLevelGrid("test");
  });

  // speech synthesis
  function speakWord(text) {
    if (state.settings.tts === false) { showToast("Telaffuz sesi kapalı (Ayarlar'dan açabilirsin)"); return; }
    if (!text || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  document.getElementById("speakBtn").addEventListener("click", () => {
    const it = currentItem();
    const w = wordByText(it.level, it.word);
    if (w) speakWord(w.w);
  });

  // ---------- session end ----------
  function showSessionEnd() {
    document.getElementById("endKnowCount").textContent = String(session.know);
    document.getElementById("endDontKnowCount").textContent = String(session.dontKnow);
    const allCorrect = session.dontKnow === 0;
    document.getElementById("endEmoji").textContent = allCorrect ? "🎉" : "💪";
    document.getElementById("endTitle").textContent = allCorrect ? "Harika, hepsi doğru!" : "Tamamlandı!";
    document.getElementById("endSub").textContent = allCorrect
      ? "Bu tekrar bu kadar. Bir sonrakine kadar sağlıcakla kal."
      : `${session.dontKnow} kelime "Yanlış Bilinenler" listesine eklendi.`;
    document.getElementById("endRetryBtn").hidden = session.wrongThisSession.length === 0;
    showView("view-session-end");
    renderHome(); renderReview(); renderLevelGrid("study"); renderLevelGrid("test");
  }
  document.getElementById("endRetryBtn").addEventListener("click", () => {
    if (session.wrongThisSession.length === 0) { showToast("Tekrar edilecek yanlış yok"); return; }
    const items = session.wrongThisSession.slice();
    session.contextPool = ALL_POOL;
    beginSession(items, "test");
  });
  document.getElementById("endHomeBtn").addEventListener("click", () => goTab("home"));

  // ---------- review tab ----------
  function renderReview() {
    const t = todayISO();
    const dueKeys = Object.keys(state.progress).filter((k) => state.progress[k].due <= t);
    document.getElementById("dueCardCount").textContent = `${dueKeys.length} kelime`;

    const wrongKeys = Object.keys(state.progress).filter((k) => state.progress[k].wrong);
    const wrongListEl = document.getElementById("wrongList");
    const wrongEmptyEl = document.getElementById("wrongEmpty");
    const wrongTestAllBtn = document.getElementById("wrongTestAllBtn");

    if (wrongKeys.length === 0) {
      wrongListEl.innerHTML = "";
      wrongEmptyEl.hidden = false;
      wrongTestAllBtn.hidden = true;
      return;
    }
    wrongEmptyEl.hidden = true;
    wrongTestAllBtn.hidden = false;

    wrongListEl.innerHTML = wrongKeys.map((key) => {
      const { level, word, dir } = parseKey(key);
      const w = wordByText(level, word);
      if (!w) return "";
      const meta = levelMeta(level);
      const front = dir === "en_tr" ? w.w : primaryMeaning(w.t);
      const back = dir === "en_tr" ? primaryMeaning(w.t) : w.w;
      return `
        <div class="item-row">
          <span class="item-level-badge" style="background:${meta.c1}26;color:${meta.c1}">${meta.name}</span>
          <span class="item-info">
            <span class="item-word">${escapeHtml(front)} → ${escapeHtml(back)}</span>
            <span class="item-meaning">${escapeHtml(w.ex || "")}</span>
          </span>
          <button class="item-know-btn" data-key="${key}" aria-label="Biliyorum">
            <svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>`;
    }).join("");

    wrongListEl.querySelectorAll(".item-know-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        markKnownDirect(btn.dataset.key);
        showToast("Biliyorum olarak işaretlendi");
        renderReview(); renderHome(); renderLevelGrid("study"); renderLevelGrid("test");
      });
    });
  }
  document.getElementById("dueCard").addEventListener("click", goToDueReview);
  document.getElementById("wrongTestAllBtn").addEventListener("click", () => {
    const items = Object.keys(state.progress).filter((k) => state.progress[k].wrong).map(parseKey);
    if (items.length === 0) { showToast("Yanlış bilinen kelime yok"); return; }
    startCustomSession(shuffle(items), "test");
  });

  // ---------- search ----------
  document.getElementById("searchBtn").addEventListener("click", openSearchView);
  document.getElementById("backFromSearch").addEventListener("click", () => showView(lastTabView));
  document.getElementById("searchInput").addEventListener("input", (e) => renderSearchResults(e.target.value));

  function openSearchView() {
    const input = document.getElementById("searchInput");
    input.value = "";
    renderSearchResults("");
    showView("view-search");
    setTimeout(() => input.focus(), 250);
  }

  function renderSearchResults(query) {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    const resultsEl = document.getElementById("searchResults");
    const emptyEl = document.getElementById("searchEmpty");
    const hintEl = document.getElementById("searchHint");
    if (!q) {
      resultsEl.innerHTML = "";
      emptyEl.hidden = true;
      hintEl.hidden = false;
      return;
    }
    hintEl.hidden = true;
    const matches = [];
    outer: for (const l of LEVELS) {
      const data = getLevelData(l.id);
      for (let i = 0; i < data.length; i++) {
        const w = data[i];
        if (w.w.toLocaleLowerCase("tr-TR").includes(q) || w.t.toLocaleLowerCase("tr-TR").includes(q)) {
          matches.push({ level: l.id, w });
          if (matches.length >= 60) break outer;
        }
      }
    }
    if (matches.length === 0) {
      resultsEl.innerHTML = "";
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    resultsEl.innerHTML = matches.map((m) => {
      const meta = levelMeta(m.level);
      return `
        <div class="item-row tappable" data-level="${m.level}" data-word="${escapeHtml(m.w.w)}">
          <span class="item-level-badge" style="background:${meta.c1}26;color:${meta.c1}">${meta.name}</span>
          <span class="item-info">
            <span class="search-result-word">${escapeHtml(m.w.w)}</span>
            <span class="search-result-meaning">${escapeHtml(primaryMeaning(m.w.t))}</span>
          </span>
          <span class="chevron"><svg viewBox="0 0 24 24"><path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        </div>`;
    }).join("");
    resultsEl.querySelectorAll(".item-row").forEach((row) => {
      row.addEventListener("click", () => openWordDetailSheet(row.dataset.level, row.dataset.word));
    });
  }

  function openWordDetailSheet(level, word) {
    const w = wordByText(level, word);
    if (!w) return;
    openSheet(
      `
      <div class="search-detail-word">${escapeHtml(w.w)}</div>
      <span class="search-detail-pos">${posLabel(w.p)}</span>
      <div class="search-detail-meaning">${escapeHtml(w.t)}</div>
      ${w.ex ? `<div class="search-detail-example">${escapeHtml(w.ex)}</div>` : ""}
      <button class="search-detail-speak" id="detailSpeakBtn">
        <svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        Telaffuzu Dinle
      </button>
      `,
      (root) => {
        root.querySelector("#detailSpeakBtn").addEventListener("click", () => speakWord(w.w));
      }
    );
  }

  // ---------- tab bar ----------
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => goTab(btn.dataset.tab));
  });

  // ---------- service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  // ---------- init ----------
  applyTheme();
  buildWordIndex();
  ALL_POOL = buildPool("mixed");
  renderLevelGrid("study");
  renderLevelGrid("test");
  renderHome();
  renderReview();
})();
