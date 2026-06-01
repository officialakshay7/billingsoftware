/* =========================================================================
   Maa Computer & Electronics — Inventory Suite
   Pure HTML/CSS/JS · localStorage backend · CDN libs
   ========================================================================= */

(() => {
  "use strict";

  // ----- Storage -----
  const KEY = "mce_inventory_v1";

  const defaultState = () => ({
    shop: {
      name: "Maa Computer & Electronics",
      phone: "",
      address: "",
      gstin: "",
      currency: "₹",
      taxPct: 0,
      lowStockThreshold: 5,
    },
    ip: {
      allowed: [],
      enforce: false,
    },
    lock: { enabled: false, pinHash: null, autoLockMin: 0 },
    cloud: { config: null, shopId: null, autoSync: false, lastSyncAt: null, lastError: null },
    categories: ["Laptops", "Mobiles", "Accessories", "Components", "Storage"],
    suppliers: [],
    products: [],
    invoices: [],
    purchaseOrders: [],
    refunds: [],
    txns: [],
    meta: { invoiceCounter: 1, productCounter: 1, poCounter: 1, refundCounter: 1 },
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const base = defaultState();
      return {
        ...base, ...parsed,
        shop: { ...base.shop, ...(parsed.shop || {}) },
        ip: { ...base.ip, ...(parsed.ip || {}) },
        lock: { ...base.lock, ...(parsed.lock || {}) },
        cloud: { ...base.cloud, ...(parsed.cloud || {}) },
        purchaseOrders: parsed.purchaseOrders || [],
        refunds: parsed.refunds || [],
        meta: { ...base.meta, ...(parsed.meta || {}) },
      };
    } catch (e) {
      console.warn("load failed", e);
      return defaultState();
    }
  }
  let saveSyncTimer = null;
  function save(triggerSync = true) {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (triggerSync && state.cloud?.autoSync && state.cloud?.config && state.cloud?.shopId) {
      clearTimeout(saveSyncTimer);
      saveSyncTimer = setTimeout(() => cloudPush(true), 1500);
    }
  }

  // ----- Helpers -----
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const el = (tag, attrs = {}, ...children) => {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) e.setAttribute(k, v);
    });
    children.flat().forEach((c) => {
      if (c == null) return;
      e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return e;
  };
  const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
  const fmt = (n) => `${state.shop.currency}${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ----- Toasts -----
  function toast(msg, type = "info") {
    const icons = { success: "fa-circle-check", error: "fa-circle-xmark", warn: "fa-triangle-exclamation", info: "fa-circle-info" };
    const t = el("div", { class: `toast ${type}` }, el("i", { class: `fa-solid ${icons[type]}` }), msg);
    $("#toastRoot").appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(8px)"; t.style.transition = "all 200ms ease"; }, 2200);
    setTimeout(() => t.remove(), 2500);
  }

  // ----- Modal -----
  function modal({ title, body, footer, size = "" }) {
    return new Promise((resolve) => {
      const back = el("div", { class: "modal-back" });
      const m = el("div", { class: `modal ${size}` });
      const head = el("div", { class: "modal-head" }, el("h3", {}, title), el("button", { class: "x-close", "data-testid": "modal-close", onclick: close }, "✕"));
      const b = el("div", { class: "modal-body" });
      b.appendChild(body);
      m.appendChild(head); m.appendChild(b);
      if (footer) { const f = el("div", { class: "modal-foot" }); footer.forEach((n) => f.appendChild(n)); m.appendChild(f); }
      back.appendChild(m); document.body.appendChild(back);
      function close(v) { back.remove(); resolve(v); }
      back.addEventListener("click", (e) => { if (e.target === back) close(null); });
      back.__close = close;
    });
  }
  function confirmDialog(message, danger = false) {
    return new Promise((res) => {
      const body = el("p", { html: message });
      const cancel = el("button", { class: "btn btn-ghost", "data-testid": "confirm-cancel", onclick: () => { back.__close(false); res(false); } }, "Cancel");
      const ok = el("button", { class: `btn ${danger ? "btn-danger" : "btn-primary"}`, "data-testid": "confirm-ok", onclick: () => { back.__close(true); res(true); } }, "Confirm");
      const back = el("div");
      modal({ title: "Confirm", body, footer: [cancel, ok] }).then((v) => res(!!v));
      setTimeout(() => { back.__close = $(".modal-back").__close; }, 0);
    });
  }

  // ----- IP detection -----
  let detectedIp = null;
  async function detectIp() {
    try {
      const r = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
      const j = await r.json();
      detectedIp = j.ip;
    } catch { detectedIp = null; }
    paintIpPill();
  }
  function isIpAllowed() {
    if (!state.ip.enforce) return true;
    if (!detectedIp) return false;
    return state.ip.allowed.includes(detectedIp);
  }
  function paintIpPill() {
    const pill = $("#ipPill"); const t = $("#ipText");
    if (!detectedIp) { pill.className = "ip-pill"; t.textContent = "IP unknown"; return; }
    if (!state.ip.enforce) { pill.className = "ip-pill ok"; t.textContent = detectedIp; return; }
    if (state.ip.allowed.includes(detectedIp)) { pill.className = "ip-pill ok"; t.textContent = detectedIp + " · allowed"; }
    else { pill.className = "ip-pill bad"; t.textContent = detectedIp + " · blocked"; }
  }

  // ----- Barcode generation -----
  function genBarcodeValue(seq) {
    // Code128-compatible: prefix MCE + zero-padded sequence + 3 random digits checksum
    const n = String(seq).padStart(6, "0");
    const r = Math.floor(100 + Math.random() * 900);
    return `MCE${n}${r}`;
  }
  function renderBarcodeSVG(target, value, opts = {}) {
    if (!window.JsBarcode) return;
    try {
      JsBarcode(target, value, {
        format: "CODE128",
        lineColor: "#0B1220",
        width: opts.width || 2,
        height: opts.height || 56,
        displayValue: opts.displayValue !== false,
        fontSize: 12,
        margin: 6,
        background: "transparent",
        font: "JetBrains Mono",
      });
    } catch (e) { console.warn("barcode err", e); }
  }

  // ----- Routing -----
  const routes = {
    dashboard: renderDashboard,
    products: renderProducts,
    inventory: renderInventory,
    pos: renderPOS,
    invoices: renderInvoices,
    categories: renderCategories,
    suppliers: renderSuppliers,
    po: renderPurchaseOrders,
    reports: renderReports,
    settings: renderSettings,
  };
  const titles = {
    dashboard: ["Dashboard", "Live overview of your shop"],
    products: ["Products", "Catalog with auto-generated barcodes"],
    inventory: ["Stock In / Out", "Adjust quantities via scan or manual"],
    pos: ["POS / Billing", "Scan barcodes, build cart, checkout"],
    invoices: ["Invoices", "All sales receipts — printable"],
    categories: ["Categories", "Organise your product taxonomy"],
    suppliers: ["Suppliers", "Vendors & contacts"],
    po: ["Purchase Orders", "Order from suppliers — receive into stock"],
    reports: ["Reports", "Sales & inventory analytics"],
    settings: ["Settings", "Shop info, lock, cloud sync, backup"],
  };

  function go(route) {
    if (!routes[route]) route = "dashboard";
    $$(".nav-item").forEach((a) => a.classList.toggle("active", a.dataset.route === route));
    const [t, s] = titles[route]; $("#pageTitle").textContent = t; $("#pageSub").textContent = s;
    const view = $("#view"); view.innerHTML = "";
    const tpl = $(`#tpl-${route}`);
    if (tpl) view.appendChild(tpl.content.cloneNode(true));
    routes[route]();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  window.addEventListener("hashchange", () => go((location.hash || "#dashboard").slice(1)));

  // ===========================================================
  //                       DASHBOARD
  // ===========================================================
  function renderDashboard() {
    const totalProducts = state.products.length;
    const totalSkus = state.products.reduce((a, p) => a + (p.stock || 0), 0);
    const stockValue = state.products.reduce((a, p) => a + (p.cost || 0) * (p.stock || 0), 0);
    const t = today();
    const todayInv = state.invoices.filter((i) => i.date.slice(0, 10) === t);
    const todaySales = todayInv.reduce((a, i) => a + i.total, 0);
    const lowStock = state.products.filter((p) => (p.stock || 0) <= (p.lowStock ?? state.shop.lowStockThreshold));

    $("#stTotalProducts").textContent = totalProducts;
    $("#stTotalSkus").textContent = `${totalSkus} units in stock`;
    $("#stStockValue").textContent = fmt(stockValue);
    $("#stTodaySales").textContent = fmt(todaySales);
    $("#stTodayOrders").textContent = todayInv.length;
    $("#stLowStock").textContent = lowStock.length;

    // Sales chart - last 14 days
    const days = 14;
    const labels = []; const values = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      labels.push(d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }));
      values.push(state.invoices.filter((iv) => iv.date.slice(0, 10) === key).reduce((a, iv) => a + iv.total, 0));
    }
    $("#dashRange").textContent = `${labels[0]} → ${labels[labels.length - 1]}`;
    drawLineChart("salesChart", labels, values);

    // Low stock list
    const ls = $("#lowStockList"); ls.classList.add("list");
    if (lowStock.length === 0) ls.innerHTML = `<div class="empty"><i class="fa-solid fa-circle-check"></i><h4>All stocked up</h4><p>No products below threshold.</p></div>`;
    else lowStock.slice(0, 6).forEach((p) => {
      ls.appendChild(el("div", { class: "list-row" },
        el("div", { class: "l" },
          el("div", { class: "icon-box" }, el("i", { class: "fa-solid fa-box" })),
          el("div", {},
            el("div", { class: "name" }, p.name),
            el("div", { class: "meta" }, `${p.sku} · ${(p.stock || 0)} left`)
          )
        ),
        el("span", { class: `tag ${p.stock === 0 ? "rose" : "amber"}` }, p.stock === 0 ? "Out of stock" : "Low")
      ));
    });

    // Top selling
    const counts = {};
    state.invoices.forEach((iv) => iv.items.forEach((it) => { counts[it.productId] = (counts[it.productId] || 0) + it.qty; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const tl = $("#topSellingList"); tl.classList.add("list");
    if (top.length === 0) tl.innerHTML = `<div class="empty"><i class="fa-solid fa-chart-simple"></i><h4>No sales yet</h4><p>Start billing to see your top products.</p></div>`;
    top.forEach(([pid, qty]) => {
      const p = state.products.find((x) => x.id === pid);
      if (!p) return;
      tl.appendChild(el("div", { class: "list-row" },
        el("div", { class: "l" },
          el("div", { class: "icon-box" }, el("i", { class: "fa-solid fa-fire" })),
          el("div", {}, el("div", { class: "name" }, p.name), el("div", { class: "meta" }, p.sku))
        ),
        el("div", { class: "r" }, `${qty} sold`)
      ));
    });

    // Recent activity
    const ra = $("#recentActivity"); ra.classList.add("list");
    const recent = [...state.txns].slice(-8).reverse();
    if (recent.length === 0) ra.innerHTML = `<div class="empty"><i class="fa-solid fa-clock-rotate-left"></i><h4>No activity yet</h4></div>`;
    recent.forEach((x) => {
      const p = state.products.find((p) => p.id === x.productId);
      const iconMap = { in: "fa-arrow-down", out: "fa-arrow-up", sale: "fa-receipt", adjust: "fa-pen-to-square" };
      const tagMap = { in: "emerald", out: "amber", sale: "violet", adjust: "gray" };
      ra.appendChild(el("div", { class: "list-row" },
        el("div", { class: "l" },
          el("div", { class: "icon-box" }, el("i", { class: `fa-solid ${iconMap[x.type] || "fa-circle"}` })),
          el("div", {},
            el("div", { class: "name" }, `${x.type.toUpperCase()} · ${p ? p.name : "Unknown"}`),
            el("div", { class: "meta" }, new Date(x.ts).toLocaleString("en-IN") + (x.note ? ` · ${x.note}` : ""))
          )
        ),
        el("span", { class: `tag ${tagMap[x.type] || "gray"}` }, `${x.qty > 0 ? "+" : ""}${x.qty}`)
      ));
    });
  }

  let charts = {};
  function drawLineChart(id, labels, data) {
    if (!window.Chart) { setTimeout(() => drawLineChart(id, labels, data), 200); return; }
    if (charts[id]) charts[id].destroy();
    const ctx = document.getElementById(id);
    if (!ctx) return;
    const grad = ctx.getContext("2d").createLinearGradient(0, 0, 0, 240);
    grad.addColorStop(0, "rgba(6,182,212,0.35)"); grad.addColorStop(1, "rgba(6,182,212,0.00)");
    charts[id] = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [{ label: "Sales", data, borderColor: "#06B6D4", backgroundColor: grad, fill: true, tension: 0.35, pointRadius: 3, pointBackgroundColor: "#0B1220", borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: "#0B1220", padding: 10, callbacks: { label: (c) => fmt(c.parsed.y) } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#5C6B85", font: { size: 11 } } },
          y: { grid: { color: "#E4E8F1" }, ticks: { color: "#5C6B85", font: { size: 11 }, callback: (v) => fmt(v) } }
        }
      }
    });
  }

  function drawDoughnut(id, labels, data) {
    if (!window.Chart) { setTimeout(() => drawDoughnut(id, labels, data), 200); return; }
    if (charts[id]) charts[id].destroy();
    const ctx = document.getElementById(id);
    if (!ctx) return;
    charts[id] = new Chart(ctx, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: ["#06B6D4", "#8B5CF6", "#10B981", "#F59E0B", "#F43F5E", "#0EA5E9", "#A855F7"], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "right", labels: { color: "#1F2A44", font: { size: 12 } } } } }
    });
  }

  // ===========================================================
  //                       PRODUCTS
  // ===========================================================
  function renderProducts() {
    const sel = $("#prodFilterCat");
    sel.innerHTML = `<option value="">All categories</option>` + state.categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    $("#prodAdd").onclick = () => editProductDialog();
    $("#prodSearch").oninput = paintProducts;
    sel.onchange = paintProducts;
    $("#prodPrintAll").onclick = printAllBarcodes;
    paintProducts();
  }
  function paintProducts() {
    const q = ($("#prodSearch")?.value || "").toLowerCase();
    const cat = $("#prodFilterCat")?.value || "";
    const tbody = $("#prodTbody"); tbody.innerHTML = "";
    const rows = state.products.filter((p) => {
      if (cat && p.category !== cat) return false;
      if (!q) return true;
      return [p.name, p.sku, p.barcode, p.category].some((v) => (v || "").toLowerCase().includes(q));
    });
    $("#prodEmpty").classList.toggle("hidden", rows.length > 0);
    rows.forEach((p) => tbody.appendChild(productRow(p)));
  }
  function productRow(p) {
    const sup = state.suppliers.find((s) => s.id === p.supplierId);
    const lowT = p.lowStock ?? state.shop.lowStockThreshold;
    const stockClass = (p.stock || 0) === 0 ? "low" : (p.stock || 0) <= lowT ? "mid" : "";
    const stockPct = Math.min(100, ((p.stock || 0) / Math.max(20, lowT * 4)) * 100);

    const tr = el("tr",
      { "data-testid": `product-row-${p.sku}` },
      el("td", {}, el("span", { class: "sku-pill" }, p.sku)),
      el("td", {},
        el("div", { style: "font-weight:600" }, p.name),
        el("div", { class: "meta muted", style: "font-size:11.5px" }, p.barcode)
      ),
      el("td", {}, el("span", { class: "tag" }, p.category || "—")),
      el("td", {}, sup ? sup.name : el("span", { class: "muted" }, "—")),
      el("td", { class: "num" }, fmt(p.cost)),
      el("td", { class: "num", style: "font-weight:700" }, fmt(p.price)),
      el("td", { class: "num" },
        el("span", { class: "stock-cell" },
          el("span", {}, String(p.stock || 0)),
          el("span", { class: `stock-bar ${stockClass}` }, el("div", { style: `width:${stockPct}%` }))
        )
      ),
      el("td", {},
        el("button", { class: "icon-btn", title: "View / Print barcode", "data-testid": `print-barcode-${p.sku}`, onclick: () => showBarcodeDialog(p) }, el("i", { class: "fa-solid fa-barcode" }))
      ),
      el("td", { class: "row-actions" },
        el("button", { class: "icon-btn", title: "Edit", "data-testid": `edit-product-${p.sku}`, onclick: () => editProductDialog(p) }, el("i", { class: "fa-solid fa-pen" })),
        el("button", { class: "icon-btn danger", title: "Delete", "data-testid": `delete-product-${p.sku}`, onclick: () => deleteProduct(p) }, el("i", { class: "fa-solid fa-trash" }))
      )
    );
    return tr;
  }

  function editProductDialog(existing) {
    const isNew = !existing;
    const p = existing ? { ...existing } : {
      id: uid("p"),
      sku: nextSku(),
      barcode: genBarcodeValue(state.meta.productCounter),
      name: "", category: state.categories[0] || "", supplierId: "",
      cost: 0, price: 0, stock: 0, lowStock: state.shop.lowStockThreshold,
      createdAt: new Date().toISOString(),
    };
    const form = el("div", { class: "form-grid" });

    form.innerHTML = `
      <label class="span-2">Product name <input data-f="name" type="text" placeholder="e.g. Logitech MK270 Combo" required data-testid="form-product-name"/></label>
      <label>SKU <input data-f="sku" type="text" data-testid="form-product-sku" /></label>
      <label>Category
        <select data-f="category" data-testid="form-product-category">
          ${state.categories.map((c) => `<option ${c === p.category ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
        </select>
      </label>
      <label>Supplier
        <select data-f="supplierId" data-testid="form-product-supplier">
          <option value="">— None —</option>
          ${state.suppliers.map((s) => `<option value="${s.id}" ${s.id === p.supplierId ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}
        </select>
      </label>
      <label>Cost (₹) <input data-f="cost" type="number" min="0" step="0.01" data-testid="form-product-cost"/></label>
      <label>Selling price (₹) <input data-f="price" type="number" min="0" step="0.01" data-testid="form-product-price"/></label>
      <label>Opening stock <input data-f="stock" type="number" min="0" data-testid="form-product-stock"/></label>
      <label>Low stock alert <input data-f="lowStock" type="number" min="0" data-testid="form-product-lowstock"/></label>
      <div class="span-2 barcode-preview">
        <svg id="bcPreview"></svg>
        <div class="code mono">Barcode: <strong>${escapeHtml(p.barcode)}</strong></div>
      </div>
    `;
    // pre-fill values
    Object.entries(p).forEach(([k, v]) => { const i = form.querySelector(`[data-f="${k}"]`); if (i) i.value = v; });

    setTimeout(() => renderBarcodeSVG($("#bcPreview", form), p.barcode, { width: 2.2, height: 60 }), 0);

    const cancel = el("button", { class: "btn btn-ghost", onclick: () => $(".modal-back").__close(null), "data-testid": "form-product-cancel" }, "Cancel");
    const ok = el("button", { class: "btn btn-primary", "data-testid": "form-product-save", onclick: () => {
      const out = { ...p };
      form.querySelectorAll("[data-f]").forEach((i) => {
        const k = i.dataset.f;
        out[k] = i.type === "number" ? Number(i.value || 0) : i.value;
      });
      if (!out.name.trim()) { toast("Name is required", "error"); return; }
      if (!out.sku.trim()) { toast("SKU is required", "error"); return; }
      if (state.products.some((x) => x.sku === out.sku && x.id !== out.id)) { toast("SKU already exists", "error"); return; }

      const prevStock = existing ? existing.stock : 0;
      if (isNew) {
        state.products.push(out);
        state.meta.productCounter += 1;
        if (out.stock > 0) state.txns.push({ id: uid("t"), ts: Date.now(), type: "in", productId: out.id, qty: out.stock, note: "Opening stock" });
      } else {
        const i = state.products.findIndex((x) => x.id === out.id);
        state.products[i] = out;
        const diff = out.stock - prevStock;
        if (diff !== 0) state.txns.push({ id: uid("t"), ts: Date.now(), type: "adjust", productId: out.id, qty: diff, note: "Manual edit" });
      }
      save();
      $(".modal-back").__close(true);
      toast(`Product ${isNew ? "added" : "updated"}`, "success");
      paintProducts();
    } }, isNew ? "Add Product" : "Save");

    modal({ title: isNew ? "Add Product" : "Edit Product", body: form, footer: [cancel, ok], size: "lg" });
  }

  function nextSku() {
    const n = state.meta.productCounter;
    return `MCE-${String(n).padStart(4, "0")}`;
  }

  async function deleteProduct(p) {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    state.products = state.products.filter((x) => x.id !== p.id);
    save(); paintProducts(); toast("Product deleted", "success");
  }

  function showBarcodeDialog(p) {
    const body = el("div");
    body.innerHTML = `
      <div class="barcode-preview">
        <svg id="bcLarge"></svg>
        <div class="code mono">${escapeHtml(p.sku)} · ${escapeHtml(p.name)}</div>
      </div>
      <p class="muted" style="margin-top:12px">Print and stick on the product. The scanner can read this in POS, Stock In/Out and global scan.</p>
    `;
    setTimeout(() => renderBarcodeSVG($("#bcLarge", body), p.barcode, { width: 3, height: 86 }), 0);

    const close = el("button", { class: "btn btn-ghost", onclick: () => $(".modal-back").__close(null) }, "Close");
    const print = el("button", { class: "btn btn-primary", onclick: () => printBarcodeOne(p) }, el("i", { class: "fa-solid fa-print" }), " Print");
    modal({ title: `Barcode · ${p.name}`, body, footer: [close, print] });
  }

  function printBarcodeOne(p) {
    const w = window.open("", "_blank", "width=420,height=260");
    w.document.write(`<html><head><title>${escapeHtml(p.sku)}</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
      <style>body{font-family:Manrope,sans-serif;text-align:center;padding:14px}h4{margin:0 0 6px;font-size:13px}</style>
      </head><body><h4>${escapeHtml(p.name)}</h4><svg id="bc"></svg>
      <script>window.onload=function(){JsBarcode("#bc","${p.barcode}",{format:"CODE128",height:80,fontSize:14});setTimeout(function(){window.print();window.close()},300);}<\/script>
      </body></html>`);
    w.document.close();
  }

  function printAllBarcodes() {
    if (state.products.length === 0) { toast("No products to print", "warn"); return; }
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) { toast("Pop-up blocked — allow pop-ups to print", "error"); return; }
    const cells = state.products.map((p) => `<div class="bc"><div class="nm">${escapeHtml(p.name)}</div><svg id="bc_${p.id}"></svg><div class="sk">${escapeHtml(p.sku)}</div></div>`).join("");
    const codes = state.products.map((p) => `JsBarcode("#bc_${p.id}","${p.barcode}",{format:"CODE128",width:1.7,height:46,fontSize:11,margin:4});`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Barcodes · ${state.products.length}</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
      <style>
        @page { size: A4; margin: 10mm; }
        body { font-family: 'Manrope', system-ui, sans-serif; margin: 0; padding: 6mm; }
        h2 { font-size: 14px; margin: 0 0 10px; }
        .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .bc { border: 1px dashed #B7BFCE; border-radius: 8px; padding: 8px; text-align: center; break-inside: avoid; }
        .nm { font-size: 11px; font-weight: 600; margin-bottom: 4px; min-height: 28px; }
        .sk { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #5C6B85; margin-top: 2px; }
      </style></head><body>
      <h2>Barcodes — ${state.products.length} items</h2>
      <div class="sheet">${cells}</div>
      <script>window.onload=function(){${codes}setTimeout(function(){window.print();},350);}<\/script>
      </body></html>`);
    w.document.close();
  }

  // ===========================================================
  //                    INVENTORY (Stock In/Out)
  // ===========================================================
  function renderInventory() {
    const sel = $("#invProductSelect");
    sel.innerHTML = `<option value="">— Select product —</option>` + state.products.map((p) => `<option value="${p.id}">${escapeHtml(p.sku)} · ${escapeHtml(p.name)}</option>`).join("");
    sel.onchange = () => showSelectedInvProduct(sel.value);

    $("#invCameraBtn").onclick = () => openCameraScanner((code) => $("#invScanInput").value = code, "inv-camera");
    $("#invScanInput").addEventListener("keydown", (e) => { if (e.key === "Enter") commitInvScan(); });
    $("#invScanInput").addEventListener("input", () => previewInvScan());
    $("#invCommit").onclick = commitInvScan;
    paintInvHistory();
  }
  function previewInvScan() {
    const v = $("#invScanInput").value.trim();
    const res = $("#invScanResult");
    if (!v) { res.className = "scan-result"; res.textContent = "Awaiting scan…"; return; }
    const p = state.products.find((p) => p.barcode === v || p.sku === v);
    if (!p) { res.className = "scan-result not-found"; res.textContent = `No product found for "${v}"`; return; }
    res.className = "scan-result found";
    res.innerHTML = `<strong>${escapeHtml(p.name)}</strong> · SKU ${escapeHtml(p.sku)} · current stock: <span class="mono">${p.stock || 0}</span>`;
  }
  function showSelectedInvProduct(id) {
    const p = state.products.find((x) => x.id === id);
    const card = $("#invSelectedCard");
    if (!p) { card.innerHTML = "Select a product to view current stock."; card.className = "muted"; return; }
    card.className = "";
    card.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2)">
      <div><div style="font-weight:700;font-size:15px">${escapeHtml(p.name)}</div>
      <div class="muted mono" style="font-size:12px">${escapeHtml(p.sku)} · ${escapeHtml(p.barcode)}</div></div>
      <div style="text-align:right"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:1px">Current stock</div>
      <div class="mono" style="font-size:24px;font-weight:700">${p.stock || 0}</div></div></div>`;
    $("#invScanInput").value = p.barcode; previewInvScan();
  }
  function commitInvScan() {
    const v = $("#invScanInput").value.trim();
    if (!v) { toast("Scan or enter a barcode", "warn"); return; }
    const p = state.products.find((p) => p.barcode === v || p.sku === v);
    if (!p) { toast("Product not found", "error"); return; }
    const mode = $('input[name="invMode"]:checked').value;
    const qty = Math.max(1, Number($("#invQty").value || 1));
    const note = $("#invNote").value.trim();
    const delta = mode === "in" ? qty : -qty;
    if (mode === "out" && (p.stock || 0) < qty) { toast("Insufficient stock", "error"); return; }
    p.stock = (p.stock || 0) + delta;
    state.txns.push({ id: uid("t"), ts: Date.now(), type: mode, productId: p.id, qty: delta, note });
    save();
    toast(`${mode === "in" ? "Added" : "Removed"} ${qty} × ${p.name}`, "success");
    $("#invScanInput").value = ""; $("#invNote").value = ""; $("#invQty").value = 1;
    previewInvScan(); paintInvHistory();
    if ($("#invProductSelect").value === p.id) showSelectedInvProduct(p.id);
  }
  function paintInvHistory() {
    const tb = $("#invHistory"); tb.innerHTML = "";
    const rows = [...state.txns].slice(-50).reverse();
    if (rows.length === 0) { tb.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;padding:30px">No transactions yet.</td></tr>`; return; }
    rows.forEach((x) => {
      const p = state.products.find((pp) => pp.id === x.productId);
      const map = { in: "emerald", out: "amber", sale: "violet", adjust: "gray" };
      tb.appendChild(el("tr",
        {},
        el("td", { class: "mono", style: "font-size:12px;color:var(--muted)" }, new Date(x.ts).toLocaleString("en-IN")),
        el("td", {}, el("span", { class: `tag ${map[x.type] || "gray"}` }, x.type.toUpperCase())),
        el("td", {}, p ? `${p.sku} · ${p.name}` : "Deleted product"),
        el("td", { class: "num", style: "font-weight:700;color:" + (x.qty > 0 ? "#065F46" : "#9F1239") }, `${x.qty > 0 ? "+" : ""}${x.qty}`),
        el("td", { class: "muted" }, x.note || "—")
      ));
    });
  }

  // ===========================================================
  //                       POS / BILLING
  // ===========================================================
  let cart = [];
  function renderPOS() {
    cart = [];
    $("#posIpHint").innerHTML = state.ip.enforce
      ? (isIpAllowed() ? `<span class="tag emerald">scanner IP ok · ${detectedIp || "?"}</span>` : `<span class="tag rose">scanner IP blocked</span>`)
      : `<span class="tag gray">IP restriction off</span>`;
    $("#posScanInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { addToCartByCode($("#posScanInput").value.trim()); $("#posScanInput").value = ""; } });
    $("#posCameraBtn").onclick = () => openCameraScanner((code) => { addToCartByCode(code); }, "pos-camera");
    $("#posProdSearch").oninput = paintPosGrid;
    $("#cartClear").onclick = () => { cart = []; paintCart(); };
    $("#cartDiscount").oninput = paintCart;
    $("#cartTax").oninput = paintCart;
    $("#cartTax").value = state.shop.taxPct || 0;
    $("#checkoutBtn").onclick = checkout;
    paintPosGrid(); paintCart();
    setTimeout(() => $("#posScanInput").focus(), 50);
  }
  function paintPosGrid() {
    const q = ($("#posProdSearch")?.value || "").toLowerCase();
    const grid = $("#posProductGrid"); grid.innerHTML = "";
    const items = state.products.filter((p) => !q || [p.name, p.sku, p.barcode, p.category].some((v) => (v || "").toLowerCase().includes(q))).slice(0, 60);
    if (items.length === 0) { grid.innerHTML = `<div class="empty"><i class="fa-solid fa-box-open"></i><h4>No products</h4><p>Add some products first.</p></div>`; return; }
    items.forEach((p) => {
      const oos = (p.stock || 0) === 0;
      const c = el("button", { class: `prod-card ${oos ? "oos" : ""}`, "data-testid": `pos-card-${p.sku}`, onclick: () => !oos && addToCart(p) },
        el("div", { class: "name" }, p.name),
        el("div", { class: "meta" }, `${p.sku} · stock ${p.stock || 0}`),
        el("div", { class: "price" }, fmt(p.price))
      );
      grid.appendChild(c);
    });
  }
  function addToCartByCode(code) {
    if (!code) return;
    const p = state.products.find((p) => p.barcode === code || p.sku === code);
    if (!p) { toast(`No product for "${code}"`, "error"); return; }
    addToCart(p);
  }
  function addToCart(p) {
    if ((p.stock || 0) <= 0) { toast(`${p.name} is out of stock`, "warn"); return; }
    const existing = cart.find((c) => c.productId === p.id);
    if (existing) {
      if (existing.qty + 1 > (p.stock || 0)) { toast("Stock limit reached", "warn"); return; }
      existing.qty += 1;
    } else cart.push({ productId: p.id, name: p.name, sku: p.sku, price: p.price, qty: 1 });
    paintCart();
  }
  function paintCart() {
    const list = $("#cartList"); list.innerHTML = "";
    if (cart.length === 0) list.innerHTML = `<div class="cart-empty"><i class="fa-solid fa-cart-shopping" style="font-size:28px;display:block;margin-bottom:8px;color:var(--muted-2)"></i>Cart is empty</div>`;
    cart.forEach((item, idx) => {
      const p = state.products.find((pp) => pp.id === item.productId);
      list.appendChild(el("div", { class: "cart-item" },
        el("div", {},
          el("div", { class: "ci-name" }, item.name),
          el("div", { class: "ci-meta" }, `${item.sku} · ${fmt(item.price)}`)
        ),
        el("div", { class: "ci-qty" },
          el("button", { "data-testid": `cart-minus-${item.sku}`, onclick: () => { item.qty = Math.max(1, item.qty - 1); paintCart(); } }, "−"),
          el("input", { type: "number", value: item.qty, min: 1, max: p?.stock || 99, "data-testid": `cart-qty-${item.sku}`, oninput: (e) => { const v = Math.max(1, Math.min(Number(e.target.value || 1), p?.stock || 99)); item.qty = v; paintCart(); } }),
          el("button", { "data-testid": `cart-plus-${item.sku}`, onclick: () => { if (item.qty + 1 > (p?.stock || 1)) { toast("Stock limit reached", "warn"); return; } item.qty += 1; paintCart(); } }, "+")
        ),
        el("div", { class: "ci-price" }, fmt(item.price * item.qty)),
        el("button", { class: "ci-x", "data-testid": `cart-remove-${item.sku}`, onclick: () => { cart.splice(idx, 1); paintCart(); } }, el("i", { class: "fa-solid fa-xmark" }))
      ));
    });
    const sub = cart.reduce((a, i) => a + i.price * i.qty, 0);
    const disc = Number($("#cartDiscount")?.value || 0);
    const tax = Number($("#cartTax")?.value || 0);
    const afterDisc = sub - (sub * disc) / 100;
    const total = afterDisc + (afterDisc * tax) / 100;
    $("#cartSubtotal").textContent = fmt(sub);
    $("#cartGrand").textContent = fmt(total);
  }
  function checkout() {
    if (cart.length === 0) { toast("Cart is empty", "warn"); return; }
    const sub = cart.reduce((a, i) => a + i.price * i.qty, 0);
    const disc = Number($("#cartDiscount").value || 0);
    const tax = Number($("#cartTax").value || 0);
    const afterDisc = sub - (sub * disc) / 100;
    const total = afterDisc + (afterDisc * tax) / 100;
    const invNo = `INV-${String(state.meta.invoiceCounter).padStart(5, "0")}`;
    const inv = {
      id: uid("iv"), no: invNo, date: new Date().toISOString(),
      customer: { name: $("#custName").value.trim(), phone: $("#custPhone").value.trim() },
      items: cart.map((c) => ({ ...c })),
      subtotal: sub, discountPct: disc, taxPct: tax, total,
      payment: $("#payMethod").value,
    };
    // deduct stock + txn
    cart.forEach((c) => {
      const p = state.products.find((pp) => pp.id === c.productId);
      if (p) {
        p.stock = (p.stock || 0) - c.qty;
        state.txns.push({ id: uid("t"), ts: Date.now(), type: "sale", productId: p.id, qty: -c.qty, note: invNo, ref: inv.id });
      }
    });
    state.invoices.push(inv);
    state.meta.invoiceCounter += 1;
    save();
    cart = []; $("#custName").value = ""; $("#custPhone").value = ""; $("#cartDiscount").value = 0;
    paintCart(); paintPosGrid();
    toast(`Sale recorded · ${invNo}`, "success");
    showInvoiceDialog(inv);
  }

  // ===========================================================
  //                       INVOICES
  // ===========================================================
  function renderInvoices() {
    $("#invSearch").oninput = paintInvoices;
    $("#invDateFrom").onchange = paintInvoices;
    $("#invDateTo").onchange = paintInvoices;
    paintInvoices();
  }
  function paintInvoices() {
    const q = ($("#invSearch")?.value || "").toLowerCase();
    const f = $("#invDateFrom")?.value || "";
    const t = $("#invDateTo")?.value || "";
    const tb = $("#invoicesTbody"); tb.innerHTML = "";
    let rows = [...state.invoices].reverse();
    if (q) rows = rows.filter((i) => [i.no, i.customer?.name, i.customer?.phone].some((v) => (v || "").toLowerCase().includes(q)));
    if (f) rows = rows.filter((i) => i.date.slice(0, 10) >= f);
    if (t) rows = rows.filter((i) => i.date.slice(0, 10) <= t);
    if (rows.length === 0) { tb.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:30px">No invoices found.</td></tr>`; return; }
    rows.forEach((iv) => {
      tb.appendChild(el("tr",
        { "data-testid": `invoice-row-${iv.no}` },
        el("td", {}, el("span", { class: "sku-pill" }, iv.no)),
        el("td", { class: "mono", style: "font-size:12px;color:var(--muted)" }, new Date(iv.date).toLocaleString("en-IN")),
        el("td", {}, iv.customer?.name || el("span", { class: "muted" }, "Walk-in")),
        el("td", { class: "num" }, iv.items.reduce((a, i) => a + i.qty, 0)),
        el("td", { class: "num", style: "font-weight:700" }, fmt(iv.total)),
        el("td", {}, el("span", { class: "tag gray" }, (iv.payment || "—").toUpperCase())),
        el("td", { class: "row-actions" },
          el("button", { class: "icon-btn", title: "View / Print", "data-testid": `view-invoice-${iv.no}`, onclick: () => showInvoiceDialog(iv) }, el("i", { class: "fa-solid fa-eye" })),
          el("button", { class: "icon-btn danger", title: "Delete", "data-testid": `delete-invoice-${iv.no}`, onclick: () => deleteInvoice(iv) }, el("i", { class: "fa-solid fa-trash" }))
        )
      ));
    });
  }
  function deleteInvoice(iv) {
    if (!confirm(`Delete invoice ${iv.no}? Stock will be restored.`)) return;
    iv.items.forEach((it) => { const p = state.products.find((pp) => pp.id === it.productId); if (p) p.stock = (p.stock || 0) + it.qty; });
    state.txns = state.txns.filter((t) => t.ref !== iv.id);
    state.invoices = state.invoices.filter((x) => x.id !== iv.id);
    save(); paintInvoices(); toast("Invoice deleted, stock restored", "success");
  }
  function showInvoiceDialog(iv) {
    const s = state.shop;
    const body = el("div", { id: "printArea" });
    const rowsHtml = iv.items.map((it) => `<tr><td>${escapeHtml(it.name)}<div class="muted mono" style="font-size:11px">${escapeHtml(it.sku)}</div></td><td class="num mono">${fmt(it.price)}</td><td class="num mono">${it.qty}</td><td class="num mono">${fmt(it.price * it.qty)}</td></tr>`).join("");
    body.innerHTML = `
      <div class="invoice-print">
        <div class="inv-h">
          <div>
            <h2>${escapeHtml(s.name)}</h2>
            ${s.address ? `<div class="muted">${escapeHtml(s.address)}</div>` : ""}
            ${s.phone ? `<div class="muted">Ph: ${escapeHtml(s.phone)}</div>` : ""}
            ${s.gstin ? `<div class="muted">GSTIN: ${escapeHtml(s.gstin)}</div>` : ""}
          </div>
          <div class="inv-meta">
            <div style="font-family:var(--font-head);font-weight:700;font-size:18px;color:var(--ink)">${iv.no}</div>
            <div>${new Date(iv.date).toLocaleString("en-IN")}</div>
            <div>Payment: <strong>${(iv.payment || "—").toUpperCase()}</strong></div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:10px">
          <div><strong style="color:var(--ink)">Bill to:</strong> ${escapeHtml(iv.customer?.name || "Walk-in customer")} ${iv.customer?.phone ? "· " + escapeHtml(iv.customer.phone) : ""}</div>
        </div>
        <table>
          <thead><tr><th>Item</th><th class="num">Rate</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="inv-total">
          <div>Subtotal: <span class="mono" style="margin-left:18px">${fmt(iv.subtotal)}</span></div>
          ${iv.discountPct ? `<div>Discount (${iv.discountPct}%): <span class="mono" style="margin-left:18px">- ${fmt((iv.subtotal * iv.discountPct) / 100)}</span></div>` : ""}
          ${iv.taxPct ? `<div>GST (${iv.taxPct}%): <span class="mono" style="margin-left:18px">+ ${fmt(((iv.subtotal - (iv.subtotal * iv.discountPct) / 100) * iv.taxPct) / 100)}</span></div>` : ""}
          <div class="g">Total: <span class="mono" style="margin-left:18px">${fmt(iv.total)}</span></div>
        </div>
        <div class="inv-foot">Thank you for shopping with ${escapeHtml(s.name)} · Powered by Maa Inventory Suite</div>
      </div>`;

    const close = el("button", { class: "btn btn-ghost", onclick: () => $(".modal-back").__close(null) }, "Close");
    const returnBtn = el("button", { class: "btn btn-ghost", "data-testid": "invoice-return-btn", onclick: () => { $(".modal-back").__close(null); openReturnDialog(iv); } }, el("i", { class: "fa-solid fa-rotate-left" }), " Return items");
    const thermalBtn = el("button", { class: "btn btn-ghost", "data-testid": "invoice-thermal-btn", onclick: () => printThermal58(iv) }, el("i", { class: "fa-solid fa-receipt" }), " 58mm Receipt");
    const print = el("button", { class: "btn btn-primary", onclick: () => printInvoiceA4(iv), "data-testid": "invoice-print-btn" }, el("i", { class: "fa-solid fa-print" }), " Print A4");
    modal({ title: `Invoice ${iv.no}`, body, footer: [close, returnBtn, thermalBtn, print], size: "lg" });
  }

  function printInvoiceA4(iv) {
    const s = state.shop;
    const rowsHtml = iv.items.map((it) => `<tr><td><div style="font-weight:600">${escapeHtml(it.name)}</div><div class="sku">${escapeHtml(it.sku)}</div></td><td class="num">${fmt(it.price)}</td><td class="num">${it.qty}</td><td class="num">${fmt(it.price * it.qty)}</td></tr>`).join("");
    const discAmt = (iv.subtotal * iv.discountPct) / 100;
    const taxAmt = ((iv.subtotal - discAmt) * iv.taxPct) / 100;
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) { toast("Pop-up blocked — allow pop-ups to print", "error"); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(iv.no)}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; }
        body { font-family: 'Manrope', system-ui, -apple-system, sans-serif; color: #0B1220; margin: 0; padding: 0; }
        .h { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0B1220; padding-bottom: 14px; margin-bottom: 22px; }
        h1 { margin: 0 0 4px; font-size: 22px; font-family: 'Sora', sans-serif; }
        .muted { color: #5C6B85; font-size: 12.5px; line-height: 1.55; }
        .meta { text-align: right; font-size: 12.5px; color: #5C6B85; }
        .meta .no { font-family: 'Sora', sans-serif; font-weight: 700; font-size: 20px; color: #0B1220; margin-bottom: 4px; }
        .bill { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 12px; }
        .bill b { color: #0B1220; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        th { background: #ECEFF5; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #5C6B85; padding: 10px 12px; border-bottom: 1px solid #D7DCE8; }
        th.num, td.num { text-align: right; }
        td { padding: 11px 12px; border-bottom: 1px solid #E4E8F1; font-size: 13px; vertical-align: top; }
        .sku { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #5C6B85; margin-top: 2px; }
        .tot { display: flex; flex-direction: column; align-items: flex-end; margin-top: 20px; gap: 4px; font-size: 13px; }
        .tot .row { display: flex; justify-content: space-between; min-width: 260px; }
        .tot .row span:last-child { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
        .grand { font-family: 'Sora', sans-serif; font-weight: 700; font-size: 18px; padding-top: 8px; border-top: 1px dashed #D7DCE8; margin-top: 6px; width: 100%; min-width: 260px; }
        .grand span:last-child { font-weight: 700; font-size: 18px; }
        .pay { display: inline-block; background: #ECEFF5; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 1px; color: #1F2A44; }
        .foot { margin-top: 36px; text-align: center; font-size: 11px; color: #8593AB; border-top: 1px solid #E4E8F1; padding-top: 12px; }
      </style></head><body>
      <div class="h">
        <div>
          <h1>${escapeHtml(s.name)}</h1>
          ${s.address ? `<div class="muted">${escapeHtml(s.address)}</div>` : ""}
          ${s.phone ? `<div class="muted">Ph: ${escapeHtml(s.phone)}</div>` : ""}
          ${s.gstin ? `<div class="muted">GSTIN: ${escapeHtml(s.gstin)}</div>` : ""}
        </div>
        <div class="meta">
          <div class="no">${escapeHtml(iv.no)}</div>
          <div>${new Date(iv.date).toLocaleString("en-IN")}</div>
          <div style="margin-top:6px"><span class="pay">${(iv.payment || "—").toUpperCase()}</span></div>
        </div>
      </div>
      <div class="bill"><div><b>Bill to:</b> ${escapeHtml(iv.customer?.name || "Walk-in customer")} ${iv.customer?.phone ? "· " + escapeHtml(iv.customer.phone) : ""}</div></div>
      <table>
        <thead><tr><th>Item</th><th class="num">Rate</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="tot">
        <div class="row"><span>Subtotal</span><span>${fmt(iv.subtotal)}</span></div>
        ${iv.discountPct ? `<div class="row"><span>Discount (${iv.discountPct}%)</span><span>- ${fmt(discAmt)}</span></div>` : ""}
        ${iv.taxPct ? `<div class="row"><span>GST (${iv.taxPct}%)</span><span>+ ${fmt(taxAmt)}</span></div>` : ""}
        <div class="row grand"><span>Total</span><span>${fmt(iv.total)}</span></div>
      </div>
      <div class="foot">Thank you for shopping with ${escapeHtml(s.name)} · Powered by Maa Inventory Suite</div>
      <script>window.onload=function(){setTimeout(function(){window.print();},300);}<\/script>
      </body></html>`);
    w.document.close();
  }

  // ===========================================================
  //                       CATEGORIES
  // ===========================================================
  function renderCategories() {
    $("#catAdd").onclick = async () => {
      const name = prompt("Category name?");
      if (!name) return;
      const t = name.trim();
      if (!t) return;
      if (state.categories.includes(t)) { toast("Already exists", "warn"); return; }
      state.categories.push(t); save(); paintCats(); toast("Category added", "success");
    };
    paintCats();
  }
  function paintCats() {
    const g = $("#catGrid"); g.innerHTML = "";
    if (state.categories.length === 0) { g.innerHTML = `<div class="empty"><i class="fa-solid fa-tag"></i><h4>No categories</h4></div>`; return; }
    state.categories.forEach((c) => {
      g.appendChild(el("div", { class: "chip" }, c, el("span", { class: "x", title: "Remove", onclick: () => removeCat(c) }, el("i", { class: "fa-solid fa-xmark" }))));
    });
  }
  function removeCat(c) {
    if (state.products.some((p) => p.category === c)) { toast("Category in use by products", "warn"); return; }
    state.categories = state.categories.filter((x) => x !== c); save(); paintCats();
  }

  // ===========================================================
  //                       SUPPLIERS
  // ===========================================================
  function renderSuppliers() {
    $("#supAdd").onclick = () => editSupplierDialog();
    paintSuppliers();
  }
  function paintSuppliers() {
    const tb = $("#supTbody"); tb.innerHTML = "";
    if (state.suppliers.length === 0) { tb.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;padding:30px">No suppliers yet.</td></tr>`; return; }
    state.suppliers.forEach((s) => {
      tb.appendChild(el("tr",
        {},
        el("td", { style: "font-weight:600" }, s.name),
        el("td", {}, s.contact || el("span", { class: "muted" }, "—")),
        el("td", { class: "mono" }, s.phone || el("span", { class: "muted" }, "—")),
        el("td", { class: "muted" }, s.address || "—"),
        el("td", { class: "row-actions" },
          el("button", { class: "icon-btn", onclick: () => editSupplierDialog(s) }, el("i", { class: "fa-solid fa-pen" })),
          el("button", { class: "icon-btn danger", onclick: () => { if (confirm("Delete supplier?")) { state.suppliers = state.suppliers.filter((x) => x.id !== s.id); save(); paintSuppliers(); } } }, el("i", { class: "fa-solid fa-trash" }))
        )
      ));
    });
  }
  function editSupplierDialog(existing) {
    const s = existing ? { ...existing } : { id: uid("s"), name: "", contact: "", phone: "", address: "" };
    const form = el("div", { class: "form-grid" });
    form.innerHTML = `
      <label class="span-2">Supplier name <input data-f="name" type="text" required data-testid="sup-name"/></label>
      <label>Contact person <input data-f="contact" type="text" data-testid="sup-contact"/></label>
      <label>Phone <input data-f="phone" type="text" data-testid="sup-phone"/></label>
      <label class="span-2">Address <input data-f="address" type="text" data-testid="sup-address"/></label>
    `;
    Object.entries(s).forEach(([k, v]) => { const i = form.querySelector(`[data-f="${k}"]`); if (i) i.value = v; });
    const cancel = el("button", { class: "btn btn-ghost", onclick: () => $(".modal-back").__close(null) }, "Cancel");
    const ok = el("button", { class: "btn btn-primary", "data-testid": "sup-save", onclick: () => {
      const out = { ...s };
      form.querySelectorAll("[data-f]").forEach((i) => out[i.dataset.f] = i.value);
      if (!out.name.trim()) { toast("Name required", "error"); return; }
      if (existing) { const i = state.suppliers.findIndex((x) => x.id === out.id); state.suppliers[i] = out; }
      else state.suppliers.push(out);
      save(); $(".modal-back").__close(true); paintSuppliers(); toast("Supplier saved", "success");
    } }, "Save");
    modal({ title: existing ? "Edit Supplier" : "Add Supplier", body: form, footer: [cancel, ok] });
  }

  // ===========================================================
  //                       REPORTS
  // ===========================================================
  let repDays = 7;
  function renderReports() {
    $$(".seg-btn").forEach((b) => b.onclick = () => {
      $$(".seg-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      repDays = Number(b.dataset.range);
      paintReports();
    });
    $("#exportSalesCsv").onclick = exportSalesCsv;
    paintReports();
  }
  function paintReports() {
    const since = Date.now() - repDays * 24 * 3600 * 1000;
    const invs = state.invoices.filter((i) => new Date(i.date).getTime() >= since);
    const refs = state.refunds.filter((r) => new Date(r.date).getTime() >= since);
    const gross = invs.reduce((a, i) => a + i.total, 0);
    const refunded = refs.reduce((a, r) => a + r.total, 0);
    const rev = gross - refunded;
    const orders = invs.length;
    const grossItems = invs.reduce((a, i) => a + i.items.reduce((b, x) => b + x.qty, 0), 0);
    const refundItems = refs.reduce((a, r) => a + r.items.reduce((b, x) => b + x.qty, 0), 0);
    const items = grossItems - refundItems;
    const avg = orders ? rev / orders : 0;
    $("#repRev").textContent = fmt(rev);
    $("#repOrders").textContent = refs.length ? `${orders} · ${refs.length} returns` : orders;
    $("#repItems").textContent = items;
    $("#repAvg").textContent = fmt(avg);

    // chart - daily (net of refunds)
    const labels = []; const data = [];
    const days = Math.min(repDays, 30);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }));
      const k = d.toISOString().slice(0, 10);
      const dayGross = invs.filter((iv) => iv.date.slice(0, 10) === k).reduce((a, iv) => a + iv.total, 0);
      const dayRefund = refs.filter((r) => r.date.slice(0, 10) === k).reduce((a, r) => a + r.total, 0);
      data.push(dayGross - dayRefund);
    }
    drawLineChart("repChart", labels, data);

    // top products
    const counts = {};
    invs.forEach((iv) => iv.items.forEach((it) => { counts[it.productId] = (counts[it.productId] || 0) + it.qty; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const tl = $("#repTop"); tl.innerHTML = ""; tl.classList.add("list");
    if (top.length === 0) tl.innerHTML = `<div class="empty"><i class="fa-solid fa-chart-simple"></i><h4>No sales</h4></div>`;
    top.forEach(([pid, qty]) => {
      const p = state.products.find((x) => x.id === pid); if (!p) return;
      tl.appendChild(el("div", { class: "list-row" },
        el("div", { class: "l" }, el("div", { class: "icon-box" }, el("i", { class: "fa-solid fa-fire" })), el("div", {}, el("div", { class: "name" }, p.name), el("div", { class: "meta" }, p.sku))),
        el("div", { class: "r" }, `${qty} · ${fmt(qty * p.price)}`)
      ));
    });

    // category chart
    const byCat = {};
    invs.forEach((iv) => iv.items.forEach((it) => { const p = state.products.find((pp) => pp.id === it.productId); const cat = p?.category || "Other"; byCat[cat] = (byCat[cat] || 0) + it.qty * it.price; }));
    drawDoughnut("repCatChart", Object.keys(byCat), Object.values(byCat));
  }
  function exportSalesCsv() {
    const rows = [["Invoice", "Date", "Customer", "Phone", "Items", "Subtotal", "Discount%", "Tax%", "Total", "Payment"]];
    state.invoices.forEach((iv) => rows.push([iv.no, iv.date, iv.customer?.name || "", iv.customer?.phone || "", iv.items.reduce((a, i) => a + i.qty, 0), iv.subtotal, iv.discountPct, iv.taxPct, iv.total, iv.payment]));
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadBlob(csv, `sales_${today()}.csv`, "text/csv");
  }

  // ===========================================================
  //                       SETTINGS
  // ===========================================================
  function renderSettings() {
    $("#setShopName").value = state.shop.name;
    $("#setShopPhone").value = state.shop.phone;
    $("#setShopAddr").value = state.shop.address;
    $("#setShopGstin").value = state.shop.gstin;
    $("#setCurrency").value = state.shop.currency;
    $("#setTax").value = state.shop.taxPct;
    $("#setLowStock").value = state.shop.lowStockThreshold;
    $("#setSaveShop").onclick = () => {
      state.shop.name = $("#setShopName").value.trim() || "Maa Computer & Electronics";
      state.shop.phone = $("#setShopPhone").value.trim();
      state.shop.address = $("#setShopAddr").value.trim();
      state.shop.gstin = $("#setShopGstin").value.trim();
      state.shop.currency = $("#setCurrency").value || "₹";
      state.shop.taxPct = Number($("#setTax").value || 0);
      state.shop.lowStockThreshold = Number($("#setLowStock").value || 5);
      save(); toast("Shop info saved", "success");
    };

    $("#setDetectedIp").textContent = detectedIp || "detecting…";
    $("#setUseMyIp").onclick = () => { if (!detectedIp) return toast("IP not detected yet", "warn"); if (!state.ip.allowed.includes(detectedIp)) { state.ip.allowed.push(detectedIp); save(); paintIpChips(); paintIpPill(); toast("IP added", "success"); } };
    $("#setIpAdd").onclick = () => {
      const v = $("#setIpInput").value.trim();
      if (!v) return;
      if (state.ip.allowed.includes(v)) { toast("Already added", "warn"); return; }
      state.ip.allowed.push(v); save(); $("#setIpInput").value = ""; paintIpChips(); paintIpPill();
    };
    $("#setIpEnforce").checked = !!state.ip.enforce;
    $("#setIpEnforce").onchange = (e) => { state.ip.enforce = e.target.checked; save(); paintIpPill(); };
    paintIpChips();

    $("#setExport").onclick = exportBackup;
    $("#setImport").onclick = () => $("#importBackupFile").click();
    $("#setReset").onclick = async () => {
      if (!confirm("Erase ALL data? This cannot be undone.")) return;
      localStorage.removeItem(KEY); state = defaultState(); save(); toast("Data reset", "success"); go("dashboard");
    };

    // PIN lock controls
    $("#setPinEnabled").checked = !!state.lock.enabled;
    $("#setAutoLock").value = state.lock.autoLockMin || 0;
    $("#setPinSave").onclick = async () => {
      const pin = $("#setPinInput").value.trim();
      const enable = $("#setPinEnabled").checked;
      const autoMin = Math.max(0, Number($("#setAutoLock").value || 0));
      if (enable && !pin && !state.lock.pinHash) { toast("Set a PIN first", "error"); return; }
      if (pin) {
        if (!/^\d{4,6}$/.test(pin)) { toast("PIN must be 4–6 digits", "error"); return; }
        state.lock.pinHash = await sha256(pin);
      }
      state.lock.enabled = enable;
      state.lock.autoLockMin = autoMin;
      $("#setPinInput").value = "";
      save(); restartIdleTimer();
      toast("PIN settings saved", "success");
    };
    $("#setPinClear").onclick = () => {
      if (!confirm("Remove PIN lock?")) return;
      state.lock = { enabled: false, pinHash: null, autoLockMin: 0 };
      $("#setPinEnabled").checked = false; $("#setAutoLock").value = 0; $("#setPinInput").value = "";
      save(); toast("PIN removed", "success");
    };
    $("#setLockNow").onclick = () => { if (!state.lock.enabled || !state.lock.pinHash) { toast("Set & enable a PIN first", "warn"); return; } showLockScreen(); };

    // Cloud sync controls
    paintCloudStatus();
    $("#setCloudConfig").value = state.cloud.config ? JSON.stringify(state.cloud.config, null, 2) : "";
    $("#setShopId").value = state.cloud.shopId || "";
    $("#setAutoSync").checked = !!state.cloud.autoSync;
    $("#setAutoSync").onchange = (e) => { state.cloud.autoSync = e.target.checked; save(); paintCloudStatus(); };
    $("#setCloudConnect").onclick = cloudConnect;
    $("#setCloudPush").onclick = () => cloudPush(false);
    $("#setCloudPull").onclick = cloudPull;
    $("#setCloudDisconnect").onclick = () => {
      if (!confirm("Disconnect from cloud? Your local data will stay.")) return;
      stopCloudListener();
      state.cloud = { config: null, shopId: null, autoSync: false, lastSyncAt: null, lastError: null };
      save(); paintCloudStatus(); $("#setCloudConfig").value = ""; $("#setShopId").value = ""; $("#setAutoSync").checked = false;
      toast("Disconnected", "success");
    };
  }
  function paintCloudStatus() {
    const s = $("#cloudStatus"); if (!s) return;
    const connected = !!state.cloud.config && !!state.cloud.shopId;
    const last = state.cloud.lastSyncAt ? new Date(state.cloud.lastSyncAt).toLocaleString("en-IN") : "never";
    s.innerHTML = connected
      ? `<div><span class="tag emerald">CONNECTED</span> <span class="meta">${escapeHtml(state.cloud.shopId)}</span></div><div class="meta">last sync: ${last}${state.cloud.lastError ? ' · <span style="color:var(--rose)">' + escapeHtml(state.cloud.lastError) + '</span>' : ''}</div>`
      : `<div><span class="tag gray">NOT CONNECTED</span></div><div class="meta">paste your Firebase config below and click Connect</div>`;
    paintSidebarCloudPill();
  }
  function paintSidebarCloudPill() {
    let pill = $(".sidebar-footer .cloud-pill");
    if (!state.cloud.config || !state.cloud.shopId) { if (pill) pill.remove(); return; }
    if (!pill) {
      pill = el("div", { class: "cloud-pill" });
      $(".sidebar-footer").insertBefore(pill, $(".sidebar-footer .version"));
    }
    pill.className = "cloud-pill " + (state.cloud.lastError ? "err" : state.cloud.lastSyncAt ? "ok" : "");
    pill.innerHTML = `<i class="fa-solid fa-cloud"></i> ${state.cloud.lastError ? 'sync err' : state.cloud.lastSyncAt ? 'synced' : 'cloud ready'}`;
  }
  function paintIpChips() {
    const g = $("#ipChips"); g.innerHTML = "";
    if (state.ip.allowed.length === 0) g.innerHTML = `<span class="muted" style="padding:8px">No IPs added — scanner will work for any IP unless restriction is enforced.</span>`;
    state.ip.allowed.forEach((ip) => {
      g.appendChild(el("div", { class: "chip" }, el("span", { class: "mono" }, ip), el("span", { class: "x", onclick: () => { state.ip.allowed = state.ip.allowed.filter((x) => x !== ip); save(); paintIpChips(); paintIpPill(); } }, el("i", { class: "fa-solid fa-xmark" }))));
    });
  }

  // ===========================================================
  //                  PIN LOCK SCREEN
  // ===========================================================
  async function sha256(s) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  let idleTimer = null;
  function restartIdleTimer() {
    clearTimeout(idleTimer);
    if (!state.lock.enabled || !state.lock.pinHash || !state.lock.autoLockMin) return;
    idleTimer = setTimeout(() => { if ($("#lockScreen").classList.contains("hidden")) showLockScreen(); }, state.lock.autoLockMin * 60 * 1000);
  }
  ["mousemove", "keydown", "click", "touchstart"].forEach((ev) => document.addEventListener(ev, restartIdleTimer));

  function showLockScreen() {
    const overlay = $("#lockScreen");
    overlay.classList.remove("hidden");
    $("#lockShopName").textContent = state.shop.name || "Maa Inventory";
    const input = $("#lockPinInput"); input.value = ""; setTimeout(() => input.focus(), 50);
    const tryUnlock = async () => {
      const pin = input.value.trim(); if (!pin) return;
      const h = await sha256(pin);
      if (h === state.lock.pinHash) {
        overlay.classList.add("hidden"); restartIdleTimer();
      } else {
        input.value = ""; input.classList.add("shake");
        setTimeout(() => input.classList.remove("shake"), 400);
        toast("Wrong PIN", "error");
      }
    };
    $("#lockSubmit").onclick = tryUnlock;
    input.onkeydown = (e) => { if (e.key === "Enter") tryUnlock(); };
  }

  // ===========================================================
  //                  THERMAL 58mm RECEIPT
  // ===========================================================
  function printThermal58(iv) {
    const s = state.shop;
    const discAmt = (iv.subtotal * iv.discountPct) / 100;
    const taxAmt = ((iv.subtotal - discAmt) * iv.taxPct) / 100;
    const itemRows = iv.items.map((it) =>
      `<div class="ti"><div class="n">${escapeHtml(it.name)}</div><div class="r"><span>${it.qty} × ${fmt(it.price)}</span><span>${fmt(it.qty * it.price)}</span></div></div>`
    ).join("");
    const w = window.open("", "_blank", "width=300,height=600");
    if (!w) { toast("Pop-up blocked — allow pop-ups to print receipts", "error"); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${iv.no}</title>
      <style>
        @page { size: 58mm auto; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 6mm 4mm; width: 58mm; font-family: 'Courier New', monospace; font-size: 11px; color: #000; }
        .c { text-align: center; } .b { font-weight: 700; }
        hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
        .ti { margin-bottom: 4px; } .ti .n { font-weight: 600; font-size: 11px; }
        .ti .r { display: flex; justify-content: space-between; font-size: 10.5px; }
        .tot { display: flex; justify-content: space-between; font-size: 11px; }
        .g { font-size: 13px; font-weight: 700; }
        h3 { margin: 0; font-size: 13px; }
      </style></head><body>
      <div class="c"><h3>${escapeHtml(s.name)}</h3>
        ${s.address ? `<div>${escapeHtml(s.address)}</div>` : ""}
        ${s.phone ? `<div>Ph: ${escapeHtml(s.phone)}</div>` : ""}
        ${s.gstin ? `<div>GSTIN: ${escapeHtml(s.gstin)}</div>` : ""}
      </div><hr/>
      <div class="b">${iv.no}</div>
      <div>${new Date(iv.date).toLocaleString("en-IN")}</div>
      ${iv.customer?.name ? `<div>Cust: ${escapeHtml(iv.customer.name)}</div>` : ""}
      ${iv.customer?.phone ? `<div>Ph: ${escapeHtml(iv.customer.phone)}</div>` : ""}
      <hr/>${itemRows}<hr/>
      <div class="tot"><span>Subtotal</span><span>${fmt(iv.subtotal)}</span></div>
      ${iv.discountPct ? `<div class="tot"><span>Discount (${iv.discountPct}%)</span><span>- ${fmt(discAmt)}</span></div>` : ""}
      ${iv.taxPct ? `<div class="tot"><span>GST (${iv.taxPct}%)</span><span>+ ${fmt(taxAmt)}</span></div>` : ""}
      <hr/><div class="tot g"><span>TOTAL</span><span>${fmt(iv.total)}</span></div><hr/>
      <div class="c">Payment: ${(iv.payment || "—").toUpperCase()}</div>
      <div class="c" style="margin-top:8px;font-size:10px">Thank you! Visit again.</div>
      <script>window.onload=function(){setTimeout(function(){window.print();},250);}<\/script>
      </body></html>`);
    w.document.close();
  }

  // ===========================================================
  //                  RETURNS / REFUNDS
  // ===========================================================
  function openReturnDialog(iv) {
    const itemsHtml = iv.items.map((it) => {
      const alreadyReturned = state.refunds
        .filter((r) => r.invoiceId === iv.id)
        .reduce((a, r) => a + (r.items.find((x) => x.productId === it.productId)?.qty || 0), 0);
      const max = it.qty - alreadyReturned;
      return `<div class="return-row">
        <div>
          <div class="ci-name">${escapeHtml(it.name)}</div>
          <div class="ci-meta">${escapeHtml(it.sku)} · sold ${it.qty} · already returned ${alreadyReturned} · max ${max}</div>
        </div>
        <input type="number" min="0" max="${max}" value="0" data-pid="${it.productId}" data-max="${max}" class="ret-qty" data-testid="return-qty-${it.sku}" ${max <= 0 ? "disabled" : ""}/>
      </div>`;
    }).join("");
    const body = el("div");
    body.innerHTML = `${itemsHtml}<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--muted);font-weight:600;margin-top:12px">Reason (optional)<input id="returnReason" type="text" placeholder="e.g. Defective, customer changed mind" style="padding:9px 12px;border:1px solid var(--line);border-radius:10px;outline:none;font-size:13.5px" data-testid="return-reason"/></label>`;

    const cancel = el("button", { class: "btn btn-ghost", onclick: () => $(".modal-back").__close(null) }, "Cancel");
    const ok = el("button", { class: "btn btn-primary", "data-testid": "return-save", onclick: () => {
      const items = []; let total = 0;
      body.querySelectorAll(".ret-qty").forEach((i) => {
        const q = Number(i.value || 0);
        if (q > 0 && q <= Number(i.dataset.max)) {
          const orig = iv.items.find((x) => x.productId === i.dataset.pid);
          items.push({ productId: orig.productId, name: orig.name, sku: orig.sku, qty: q, price: orig.price });
          total += q * orig.price;
        }
      });
      if (items.length === 0) { toast("Pick at least one item to return", "warn"); return; }
      const reason = body.querySelector("#returnReason").value.trim();
      const rf = {
        id: uid("rf"), no: `RF-${String(state.meta.refundCounter || 1).padStart(5, "0")}`,
        invoiceId: iv.id, invoiceNo: iv.no, date: new Date().toISOString(),
        items, total, reason,
      };
      state.refunds.push(rf);
      state.meta.refundCounter = (state.meta.refundCounter || 1) + 1;
      items.forEach((it) => {
        const p = state.products.find((pp) => pp.id === it.productId);
        if (p) {
          p.stock = (p.stock || 0) + it.qty;
          state.txns.push({ id: uid("t"), ts: Date.now(), type: "in", productId: p.id, qty: it.qty, note: `Return ${rf.no}`, ref: rf.id });
        }
      });
      save(); $(".modal-back").__close(true); paintInvoices();
      toast(`Return recorded · ${rf.no} · ${fmt(total)} refunded · stock restored`, "success");
    } }, "Process Return");
    modal({ title: `Return items · ${iv.no}`, body, footer: [cancel, ok] });
  }

  // ===========================================================
  //                  PURCHASE ORDERS
  // ===========================================================
  function renderPurchaseOrders() {
    $("#poAdd").onclick = () => editPoDialog();
    paintPurchaseOrders();
  }
  function paintPurchaseOrders() {
    const tb = $("#poTbody"); tb.innerHTML = "";
    if (!state.purchaseOrders.length) {
      tb.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:30px">No purchase orders yet — create one to track what you're ordering from suppliers.</td></tr>`;
      return;
    }
    const statusMap = { draft: "gray", ordered: "amber", received: "emerald", cancelled: "rose" };
    [...state.purchaseOrders].reverse().forEach((po) => {
      const sup = state.suppliers.find((s) => s.id === po.supplierId);
      const total = po.items.reduce((a, i) => a + i.qty * i.cost, 0);
      const actions = [];
      if (po.status !== "received" && po.status !== "cancelled") actions.push(el("button", { class: "icon-btn", title: "Mark received (add to stock)", "data-testid": `po-receive-${po.no}`, onclick: () => receivePo(po) }, el("i", { class: "fa-solid fa-check" })));
      actions.push(el("button", { class: "icon-btn", title: "Edit", "data-testid": `po-edit-${po.no}`, onclick: () => editPoDialog(po) }, el("i", { class: "fa-solid fa-pen" })));
      actions.push(el("button", { class: "icon-btn danger", title: "Delete", "data-testid": `po-delete-${po.no}`, onclick: () => deletePo(po) }, el("i", { class: "fa-solid fa-trash" })));

      tb.appendChild(el("tr",
        { "data-testid": `po-row-${po.no}` },
        el("td", {}, el("span", { class: "sku-pill" }, po.no)),
        el("td", { class: "mono", style: "font-size:12px;color:var(--muted)" }, new Date(po.date).toLocaleDateString("en-IN")),
        el("td", {}, sup ? sup.name : el("span", { class: "muted" }, "—")),
        el("td", { class: "num" }, po.items.reduce((a, i) => a + i.qty, 0)),
        el("td", { class: "num", style: "font-weight:700" }, fmt(total)),
        el("td", {}, el("span", { class: `tag ${statusMap[po.status] || "gray"}` }, po.status.toUpperCase())),
        el("td", { class: "row-actions" }, ...actions)
      ));
    });
  }
  function receivePo(po) {
    if (po.status === "received") return;
    const totalQty = po.items.reduce((a, i) => a + i.qty, 0);
    if (!confirm(`Mark ${po.no} as received? This will add ${totalQty} units to stock and update cost prices.`)) return;
    po.items.forEach((it) => {
      const p = state.products.find((pp) => pp.id === it.productId);
      if (p) {
        p.stock = (p.stock || 0) + it.qty;
        if (it.cost) p.cost = it.cost; // refresh cost to latest purchase
        state.txns.push({ id: uid("t"), ts: Date.now(), type: "in", productId: p.id, qty: it.qty, note: `Received ${po.no}`, ref: po.id });
      }
    });
    po.status = "received"; po.receivedAt = new Date().toISOString();
    save(); paintPurchaseOrders(); toast(`${po.no} received · ${totalQty} units added to stock`, "success");
  }
  function deletePo(po) {
    if (!confirm(`Delete ${po.no}? ${po.status === "received" ? "Stock will NOT be reverted." : ""}`)) return;
    state.purchaseOrders = state.purchaseOrders.filter((x) => x.id !== po.id);
    save(); paintPurchaseOrders(); toast("PO deleted", "success");
  }
  function editPoDialog(existing) {
    const isNew = !existing;
    const po = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: uid("po"),
      no: `PO-${String(state.meta.poCounter || 1).padStart(5, "0")}`,
      supplierId: state.suppliers[0]?.id || "",
      date: new Date().toISOString(),
      expectedDate: "",
      status: "draft",
      items: [],
      notes: "",
    };
    const body = el("div");
    body.innerHTML = `
      <div class="form-grid">
        <label>PO Number <input data-f="no" type="text" value="${escapeHtml(po.no)}" data-testid="po-no"/></label>
        <label>Supplier
          <select data-f="supplierId" data-testid="po-supplier">
            <option value="">— None —</option>
            ${state.suppliers.map((s) => `<option value="${s.id}" ${s.id === po.supplierId ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}
          </select>
        </label>
        <label>Date <input data-f="date" type="date" value="${po.date.slice(0, 10)}"/></label>
        <label>Expected delivery <input data-f="expectedDate" type="date" value="${po.expectedDate || ""}"/></label>
        <label>Status
          <select data-f="status" data-testid="po-status" ${po.status === "received" ? "disabled" : ""}>
            <option value="draft" ${po.status === "draft" ? "selected" : ""}>Draft</option>
            <option value="ordered" ${po.status === "ordered" ? "selected" : ""}>Ordered</option>
            <option value="cancelled" ${po.status === "cancelled" ? "selected" : ""}>Cancelled</option>
            ${po.status === "received" ? '<option value="received" selected>Received</option>' : ""}
          </select>
        </label>
        <label class="span-2">Notes <input data-f="notes" type="text" value="${escapeHtml(po.notes || "")}"/></label>
      </div>
      <h4 style="margin:18px 0 8px;font-family:var(--font-head);font-weight:600">Items</h4>
      <div id="poItems"></div>
      <button class="btn btn-ghost" id="poAddItem" type="button" style="margin-top:10px" data-testid="po-add-item"><i class="fa-solid fa-plus"></i> Add item</button>
      <div id="poTotal" style="margin-top:14px;text-align:right;font-family:var(--font-head);font-weight:700;font-size:15px"></div>
    `;
    function renderItems() {
      const wrap = body.querySelector("#poItems");
      wrap.innerHTML = po.items.length === 0
        ? `<div class="muted" style="padding:10px;text-align:center;border:1px dashed var(--line-2);border-radius:10px">No items yet. Click "Add item" to start.</div>`
        : po.items.map((it, idx) => `
          <div class="po-item-row">
            <select data-i="${idx}" data-k="productId" data-testid="po-item-prod-${idx}">
              ${state.products.map((p) => `<option value="${p.id}" ${p.id === it.productId ? "selected" : ""}>${escapeHtml(p.sku)} · ${escapeHtml(p.name)}</option>`).join("")}
            </select>
            <input type="number" min="1" value="${it.qty}" data-i="${idx}" data-k="qty" data-testid="po-item-qty-${idx}"/>
            <input type="number" min="0" step="0.01" value="${it.cost}" data-i="${idx}" data-k="cost" data-testid="po-item-cost-${idx}"/>
            <span class="mono po-sub">${fmt(it.qty * it.cost)}</span>
            <button class="icon-btn danger" type="button" data-rm="${idx}" data-testid="po-item-remove-${idx}"><i class="fa-solid fa-xmark"></i></button>
          </div>
        `).join("");
      body.querySelector("#poTotal").textContent = "Total: " + fmt(po.items.reduce((a, i) => a + i.qty * i.cost, 0));
      wrap.querySelectorAll("select[data-i], input[data-i]").forEach((inp) => {
        inp.oninput = () => {
          const i = Number(inp.dataset.i), k = inp.dataset.k;
          let v = inp.value;
          if (k === "qty" || k === "cost") v = Number(v || 0);
          po.items[i][k] = v;
          if (k === "productId") {
            const p = state.products.find((p) => p.id === v);
            if (p) { po.items[i].name = p.name; po.items[i].sku = p.sku; if (!po.items[i].cost) po.items[i].cost = p.cost || 0; }
          }
          renderItems();
        };
      });
      wrap.querySelectorAll("button[data-rm]").forEach((btn) => btn.onclick = () => { po.items.splice(Number(btn.dataset.rm), 1); renderItems(); });
    }
    setTimeout(() => {
      body.querySelector("#poAddItem").onclick = () => {
        if (state.products.length === 0) { toast("Add a product first", "warn"); return; }
        const p = state.products[0];
        po.items.push({ productId: p.id, name: p.name, sku: p.sku, qty: 1, cost: p.cost || 0 });
        renderItems();
      };
      renderItems();
    }, 0);

    const cancel = el("button", { class: "btn btn-ghost", onclick: () => $(".modal-back").__close(null) }, "Cancel");
    const ok = el("button", { class: "btn btn-primary", "data-testid": "po-save", onclick: () => {
      body.querySelectorAll("[data-f]").forEach((i) => {
        const k = i.dataset.f;
        po[k] = (k === "date" && i.value) ? new Date(i.value).toISOString() : i.value;
      });
      if (po.items.length === 0) { toast("Add at least one item", "error"); return; }
      if (isNew) { state.purchaseOrders.push(po); state.meta.poCounter = (state.meta.poCounter || 1) + 1; }
      else { const ix = state.purchaseOrders.findIndex((x) => x.id === po.id); state.purchaseOrders[ix] = po; }
      save(); $(".modal-back").__close(true); paintPurchaseOrders();
      toast(`PO ${isNew ? "created" : "updated"} · ${po.no}`, "success");
    } }, isNew ? "Create PO" : "Save");
    modal({ title: isNew ? "New Purchase Order" : `Edit ${po.no}`, body, footer: [cancel, ok], size: "lg" });
  }

  // ===========================================================
  //                  CLOUD SYNC (Firebase)
  // ===========================================================
  let cloudReady = !!(window.MaaCloud);
  window.addEventListener("maa-cloud-ready", () => { cloudReady = true; });
  function waitForCloudLib() {
    if (cloudReady) return Promise.resolve();
    return new Promise((res) => window.addEventListener("maa-cloud-ready", res, { once: true }));
  }

  let _cloudListening = false;
  let _ourLastPushAt = 0;        // timestamp WE wrote — used to ignore our own echoes
  function startCloudListener() {
    if (_cloudListening) return;
    if (!state.cloud.config || !state.cloud.shopId) return;
    if (!window.MaaCloud?.ready) return;
    _cloudListening = true;
    try {
      window.MaaCloud.subscribe(state.cloud.shopId, (data, updatedAt) => {
        if (!data || !updatedAt) return;
        // Ignore the echo of our own push
        if (updatedAt <= _ourLastPushAt) return;
        // Ignore if we already have this version locally
        if (state.cloud.lastSyncAt && updatedAt <= state.cloud.lastSyncAt) return;
        const keepCloud = state.cloud;
        state = { ...defaultState(), ...data, cloud: keepCloud };
        state.cloud.lastSyncAt = updatedAt;
        state.cloud.lastError = null;
        save(false);
        paintCloudStatus?.();
        // Re-render current view so the user sees the change instantly
        const cur = (location.hash || "#dashboard").slice(1);
        if (routes[cur]) go(cur);
        toast("Synced changes from another device", "info");
      });
    } catch (e) {
      _cloudListening = false;
      console.warn("cloud subscribe failed", e);
    }
  }
  function stopCloudListener() {
    _cloudListening = false;
    if (window.MaaCloud?.unsubscribe) window.MaaCloud.unsubscribe();
  }

  async function cloudConnect() {
    const raw = $("#setCloudConfig").value.trim();
    if (!raw) { toast("Paste your Firebase config first", "error"); return; }
    let cfg;
    try { cfg = JSON.parse(raw); } catch { toast("Config is not valid JSON", "error"); return; }
    const required = ["apiKey", "projectId"];
    for (const k of required) if (!cfg[k]) { toast(`Missing field: ${k}`, "error"); return; }
    try {
      await waitForCloudLib();
      await window.MaaCloud.init(cfg);
      state.cloud.config = cfg;
      if (!state.cloud.shopId) state.cloud.shopId = $("#setShopId").value.trim() || ("mce_" + Math.random().toString(36).slice(2, 14));
      else state.cloud.shopId = $("#setShopId").value.trim() || state.cloud.shopId;
      state.cloud.autoSync = true;    // default ON so mobile↔desktop just works
      state.cloud.lastError = null;
      save(false);
      $("#setShopId").value = state.cloud.shopId;
      $("#setAutoSync").checked = true;
      paintCloudStatus();
      startCloudListener();
      toast("Connected to Firebase · live sync ON", "success");
    } catch (e) {
      state.cloud.lastError = e.message || String(e);
      save(false); paintCloudStatus();
      toast("Connect failed: " + (e.message || e), "error");
    }
  }
  async function cloudPush(silent = false) {
    if (!state.cloud.config || !state.cloud.shopId) { if (!silent) toast("Connect to cloud first", "warn"); return false; }
    try {
      await waitForCloudLib();
      if (!window.MaaCloud.ready) await window.MaaCloud.init(state.cloud.config);
      const snapshot = JSON.parse(JSON.stringify(state));
      delete snapshot.cloud.config; // don't upload secrets
      _ourLastPushAt = Date.now();
      await window.MaaCloud.push(state.cloud.shopId, snapshot);
      state.cloud.lastSyncAt = _ourLastPushAt; state.cloud.lastError = null;
      save(false); paintCloudStatus();
      startCloudListener(); // ensure listening
      if (!silent) toast("Pushed to cloud", "success");
      return true;
    } catch (e) {
      state.cloud.lastError = e.message || String(e);
      save(false); paintCloudStatus();
      if (!silent) toast("Push failed: " + (e.message || e), "error");
      return false;
    }
  }
  async function cloudPull() {
    if (!state.cloud.config || !state.cloud.shopId) { toast("Connect to cloud first", "warn"); return; }
    if (!confirm("Pull from cloud will OVERWRITE your local data with the cloud copy. Continue?")) return;
    try {
      await waitForCloudLib();
      if (!window.MaaCloud.ready) await window.MaaCloud.init(state.cloud.config);
      const data = await window.MaaCloud.pull(state.cloud.shopId);
      if (!data) { toast("No cloud data found for this Shop ID — push first", "warn"); return; }
      const keepCloud = state.cloud;
      state = { ...defaultState(), ...data, cloud: keepCloud };
      state.cloud.lastSyncAt = Date.now(); state.cloud.lastError = null;
      save(false);
      toast("Pulled from cloud — reloading", "success");
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      state.cloud.lastError = e.message || String(e);
      save(false); paintCloudStatus();
      toast("Pull failed: " + (e.message || e), "error");
    }
  }


  function openCameraScanner(onResult, testid = "camera") {
    if (state.ip.enforce && !isIpAllowed()) {
      toast(`Camera scanner blocked: IP ${detectedIp || "unknown"} not in whitelist. Add it in Settings.`, "error");
      return;
    }
    if (!window.Html5Qrcode) { toast("Scanner library still loading…", "warn"); return; }

    const reader = el("div", { id: "qr-reader", "data-testid": testid });
    const body = el("div", {}, el("div", { class: "scanner-box" }, reader),
      el("p", { class: "muted", style: "margin-top:10px;font-size:12.5px" }, "Hold barcode within the box. Works with most webcams & phones.")
    );
    const close = el("button", { class: "btn btn-ghost", onclick: stop }, "Close");
    const mp = modal({ title: "Scan barcode", body, footer: [close] });
    const html5 = new Html5Qrcode("qr-reader");
    html5.start({ facingMode: "environment" }, { fps: 12, qrbox: { width: 280, height: 140 } },
      (decoded) => {
        try { html5.stop().then(() => html5.clear()); } catch {}
        $(".modal-back")?.__close(null);
        onResult(decoded);
        toast(`Scanned: ${decoded}`, "success");
      },
      () => {}
    ).catch((e) => { toast("Camera error: " + (e.message || e), "error"); });
    function stop() {
      try { html5.stop().then(() => html5.clear()); } catch {}
      $(".modal-back")?.__close(null);
    }
    return mp;
  }

  // ===========================================================
  //                  GLOBAL HEADER SCANNER (Enter)
  // ===========================================================
  function setupGlobalScan() {
    const inp = $("#globalScan");
    inp.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const v = inp.value.trim(); inp.value = "";
      if (!v) return;
      const p = state.products.find((p) => p.barcode === v || p.sku === v);
      if (!p) { toast(`No product for "${v}"`, "error"); return; }
      const route = (location.hash || "#dashboard").slice(1);
      if (route === "pos") addToCart(p);
      else if (route === "inventory") { $("#invScanInput").value = v; previewInvScan(); }
      else { toast(`${p.name} · stock ${p.stock || 0} · ${fmt(p.price)}`, "info"); }
    });
  }

  // ===========================================================
  //                  BACKUP / IMPORT
  // ===========================================================
  function exportBackup() {
    const data = JSON.stringify(state, null, 2);
    downloadBlob(data, `mce_backup_${today()}.json`, "application/json");
    toast("Backup downloaded", "success");
  }
  function importBackup(file) {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const j = JSON.parse(e.target.result);
        if (!j.products || !j.invoices) throw new Error("Invalid backup");
        state = j; save(); toast("Backup restored", "success"); go("dashboard");
      } catch (err) { toast("Invalid backup file", "error"); }
    };
    r.readAsText(file);
  }
  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 600);
  }

  // ===========================================================
  //                       SEED + INIT
  // ===========================================================
  function seedIfEmpty() {
    if (state.products.length > 0) return;
    state.suppliers = [
      { id: uid("s"), name: "TechHub Distributors", contact: "Rajesh Kumar", phone: "+91 98765 43210", address: "Nehru Place, New Delhi" },
      { id: uid("s"), name: "DigiTrade Wholesale", contact: "Priya Sharma", phone: "+91 99887 76655", address: "SP Road, Bengaluru" },
    ];
    const supA = state.suppliers[0].id;
    const supB = state.suppliers[1].id;
    const seedItems = [
      { name: "HP 15s Laptop · Ryzen 5", cat: "Laptops", cost: 38000, price: 45999, stock: 3, supplierId: supA },
      { name: "Logitech MK270 Wireless Combo", cat: "Accessories", cost: 980, price: 1499, stock: 18, supplierId: supA },
      { name: "Samsung 1TB 980 NVMe SSD", cat: "Storage", cost: 5400, price: 6299, stock: 12, supplierId: supB },
      { name: "Redmi 12 5G · 6/128 GB", cat: "Mobiles", cost: 11500, price: 13499, stock: 6, supplierId: supB },
      { name: "Intel Core i5-12400F CPU", cat: "Components", cost: 12500, price: 14499, stock: 4, supplierId: supA },
      { name: "Boya BY-M1 Microphone", cat: "Accessories", cost: 750, price: 999, stock: 22, supplierId: supB },
      { name: "WD 2TB External HDD", cat: "Storage", cost: 4800, price: 5799, stock: 2, supplierId: supA },
      { name: "iPhone Lightning Cable", cat: "Accessories", cost: 220, price: 399, stock: 40, supplierId: supB },
    ];
    seedItems.forEach((it, idx) => {
      state.meta.productCounter = idx + 1;
      const p = {
        id: uid("p"), sku: `MCE-${String(idx + 1).padStart(4, "0")}`,
        barcode: genBarcodeValue(idx + 1),
        name: it.name, category: it.cat, supplierId: it.supplierId,
        cost: it.cost, price: it.price, stock: it.stock,
        lowStock: 5, createdAt: new Date().toISOString(),
      };
      state.products.push(p);
      state.txns.push({ id: uid("t"), ts: Date.now() - (8 - idx) * 86400000, type: "in", productId: p.id, qty: p.stock, note: "Opening stock" });
    });
    state.meta.productCounter = seedItems.length + 1;
    save();
  }

  function init() {
    seedIfEmpty();
    setupGlobalScan();
    $("#exportBackup").onclick = exportBackup;
    $("#importBackupBtn").onclick = () => $("#importBackupFile").click();
    $("#importBackupFile").onchange = (e) => { const f = e.target.files[0]; if (f) importBackup(f); e.target.value = ""; };
    detectIp();
    // Lock screen on app open if enabled
    if (state.lock?.enabled && state.lock?.pinHash) showLockScreen();
    // If cloud config exists, init the library so auto-sync works
    if (state.cloud?.config) {
      waitForCloudLib().then(async () => {
        try { await window.MaaCloud.init(state.cloud.config); startCloudListener(); }
        catch (e) { console.warn("cloud init failed", e); }
      });
    }
    restartIdleTimer();
    go((location.hash || "#dashboard").slice(1));
    paintSidebarCloudPill();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
