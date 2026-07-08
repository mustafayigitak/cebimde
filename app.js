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
    { id: "diger", name: "Diğer", icon: "📦", color: "#8E8E93" },
  ];
  const LIST_ICONS = ["📋", "✅", "🛒", "📚", "🏋️", "🎁", "🧳", "🎯", "🏠", "💼", "🍽️", "🎓"];
  const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function formatCurrency(n) {
    return "₺" + n.toLocaleString("tr-TR", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  }
  function formatDateMeta(iso) {
    const d = new Date(iso + "T00:00:00");
    return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${DAYS[d.getDay()]}`;
  }
  function categoryById(id) {
    return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- state ----------
  let state = loadState();
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { expenses: [], lists: [] };
  }
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let currentMonth = new Date();
  currentMonth.setDate(1);
  let currentListId = null;

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
    expenses: document.getElementById("view-expenses"),
    lists: document.getElementById("view-lists"),
    "list-detail": document.getElementById("view-list-detail"),
  };
  function showView(name) {
    Object.values(views).forEach((v) => v.classList.remove("active"));
    views[name].classList.add("active");
  }
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      showView(btn.dataset.tab);
      if (btn.dataset.tab === "expenses") renderExpenses();
      if (btn.dataset.tab === "lists") renderLists();
    });
  });

  // ===================================================================
  // EXPENSES
  // ===================================================================
  function monthKeyOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function renderExpenses() {
    document.getElementById("monthLabel").textContent = `${MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
    const key = monthKeyOf(currentMonth);
    const monthExpenses = state.expenses.filter((e) => e.date.startsWith(key)).sort((a, b) => (a.date < b.date ? 1 : -1));

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

    const listEl = document.getElementById("expensesList");
    const emptyEl = document.getElementById("expensesEmpty");
    if (monthExpenses.length === 0) {
      listEl.innerHTML = "";
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
      listEl.innerHTML = monthExpenses
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

  document.getElementById("expensesList").addEventListener("click", (e) => {
    const delBtn = e.target.closest("[data-del]");
    if (delBtn) {
      if (confirm("Bu harcamayı silmek istiyor musun?")) {
        state.expenses = state.expenses.filter((x) => x.id !== delBtn.dataset.del);
        saveState();
        renderExpenses();
      }
    }
  });

  function openAddExpenseSheet() {
    let selectedCat = CATEGORIES[0].id;
    const html = `
      <div class="sheet-title">Yeni Harcama</div>
      <div class="field-group">
        <input class="field-input amount-input" id="expAmount" type="number" inputmode="decimal" placeholder="₺0" step="0.01" />
      </div>
      <div class="field-group">
        <label class="field-label">Kategori</label>
        <div class="chip-row" id="catChips">
          ${CATEGORIES.map((c) => `<button type="button" class="chip${c.id === selectedCat ? " selected" : ""}" data-cat="${c.id}">${c.icon} ${c.name}</button>`).join("")}
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Not</label>
        <input class="field-input" id="expNote" type="text" placeholder="Örn: Migros market alışverişi" />
      </div>
      <div class="field-group">
        <label class="field-label">Tarih</label>
        <input class="field-input" id="expDate" type="date" value="${todayISO()}" />
      </div>
      <div class="sheet-actions">
        <button class="btn btn-secondary" id="expCancel">Vazgeç</button>
        <button class="btn btn-primary" id="expSave">Kaydet</button>
      </div>
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
        state.expenses.push({ id: uid(), amount, categoryId: selectedCat, note, date });
        saveState();
        closeSheet();
        currentMonth = new Date(date + "T00:00:00");
        currentMonth.setDate(1);
        renderExpenses();
      });
    });
  }
  document.getElementById("addExpenseBtn").addEventListener("click", openAddExpenseSheet);

  // ===================================================================
  // LISTS
  // ===================================================================
  function renderLists() {
    const grid = document.getElementById("listsGrid");
    const empty = document.getElementById("listsEmpty");
    if (state.lists.length === 0) {
      grid.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    grid.innerHTML = state.lists
      .map((l) => {
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
      })
      .join("");
  }

  document.getElementById("listsGrid").addEventListener("click", (e) => {
    const card = e.target.closest("[data-list]");
    if (card) {
      currentListId = card.dataset.list;
      showView("list-detail");
      renderListDetail();
    }
  });

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
        currentListId = newList.id;
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
          <div class="item-text">${escapeHtml(it.text)}</div>
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
    if (toggleId) {
      const item = list.items.find((i) => i.id === toggleId.dataset.toggle);
      if (item) item.done = !item.done;
      saveState();
      renderListDetail();
    } else if (delId) {
      list.items = list.items.filter((i) => i.id !== delId.dataset.delitem);
      saveState();
      renderListDetail();
    }
  });

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
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === "lists"));
    showView("lists");
    renderLists();
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
          showView("lists");
          document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === "lists"));
          renderLists();
        }
      });
    });
  });

  // ---------- init ----------
  renderExpenses();
  renderLists();
  showView("expenses");

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
