(() => {
  "use strict";

  const STORAGE_KEY = "cebimde_data_v1";

  const CATEGORIES = [
    { id: "market", name: "Market", icon: "🛒", color: "#34C759" },
    { id: "yemek", name: "Yemek", icon: "🍔", color: "#FF9500" },
    { id: "ulasim", name: "Ulaşım", icon: "🚌", color: "#007AFF" },
    { id: "fatura", name: "Faturalar", icon: "🧾", color: "#FF3B30" },
    { id: "eglence", name: "Eğlence", icon: "🎬", color: "#AF52DE" },
    { id: "saglik", name: "Sağlık", icon: "💊", color: "#32ADE6" },
    { id: "giyim", name: "Giyim", icon: "👕", color: "#FF2D55" },
    { id: "abonelik", name: "Abonelik", icon: "↻", color: "#00BFA6" },
    { id: "diger", name: "Diğer", icon: "📦", color: "#8E8E93" },
  ];
  const LIST_ICONS = ["📋", "✅", "🛒", "📚", "🏋️", "🎁", "🧳", "🎯", "🏠", "💼", "🍽️", "🎓"];
  const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

  const SUBSCRIPTION_PRESETS = [
    { name: "Spotify", color: "#1DB954" },
    { name: "Netflix", color: "#E50914" },
    { name: "YouTube Premium", color: "#FF0000" },
    { name: "Apple Music", color: "#FA233B" },
    { name: "Apple TV+", color: "#333336" },
    { name: "iCloud+", color: "#3693F3" },
    { name: "Disney+", color: "#113CCF" },
    { name: "Amazon Prime", color: "#00A8E1" },
    { name: "Kick", color: "#53FC18" },
    { name: "PlayStation Plus", color: "#0070D1" },
    { name: "Xbox Game Pass", color: "#107C10" },
    { name: "Exxen", color: "#FF4E00" },
  ];
  const SWATCHES = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#00C7BE", "#32ADE6", "#007AFF", "#5E5CE6", "#AF52DE", "#FF2D55", "#8E8E93", "#48484A"];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function todayISO() {
    return isoDate(new Date());
  }
  function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function formatCurrency(n) {
    return "₺" + n.toLocaleString("tr-TR", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  }
  function formatDateMeta(iso) {
    const d = new Date(iso + "T00:00:00");
    return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${DAYS[d.getDay()]}`;
  }
  function formatDateShort(d) {
    const suffix = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : "";
    return `${d.getDate()} ${MONTHS[d.getMonth()]}${suffix}`;
  }
  function categoryById(id) {
    return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function advanceCycle(date, cycle) {
    const d = new Date(date);
    if (cycle === "yearly") d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d;
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
    if (!s.expenses) s.expenses = [];
    if (!s.lists) s.lists = [];
    if (!s.subscriptions) s.subscriptions = [];
    if (!s.settings) s.settings = { budget: null, theme: "system" };
    if (!s.settings.theme) s.settings.theme = "system";
    return s;
  }
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let currentMonth = new Date();
  currentMonth.setDate(1);
  let currentListId = null;

  // ---------- toast ----------
  const toastEl = document.getElementById("toast");
  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  // ---------- sheet ----------
  const sheetOverlay = document.getElementById("sheetOverlay");
  const sheetEl = document.getElementById("sheet");

  function openSheet(innerHTML, onMount) {
    sheetEl.innerHTML = `<div class="sheet-handle"></div>${innerHTML}`;
    sheetOverlay.classList.add("open");
    if (onMount) onMount(sheetEl);
  }
  function closeSheet() {
    sheetOverlay.classList.remove("open");
  }
  sheetOverlay.addEventListener("click", (e) => {
    if (e.target === sheetOverlay) closeSheet();
  });

  // ---------- tab / view switching ----------
  const views = {
    overview: document.getElementById("view-overview"),
    expenses: document.getElementById("view-expenses"),
    subscriptions: document.getElementById("view-subscriptions"),
    lists: document.getElementById("view-lists"),
    "list-detail": document.getElementById("view-list-detail"),
  };
  function showView(name) {
    Object.values(views).forEach((v) => v.classList.remove("active"));
    views[name].classList.add("active");
  }
  const renderers = {
    overview: renderOverview,
    expenses: renderExpenses,
    subscriptions: renderSubscriptions,
    lists: renderLists,
  };
  function goToTab(tab) {
    const alreadyThere = views[tab].classList.contains("active");
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    if (alreadyThere) return;
    showView(tab);
    renderers[tab]();
  }
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => goToTab(btn.dataset.tab));
  });

  // ===================================================================
  // SUBSCRIPTIONS
  // ===================================================================
  function processSubscriptionRenewals() {
    const today = startOfToday();
    let loggedCount = 0;
    state.subscriptions.forEach((sub) => {
      if (!sub.active || sub.autoLog === false) return;
      let cursor = sub.lastBilledDate ? advanceCycle(new Date(sub.lastBilledDate + "T00:00:00"), sub.cycle) : new Date(sub.anchorDate + "T00:00:00");
      let iterations = 0;
      while (cursor <= today && iterations < 36) {
        const iso = isoDate(cursor);
        state.expenses.push({ id: uid(), amount: sub.price, categoryId: "abonelik", note: sub.name, date: iso, subscriptionId: sub.id });
        sub.lastBilledDate = iso;
        loggedCount++;
        cursor = advanceCycle(cursor, sub.cycle);
        iterations++;
      }
    });
    if (loggedCount > 0) {
      saveState();
      showToast(`${loggedCount} abonelik ödemesi harcama olarak eklendi`);
    }
  }

  function nextBillingDate(sub) {
    if (sub.lastBilledDate) return advanceCycle(new Date(sub.lastBilledDate + "T00:00:00"), sub.cycle);
    return new Date(sub.anchorDate + "T00:00:00");
  }
  function monthlyEquivalent(sub) {
    return sub.cycle === "yearly" ? sub.price / 12 : sub.price;
  }

  function renderSubscriptions() {
    const active = state.subscriptions.filter((s) => s.active);
    const monthlyTotal = active.reduce((sum, s) => sum + monthlyEquivalent(s), 0);
    document.getElementById("subMonthlyTotal").textContent = formatCurrency(monthlyTotal);
    const yearlyCount = active.filter((s) => s.cycle === "yearly").length;
    document.getElementById("subYearlyNote").textContent = yearlyCount > 0 ? `${yearlyCount} yıllık abonelik aylığa bölünerek hesaplandı` : "";

    const upcoming = active
      .map((s) => ({ sub: s, date: nextBillingDate(s) }))
      .filter((x) => (x.date - startOfToday()) / 86400000 <= 30)
      .sort((a, b) => a.date - b.date);

    const upcomingTitleEl = document.getElementById("upcomingTitle");
    const upcomingListEl = document.getElementById("upcomingList");
    if (upcoming.length === 0) {
      upcomingTitleEl.hidden = true;
      upcomingListEl.innerHTML = "";
    } else {
      upcomingTitleEl.hidden = false;
      upcomingListEl.innerHTML = upcoming
        .map(({ sub, date }) => {
          const days = Math.round((date - startOfToday()) / 86400000);
          const label = days === 0 ? "Bugün" : days === 1 ? "Yarın" : `${formatDateShort(date)}`;
          return `<div class="sub-row" data-sub="${sub.id}">
            <div class="sub-avatar" style="background:${sub.color}">${escapeHtml(sub.name.charAt(0).toUpperCase())}</div>
            <div class="sub-info">
              <div class="sub-name">${escapeHtml(sub.name)}</div>
              <div class="sub-meta">${label}</div>
            </div>
            <div class="sub-price">${formatCurrency(sub.price)}</div>
          </div>`;
        })
        .join("");
    }

    const subsListEl = document.getElementById("subsList");
    const subsEmptyEl = document.getElementById("subsEmpty");
    if (state.subscriptions.length === 0) {
      subsListEl.innerHTML = "";
      subsEmptyEl.hidden = false;
    } else {
      subsEmptyEl.hidden = true;
      const sorted = [...state.subscriptions].sort((a, b) => (a.active === b.active ? a.name.localeCompare(b.name) : a.active ? -1 : 1));
      subsListEl.innerHTML = sorted
        .map((sub) => {
          const date = nextBillingDate(sub);
          return `<div class="sub-row${sub.active ? "" : " paused"}" data-sub="${sub.id}">
            <div class="sub-avatar" style="background:${sub.color}">${escapeHtml(sub.name.charAt(0).toUpperCase())}</div>
            <div class="sub-info">
              <div class="sub-name">${escapeHtml(sub.name)}</div>
              <div class="sub-meta">${sub.active ? `Sıradaki ödeme: ${formatDateShort(date)}` : "Duraklatıldı"}</div>
            </div>
            <div class="sub-price">${formatCurrency(sub.price)}<span class="sub-price-cycle">${sub.cycle === "yearly" ? "/ yıl" : "/ ay"}</span></div>
          </div>`;
        })
        .join("");
    }
  }

  function presetPickerHtml(selectedIdx) {
    return SUBSCRIPTION_PRESETS.map(
      (p, i) => `<button type="button" class="preset-item${i === selectedIdx ? " selected" : ""}" data-preset="${i}">
        <div class="sub-avatar" style="background:${p.color}">${p.name.charAt(0)}</div>
        <span class="preset-label">${p.name}</span>
      </button>`
    ).join("") + `<button type="button" class="preset-item${selectedIdx === -1 ? " selected" : ""}" data-preset="-1">
        <div class="sub-avatar" style="background:#8E8E93">?</div>
        <span class="preset-label">Özel</span>
      </button>`;
  }

  function openAddSubscriptionSheet() {
    let selectedPreset = 0;
    let customName = "";
    let customColor = SWATCHES[0];
    let cycle = "monthly";
    let autoLog = true;

    function currentNameColor() {
      if (selectedPreset === -1) return { name: customName, color: customColor };
      const p = SUBSCRIPTION_PRESETS[selectedPreset];
      return { name: p.name, color: p.color };
    }

    const html = `
      <div class="sheet-title">Yeni Abonelik</div>
      <div class="field-group">
        <label class="field-label">Servis</label>
        <div class="preset-grid" id="presetGrid">${presetPickerHtml(selectedPreset)}</div>
      </div>
      <div class="field-group" id="customNameGroup" hidden>
        <label class="field-label">Ad</label>
        <input class="field-input" id="subCustomName" type="text" placeholder="Örn: Kick Aboneliği" />
        <div class="swatch-row" id="swatchRow" style="margin-top:10px">
          ${SWATCHES.map((c, i) => `<button type="button" class="swatch${i === 0 ? " selected" : ""}" data-swatch="${c}" style="background:${c}"></button>`).join("")}
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Ücret</label>
        <input class="field-input amount-input" id="subPrice" type="number" inputmode="decimal" placeholder="₺0" step="0.01" />
      </div>
      <div class="field-group">
        <label class="field-label">Periyot</label>
        <div class="cycle-toggle">
          <button type="button" class="chip selected" data-cycle="monthly">Aylık</button>
          <button type="button" class="chip" data-cycle="yearly">Yıllık</button>
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">İlk / Sıradaki Ödeme Tarihi</label>
        <input class="field-input" id="subDate" type="date" value="${todayISO()}" />
      </div>
      <div class="field-group">
        <button type="button" class="chip selected" id="autoLogChip">✓ Otomatik harcama olarak eklensin</button>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-secondary" id="subCancel">Vazgeç</button>
        <button class="btn btn-primary" id="subSave">Kaydet</button>
      </div>
    `;
    openSheet(html, (root) => {
      root.querySelectorAll("[data-preset]").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedPreset = parseInt(btn.dataset.preset, 10);
          root.querySelectorAll("[data-preset]").forEach((b) => b.classList.toggle("selected", parseInt(b.dataset.preset, 10) === selectedPreset));
          root.querySelector("#customNameGroup").hidden = selectedPreset !== -1;
        });
      });
      root.querySelectorAll("[data-swatch]").forEach((btn) => {
        btn.addEventListener("click", () => {
          customColor = btn.dataset.swatch;
          root.querySelectorAll("[data-swatch]").forEach((b) => b.classList.toggle("selected", b.dataset.swatch === customColor));
        });
      });
      root.querySelectorAll("[data-cycle]").forEach((btn) => {
        btn.addEventListener("click", () => {
          cycle = btn.dataset.cycle;
          root.querySelectorAll("[data-cycle]").forEach((b) => b.classList.toggle("selected", b.dataset.cycle === cycle));
        });
      });
      root.querySelector("#autoLogChip").addEventListener("click", () => {
        autoLog = !autoLog;
        root.querySelector("#autoLogChip").classList.toggle("selected", autoLog);
        root.querySelector("#autoLogChip").textContent = autoLog ? "✓ Otomatik harcama olarak eklensin" : "Otomatik harcama olarak eklensin";
      });
      root.querySelector("#subCancel").addEventListener("click", closeSheet);
      root.querySelector("#subSave").addEventListener("click", () => {
        const priceRaw = root.querySelector("#subPrice").value;
        const price = parseFloat(String(priceRaw).replace(",", "."));
        if (!price || price <= 0) {
          root.querySelector("#subPrice").focus();
          return;
        }
        if (selectedPreset === -1) {
          customName = root.querySelector("#subCustomName").value.trim();
          if (!customName) {
            root.querySelector("#subCustomName").focus();
            return;
          }
        }
        const { name, color } = currentNameColor();
        const anchorDate = root.querySelector("#subDate").value || todayISO();
        state.subscriptions.push({
          id: uid(),
          name,
          color,
          price,
          cycle,
          anchorDate,
          lastBilledDate: null,
          active: true,
          autoLog,
        });
        processSubscriptionRenewals();
        saveState();
        closeSheet();
        renderSubscriptions();
        renderOverview();
      });
    });
  }
  document.getElementById("addSubBtn").addEventListener("click", openAddSubscriptionSheet);

  function openEditSubscriptionSheet(sub) {
    const html = `
      <div class="sheet-title">${escapeHtml(sub.name)}</div>
      <div class="field-group">
        <label class="field-label">Ücret</label>
        <input class="field-input amount-input" id="editPrice" type="number" inputmode="decimal" value="${sub.price}" step="0.01" />
      </div>
      <div class="field-group">
        <label class="field-label">Periyot</label>
        <div class="cycle-toggle">
          <button type="button" class="chip${sub.cycle === "monthly" ? " selected" : ""}" data-cycle="monthly">Aylık</button>
          <button type="button" class="chip${sub.cycle === "yearly" ? " selected" : ""}" data-cycle="yearly">Yıllık</button>
        </div>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-secondary" id="editCancel">Vazgeç</button>
        <button class="btn btn-primary" id="editSave">Kaydet</button>
      </div>
      <div class="sheet-actions" style="margin-top:10px">
        <button class="btn btn-secondary" id="editPause">${sub.active ? "Duraklat" : "Devam Ettir"}</button>
        <button class="btn btn-danger" id="editDelete">Sil</button>
      </div>
    `;
    let cycle = sub.cycle;
    openSheet(html, (root) => {
      root.querySelectorAll("[data-cycle]").forEach((btn) => {
        btn.addEventListener("click", () => {
          cycle = btn.dataset.cycle;
          root.querySelectorAll("[data-cycle]").forEach((b) => b.classList.toggle("selected", b.dataset.cycle === cycle));
        });
      });
      root.querySelector("#editCancel").addEventListener("click", closeSheet);
      root.querySelector("#editSave").addEventListener("click", () => {
        const price = parseFloat(String(root.querySelector("#editPrice").value).replace(",", "."));
        if (!price || price <= 0) return;
        sub.price = price;
        sub.cycle = cycle;
        saveState();
        closeSheet();
        renderSubscriptions();
        renderOverview();
      });
      root.querySelector("#editPause").addEventListener("click", () => {
        sub.active = !sub.active;
        saveState();
        closeSheet();
        renderSubscriptions();
        renderOverview();
      });
      root.querySelector("#editDelete").addEventListener("click", () => {
        if (confirm(`"${sub.name}" aboneliği silinsin mi?`)) {
          state.subscriptions = state.subscriptions.filter((s) => s.id !== sub.id);
          saveState();
          closeSheet();
          renderSubscriptions();
          renderOverview();
        }
      });
    });
  }

  function handleSubRowClick(e) {
    const row = e.target.closest("[data-sub]");
    if (!row) return;
    const sub = state.subscriptions.find((s) => s.id === row.dataset.sub);
    if (sub) openEditSubscriptionSheet(sub);
  }
  document.getElementById("upcomingList").addEventListener("click", handleSubRowClick);
  document.getElementById("subsList").addEventListener("click", handleSubRowClick);

  // ===================================================================
  // EXPENSES
  // ===================================================================
  function monthKeyOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function renderExpenses() {
    document.getElementById("monthLabel").textContent = `${MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
    const key = monthKeyOf(currentMonth);
    let monthExpenses = state.expenses.filter((e) => e.date.startsWith(key)).sort((a, b) => (a.date < b.date ? 1 : -1));

    const total = monthExpenses.reduce((s, e) => s + e.amount, 0);
    document.getElementById("monthTotal").textContent = formatCurrency(total);

    const byCat = {};
    monthExpenses.forEach((e) => {
      byCat[e.categoryId] = (byCat[e.categoryId] || 0) + e.amount;
    });
    const catBarsEl = document.getElementById("catBars");
    const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    catBarsEl.innerHTML = sortedCats
      .map(([catId, amt]) => {
        const cat = categoryById(catId);
        const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
        return `<div class="cat-bar-row">
          <span class="cat-bar-icon">${cat.icon}</span>
          <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${cat.color}"></div></div>
          <span class="cat-bar-amount">${formatCurrency(amt)}</span>
        </div>`;
      })
      .join("");

    const searchInput = document.getElementById("expenseSearch");
    const query = (searchInput.value || "").trim().toLowerCase();
    let displayExpenses = monthExpenses;
    if (query) {
      displayExpenses = monthExpenses.filter((e) => {
        const cat = categoryById(e.categoryId);
        return (e.note || "").toLowerCase().includes(query) || cat.name.toLowerCase().includes(query);
      });
    }

    const listEl = document.getElementById("expensesList");
    const emptyEl = document.getElementById("expensesEmpty");
    if (displayExpenses.length === 0) {
      listEl.innerHTML = "";
      emptyEl.hidden = false;
      emptyEl.querySelector("p").textContent = query ? "Aramanla eşleşen harcama yok." : "Bu ay henüz bir harcama eklemedin.";
    } else {
      emptyEl.hidden = true;
      listEl.innerHTML = displayExpenses
        .map((e) => {
          const cat = categoryById(e.categoryId);
          return `<div class="expense-row" data-id="${e.id}">
            <div class="expense-icon" style="background:${cat.color}22">${cat.icon}</div>
            <div class="expense-info">
              <div class="expense-note">${escapeHtml(e.note || cat.name)}</div>
              <div class="expense-meta">${cat.name} · ${formatDateMeta(e.date)}</div>
            </div>
            <div class="expense-amount">${formatCurrency(e.amount)}</div>
            <button class="delete-x" data-del="${e.id}">✕</button>
          </div>`;
        })
        .join("");
    }
  }

  document.getElementById("prevMonth").addEventListener("click", () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderExpenses();
  });
  document.getElementById("nextMonth").addEventListener("click", () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderExpenses();
  });
  document.getElementById("expenseSearch").addEventListener("input", renderExpenses);

  document.getElementById("expensesList").addEventListener("click", (e) => {
    const delBtn = e.target.closest("[data-del]");
    if (delBtn) {
      if (confirm("Bu harcamayı silmek istiyor musun?")) {
        state.expenses = state.expenses.filter((x) => x.id !== delBtn.dataset.del);
        saveState();
        renderExpenses();
        renderOverview();
      }
      return;
    }
    const row = e.target.closest("[data-id]");
    if (row) {
      const expense = state.expenses.find((x) => x.id === row.dataset.id);
      if (expense) openAddExpenseSheet(expense);
    }
  });

  function openAddExpenseSheet(existing) {
    let selectedCat = existing ? existing.categoryId : CATEGORIES[0].id;
    const html = `
      <div class="sheet-title">${existing ? "Harcamayı Düzenle" : "Yeni Harcama"}</div>
      <div class="field-group">
        <input class="field-input amount-input" id="expAmount" type="number" inputmode="decimal" placeholder="₺0" step="0.01" value="${existing ? existing.amount : ""}" />
      </div>
      <div class="field-group">
        <label class="field-label">Kategori</label>
        <div class="chip-row" id="catChips">
          ${CATEGORIES.map((c) => `<button type="button" class="chip${c.id === selectedCat ? " selected" : ""}" data-cat="${c.id}">${c.icon} ${c.name}</button>`).join("")}
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Not</label>
        <input class="field-input" id="expNote" type="text" placeholder="Örn: Migros market alışverişi" value="${existing ? escapeHtml(existing.note || "") : ""}" />
      </div>
      <div class="field-group">
        <label class="field-label">Tarih</label>
        <input class="field-input" id="expDate" type="date" value="${existing ? existing.date : todayISO()}" />
      </div>
      <div class="sheet-actions">
        <button class="btn btn-secondary" id="expCancel">Vazgeç</button>
        <button class="btn btn-primary" id="expSave">Kaydet</button>
      </div>
      ${existing ? '<div class="sheet-actions" style="margin-top:10px"><button class="btn btn-danger" id="expDelete">Harcamayı Sil</button></div>' : ""}
    `;
    openSheet(html, (root) => {
      root.querySelector("#expAmount").focus();
      root.querySelectorAll("[data-cat]").forEach((chip) => {
        chip.addEventListener("click", () => {
          selectedCat = chip.dataset.cat;
          root.querySelectorAll("[data-cat]").forEach((c) => c.classList.toggle("selected", c.dataset.cat === selectedCat));
        });
      });
      root.querySelector("#expCancel").addEventListener("click", closeSheet);
      root.querySelector("#expSave").addEventListener("click", () => {
        const amountRaw = root.querySelector("#expAmount").value;
        const amount = parseFloat(String(amountRaw).replace(",", "."));
        if (!amount || amount <= 0) {
          root.querySelector("#expAmount").focus();
          return;
        }
        const note = root.querySelector("#expNote").value.trim();
        const date = root.querySelector("#expDate").value || todayISO();
        if (existing) {
          existing.amount = amount;
          existing.categoryId = selectedCat;
          existing.note = note;
          existing.date = date;
        } else {
          state.expenses.push({ id: uid(), amount, categoryId: selectedCat, note, date });
        }
        saveState();
        closeSheet();
        currentMonth = new Date(date + "T00:00:00");
        currentMonth.setDate(1);
        renderExpenses();
        renderOverview();
      });
      if (existing) {
        root.querySelector("#expDelete").addEventListener("click", () => {
          if (confirm("Bu harcamayı silmek istiyor musun?")) {
            state.expenses = state.expenses.filter((x) => x.id !== existing.id);
            saveState();
            closeSheet();
            renderExpenses();
            renderOverview();
          }
        });
      }
    });
  }
  document.getElementById("addExpenseBtn").addEventListener("click", () => openAddExpenseSheet());

  // ===================================================================
  // LISTS
  // ===================================================================
  function listCardHtml(l) {
    const done = l.items.filter((i) => i.done).length;
    const total = l.items.length;
    const progress = total === 0 ? "Henüz öğe yok" : `${done}/${total} tamamlandı`;
    return `<button class="list-card" data-list="${l.id}">
      <div class="list-card-icon">${l.icon}</div>
      <div class="list-card-info">
        <div class="list-card-name">${escapeHtml(l.name)}</div>
        <div class="list-card-progress">${progress}</div>
      </div>
      <div class="list-card-chevron"><svg viewBox="0 0 24 24"><path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    </button>`;
  }

  function renderLists() {
    const grid = document.getElementById("listsGrid");
    const empty = document.getElementById("listsEmpty");
    if (state.lists.length === 0) {
      grid.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    grid.innerHTML = state.lists.map(listCardHtml).join("");
  }

  function handleListCardClick(e) {
    const card = e.target.closest("[data-list]");
    if (card) {
      currentListId = card.dataset.list;
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === "lists"));
      showView("list-detail");
      renderListDetail();
    }
  }
  document.getElementById("listsGrid").addEventListener("click", handleListCardClick);
  document.getElementById("ovListsPreview").addEventListener("click", handleListCardClick);

  function openAddListSheet() {
    let selectedIcon = LIST_ICONS[0];
    const html = `
      <div class="sheet-title">Yeni Liste</div>
      <div class="field-group">
        <input class="field-input" id="listName" type="text" placeholder="Örn: Market Listesi" />
      </div>
      <div class="field-group">
        <label class="field-label">Simge</label>
        <div class="icon-picker-grid" id="iconGrid">
          ${LIST_ICONS.map((ic) => `<button type="button" class="icon-picker-item${ic === selectedIcon ? " selected" : ""}" data-icon="${ic}">${ic}</button>`).join("")}
        </div>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-secondary" id="listCancel">Vazgeç</button>
        <button class="btn btn-primary" id="listSave">Oluştur</button>
      </div>
    `;
    openSheet(html, (root) => {
      root.querySelector("#listName").focus();
      root.querySelectorAll("[data-icon]").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedIcon = btn.dataset.icon;
          root.querySelectorAll("[data-icon]").forEach((b) => b.classList.toggle("selected", b.dataset.icon === selectedIcon));
        });
      });
      root.querySelector("#listCancel").addEventListener("click", closeSheet);
      root.querySelector("#listSave").addEventListener("click", () => {
        const name = root.querySelector("#listName").value.trim();
        if (!name) {
          root.querySelector("#listName").focus();
          return;
        }
        const newList = { id: uid(), name, icon: selectedIcon, items: [] };
        state.lists.push(newList);
        saveState();
        closeSheet();
        renderLists();
        renderOverview();
        currentListId = newList.id;
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === "lists"));
        showView("list-detail");
        renderListDetail();
      });
    });
  }
  document.getElementById("addListBtn").addEventListener("click", openAddListSheet);

  // ---------- list detail ----------
  function currentList() {
    return state.lists.find((l) => l.id === currentListId);
  }

  function renderListDetail() {
    const list = currentList();
    if (!list) {
      showView("lists");
      return;
    }
    document.getElementById("detailListName").textContent = list.icon + "  " + list.name;
    const done = list.items.filter((i) => i.done).length;
    const total = list.items.length;
    document.getElementById("detailProgressText").textContent = `${done}/${total}`;
    document.getElementById("detailProgressFill").style.width = total > 0 ? `${(done / total) * 100}%` : "0%";

    const itemsEl = document.getElementById("detailItems");
    itemsEl.innerHTML = list.items
      .map(
        (it) => `<div class="item-row${it.done ? " done" : ""}" data-item="${it.id}">
          <div class="checkbox${it.done ? " checked" : ""}" data-toggle="${it.id}">
            <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div class="item-text" data-edittext="${it.id}">${escapeHtml(it.text)}</div>
          <button class="delete-x" data-delitem="${it.id}">✕</button>
        </div>`
      )
      .join("");
  }

  document.getElementById("detailItems").addEventListener("click", (e) => {
    const list = currentList();
    if (!list) return;
    const toggleId = e.target.closest("[data-toggle]");
    const delId = e.target.closest("[data-delitem]");
    const editId = e.target.closest("[data-edittext]");
    if (toggleId) {
      const item = list.items.find((i) => i.id === toggleId.dataset.toggle);
      if (item) item.done = !item.done;
      saveState();
      renderListDetail();
    } else if (delId) {
      list.items = list.items.filter((i) => i.id !== delId.dataset.delitem);
      saveState();
      renderListDetail();
    } else if (editId) {
      const item = list.items.find((i) => i.id === editId.dataset.edittext);
      if (item) openEditItemSheet(item);
    }
  });

  function openEditItemSheet(item) {
    const html = `
      <div class="sheet-title">Öğeyi Düzenle</div>
      <div class="field-group">
        <input class="field-input" id="editItemText" type="text" value="${escapeHtml(item.text)}" />
      </div>
      <div class="sheet-actions">
        <button class="btn btn-secondary" id="editItemCancel">Vazgeç</button>
        <button class="btn btn-primary" id="editItemSave">Kaydet</button>
      </div>
    `;
    openSheet(html, (root) => {
      const input = root.querySelector("#editItemText");
      input.focus();
      input.select();
      root.querySelector("#editItemCancel").addEventListener("click", closeSheet);
      root.querySelector("#editItemSave").addEventListener("click", () => {
        const val = input.value.trim();
        if (!val) return;
        item.text = val;
        saveState();
        closeSheet();
        renderListDetail();
      });
    });
  }

  document.getElementById("addItemForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const list = currentList();
    if (!list) return;
    const input = document.getElementById("addItemInput");
    const text = input.value.trim();
    if (!text) return;
    list.items.push({ id: uid(), text, done: false });
    input.value = "";
    saveState();
    renderListDetail();
  });

  document.getElementById("clearCheckedBtn").addEventListener("click", () => {
    const list = currentList();
    if (!list) return;
    const doneCount = list.items.filter((i) => i.done).length;
    if (doneCount === 0) return;
    if (confirm(`${doneCount} tamamlanmış öğe silinsin mi?`)) {
      list.items = list.items.filter((i) => !i.done);
      saveState();
      renderListDetail();
    }
  });

  document.getElementById("backToLists").addEventListener("click", () => {
    goToTab("lists");
  });

  document.getElementById("listMenuBtn").addEventListener("click", () => {
    const list = currentList();
    if (!list) return;
    const html = `
      <div class="sheet-title">${escapeHtml(list.name)}</div>
      <div class="field-group">
        <input class="field-input" id="renameInput" type="text" value="${escapeHtml(list.name)}" />
      </div>
      <div class="sheet-actions">
        <button class="btn btn-secondary" id="renameCancel">Vazgeç</button>
        <button class="btn btn-primary" id="renameSave">Kaydet</button>
      </div>
      <div class="sheet-actions" style="margin-top:10px">
        <button class="btn btn-danger" id="listDelete">Listeyi Sil</button>
      </div>
    `;
    openSheet(html, (root) => {
      root.querySelector("#renameCancel").addEventListener("click", closeSheet);
      root.querySelector("#renameSave").addEventListener("click", () => {
        const val = root.querySelector("#renameInput").value.trim();
        if (val) {
          list.name = val;
          saveState();
          renderListDetail();
        }
        closeSheet();
      });
      root.querySelector("#listDelete").addEventListener("click", () => {
        if (confirm(`"${list.name}" listesi tamamen silinsin mi?`)) {
          state.lists = state.lists.filter((l) => l.id !== list.id);
          saveState();
          closeSheet();
          goToTab("lists");
        }
      });
    });
  });

  // ===================================================================
  // OVERVIEW
  // ===================================================================
  function greeting() {
    const h = new Date().getHours();
    if (h < 6) return "İyi geceler";
    if (h < 12) return "Günaydın";
    if (h < 18) return "İyi günler";
    return "İyi akşamlar";
  }

  function renderOverview() {
    document.getElementById("greetingTitle").textContent = greeting();

    const now = new Date();
    const thisKey = monthKeyOf(now);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = monthKeyOf(prevDate);
    const thisTotal = state.expenses.filter((e) => e.date.startsWith(thisKey)).reduce((s, e) => s + e.amount, 0);
    const prevTotal = state.expenses.filter((e) => e.date.startsWith(prevKey)).reduce((s, e) => s + e.amount, 0);

    document.getElementById("ovExpenseTotal").textContent = formatCurrency(thisTotal);
    const deltaEl = document.getElementById("ovDelta");
    const subEl = document.getElementById("ovExpenseSub");
    if (prevTotal > 0) {
      const pct = Math.round(((thisTotal - prevTotal) / prevTotal) * 100);
      deltaEl.hidden = false;
      deltaEl.textContent = `${pct >= 0 ? "▲" : "▼"} %${Math.abs(pct)}`;
      deltaEl.className = "delta-badge " + (pct >= 0 ? "up" : "down");
      subEl.textContent = `Geçen ay: ${formatCurrency(prevTotal)}`;
    } else {
      deltaEl.hidden = true;
      deltaEl.textContent = "";
      subEl.textContent = "Geçen ay ile karşılaştırma yok";
    }

    const budgetRow = document.getElementById("budgetRow");
    const budget = state.settings.budget;
    if (budget && budget > 0) {
      budgetRow.hidden = false;
      const pct = Math.min(100, Math.round((thisTotal / budget) * 100));
      const fillEl = document.getElementById("budgetFill");
      fillEl.style.width = pct + "%";
      fillEl.style.background = pct >= 100 ? "var(--danger)" : pct >= 80 ? "#FF9500" : "var(--accent-2)";
      document.getElementById("budgetText").textContent = `%${pct} · ${formatCurrency(budget)} bütçe`;
    } else {
      budgetRow.hidden = true;
    }

    const active = state.subscriptions.filter((s) => s.active);
    const monthlyTotal = active.reduce((sum, s) => sum + monthlyEquivalent(s), 0);
    document.getElementById("ovSubTotal").textContent = formatCurrency(monthlyTotal);

    const upcoming = active
      .map((s) => ({ sub: s, date: nextBillingDate(s) }))
      .sort((a, b) => a.date - b.date)
      .slice(0, 3);
    const ovUpcomingEl = document.getElementById("ovUpcoming");
    ovUpcomingEl.innerHTML = upcoming
      .map(({ sub, date }) => {
        const days = Math.round((date - startOfToday()) / 86400000);
        const label = days === 0 ? "Bugün" : days === 1 ? "Yarın" : days < 0 ? formatDateShort(date) : `${formatDateShort(date)}`;
        return `<div class="ov-upcoming-row">
          <div class="sub-avatar" style="background:${sub.color}">${escapeHtml(sub.name.charAt(0).toUpperCase())}</div>
          <div class="ov-upcoming-name">${escapeHtml(sub.name)}</div>
          <div class="ov-upcoming-date">${label}</div>
        </div>`;
      })
      .join("");

    const listsPreviewEl = document.getElementById("ovListsPreview");
    const listsEmptyEl = document.getElementById("ovListsEmpty");
    if (state.lists.length === 0) {
      listsPreviewEl.innerHTML = "";
      listsEmptyEl.hidden = false;
    } else {
      listsEmptyEl.hidden = true;
      listsPreviewEl.innerHTML = state.lists.slice(0, 3).map(listCardHtml).join("");
    }
  }

  document.getElementById("ovSubsCard").addEventListener("click", () => goToTab("subscriptions"));
  document.getElementById("qaExpense").addEventListener("click", () => openAddExpenseSheet());
  document.getElementById("qaSub").addEventListener("click", openAddSubscriptionSheet);
  document.getElementById("qaList").addEventListener("click", openAddListSheet);

  // ===================================================================
  // SETTINGS (budget goal + backup/restore)
  // ===================================================================
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cebimde-yedek-${todayISO()}.json`;
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
      if (!parsed || !Array.isArray(parsed.expenses) || !Array.isArray(parsed.lists) || !Array.isArray(parsed.subscriptions)) {
        showToast("Dosya formatı tanınmadı");
        return;
      }
      if (!confirm("Mevcut tüm verilerin yerine bu yedek yüklenecek. Emin misin?")) return;
      state = {
        expenses: parsed.expenses,
        lists: parsed.lists,
        subscriptions: parsed.subscriptions,
        settings: parsed.settings || { budget: null, theme: "system" },
      };
      if (!state.settings.theme) state.settings.theme = "system";
      saveState();
      applyTheme();
      closeSheet();
      renderOverview();
      renderExpenses();
      renderSubscriptions();
      renderLists();
      showToast("Veriler geri yüklendi");
    };
    reader.readAsText(file);
  }

  function applyTheme() {
    const theme = state.settings.theme || "system";
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }

  function openSettingsSheet() {
    const theme = state.settings.theme || "system";
    const html = `
      <div class="sheet-title">Ayarlar</div>
      <div class="field-group">
        <label class="field-label">Görünüm</label>
        <div class="chip-row">
          <button type="button" class="chip${theme === "system" ? " selected" : ""}" data-theme-opt="system">Sistem</button>
          <button type="button" class="chip${theme === "light" ? " selected" : ""}" data-theme-opt="light">Açık</button>
          <button type="button" class="chip${theme === "dark" ? " selected" : ""}" data-theme-opt="dark">Koyu</button>
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Aylık Bütçe Hedefi</label>
        <input class="field-input amount-input" id="budgetInput" type="number" inputmode="decimal" placeholder="₺0 (opsiyonel)" value="${state.settings.budget || ""}" />
      </div>
      <div class="sheet-actions">
        <button class="btn btn-secondary" id="budgetClear">Temizle</button>
        <button class="btn btn-primary" id="budgetSave">Kaydet</button>
      </div>
      <div class="settings-group" style="margin-top:22px">
        <button class="settings-row as-button" id="exportBtn">
          <div><div class="settings-label">Verileri Dışa Aktar</div><div class="settings-sub">JSON yedek dosyası indir</div></div>
        </button>
        <button class="settings-row as-button" id="importBtn">
          <div><div class="settings-label">Verileri İçe Aktar</div><div class="settings-sub">Yedek dosyasından geri yükle</div></div>
        </button>
        <input type="file" id="importFile" accept="application/json" hidden />
        <button class="settings-row as-button danger" id="resetBtn">
          <div><div class="settings-label">Tüm Verileri Sıfırla</div><div class="settings-sub">Bu işlem geri alınamaz</div></div>
        </button>
      </div>
    `;
    openSheet(html, (root) => {
      root.querySelectorAll("[data-theme-opt]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.settings.theme = btn.dataset.themeOpt;
          saveState();
          applyTheme();
          root.querySelectorAll("[data-theme-opt]").forEach((b) => b.classList.toggle("selected", b.dataset.themeOpt === state.settings.theme));
        });
      });
      root.querySelector("#budgetSave").addEventListener("click", () => {
        const val = parseFloat(String(root.querySelector("#budgetInput").value).replace(",", "."));
        state.settings.budget = val > 0 ? val : null;
        saveState();
        closeSheet();
        renderOverview();
      });
      root.querySelector("#budgetClear").addEventListener("click", () => {
        state.settings.budget = null;
        saveState();
        closeSheet();
        renderOverview();
      });
      root.querySelector("#exportBtn").addEventListener("click", exportData);
      root.querySelector("#importBtn").addEventListener("click", () => root.querySelector("#importFile").click());
      root.querySelector("#importFile").addEventListener("change", (e) => {
        if (e.target.files[0]) importDataFromFile(e.target.files[0]);
      });
      root.querySelector("#resetBtn").addEventListener("click", () => {
        if (confirm("Tüm harcamalar, abonelikler ve listeler silinecek. Bu işlem geri alınamaz. Emin misin?")) {
          state = { expenses: [], lists: [], subscriptions: [], settings: { budget: null, theme: state.settings.theme } };
          saveState();
          closeSheet();
          renderOverview();
          renderExpenses();
          renderSubscriptions();
          renderLists();
          showToast("Tüm veriler sıfırlandı");
        }
      });
    });
  }
  document.getElementById("settingsBtn").addEventListener("click", openSettingsSheet);

  // ---------- init ----------
  applyTheme();
  processSubscriptionRenewals();
  renderOverview();
  renderExpenses();
  renderSubscriptions();
  renderLists();
  showView("overview");

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
