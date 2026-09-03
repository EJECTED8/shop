const tg = window.Telegram ? window.Telegram.WebApp : null;
if (tg) { tg.ready(); tg.expand(); }

// фирменная тёмная база — всегда тёмная (стритвир)
document.documentElement.setAttribute("data-theme", "dark");

// избранное (локально в браузере клиента)
let FAVES = new Set();
try { FAVES = new Set(JSON.parse(localStorage.getItem("faves") || "[]")); } catch (e) {}
function toggleFav(id) {
  if (FAVES.has(id)) FAVES.delete(id); else FAVES.add(id);
  try { localStorage.setItem("faves", JSON.stringify([...FAVES])); } catch (e) {}
}

// дерзкие заглушки для карточек без фото
const GRADIENTS = [
  "linear-gradient(145deg,#ff4d00,#1a1a1a)",
  "linear-gradient(145deg,#1a1a1a,#3a3a3a)",
  "linear-gradient(145deg,#2b2b2b,#ff5a1f)",
  "linear-gradient(145deg,#222,#111)",
  "linear-gradient(145deg,#ff6a2b,#2a2a2a)",
  "linear-gradient(145deg,#333,#1a1a1a)"
];

let CATALOG = [];
let activeFilter = "все";
let searchQuery = "";
let viewMode = "list";
try { viewMode = localStorage.getItem("view") || "list"; } catch (e) {}
const IMG_V = "2"; // метка версии фото (бампать при пересжатии картинок)
function imgUrl(src) { return src ? src + (src.includes("?") ? "&" : "?") + "i=" + IMG_V : src; }
let showFaves = false;
let activeBrand = "все";

// унисекс попадает и в мужской, и в женский раздел
function genderMatch(p) {
  if (activeFilter === "все") return true;
  if (activeFilter === "муж") return p.gender === "муж" || p.gender === "унисекс";
  if (activeFilter === "жен") return p.gender === "жен" || p.gender === "унисекс";
  return p.gender === activeFilter; // "унисекс" → только унисекс
}
// cart: { key: {productId, name, brand, volume, unit, price, qty} }
const cart = {};

function money(n) { return n.toLocaleString("ru-RU") + " ₽"; }
function keyOf(pid, volume) { return pid + "@" + volume; }

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// Пирамида нот. Возвращает массив групп {label, items} для непустых уровней,
// либо null если ноты заданы старым плоским списком (массивом).
function noteGroups(p) {
  const n = p.notes;
  if (Array.isArray(n)) return null; // старый формат
  if (n && typeof n === "object") {
    const groups = [];
    if (n.top && n.top.length)   groups.push({ label: "Верхние", items: n.top });
    if (n.heart && n.heart.length) groups.push({ label: "Сердце", items: n.heart });
    if (n.base && n.base.length)   groups.push({ label: "База", items: n.base });
    return groups;
  }
  return [];
}
// Все ноты одним массивом — для поиска.
function allNotes(p) {
  const n = p.notes;
  if (Array.isArray(n)) return n;
  if (n && typeof n === "object") return [...(n.top || []), ...(n.heart || []), ...(n.base || [])];
  return [];
}

async function load() {
  try {
    const res = await fetch("catalog.json?v=" + Date.now());
    const data = await res.json();
    CATALOG = data.products || [];
    if (data.shop) {
      document.getElementById("shopTitle").textContent = data.shop.title || "Парфюмерия";
      document.getElementById("shopSubtitle").textContent = data.shop.subtitle || "";
    }
    renderFilters();
    renderBrands();
    renderGrid();
  } catch (e) {
    document.getElementById("grid").innerHTML =
      '<div class="empty"><span class="empty-mark">✦</span>Не удалось загрузить каталог</div>';
  }
}

function renderFilters() {
  // фиксированный порядок: Все · Унисекс · Жен · Муж, затем прочие
  const ORDER = ["унисекс", "жен", "муж"];
  const present = new Set(CATALOG.map(p => p.gender).filter(Boolean));
  const genders = [
    "все",
    ...ORDER.filter(g => present.has(g)),
    ...[...present].filter(g => !ORDER.includes(g))
  ];
  const box = document.getElementById("filters");
  box.innerHTML = "";
  genders.forEach(g => {
    const b = document.createElement("button");
    b.className = "chip" + (g === activeFilter ? " active" : "");
    b.textContent = g;
    b.onclick = () => { activeFilter = g; renderFilters(); renderGrid(); };
    box.appendChild(b);
  });
}

function renderBrands() {
  const sel = document.getElementById("brandFilter");
  if (!sel) return;
  const brands = [...new Set(CATALOG.map(p => p.brand).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ru"));
  sel.innerHTML = '<option value="все">Все бренды</option>' +
    brands.map(b => `<option value="${b.replace(/"/g, "&quot;")}">${b}</option>`).join("");
  sel.value = activeBrand;
}

function matchesSearch(p) {
  if (!searchQuery) return true;
  const hay = [
    p.brand, p.name, p.description, p.gender,
    ...allNotes(p)
  ].join(" ").toLowerCase();
  // все слова запроса должны встретиться
  return searchQuery.split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

function triggerWash() {
  const w = document.getElementById("wash");
  if (!w) return;
  w.classList.remove("run");
  void w.offsetWidth; // сброс, чтобы перезапустить анимацию
  w.classList.add("run");
}

function applyCategoryTheme() {
  // розовая тема + фон + анимация «выгорания» для категории «жен»
  const fem = activeFilter === "жен";
  const was = document.documentElement.classList.contains("cat-fem");
  document.documentElement.classList.toggle("cat-fem", fem);
  if (fem && !was) triggerWash();
}

function renderGrid() {
  applyCategoryTheme();
  const grid = document.getElementById("grid");
  grid.className = "grid view-" + viewMode;
  const items = CATALOG.filter(p =>
    genderMatch(p) &&
    (activeBrand === "все" || p.brand === activeBrand) &&
    matchesSearch(p) &&
    (!showFaves || FAVES.has(p.id))
  );
  // в наличии — первыми, предзаказ — ниже (порядок внутри групп сохраняется)
  items.sort((a, b) => (a.preorder ? 1 : 0) - (b.preorder ? 1 : 0));
  grid.innerHTML = "";
  if (!items.length) {
    if (showFaves) {
      grid.innerHTML = '<div class="empty"><span class="empty-mark">♥</span>В избранном пусто. Жми ♥ на карточке товара.</div>';
    } else {
      grid.innerHTML = '<div class="empty"><span class="empty-mark">?</span>Ничего не найдено<br><button class="btn-line" id="emptyRequest">Оставить заявку на этот аромат</button></div>';
      const er = document.getElementById("emptyRequest");
      if (er) er.onclick = () => openRequest(searchInput.value.trim());
    }
    return;
  }

  items.forEach((p, idx) => {
    const card = document.createElement("article");
    card.className = "card";

    const media = document.createElement("div");
    media.className = "card-media";
    if (p.image) {
      const img = document.createElement("img");
      img.className = "card-img";
      img.loading = "lazy";      // грузятся только видимые фото
      img.decoding = "async";
      img.alt = p.brand + " " + p.name;
      img.src = imgUrl(p.image);
      media.appendChild(img);
    } else {
      media.style.background = GRADIENTS[idx % GRADIENTS.length];
      media.innerHTML = `<span class="ph">${p.brand}<small>${p.name}</small></span>`;
    }
    if (p.preorder) {
      const badge = document.createElement("div");
      badge.className = "preorder-badge";
      badge.textContent = "Предзаказ";
      media.appendChild(badge);
    }

    const fav = document.createElement("button");
    fav.className = "fav" + (FAVES.has(p.id) ? " active" : "");
    fav.setAttribute("aria-label", "В избранное");
    fav.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-10-9.3C.6 8.9 2 5.5 5.2 5.1 7 4.9 8.7 5.9 12 8c3.3-2.1 5-3.1 6.8-2.9 3.2.4 4.6 3.8 3.2 6.6C19.5 16.4 12 21 12 21z"/></svg>';
    fav.onclick = (e) => {
      e.stopPropagation();
      toggleFav(p.id);
      fav.classList.toggle("active", FAVES.has(p.id));
      if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
      if (showFaves) renderGrid();
    };
    media.appendChild(fav);

    const groups = noteGroups(p);
    let notesHtml;
    if (groups === null) {
      notesHtml = `<div class="card-notes">${allNotes(p).join(" · ")}</div>`;
    } else {
      notesHtml = groups.map(g =>
        `<div class="card-notes"><span class="note-group">${g.label}:</span> ${g.items.join(", ")}</div>`
      ).join("");
    }

    const body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML = `
      <div class="card-brand">${p.brand} · ${p.gender || ""}</div>
      <div class="card-name">${p.name}</div>
      ${notesHtml}
      <div class="card-desc">${p.description || ""}</div>
    `;

    const variants = document.createElement("div");
    variants.className = "variants";
    const vlist = p.variants || [];
    if (vlist.length) variants.appendChild(renderVariant(p, vlist[0]));
    if (vlist.length > 1) {
      const more = document.createElement("div");
      more.className = "more-sizes";
      const n = vlist.length - 1;
      more.textContent = `+ ещё ${n} ${plural(n, "размер", "размера", "размеров")} →`;
      variants.appendChild(more);
    }

    body.appendChild(variants);
    card.appendChild(media);
    card.appendChild(body);
    card.addEventListener("click", () => openProduct(p));
    grid.appendChild(card);
  });
}

function renderVariant(p, v, refresh) {
  refresh = refresh || renderGrid;
  const row = document.createElement("div");
  row.className = "variant";
  const k = keyOf(p.id, v.volume);
  const inCart = cart[k] ? cart[k].qty : 0;

  const info = document.createElement("div");
  info.className = "variant-info";
  info.innerHTML = `<b>${v.volume} ${v.unit}</b><span class="variant-price">${money(v.price)}</span>`;

  const ctrl = document.createElement("div");
  if (inCart > 0) {
    ctrl.className = "qty";
    ctrl.innerHTML = `<button data-a="dec">−</button><span class="count">${inCart}</span><button data-a="inc">+</button>`;
    ctrl.querySelector('[data-a="dec"]').onclick = (e) => { e.stopPropagation(); changeQty(p, v, -1); refresh(); };
    ctrl.querySelector('[data-a="inc"]').onclick = (e) => { e.stopPropagation(); changeQty(p, v, +1); refresh(); };
  } else {
    const add = document.createElement("button");
    add.className = p.preorder ? "add-btn preorder" : "add-btn";
    add.textContent = p.preorder ? "Предзаказ" : "В корзину";
    add.onclick = (e) => { e.stopPropagation(); changeQty(p, v, +1); refresh(); };
    ctrl.appendChild(add);
  }

  row.appendChild(info);
  row.appendChild(ctrl);
  return row;
}

/* ---- детальная карточка товара ---- */
function openProduct(p) {
  const c = document.getElementById("productContent");
  const groups = noteGroups(p);
  let notesHtml;
  if (groups === null) {
    const all = allNotes(p);
    notesHtml = all.length ? `<div class="card-notes">${all.join(" · ")}</div>` : "";
  } else {
    notesHtml = groups.map(g =>
      `<div class="card-notes"><span class="note-group">${g.label}:</span> ${g.items.join(", ")}</div>`
    ).join("");
  }
  const mediaStyle = p.image
    ? `background-image:url('${imgUrl(p.image)}')`
    : `background:${GRADIENTS[0]}`;
  c.innerHTML = `
    <div class="pd-media" style="${mediaStyle}">
      ${p.preorder ? '<div class="preorder-badge">Предзаказ</div>' : ''}
    </div>
    <div class="pd-brand">${p.brand} · ${p.gender || ""}</div>
    <h2 class="pd-name">${p.name}</h2>
    <div class="pd-notes">${notesHtml}</div>
    <p class="pd-desc">${p.description || ""}</p>
    <div class="variants" id="pdVariants"></div>
  `;
  renderDetailVariants(p);
  document.getElementById("productOverlay").classList.add("show");
}
function renderDetailVariants(p) {
  const box = document.getElementById("pdVariants");
  if (!box) return;
  box.innerHTML = "";
  (p.variants || []).forEach(v => box.appendChild(renderVariant(p, v, () => renderDetailVariants(p))));
}
function closeProduct() {
  document.getElementById("productOverlay").classList.remove("show");
  renderGrid();
}

function changeQty(p, v, delta) {
  const k = keyOf(p.id, v.volume);
  const cur = cart[k] ? cart[k].qty : 0;
  const next = cur + delta;
  if (next <= 0) { delete cart[k]; }
  else {
    cart[k] = {
      productId: p.id, brand: p.brand, name: p.name,
      volume: v.volume, unit: v.unit, price: v.price, qty: next,
      preorder: !!p.preorder
    };
  }
  updateCartBar();
}

function cartCount() { return Object.values(cart).reduce((s, i) => s + i.qty, 0); }
function cartTotal() { return Object.values(cart).reduce((s, i) => s + i.qty * i.price, 0); }

function updateCartBar() {
  const bar = document.getElementById("cartbar");
  const n = cartCount();
  if (n > 0) {
    bar.classList.add("show");
    document.getElementById("cartSummary").textContent = `${n} шт · ${money(cartTotal())}`;
  } else {
    bar.classList.remove("show");
  }
}

/* ---- checkout ---- */
function updateDeliveryFields() {
  const courier = document.getElementById("f_delivery").value === "Курьер по городу";
  document.getElementById("courierFields").style.display = courier ? "" : "none";
}

function openCheckout() {
  if (cartCount() === 0) return;
  renderOrderLines();
  updateDeliveryFields();
  const uname = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.username;
  if (uname) document.getElementById("f_username").value = "@" + uname;
  const fn = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name;
  if (fn && !document.getElementById("f_name").value) document.getElementById("f_name").value = fn;
  document.getElementById("overlay").classList.add("show");
}
function closeCheckout() { document.getElementById("overlay").classList.remove("show"); }

function renderOrderLines() {
  const box = document.getElementById("orderLines");
  box.innerHTML = "";
  Object.entries(cart).forEach(([k, i]) => {
    const line = document.createElement("div");
    line.className = "order-line";
    const pre = i.preorder ? ' <b class="pre-tag">предзаказ</b>' : '';
    line.innerHTML = `<span>${i.brand} ${i.name}, ${i.volume} ${i.unit} × ${i.qty}${pre}</span>
      <span>${money(i.price * i.qty)} <button class="rm" data-k="${k}">удалить</button></span>`;
    line.querySelector(".rm").onclick = () => {
      delete cart[k]; updateCartBar(); renderGrid();
      if (cartCount() === 0) { closeCheckout(); return; }
      renderOrderLines();
    };
    box.appendChild(line);
  });
  document.getElementById("orderTotal").textContent = money(cartTotal());
}

function validate() {
  let ok = true;
  document.querySelectorAll('.field[data-req="1"]').forEach(f => {
    const inp = f.querySelector("input, select");
    if (!inp.value.trim()) { f.classList.add("invalid"); ok = false; }
    else f.classList.remove("invalid");
  });
  return ok;
}

function submitOrder() {
  if (!validate()) {
    if (tg) tg.HapticFeedback.notificationOccurred("error");
    return;
  }
  const order = {
    type: "order",
    items: Object.values(cart).map(i => ({
      brand: i.brand, name: i.name, volume: i.volume, unit: i.unit,
      qty: i.qty, price: i.price, sum: i.price * i.qty, preorder: !!i.preorder
    })),
    total: cartTotal(),
    promo: val("f_promo"),
    customer: {
      name: val("f_name"), phone: val("f_phone"), username: val("f_username"),
      city: val("f_city"), address: val("f_address"),
      delivery: val("f_delivery"), contact: val("f_contact"), comment: val("f_comment"),
      entrance: val("f_entrance"), floor: val("f_floor"), flat: val("f_flat")
    }
  };

  if (tg && tg.sendData) {
    tg.sendData(JSON.stringify(order));
    // Telegram сам закроет Mini App после sendData
  } else {
    alert("Заказ сформирован (демо-режим вне Telegram):\n\n" + JSON.stringify(order, null, 2));
  }
}
function val(id) { return document.getElementById(id).value.trim(); }

/* ---- реферальный промокод ---- */
function openPromo() { document.getElementById("promoOverlay").classList.add("show"); }
function closePromo() { document.getElementById("promoOverlay").classList.remove("show"); }
function createPromo() {
  const code = val("p_code");
  if (code.length < 3) {
    if (tg) tg.HapticFeedback.notificationOccurred("error");
    alert("Код минимум 3 символа (буквы/цифры).");
    return;
  }
  if (tg && tg.sendData) tg.sendData(JSON.stringify({ type: "create_promo", code }));
  else alert("Создание промокода: " + code + " (демо вне Telegram)");
}

/* ---- заявка на аромат (предложка) ---- */
function openRequest(prefill) {
  if (prefill) document.getElementById("r_fragrance").value = prefill;
  const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  if (u && u.username && !document.getElementById("r_contact").value)
    document.getElementById("r_contact").value = "@" + u.username;
  if (u && u.first_name && !document.getElementById("r_name").value)
    document.getElementById("r_name").value = u.first_name;
  document.getElementById("requestOverlay").classList.add("show");
}
function closeRequest() { document.getElementById("requestOverlay").classList.remove("show"); }
function submitRequest() {
  let ok = true;
  document.querySelectorAll('.field[data-rreq="1"]').forEach(f => {
    const i = f.querySelector("input");
    if (!i.value.trim()) { f.classList.add("invalid"); ok = false; }
    else f.classList.remove("invalid");
  });
  if (!ok) { if (tg) tg.HapticFeedback.notificationOccurred("error"); return; }
  const req = {
    type: "request",
    fragrance: val("r_fragrance"),
    name: val("r_name"),
    contact: val("r_contact"),
    comment: val("r_comment")
  };
  if (tg && tg.sendData) tg.sendData(JSON.stringify(req));
  else alert("Заявка сформирована (демо вне Telegram):\n\n" + JSON.stringify(req, null, 2));
}

/* ---- wiring ---- */
const searchInput = document.getElementById("searchInput");
const searchBox = document.querySelector(".search");
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  searchBox.classList.toggle("has-value", searchInput.value.length > 0);
  renderGrid();
});
document.getElementById("searchClear").onclick = () => {
  searchInput.value = "";
  searchQuery = "";
  searchBox.classList.remove("has-value");
  renderGrid();
  searchInput.focus();
};

// переключатель вида (сетка / список)
document.querySelectorAll(".vt").forEach(btn => {
  btn.classList.toggle("active", btn.dataset.view === viewMode);
  btn.onclick = () => {
    viewMode = btn.dataset.view;
    try { localStorage.setItem("view", viewMode); } catch (e) {}
    document.querySelectorAll(".vt").forEach(b => b.classList.toggle("active", b.dataset.view === viewMode));
    renderGrid();
    if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
  };
});

// избранное: показать только отложенные
document.getElementById("brandFilter").addEventListener("change", (e) => {
  activeBrand = e.target.value;
  renderGrid();
});

document.getElementById("favToggle").onclick = () => {
  showFaves = !showFaves;
  document.getElementById("favToggle").classList.toggle("active", showFaves);
  renderGrid();
  if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
};

document.getElementById("cartbar").onclick = openCheckout;
document.getElementById("sheetClose").onclick = closeCheckout;
document.getElementById("overlay").onclick = (e) => { if (e.target.id === "overlay") closeCheckout(); };
document.getElementById("submitBtn").onclick = submitOrder;
document.getElementById("f_delivery").addEventListener("change", updateDeliveryFields);
document.getElementById("productClose").onclick = closeProduct;
document.getElementById("productOverlay").onclick = (e) => { if (e.target.id === "productOverlay") closeProduct(); };
document.getElementById("promoCta").onclick = openPromo;
document.getElementById("promoClose").onclick = closePromo;
document.getElementById("promoOverlay").onclick = (e) => { if (e.target.id === "promoOverlay") closePromo(); };
document.getElementById("promoCreate").onclick = createPromo;
document.getElementById("requestCta").onclick = () => openRequest("");
document.getElementById("requestClose").onclick = closeRequest;
document.getElementById("requestOverlay").onclick = (e) => { if (e.target.id === "requestOverlay") closeRequest(); };
document.getElementById("requestSubmit").onclick = submitRequest;

load();
