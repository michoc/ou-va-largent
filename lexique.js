/* ==========================================================================
 * Où va l'argent public ? — LA COUCHE LEXICALE (F4)
 * --------------------------------------------------------------------------
 * data/glossaire.json → chaque terme du jargon devient un <abbr class="lex">
 * souligné pointillé ; survol, focus clavier ou tap → une fiche de trois
 * lignes : ce que c'est, combien ça pèse, pourquoi ça compte ici.
 *   • sigles (CAS Pensions, COR, CNRACL…) : casse exacte, chaque occurrence ;
 *   • mots courants (cotisation, mission…) : première occurrence par ZONE
 *     (section, panneau, dialogue…) pour ne pas cribler le texte ;
 *   • jamais dans un lien, un bouton, un titre h1/h2, un tableau, un bandeau
 *     de chiffres ni dans une infobulle ECharts.
 * S'applique au chargement et à tout contenu ajouté ensuite (MutationObserver) :
 * panneau retraites, carte historique, légende du Mondrian, méthodologie…
 * API : window.lexique.apply(racine) ; window.lexique.entries.
 * ========================================================================== */
(function () {
  "use strict";

  const SKIP = "abbr, a, button, select, option, textarea, input, label, script, style, svg, canvas, " +
               "h1, h2, table, .lex-pop, .statband, .fil-big, .credits, .ret-src, .src, .crumb, .breadcrumb, .tm-crumb, .mode-steps, " +
               ".labo-band, [data-nolex], [_echarts_instance_]";
  const ZONES = "[data-lex-zone], .temps, .masthead, .panel-retraites, .histo-card, #metho-body, .mode-dlg, " +
                ".mode-caption, .compare-panel, .cas-legend, .hint, .report-dlg, .compte-card, .acte, section, article";
  const src = (document.currentScript && document.currentScript.src) || "lexique.js";
  const JSON_URL = src.replace(/lexique\.js.*$/, "") + "data/glossaire.json";

  const entries = {};          // id → entrée
  let reSigle = null, reMot = null, byVariant = {};
  const seen = new WeakMap();  // zone → Set(id) déjà soulignés

  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const build = (list, flags) => {
    const vars = [];
    list.forEach((e) => e.variantes.forEach((v) => { vars.push(v); byVariant[v.toLowerCase()] = e.id; }));
    vars.sort((a, b) => b.length - a.length);
    if (!vars.length) return null;
    return new RegExp("(?<![\\p{L}\\p{N}])(" + vars.map(escRe).join("|") + ")(?![\\p{L}\\p{N}])", flags);
  };

  function zoneOf(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return (el && el.closest(ZONES)) || document.body;
  }

  function wrapText(textNode) {
    const txt = textNode.nodeValue;
    if (!txt || txt.length < 3) return;
    const parent = textNode.parentElement;
    if (!parent || parent.closest(SKIP)) return;
    const zone = zoneOf(textNode);
    let done = seen.get(zone);
    if (!done) { done = new Set(); seen.set(zone, done); }
    const hits = [];
    [[reSigle, true], [reMot, false]].forEach(([re, sigle]) => {
      if (!re) return;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(txt))) {
        const id = byVariant[m[1].toLowerCase()];
        if (!id) continue;
        hits.push({ s: m.index, e: m.index + m[1].length, id: id, sigle: sigle, t: m[1] });
        if (!re.global) break;
      }
    });
    if (!hits.length) return;
    hits.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
    const frag = document.createDocumentFragment();
    let pos = 0, last = -1, wrapped = 0;
    hits.forEach((h) => {
      if (h.s < last) return;                               // chevauchement
      if (!h.sigle && done.has(h.id)) return;              // déjà souligné dans cette zone
      done.add(h.id);
      if (h.s > pos) frag.appendChild(document.createTextNode(txt.slice(pos, h.s)));
      const ab = document.createElement("abbr");
      ab.className = "lex"; ab.tabIndex = 0; ab.dataset.lex = h.id;
      ab.setAttribute("aria-label", entries[h.id].terme + " — définition");
      ab.textContent = h.t;
      frag.appendChild(ab);
      pos = h.e; last = h.e; wrapped++;
    });
    if (!wrapped) return;
    if (pos < txt.length) frag.appendChild(document.createTextNode(txt.slice(pos)));
    parent.replaceChild(frag, textNode);
  }

  function apply(root) {
    root = root || document.body;
    if (!reSigle && !reMot) return;
    if (root.nodeType === 3) { wrapText(root); return; }
    if (root.nodeType !== 1 || root.closest(SKIP)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && n.parentElement.closest(SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(wrapText);
  }

  /* ---------- la fiche ---------- */
  let pop = null, current = null, hideT = null;
  const hoverable = window.matchMedia && window.matchMedia("(hover: hover)").matches;
  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement("div");
    pop.className = "lex-pop"; pop.setAttribute("role", "tooltip"); pop.hidden = true;
    pop.addEventListener("mouseenter", () => clearTimeout(hideT));
    pop.addEventListener("mouseleave", () => scheduleHide());
    document.body.appendChild(pop);
    return pop;
  }
  function show(ab) {
    const e = entries[ab.dataset.lex];
    if (!e) return;
    const p = ensurePop();
    clearTimeout(hideT);
    p.innerHTML = '<p class="lex-t">' + esc(e.terme) + '<span class="lex-m">' + esc(window.lexique.millesime || "") + "</span></p>" +
      '<p class="lex-d">' + esc(e.court) + "</p>" +
      (e.poids ? '<p class="lex-p"><span>Combien</span>' + esc(e.poids) + "</p>" : "") +
      (e.ici ? '<p class="lex-i"><span>Ici</span>' + esc(e.ici) + "</p>" : "");
    p.hidden = false;
    current = ab;
    const r = ab.getBoundingClientRect(), pw = Math.min(340, window.innerWidth - 24);
    p.style.width = pw + "px";
    let x = r.left + window.scrollX + r.width / 2 - pw / 2;
    x = Math.max(12 + window.scrollX, Math.min(x, window.scrollX + window.innerWidth - pw - 12));
    const ph = p.offsetHeight;
    const below = r.bottom + 10 + ph < window.innerHeight || r.top < ph + 10;
    p.style.left = x + "px";
    p.style.top = (below ? r.bottom + window.scrollY + 8 : r.top + window.scrollY - ph - 8) + "px";
    p.classList.toggle("above", !below);
    ab.setAttribute("aria-expanded", "true");
  }
  function hide() {
    if (!pop) return;
    pop.hidden = true;
    if (current) current.removeAttribute("aria-expanded");
    current = null;
  }
  function scheduleHide() { clearTimeout(hideT); hideT = setTimeout(hide, 220); }
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");

  document.addEventListener("mouseover", (e) => {
    if (!hoverable) return;
    const ab = e.target.closest && e.target.closest("abbr.lex");
    if (ab) show(ab);
  });
  document.addEventListener("mouseout", (e) => {
    if (!hoverable) return;
    if (e.target.closest && e.target.closest("abbr.lex")) scheduleHide();
  });
  document.addEventListener("click", (e) => {
    const ab = e.target.closest && e.target.closest("abbr.lex");
    if (ab) { e.preventDefault(); if (current === ab && pop && !pop.hidden) hide(); else show(ab); return; }
    if (pop && !pop.hidden && !(e.target.closest && e.target.closest(".lex-pop"))) hide();
  });
  document.addEventListener("focusin", (e) => { const ab = e.target.closest && e.target.closest("abbr.lex"); if (ab) show(ab); });
  document.addEventListener("focusout", (e) => { if (e.target.closest && e.target.closest("abbr.lex")) scheduleHide(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  window.addEventListener("scroll", () => { if (current) hide(); }, { passive: true });

  /* ---------- contenu ajouté après coup ---------- */
  let pending = null;
  const queue = new Set();
  function observe() {
    new MutationObserver((muts) => {
      muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1 || n.nodeType === 3) queue.add(n); }));
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        const list = Array.from(queue); queue.clear();
        list.forEach((n) => { if (n.isConnected) apply(n); });
      }, 60);
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.lexique = { apply: apply, entries: entries, millesime: "" };

  fetch(JSON_URL, { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then((g) => {
      window.lexique.millesime = g.millesime || "";
      (g.entrees || []).forEach((e) => (entries[e.id] = e));
      const list = Object.values(entries).filter((e) => e.souligne !== false);   // U24
      reSigle = build(list.filter((e) => e.sigle), "gu");
      reMot = build(list.filter((e) => !e.sigle), "giu");
      apply(document.body);
      observe();
    })
    .catch(() => { /* sans lexique, la page reste lisible */ });
})();
