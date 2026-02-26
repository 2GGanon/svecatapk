const DATA_URL = "./data/shadowverse-evolve-card-catalog.csv";
const CARD_TYPE_URL = "./data/shadowverse-cardtype-cache.json";
const STORAGE_KEY = "sve_collection_v1";
const CARD_ART_BASE = "https://en.shadowverse-evolve.com/wordpress/wp-content/images/cardlist";

const SET_NAME_BY_CODE = {
  BP01: "Advent of Genesis",
  BP02: "Reign of Bahamut",
  BP03: "Flame of Laevateinn",
  BP04: "Cosmic Mythos",
  BP05: "Omens Eternal",
  BP06: "Paragons of the Colosseum",
  BP07: "Verdant Steel",
  BP08: "Alterchaotica",
  BP09: "Duet of Dawn and Dusk",
  BP10: "Gods of the Arcana",
  BP11: "Bullet of Fate",
  BP12: "Worldreaver's Descent",
  BP13: "Dominion of Darkness",
  BP14: "Banquet of Dreams",
  BP15: "Trial of the Omens",
  CP01: "Umamusume: Pretty Derby",
  CP02: "THE IDOLM@STER CINDERELLA GIRLS",
  CP03: "Cardfight!! Vanguard",
  CSD01: "Ready, Set, Umamusume!",
  CSD02A: "Cute",
  CSD02B: "Cool",
  CSD02C: "Passion",
  CSD03A: "Sanctuary Knight Brigade",
  CSD03B: "Apocalyptic Fire",
  ECP01: "Umamusume: Pretty Derby",
  GFB01A: "Guide to Glory (Forestcraft)",
  GFB01B: "Guide to Glory (Swordcraft)",
  GFB01C: "Guide to Glory (Runecraft)",
  GFB01D: "Guide to Glory (Dragoncraft)",
  GFD01: "Luxheart Legends",
  GFD02: "Treacherous Ambitions",
  SD01: "Regal Fairy Princess",
  SD02: "Blade of Resentment",
  SD03: "Mysteries of Conjuration",
  SD04: "Wrath of the Greatwyrm",
  SD05: "Waltz of the Undying Night",
  SD06: "Maculate Ablution",
  SP01: "Seaside Memories",
  SS01: "Worlds Beyond Swordcraft Starter Set",
  SS02: "Worlds Beyond Dragoncraft Starter Set",
  PR: "Promo Cards",
  BSF2024: "Bushiroad Spring Fest 2024 Promo",
  BSF2025: "Bushiroad Spring Fest 2025 Promo",
  NY2024: "New Year 2024 Promo",
};

function normalizeSetCodeForLookup(setCode) {
  const raw = String(setCode || "").trim();
  if (!raw) return "";
  const suffixed = raw.match(/^([A-Za-z]+\d+)([a-z])$/);
  if (suffixed) return `${suffixed[1].toUpperCase()}${suffixed[2].toUpperCase()}`;
  return raw.toUpperCase();
}

function setLabel(setCode) {
  const normalized = normalizeSetCodeForLookup(setCode);
  const name = SET_NAME_BY_CODE[normalized];
  return name ? `${setCode}: ${name}` : setCode;
}

const searchInput = document.getElementById("searchInput");
const setFilter = document.getElementById("setFilter");
const rarityFilter = document.getElementById("rarityFilter");
const ownedOnly = document.getElementById("ownedOnly");
const exportBtn = document.getElementById("exportBtn");
const importInput = document.getElementById("importInput");
const tableBody = document.getElementById("cardsTableBody");
const rowTemplate = document.getElementById("rowTemplate");

const incompletePlaysetsEl = document.getElementById("incompletePlaysets");
const incompleteSetsEl = document.getElementById("incompleteSets");
const summaryHigherOnly = document.getElementById("summaryHigherOnly");

const RARITY_LABEL_BY_PREFIX = {
  "": "Base",
  P: "Premium",
  SL: "Super Legendary",
  U: "Ultimate",
  SP: "Special",
  SSP: "Super Special",
  LD: "Leader",
  PR: "Promo",
  T: "Token",
  UT: "Token",
  EP: "Evo Point",
};

const RARITY_SORT_ORDER = [
  "Base",
  "Premium",
  "Super Legendary",
  "Ultimate",
  "Special",
  "Super Special",
  "Leader",
  "Promo",
  "Token",
  "Evo Point",
  "Uncategorized",
];

let cards = [];
let collection = {};
let zoomState = { cards: [], index: -1, anchorEl: null, anchorCode: "" };
let zoomNavLeft = null;
let zoomNavRight = null;
let zoomCloseHandlersBound = false;
let rarityOutliers = [];

function setCodeFromCardCode(cardCode) {
  const match = (cardCode || "").match(/^([A-Za-z0-9]+)-/);
  return match ? match[1] : "UNKNOWN";
}

function setCodeFolderCandidates(setCode) {
  const out = new Set();
  out.add(setCode);
  out.add(setCode.toUpperCase());
  const suffix = setCode.match(/^([A-Za-z]+\d+)([a-z])$/);
  if (suffix) {
    out.add(suffix[1]);
    out.add(suffix[1].toUpperCase());
    out.add(`${suffix[1]}${suffix[2].toUpperCase()}`);
  }
  return [...out];
}

function parseRarityFromCardCode(cardCode) {
  const segmentRaw = String(cardCode || "").split("-")[1] || "";
  let segment = segmentRaw.trim();
  try {
    segment = decodeURIComponent(segment);
  } catch {
    segment = segmentRaw.trim();
  }

  const baseMatch = segment.match(/^(\d+)/);
  if (baseMatch) {
    return { rarity: RARITY_LABEL_BY_PREFIX[""], outlier: false, outlierReason: "" };
  }

  const directMatch = segment.match(/^([A-Za-z]+)(\d+)/);
  if (directMatch) {
    const prefix = directMatch[1].toUpperCase();
    const rarity = RARITY_LABEL_BY_PREFIX[prefix];
    if (rarity) {
      return { rarity, outlier: false, outlierReason: "" };
    }
    return { rarity: "Uncategorized", outlier: true, outlierReason: `Unknown rarity prefix: ${prefix}` };
  }

  const decoratedMatch = segment.match(/^([A-Za-z]+)([^0-9A-Za-z]+)(\d+)/);
  if (decoratedMatch) {
    const prefix = decoratedMatch[1].toUpperCase();
    const rarity = RARITY_LABEL_BY_PREFIX[prefix];
    if (rarity) {
      return { rarity, outlier: false, outlierReason: "" };
    }
    return {
      rarity: "Uncategorized",
      outlier: true,
      outlierReason: `Non-standard rarity segment: ${prefix}${decoratedMatch[2]}`,
    };
  }

  return { rarity: "Uncategorized", outlier: true, outlierReason: "Unparseable card code segment" };
}

function artUrlCandidates(card) {
  const folders = new Set(setCodeFolderCandidates(card.setCode));
  // Official site stores many promo/special codes under PR folder (e.g. BSF2024-001EN).
  folders.add("PR");
  return [...folders].map((folder) => `${CARD_ART_BASE}/${folder}/${card.code}.png`);
}

function applyArtToImage(imgEl, card) {
  const candidates = artUrlCandidates(card);
  let idx = 0;
  imgEl.src = candidates[idx];
  imgEl.alt = `${card.name} art`;
  imgEl.onerror = () => {
    idx += 1;
    if (idx < candidates.length) {
      imgEl.src = candidates[idx];
      return;
    }
    imgEl.onerror = null;
    imgEl.src = "./assets/card-placeholder.svg";
  };
}

function isEvolvedType(cardType, name) {
  const t = String(cardType || "").toLowerCase();
  if (t.includes("follower / evolved")) return true;
  return String(name || "").toLowerCase().includes("(evolved)");
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows[0] || [];
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = (rows[i][idx] || "").trim();
    });
    data.push(obj);
  }
  return data;
}

function saveCollection() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
}

function loadCollection() {
  try {
    collection = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    collection = {};
  }
}

function ownedFor(code) {
  const value = Number(collection[code] ?? 0);
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(3, value));
}

function setOwned(code, value) {
  const next = Math.max(0, Math.min(3, value));
  collection[code] = next;
  saveCollection();
}

function populateSetFilter() {
  const sets = [...new Set(cards.map((c) => c.setCode))].sort((a, b) => a.localeCompare(b));
  sets.forEach((setCode) => {
    const opt = document.createElement("option");
    opt.value = setCode;
    opt.textContent = setLabel(setCode);
    setFilter.appendChild(opt);
  });
  if (sets.includes("BP01")) {
    setFilter.value = "BP01";
  }
}

function populateRarityFilter() {
  const rarities = [...new Set(cards.map((c) => c.rarity))].sort((a, b) => {
    const aIdx = RARITY_SORT_ORDER.indexOf(a);
    const bIdx = RARITY_SORT_ORDER.indexOf(b);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.localeCompare(b);
  });

  rarities.forEach((rarity) => {
    const opt = document.createElement("option");
    opt.value = rarity;
    opt.textContent = rarity;
    rarityFilter.appendChild(opt);
  });
}

function filteredCards() {
  const text = searchInput.value.trim().toLowerCase();
  const set = setFilter.value;
  const rarity = rarityFilter.value;
  const requireOwned = ownedOnly.checked;

  return cards.filter((card) => {
    if (set && card.setCode !== set) return false;
    if (rarity && card.rarity !== rarity) return false;
    if (requireOwned && ownedFor(card.code) === 0) return false;
    if (!text) return true;
    return card.name.toLowerCase().includes(text) || card.code.toLowerCase().includes(text);
  });
}

function renderSummary() {
  let incompletePlaysets = 0;
  const setCompletion = new Map();
  const summaryCards = cards.filter((card) =>
    summaryHigherOnly.checked ? card.rarity !== "Base" : card.rarity === "Base"
  );

  summaryCards.forEach((card) => {
    const qty = ownedFor(card.code);
    const isComplete = qty >= 3;
    if (!isComplete) incompletePlaysets++;

    if (!setCompletion.has(card.setCode)) {
      setCompletion.set(card.setCode, true);
    }
    if (!isComplete) {
      setCompletion.set(card.setCode, false);
    }
  });

  let incompleteSets = 0;
  for (const complete of setCompletion.values()) {
    if (!complete) incompleteSets++;
  }

  incompletePlaysetsEl.textContent = String(incompletePlaysets);
  incompleteSetsEl.textContent = String(incompleteSets);
}

function updateZoomNavState() {
  if (!zoomNavLeft || !zoomNavRight) return;
  const hasMulti = zoomState.cards.length > 1;
  zoomNavLeft.classList.toggle("disabled", !hasMulti);
  zoomNavRight.classList.toggle("disabled", !hasMulti);
}

function closeZoom() {
  document.querySelectorAll(".card-art.zoomed").forEach((el) => el.classList.remove("zoomed"));
  document.body.classList.remove("zoom-active");
  if (zoomState.anchorEl && zoomState.anchorCode) {
    const anchorCard = cards.find((c) => c.code === zoomState.anchorCode);
    if (anchorCard) applyArtToImage(zoomState.anchorEl, anchorCard);
  }
  zoomState = { cards: [], index: -1, anchorEl: null, anchorCode: "" };
  updateZoomNavState();
}

function setZoomedElement(nextIndex) {
  if (!zoomState.cards.length || !zoomState.anchorEl) return;
  const len = zoomState.cards.length;
  const wrapped = ((nextIndex % len) + len) % len;
  const zoomCard = zoomState.cards[wrapped];
  zoomState.index = wrapped;
  applyArtToImage(zoomState.anchorEl, zoomCard);
  zoomState.anchorEl.classList.add("zoomed");
  document.body.classList.add("zoom-active");
  updateZoomNavState();
}

function openZoomFor(artEl) {
  const name = artEl.dataset.cardName || "";
  const code = artEl.dataset.cardCode || "";
  if (!name || !code) return;

  if (artEl.classList.contains("zoomed")) {
    closeZoom();
    return;
  }

  const clickedCard = cards.find((c) => c.code === code);
  if (!clickedCard) return;

  // Use full dataset (not current set filter) and keep evolved/non-evolved separate.
  const group = cards.filter((c) => c.name === clickedCard.name && c.isEvolved === clickedCard.isEvolved);
  if (!group.length) return;

  closeZoom();
  zoomState = {
    cards: group,
    index: group.findIndex((c) => c.code === clickedCard.code),
    anchorEl: artEl,
    anchorCode: clickedCard.code,
  };
  artEl.classList.add("zoomed");
  setZoomedElement(zoomState.index);
}

function navigateZoom(step) {
  if (!zoomState.cards.length) return;
  setZoomedElement(zoomState.index + step);
}

function createZoomNav() {
  if (zoomNavLeft && zoomNavRight) return;

  zoomNavLeft = document.createElement("button");
  zoomNavRight = document.createElement("button");

  zoomNavLeft.type = "button";
  zoomNavRight.type = "button";
  zoomNavLeft.className = "zoom-nav zoom-nav-left disabled";
  zoomNavRight.className = "zoom-nav zoom-nav-right disabled";
  zoomNavLeft.textContent = String.fromCharCode(0x25C0);
  zoomNavRight.textContent = String.fromCharCode(0x25B6);
  zoomNavLeft.setAttribute("aria-label", "Previous matching card");
  zoomNavRight.setAttribute("aria-label", "Next matching card");

  zoomNavLeft.addEventListener("click", () => navigateZoom(-1));
  zoomNavRight.addEventListener("click", () => navigateZoom(1));

  if (!zoomCloseHandlersBound) {
    document.addEventListener(
      "click",
      (event) => {
        if (!document.body.classList.contains("zoom-active")) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target === zoomNavLeft || target === zoomNavRight || target.closest(".zoom-nav")) return;
        closeZoom();
      },
      true
    );
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && document.body.classList.contains("zoom-active")) {
        closeZoom();
      }
    });
    zoomCloseHandlersBound = true;
  }

  document.body.appendChild(zoomNavLeft);
  document.body.appendChild(zoomNavRight);
}

function createRow(card) {
  const fragment = rowTemplate.content.cloneNode(true);
  const tr = fragment.querySelector("tr");
  const qtyEl = fragment.querySelector(".qty-value");
  const artEl = fragment.querySelector(".card-art");
  applyArtToImage(artEl, card);
  artEl.dataset.cardName = card.name;
  artEl.dataset.cardCode = card.code;
  artEl.addEventListener("click", () => openZoomFor(artEl));

  fragment.querySelector(".card-name").textContent = card.name;
  fragment.querySelector(".card-code").textContent = card.code;
  fragment.querySelector(".card-set").textContent = card.setCode;
  fragment.querySelector(".promo-source").textContent = card.promoSource;
  qtyEl.textContent = String(ownedFor(card.code));

  fragment.querySelector(".dec").addEventListener("click", () => {
    const next = ownedFor(card.code) - 1;
    setOwned(card.code, next);
    qtyEl.textContent = String(ownedFor(card.code));
    renderSummary();
  });

  fragment.querySelector(".inc").addEventListener("click", () => {
    const next = ownedFor(card.code) + 1;
    setOwned(card.code, next);
    qtyEl.textContent = String(ownedFor(card.code));
    renderSummary();
  });

  return tr;
}

function renderTable() {
  closeZoom();
  tableBody.innerHTML = "";
  const rows = filteredCards();
  const fragment = document.createDocumentFragment();
  rows.forEach((card) => fragment.appendChild(createRow(card)));
  tableBody.appendChild(fragment);
}

function exportCollection() {
  const payload = {
    exportedAt: new Date().toISOString(),
    data: collection,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sve-collection-export.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importCollection(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      if (!parsed || typeof parsed !== "object" || typeof parsed.data !== "object") {
        throw new Error("Invalid format");
      }
      collection = parsed.data;
      saveCollection();
      renderSummary();
      renderTable();
      alert("Collection import complete.");
    } catch {
      alert("Import failed. Use a valid export JSON file.");
    }
  };
  reader.readAsText(file);
}

async function loadCards() {
  let cardTypeMap = {};
  try {
    const typeRes = await fetch(CARD_TYPE_URL);
    if (typeRes.ok) cardTypeMap = await typeRes.json();
  } catch {
    cardTypeMap = {};
  }

  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`Failed to load card data from ${DATA_URL}`);
  }
  const csvText = await response.text();
  const parsed = parseCsv(csvText);
  cards = parsed.map((r) => {
    const rarityInfo = parseRarityFromCardCode(r["Card Code"]);
    return {
      name: r["Card Name"],
      code: r["Card Code"],
      promoSource: r["Promo Obtain Source (if PR in code)"] || "",
      setCode: setCodeFromCardCode(r["Card Code"]),
      rarity: rarityInfo.rarity,
      rarityOutlier: rarityInfo.outlier,
      rarityOutlierReason: rarityInfo.outlierReason,
      isEvolved: isEvolvedType(cardTypeMap[r["Card Code"]], r["Card Name"]),
    };
  });
  rarityOutliers = cards.filter((c) => c.rarityOutlier).map((c) => ({
    code: c.code,
    name: c.name,
    reason: c.rarityOutlierReason,
  }));
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function bindEvents() {
  searchInput.addEventListener("input", renderTable);
  setFilter.addEventListener("change", renderTable);
  rarityFilter.addEventListener("change", renderTable);
  ownedOnly.addEventListener("change", renderTable);
  summaryHigherOnly.addEventListener("change", renderSummary);
  exportBtn.addEventListener("click", exportCollection);
  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (file) importCollection(file);
    importInput.value = "";
  });
}

async function start() {
  loadCollection();
  createZoomNav();
  bindEvents();
  registerServiceWorker();
  try {
    await loadCards();
    populateSetFilter();
    populateRarityFilter();
    renderSummary();
    renderTable();
    if (rarityOutliers.length) {
      console.warn("Rarity outliers detected and left uncategorized:", rarityOutliers);
    }
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="6">${String(err.message || err)}</td></tr>`;
  }
}

start();

