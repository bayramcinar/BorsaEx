const ICON_CHART = `
<svg class="iconSvg" viewBox="0 0 24 24" fill="none">
  <path d="M4 19V5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M4 19H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M7 15l4-4 3 3 5-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ICON_REFRESH = `
<svg class="iconSvg" viewBox="0 0 24 24" fill="none">
  <path d="M20 12a8 8 0 10-2.34 5.66" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M20 8v4h-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ICON_TRASH = `
<svg class="iconSvg" viewBox="0 0 24 24" fill="none">
  <path d="M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M8 6V4h8v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M6 6l1 16h10l1-16" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
</svg>`;

class BorsaTakip {
  constructor() {
    this.searchResults = [];
    this.favorites = JSON.parse(localStorage.getItem("favorites") || "[]");
    this.favoritesData = new Map();
    this.lastPrices = new Map();

    this.currentTab = "search";
    this.updateInterval = null;
    this.isAutoRefresh = true;
    this.isUpdating = false;

    this.rrIndex = 0; // round robin index
    this.init();
  }

  $(id) {
    return document.getElementById(id);
  }

  async init() {
    this.setupEventListeners();
    this.renderFavoritesList();
    this.updateStockSelect();

    // İlk açılışta hepsini bir kez çek
    if (this.favorites.length) await this.refreshAllFavorites();

    // 1 sn “anlık” loop: her saniye 1 favoriyi yenile (stabil)
    this.startAutoLoop();
  }

  setupEventListeners() {
    // Tabs
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", async (e) => {
        document
          .querySelectorAll(".tab")
          .forEach((t) => t.classList.remove("active"));
        document
          .querySelectorAll(".tab-content")
          .forEach((c) => c.classList.remove("active"));

        e.currentTarget.classList.add("active");
        this.currentTab = e.currentTarget.dataset.tab;
        this.$(`${this.currentTab}Tab`).classList.add("active");

        if (this.currentTab === "favorites") {
          await this.refreshAllFavorites();
        } else if (this.currentTab === "graph") {
          this.updateStockSelect();
        }
      });
    });

    // Search
    this.$("searchBtn").addEventListener("click", () => this.searchStocks());
    this.$("searchInput").addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.searchStocks();
    });

    // Top refresh
    this.$("refreshBtn").addEventListener("click", async () => {
      if (this.currentTab === "favorites") await this.refreshAllFavorites();
      else if (this.$("searchInput").value.trim()) await this.searchStocks();
    });

    // Favorites actions
    this.$("refreshAllBtn").addEventListener("click", () =>
      this.refreshAllFavorites()
    );

    const autoBtn = this.$("autoRefreshToggle");
    autoBtn.addEventListener("click", () => {
      this.isAutoRefresh = !this.isAutoRefresh;
      autoBtn.textContent = `Otomatik: ${
        this.isAutoRefresh ? "AÇIK" : "KAPALI"
      }`;
      autoBtn.classList.toggle("off", !this.isAutoRefresh);
    });

    this.$("clearAllBtn").addEventListener("click", () => {
      if (!confirm("Tüm favorileri silmek istediğinize emin misiniz?")) return;
      this.favorites = [];
      this.favoritesData.clear();
      this.lastPrices.clear();
      localStorage.setItem("favorites", JSON.stringify(this.favorites));
      this.renderFavoritesList();
      this.updateStockSelect();
    });

    // Theme
    this.$("themeToggle").addEventListener("click", () => {
      document.documentElement.classList.toggle("dark");
      // chart theme güncelle
      if (this.currentTab === "graph") {
        const sym = this.$("stockSelect").value;
        if (sym) this.loadTradingView(sym, this.$("timeframe").value);
      }
    });

    // TradingView
    this.$("timeframe").addEventListener("change", (e) => {
      const selected = this.$("stockSelect").value;
      if (selected) this.loadTradingView(selected, e.target.value);
    });

    this.$("stockSelect").addEventListener("change", (e) => {
      if (e.target.value)
        this.loadTradingView(e.target.value, this.$("timeframe").value);
    });
  }

  startAutoLoop() {
    if (this.updateInterval) clearInterval(this.updateInterval);

    this.updateInterval = setInterval(async () => {
      if (this.currentTab !== "favorites") return;
      if (!this.isAutoRefresh) return;
      if (this.isUpdating) return;
      if (!this.favorites.length) return;

      // round-robin: her saniye 1 favori
      const fav = this.favorites[this.rrIndex % this.favorites.length];
      this.rrIndex = (this.rrIndex + 1) % this.favorites.length;
      await this.refreshSingleFavorite(fav.code);
    }, 1000);
  }

  // ---------------- SEARCH ----------------
  async searchStocks() {
    const searchTerm = this.$("searchInput").value.trim();
    const container = this.$("searchResults");

    if (!searchTerm) {
      container.innerHTML = `
        <div class="emptyState">
          <div class="emptyIcon">🔎</div>
          <div class="emptyTitle">Arama terimi gir</div>
          <div class="emptyDesc">Örn: ALTINS1, THYAO, USD</div>
        </div>`;
      return;
    }

    container.innerHTML = `<div class="emptyState compact"><div class="emptyTitle">Aranıyor...</div></div>`;

    try {
      const resp = await fetch(
        `https://canlidoviz.com/api/search?q=${encodeURIComponent(searchTerm)}`
      );
      const data = await resp.json();
      this.searchResults = Array.isArray(data) ? data : [];
      this.renderSearchResults();
      this.updateStockSelect();
    } catch (err) {
      console.error("Arama hatası:", err);
      container.innerHTML = `
        <div class="emptyState">
          <div class="emptyIcon">⚠️</div>
          <div class="emptyTitle">Arama hatası</div>
          <div class="emptyDesc">Tekrar deneyin.</div>
        </div>`;
    }
  }

  renderSearchResults() {
    const container = this.$("searchResults");

    if (!this.searchResults.length) {
      container.innerHTML = `
        <div class="emptyState">
          <div class="emptyIcon">😕</div>
          <div class="emptyTitle">Sonuç bulunamadı</div>
          <div class="emptyDesc">Farklı bir kelime ile tekrar deneyin.</div>
        </div>`;
      return;
    }

    container.innerHTML = this.searchResults
      .map((s) => {
        const isFav = this.isFavorite(s.code);
        return `
          <div class="resultRow" data-code="${s.code}">
            <div class="resultLeft">
              <div class="resultCode">${s.code}</div>
              <div class="resultName">${s.name || ""}</div>
              <div class="resultMarket">${s.marketName || ""}</div>
            </div>
            <div class="resultActions">
              <button class="favMini ${isFav ? "active" : ""}" data-code="${
          s.code
        }" title="${isFav ? "Favoriden çıkar" : "Favoriye ekle"}">
                ${isFav ? "★" : "☆"}
              </button>
              <button class="detailMini" data-code="${
                s.code
              }" title="Grafik">${ICON_CHART}</button>
            </div>
          </div>
        `;
      })
      .join("");

    // fav toggle
    container.querySelectorAll(".favMini").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const code = btn.dataset.code;
        const stock = this.searchResults.find((x) => x.code === code);
        if (!stock) return;
        this.toggleFavorite(stock);
        const active = this.isFavorite(code);
        btn.classList.toggle("active", active);
        btn.textContent = active ? "★" : "☆";
      });
    });

    // chart
    container.querySelectorAll(".detailMini").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const code = btn.dataset.code;
        const stock = this.searchResults.find((x) => x.code === code);
        if (stock) this.showChartForStock(stock);
      });
    });
  }

  // ---------------- FAVORITES ----------------
  isFavorite(code) {
    return this.favorites.some((f) => f.code === code);
  }

  toggleFavorite(stock) {
    const idx = this.favorites.findIndex((f) => f.code === stock.code);

    if (idx === -1) {
      this.favorites.push({
        code: stock.code,
        name: stock.name,
        slug: stock.slug,
        marketName: stock.marketName,
      });
      localStorage.setItem("favorites", JSON.stringify(this.favorites));
      this.renderFavoritesList();
      this.updateStockSelect();
      this.refreshSingleFavorite(stock.code);
    } else {
      const removed = this.favorites[idx];
      this.favorites.splice(idx, 1);
      this.favoritesData.delete(removed.code);
      this.lastPrices.delete(removed.code);
      localStorage.setItem("favorites", JSON.stringify(this.favorites));
      this.renderFavoritesList();
      this.updateStockSelect();
    }
  }

  async refreshAllFavorites() {
    if (!this.favorites.length) {
      this.renderFavoritesList();
      return;
    }
    if (this.isUpdating) return;
    this.isUpdating = true;

    try {
      const promises = this.favorites.map((f) => this.fetchStockData(f.slug));
      const results = await Promise.allSettled(promises);

      results.forEach((r, i) => {
        if (r.status === "fulfilled" && r.value) {
          this.favoritesData.set(this.favorites[i].code, r.value);
        }
      });

      this.renderFavoritesList();
      this.updateLastUpdateTime();
      this.updateStockSelect();
    } finally {
      this.isUpdating = false;
    }
  }

  async refreshSingleFavorite(code) {
    const fav = this.favorites.find((f) => f.code === code);
    if (!fav) return;

    try {
      const data = await this.fetchStockData(fav.slug);
      if (data) {
        this.favoritesData.set(code, data);
        this.renderFavoritesList(); // list stable, hızlı
        this.updateLastUpdateTime();
      }
    } catch (e) {
      console.error(e);
    }
  }

  renderFavoritesList() {
    const container = this.$("favoritesList");
    const total = this.$("totalFavorites");

    total.textContent = String(this.favorites.length);

    if (!this.favorites.length) {
      container.innerHTML = `
        <div class="emptyState compact">
          <div class="emptyIcon">⭐</div>
          <div class="emptyTitle">Henüz favori yok</div>
          <div class="emptyDesc">Arama sekmesinden yıldız ile favorilere ekle.</div>
        </div>`;
      return;
    }

    container.innerHTML = this.favorites
      .map((fav) => {
        const data = this.favoritesData.get(fav.code);

        const current = data?.current ?? "—";
        const change = data?.change ?? "—";
        const changeArrow = data?.changeArrow ?? "→";
        const changeClass = data?.changeClass ?? "changeNeu";

        const low = data?.low ?? "—";
        const high = data?.high ?? "—";
        const prevClose = data?.previousClose ?? "—";
        const lastUpdate = data?.lastUpdate ?? "--:--:--";

        // price flash
        const prev = this.lastPrices.get(fav.code);
        const currNum = parseFloat(String(current).replace(",", "."));
        let priceCls = "";
        if (!isNaN(prev) && !isNaN(currNum)) {
          if (currNum > prev) priceCls = "price-up";
          else if (currNum < prev) priceCls = "price-down";
        }
        if (!isNaN(currNum)) this.lastPrices.set(fav.code, currNum);

        return `
        <div class="favCard" data-code="${fav.code}">
          <div class="favTop">
            <div class="stockCell">
              <div class="avatar">${fav.code.charAt(0)}</div>
              <div class="stockMeta">
                <div class="stockCode">${fav.code}</div>
                <div class="stockName">${fav.name || data?.name || ""}</div>
              </div>
            </div>

            <div class="favBadges">
              <span class="pill pricePill mono ${priceCls}">${current}</span>
            </div>
          </div>

          <div class="favTop" style="justify-content: space-between;">
            <div class="${changeClass}">
              <span class="mono">${changeArrow} ${change}</span>
            </div>
            <div class="muted mono">${lastUpdate}</div>
          </div>

          <div class="favGrid">
            <div class="kpi">
              <div class="kpiLabel">Günlük Min</div>
              <div class="kpiVal mono minVal">${low}</div>
            </div>
            <div class="kpi">
              <div class="kpiLabel">Günlük Max</div>
              <div class="kpiVal mono maxVal">${high}</div>
            </div>
            <div class="kpi">
              <div class="kpiLabel">Dün Kapanış</div>
              <div class="kpiVal mono prevVal">${prevClose}</div>
            </div>
          </div>

          <div class="favBottom">
            <div class="muted"> </div>
            <div class="actions">
              <button class="actBtn refresh" data-code="${
                fav.code
              }" title="Yenile">${ICON_REFRESH}</button>
              <button class="actBtn chart" data-code="${
                fav.code
              }" title="Grafik">${ICON_CHART}</button>
              <button class="actBtn remove" data-code="${
                fav.code
              }" title="Kaldır">${ICON_TRASH}</button>
            </div>
          </div>
        </div>
      `;
      })
      .join("");

    // actions bind
    container.querySelectorAll(".actBtn.refresh").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.refreshSingleFavorite(btn.dataset.code);
      });
    });

    container.querySelectorAll(".actBtn.chart").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const code = btn.dataset.code;
        const fav = this.favorites.find((f) => f.code === code);
        if (fav) this.showChartForStock(fav);
      });
    });

    container.querySelectorAll(".actBtn.remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const code = btn.dataset.code;
        const idx = this.favorites.findIndex((f) => f.code === code);
        if (idx !== -1) {
          this.favorites.splice(idx, 1);
          this.favoritesData.delete(code);
          this.lastPrices.delete(code);
          localStorage.setItem("favorites", JSON.stringify(this.favorites));
          this.renderFavoritesList();
          this.updateStockSelect();
        }
      });
    });

    // card click -> chart
    container.querySelectorAll(".favCard").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        const code = card.dataset.code;
        const fav = this.favorites.find((f) => f.code === code);
        if (fav) this.showChartForStock(fav);
      });
    });
  }

  updateLastUpdateTime() {
    const t = new Date().toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    this.$("lastUpdateTime").textContent = t;
  }

  // ---------------- DATA FETCH (your mapping) ----------------
  async fetchStockData(slug) {
    const resp = await fetch(`https://canlidoviz.com${slug}`);
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    const getText = (sel) => doc.querySelector(sel)?.textContent?.trim() || "—";

    // ✅ Anlık fiyat
    const current = getText('span[dt="amount"][itemprop="price"]');
    const changePercent = getText('span[dt="change"]');

    let changeArrow = "→";
    let changeClass = "changeNeu";

    const findValueByLabel = (label) => {
      const nodes = Array.from(doc.querySelectorAll("span,div"));
      const el = nodes.find(
        (x) => (x.textContent || "").trim().toUpperCase() === label
      );
      if (!el) return "—";
      const p = el.parentElement;
      if (!p) return "—";
      const cand = p.querySelectorAll("span,div");
      const values = Array.from(cand)
        .map((x) => (x.textContent || "").trim())
        .filter(Boolean);
      return values.length ? values[values.length - 1] : "—";
    };

    const high = findValueByLabel("EN YÜKSEK");
    const low = findValueByLabel("EN DÜŞÜK");
    const prevClose =
      findValueByLabel("D. KAPANIŞ") || findValueByLabel("DÜNKÜ KAPANIŞ");

    return {
      current,
      change: `${changePercent}`,
      changeArrow,
      changeClass,
      high,
      low,
      previousClose: prevClose,
      lastUpdate: new Date().toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    };
  }

  // ---------------- GRAPH ----------------
  showChartForStock(stock) {
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.remove("active"));
    document
      .querySelectorAll(".tab-content")
      .forEach((c) => c.classList.remove("active"));

    document.querySelector('[data-tab="graph"]').classList.add("active");
    this.$("graphTab").classList.add("active");
    this.currentTab = "graph";

    this.updateStockSelect();

    const select = this.$("stockSelect");
    select.value = `BIST:${stock.code}`;
    this.loadTradingView(`BIST:${stock.code}`, this.$("timeframe").value);
  }

  updateStockSelect() {
    const select = this.$("stockSelect");
    if (!select) return;

    const all = [...this.searchResults, ...this.favorites].filter(
      (s, i, arr) => i === arr.findIndex((x) => x.code === s.code)
    );

    select.innerHTML =
      '<option value="">Hisse seçin</option>' +
      all
        .map(
          (s) =>
            `<option value="BIST:${s.code}">${s.code} - ${
              s.name || ""
            }</option>`
        )
        .join("");
  }

  loadTradingView(symbol, interval = "1D") {
    const container = this.$("tradingview_chart");
    container.innerHTML = "";

    const theme = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";

    new TradingView.widget({
      container_id: "tradingview_chart",
      width: "100%",
      height: "100%",
      symbol,
      interval,
      timezone: "Europe/Istanbul",
      theme,
      style: "1",
      locale: "tr",
      toolbar_bg: theme === "dark" ? "#0f172a" : "#f1f3f6",
      enable_publishing: false,
      hide_side_toolbar: false,
      allow_symbol_change: false,
      details: true,
      calendar: true,
      studies: ["Volume@tv-basicstudies"],
      show_popup_button: true,
      popup_width: "1100",
      popup_height: "720",
    });
  }
}

document.addEventListener("DOMContentLoaded", () => new BorsaTakip());
