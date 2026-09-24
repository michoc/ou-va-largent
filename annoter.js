/* ==========================================================================
 * ANNOTER — le mode commentaire de l'auteur. INVISIBLE pour les lecteurs :
 * le fichier n'est même pas téléchargé tant que le mode n'est pas activé
 * (chargeur en une ligne à la fin de chaque page).
 * --------------------------------------------------------------------------
 * ACTIVER    : ajouter ?annoter à n'importe quelle URL du site (une seule fois :
 *              le mode suit ensuite la navigation, drapeau dans localStorage).
 * ANNOTER    : 1. SÉLECTIONNER des mots → un bouton « Commenter la sélection »
 *                 apparaît ; la phrase reste surlignée en jaune sur la page.
 *              2. Dans un GRAPHIQUE, ⌥/Alt + clic sur un bloc → le nom exact du
 *                 bloc survolé est retenu (chemin complet dans le Mondrian).
 *              3. Ailleurs, ⌥/Alt + clic sur un élément — ou le bouton
 *                 « + Commenter » puis un clic/tap (tactile).
 * RELIRE     : épingle numérotée là où on a cliqué ; le panneau liste tout,
 *              « ↗ » ramène à l'endroit commenté.
 * ENVOYER    : « Copier pour Claude » → markdown à coller dans le chat.
 *
 * Chaque note retient : la page, l'état du graphique (lecture ①②③, plongée,
 * temps du fil, hash), la phrase ou le bloc visé, un sélecteur CSS, la largeur
 * d'écran et la date. Zéro réseau : tout reste dans le navigateur (localStorage,
 * donc par appareil et par origine).
 * ========================================================================== */

(function () {
  "use strict";

  const QS = new URLSearchParams(location.search);
  if (QS.has("embed")) return;          // la scène du fil : on annote le cadre, pas son contenu

  const FLAG = "ovlap.annoter", KEY = "ovlap.annotations";
  const LS = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* navigation privée */ } },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* navigation privée */ } },
  };

  if (QS.has("annoter")) {
    const v = (QS.get("annoter") || "").toLowerCase();
    if (v === "0" || v === "off" || v === "non") {
      LS.del(FLAG);
      location.replace(location.pathname + location.hash);
      return;
    }
    LS.set(FLAG, "1");
  }
  if (LS.get(FLAG) !== "1") return;

  /* ---------- données ---------- */
  const load = () => { try { return JSON.parse(LS.get(KEY) || "[]"); } catch (e) { return []; } };
  const save = (a) => LS.set(KEY, JSON.stringify(a));
  let notes = load();
  let armed = false, pending = null, selBtn = null;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const court = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s);

  /* ---------- contexte : où en est le lecteur ---------- */
  function pageName() {
    const f = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    return f.indexOf("sankey") === 0 ? "Les flux"
      : f.indexOf("treemap") === 0 ? "Les masses"
      : f.indexOf("simulateur") === 0 ? "Le labo"
      : "Le fil";
  }
  const MODES = { officiel: "① ce qu'on montre", revele: "② ce qui s'y cache", realite: "③ ce que ça coûte vraiment" };
  function etatOf() {
    const bits = [];
    const mode = document.body.dataset.mode;
    if (mode) bits.push(MODES[mode] || mode);
    const crumb = document.querySelector('#tm-crumb .tm-crumb-item[aria-current], .breadcrumb .crumb[aria-current]');
    const ct = crumb ? clean(crumb.textContent) : "";
    if (ct && ct !== "Vue d'ensemble") bits.push("plongée " + ct);
    const rail = document.querySelector(".fil-rail a.is-current span");
    if (rail) bits.push("temps « " + clean(rail.textContent) + " »");
    const acte = document.querySelector(".labo-crumb a.is-current");
    if (acte) bits.push(clean(acte.textContent));
    if (location.hash && location.hash.length > 1) bits.push(location.hash);
    return bits.join(" · ");
  }

  /* ---------- graphiques : retenir le bloc survolé (ECharts) ---------- */
  const survol = {};                    // id du conteneur → { label, ts }
  function brancherGraphiques() {
    if (!window.echarts) return;
    ["chart", "treemap"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.annoterOn) return;
      const inst = window.echarts.getInstanceByDom(el);
      if (!inst) return;
      el.dataset.annoterOn = "1";
      inst.on("mouseover", (p) => {
        let label = p.name || "";
        if (p.treePathInfo && p.treePathInfo.length > 1) {
          label = p.treePathInfo.slice(1).map((t) => t.name).join(" › ");
        } else if (p.dataType === "edge" && p.data) {
          label = p.data.source + " → " + p.data.target;
        }
        if (typeof p.value === "number") label += " (" + String(Math.round(p.value * 10) / 10).replace(".", ",") + " Md€)";
        survol[id] = { label: clean(label), ts: Date.now() };
      });
    });
  }
  [0, 900, 2600, 6000].forEach((t) => setTimeout(brancherGraphiques, t));
  window.addEventListener("hashchange", () => setTimeout(brancherGraphiques, 500));
  function blocSurvole(el) {
    const c = el && el.closest ? el.closest("#chart, #treemap") : null;
    if (!c) return null;
    const s = survol[c.id];
    return s && Date.now() - s.ts < 6000 ? s.label : null;
  }

  /* ---------- cibles : le plus petit bloc de sens sous le curseur ---------- */
  const CIBLES = "p,li,h1,h2,h3,h4,figure,table,tr,button,a,label,summary,output," +
    ".fil-svg,#chart,#treemap,#sim-chart,#balance-svg,.gen-card,.levier,.vie-col,.mini,.stage-panel," +
    ".histo-card,.these-banner,.mode-step,.temps-exergue,.fil-tool,.verdict,.resultat,.mission,section";
  const cibleDe = (el) => (el && el.closest ? el.closest(CIBLES) || el : el);

  function selectorFor(el) {
    if (!el || el === document.body) return "body";
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body && parts.length < 4) {
      if (cur.id) { parts.unshift("#" + cur.id); break; }
      if (cur.dataset && cur.dataset.ch) { parts.unshift('[data-ch="' + cur.dataset.ch + '"]'); break; }
      let s = cur.tagName.toLowerCase();
      const cls = typeof cur.className === "string"
        ? cur.className.trim().split(/\s+/).filter((c) => c && !/^(is-|on$|open$|annoter)/.test(c))[0] : null;
      if (cls) s += "." + cls;
      const sibs = cur.parentElement ? [].filter.call(cur.parentElement.children, (x) => x.tagName === cur.tagName) : [];
      if (sibs.length > 1) s += ":nth-of-type(" + (sibs.indexOf(cur) + 1) + ")";
      parts.unshift(s);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  /* ---------- styles (injectés : style.css reste celui des lecteurs) ---------- */
  const css = document.createElement("style");
  css.textContent = `
  #annoter-ui, #annoter-pins, .annoter-selbtn { font: 13px/1.5 var(--sans, system-ui); }
  #annoter-pins { position: absolute; inset: 0 auto auto 0; z-index: 9000; pointer-events: none; }
  .annoter-pin { position: absolute; z-index: 9000; width: 22px; height: 22px; border-radius: 50%;
    background: #C13B55; color: #fff; font: 700 11px/22px var(--sans, system-ui); text-align: center;
    box-shadow: 0 2px 6px rgba(30,36,48,.35); pointer-events: auto; cursor: pointer; transform: translate(-50%, -50%); }
  .annoter-pin:hover { background: #8E1B38; transform: translate(-50%, -50%) scale(1.15); }
  mark.annoter-mark { background: #FBE79B; color: inherit; box-shadow: 0 1px 0 #C13B55; border-radius: 2px; padding: 0 1px; }
  .annoter-ann { outline: 1px dashed rgba(193,59,85,.5); outline-offset: 2px; }
  body.annoter-armed, body.annoter-alt { cursor: crosshair; }
  body.annoter-armed .annoter-hi, body.annoter-alt .annoter-hi {
    outline: 2px solid #C13B55 !important; outline-offset: 2px; background: rgba(193,59,85,.06) !important; }
  .annoter-selbtn { position: fixed; z-index: 9150; background: #C13B55; color: #FFF; border: 0; border-radius: 999px;
    padding: 8px 14px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 14px rgba(30,36,48,.3); }
  .annoter-selbtn:hover { background: #8E1B38; }
  #annoter-tip { position: fixed; z-index: 9100; background: #FFF; color: #1E2430; border: 1px solid #1E2430;
    border-radius: 10px; box-shadow: 0 10px 30px rgba(30,36,48,.25); padding: 10px; width: 310px; max-width: calc(100vw - 24px); }
  #annoter-tip .ctx { margin: 0 0 6px; font-size: 11px; color: #4A5265; }
  #annoter-tip .cite { margin: 0 0 7px; font-size: 12px; color: #1E2430; background: #FBE79B; border-radius: 4px; padding: 4px 6px; }
  #annoter-tip textarea { width: 100%; height: 76px; box-sizing: border-box; font: 13px/1.45 var(--sans, system-ui);
    border: 1px solid #E4DCCB; border-radius: 6px; padding: 7px; resize: vertical; color: #1E2430; background: #FFF; }
  #annoter-tip .row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
  #annoter-ui { position: fixed; right: 14px; bottom: 14px; z-index: 9200; max-width: min(380px, calc(100vw - 28px)); }
  #annoter-open { display: flex; align-items: center; gap: 7px; background: #1E2430; color: #FFF; border: 0;
    border-radius: 999px; padding: 10px 15px; font: 700 13px/1 var(--sans, system-ui); cursor: pointer;
    box-shadow: 0 4px 16px rgba(30,36,48,.3); }
  #annoter-open b { background: #C13B55; border-radius: 999px; padding: 2px 7px; font-size: 11px; }
  #annoter-panel { display: none; background: #FFF; color: #1E2430; border: 1px solid #1E2430; border-radius: 12px;
    box-shadow: 0 12px 40px rgba(30,36,48,.28); overflow: hidden; }
  #annoter-ui.open #annoter-panel { display: block; }
  #annoter-ui.open #annoter-open { display: none; }
  #annoter-panel header { display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 9px 12px; border-bottom: 1px solid #E4DCCB; background: #FAF6EF; }
  #annoter-panel header b { font: 700 12px/1 var(--sans, system-ui); letter-spacing: .08em; text-transform: uppercase; }
  #annoter-aide { padding: 8px 12px; font-size: 11.5px; color: #4A5265; background: #FBF7EE; border-bottom: 1px solid #E4DCCB; }
  #annoter-list { max-height: min(42vh, 380px); overflow: auto; margin: 0; padding: 0; list-style: none; }
  #annoter-list li { border-bottom: 1px solid #E4DCCB; padding: 9px 12px; display: grid;
    grid-template-columns: 22px 1fr auto auto; gap: 6px; align-items: start; }
  #annoter-list .n { width: 20px; height: 20px; border-radius: 50%; background: #C13B55; color: #fff;
    font: 700 11px/20px var(--sans, system-ui); text-align: center; }
  #annoter-list .ctx { font-size: 11px; color: #4A5265; }
  #annoter-list .txt { font-size: 13px; }
  #annoter-list .cite { font-size: 11px; color: #1E2430; background: #FBE79B; border-radius: 3px; padding: 0 3px; }
  #annoter-list .vide { color: #4A5265; font-style: italic; }
  #annoter-panel footer { display: flex; flex-wrap: wrap; gap: 6px; padding: 9px 12px; border-top: 1px solid #E4DCCB; background: #FAF6EF; }
  .annoter-btn { font: 700 12px/1 var(--sans, system-ui); border-radius: 999px; padding: 8px 12px; cursor: pointer;
    border: 1px solid #C13B55; background: #FFF; color: #C13B55; }
  .annoter-btn:hover { background: #C13B55; color: #FFF; }
  .annoter-btn.ghost { border-color: #E4DCCB; color: #4A5265; }
  .annoter-btn.ghost:hover { background: #1E2430; border-color: #1E2430; color: #FFF; }
  .annoter-btn.on { background: #C13B55; color: #FFF; }
  .annoter-mini { border: 0; background: none; cursor: pointer; color: #4A5265; font-size: 14px; padding: 0 3px; }
  .annoter-mini:hover { color: #C13B55; }
  #annoter-toast { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 9300;
    background: #1E2430; color: #FFF; border-radius: 999px; padding: 9px 16px; font: 700 13px/1 var(--sans, system-ui); }
  @media (max-width: 640px) {
    #annoter-ui { left: 10px; right: 10px; bottom: 10px; max-width: none; }
    #annoter-list { max-height: 38vh; }
  }`;
  document.head.appendChild(css);

  /* ---------- interface ---------- */
  const ui = document.createElement("div");
  ui.id = "annoter-ui";
  ui.innerHTML =
    '<button type="button" id="annoter-open">Commentaires <b id="annoter-count">0</b></button>' +
    '<div id="annoter-panel">' +
      '<header><b>Mode commentaire</b>' +
        '<button type="button" class="annoter-mini" id="annoter-close" title="Réduire">▾</button></header>' +
      '<p id="annoter-aide">Sélectionner des mots pour commenter une phrase · ⌥/Alt&nbsp;+&nbsp;clic sur un bloc ou une tuile de graphique · ou «&nbsp;+&nbsp;Commenter&nbsp;» puis un tap.</p>' +
      '<ul id="annoter-list"></ul>' +
      '<footer>' +
        '<button type="button" class="annoter-btn" id="annoter-arm">+ Commenter</button>' +
        '<button type="button" class="annoter-btn" id="annoter-copy">Copier pour Claude</button>' +
        '<button type="button" class="annoter-btn ghost" id="annoter-clear">Tout effacer</button>' +
        '<button type="button" class="annoter-btn ghost" id="annoter-quit">Quitter le mode</button>' +
      "</footer></div>";
  document.body.appendChild(ui);
  const pins = document.createElement("div");
  pins.id = "annoter-pins";
  document.body.appendChild(pins);

  const $ = (id) => document.getElementById(id);
  const toast = (txt) => {
    const t = document.createElement("div");
    t.id = "annoter-toast"; t.textContent = txt;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  };

  /* ---------- surlignage des phrases citées ---------- */
  function demarquer() {
    document.querySelectorAll("mark.annoter-mark").forEach((m) => {
      const p = m.parentNode;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      m.remove();
      if (p.normalize) p.normalize();
    });
    document.querySelectorAll(".annoter-ann").forEach((e) => e.classList.remove("annoter-ann"));
  }
  function marquer() {
    demarquer();
    notes.forEach((n, i) => {
      if (!ici(n)) return;
      let el = null;
      try { el = document.querySelector(n.sel); } catch (e) { el = null; }
      if (!el) return;
      if (!n.quote) { el.classList.add("annoter-ann"); return; }
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      let node, pose = false;
      while ((node = w.nextNode())) {
        const k = node.nodeValue.indexOf(n.quote);
        if (k < 0) continue;
        const r = document.createRange();
        r.setStart(node, k); r.setEnd(node, k + n.quote.length);
        const m = document.createElement("mark");
        m.className = "annoter-mark"; m.dataset.i = i; m.title = n.note;
        try { r.surroundContents(m); pose = true; } catch (e) { /* sélection à cheval */ }
        break;
      }
      if (!pose) el.classList.add("annoter-ann");
    });
  }

  /* ---------- épingles ---------- */
  function ici(n) { return n.page === pageName(); }
  function ancre(n) {
    if (n.quote) {
      const m = document.querySelector('mark.annoter-mark[data-i="' + notes.indexOf(n) + '"]');
      if (m) return m;
    }
    try { return document.querySelector(n.sel); } catch (e) { return null; }
  }
  function placePins() {
    pins.innerHTML = "";
    notes.forEach((n, i) => {
      if (!ici(n)) return;
      const el = ancre(n);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      const p = document.createElement("button");
      p.type = "button"; p.className = "annoter-pin"; p.textContent = i + 1;
      p.title = n.note;
      const dx = n.px != null ? n.px * r.width : r.width;
      const dy = n.py != null ? n.py * r.height : 8;
      p.style.left = (r.left + window.scrollX + dx) + "px";
      p.style.top = (r.top + window.scrollY + dy) + "px";
      p.addEventListener("click", (e) => { e.stopPropagation(); ouvrir(); surligner(i); });
      pins.appendChild(p);
    });
  }
  let raf = 0;
  const replacer = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; placePins(); }); };
  window.addEventListener("scroll", replacer, { passive: true });
  window.addEventListener("resize", replacer);

  /* ---------- liste ---------- */
  function render() {
    $("annoter-count").textContent = notes.length;
    const list = $("annoter-list");
    if (!notes.length) {
      list.innerHTML = '<li><span></span><span class="vide">Aucun commentaire pour l\'instant.</span><span></span><span></span></li>';
    } else {
      list.innerHTML = notes.map((n, i) =>
        '<li data-i="' + i + '"><span class="n">' + (i + 1) + "</span>" +
        '<span><span class="ctx">' + esc(n.page) + (n.etat ? " · " + esc(n.etat) : "") + " · " + esc(n.vw) + "&nbsp;px</span><br>" +
        '<span class="txt">' + esc(n.note) + "</span><br>" +
        (n.quote ? '<span class="cite">« ' + esc(court(clean(n.quote), 64)) + " »</span>"
          : n.bloc ? '<span class="ctx">bloc : ' + esc(court(n.bloc, 64)) + "</span>"
          : '<span class="ctx">sur : « ' + esc(court(n.texte || "", 60)) + " »</span>") +
        "</span>" +
        '<button type="button" class="annoter-mini" data-go="' + i + '" title="Aller voir">↗</button>' +
        '<button type="button" class="annoter-mini" data-del="' + i + '" title="Supprimer">✕</button></li>').join("");
    }
    marquer();
    placePins();
  }
  function surligner(i) {
    const li = document.querySelector('#annoter-list li[data-i="' + i + '"]');
    if (!li) return;
    li.scrollIntoView({ block: "nearest" });
    li.style.background = "#FDF3D6";
    setTimeout(() => { li.style.background = ""; }, 1200);
  }
  const ouvrir = () => ui.classList.add("open");

  /* ---------- capture par sélection de texte ---------- */
  function cacherSelBtn() { if (selBtn) { selBtn.remove(); selBtn = null; } }
  function proposerSelection() {
    cacherSelBtn();
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return;
    const brut = s.toString();
    if (clean(brut).length < 3) return;
    const r = s.getRangeAt(0);
    if (r.commonAncestorContainer.parentElement &&
        r.commonAncestorContainer.parentElement.closest("#annoter-ui, #annoter-tip")) return;
    const rect = r.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const anc = r.commonAncestorContainer.nodeType === 1
      ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "annoter-selbtn"; btn.textContent = "Commenter la sélection";
    document.body.appendChild(btn);
    btn.style.left = Math.max(8, Math.min(rect.left + rect.width / 2 - btn.offsetWidth / 2,
      window.innerWidth - btn.offsetWidth - 8)) + "px";
    btn.style.top = Math.min(rect.bottom + 8, window.innerHeight - btn.offsetHeight - 8) + "px";
    selBtn = btn;
    btn.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const cible = cibleDe(anc);
      const cr = cible.getBoundingClientRect();
      cacherSelBtn();
      ouvrirTip(cible, rect.left + rect.width / 2, rect.bottom, {
        quote: brut,
        px: cr.width ? (rect.left + rect.width / 2 - cr.left) / cr.width : null,
        py: cr.height ? (rect.top + rect.height / 2 - cr.top) / cr.height : null,
      });
    });
  }
  document.addEventListener("mouseup", (e) => {
    if (e.target.closest && e.target.closest("#annoter-ui, #annoter-tip, .annoter-pin, .annoter-selbtn")) return;
    setTimeout(proposerSelection, 10);
  });
  document.addEventListener("touchend", () => setTimeout(proposerSelection, 120));
  document.addEventListener("mousedown", (e) => {
    if (e.target.closest && e.target.closest(".annoter-selbtn")) return;
    cacherSelBtn();
  });
  window.addEventListener("scroll", cacherSelBtn, { passive: true });

  /* ---------- capture par clic (blocs, tuiles de graphique) ---------- */
  let hi = null;
  function setHi(el) {
    if (hi === el) return;
    if (hi) hi.classList.remove("annoter-hi");
    hi = el;
    if (hi) hi.classList.add("annoter-hi");
  }
  document.addEventListener("pointermove", (e) => {
    if (!armed && !document.body.classList.contains("annoter-alt")) { setHi(null); return; }
    if (e.target.closest("#annoter-ui, #annoter-tip, .annoter-pin, .annoter-selbtn")) { setHi(null); return; }
    setHi(cibleDe(e.target));
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Alt") document.body.classList.add("annoter-alt");
    if (e.key === "Escape") { fermerTip(); cacherSelBtn(); desarmer(); }
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "Alt") { document.body.classList.remove("annoter-alt"); setHi(null); }
  });
  window.addEventListener("blur", () => { document.body.classList.remove("annoter-alt"); setHi(null); });

  document.addEventListener("click", (e) => {
    if (e.target.closest("#annoter-ui, #annoter-tip, .annoter-pin, .annoter-selbtn")) return;
    if (!armed && !e.altKey) return;
    e.preventDefault(); e.stopPropagation();
    const el = cibleDe(e.target);
    const r = el.getBoundingClientRect();
    setHi(null); desarmer();
    ouvrirTip(el, e.clientX, e.clientY, {
      bloc: blocSurvole(el),
      px: r.width ? (e.clientX - r.left) / r.width : null,
      py: r.height ? (e.clientY - r.top) / r.height : null,
    });
  }, true);

  function desarmer() { armed = false; document.body.classList.remove("annoter-armed"); $("annoter-arm").classList.remove("on"); }
  function armer() { armed = true; document.body.classList.add("annoter-armed"); $("annoter-arm").classList.add("on"); ui.classList.remove("open"); toast("Cliquer l'élément à commenter"); }

  /* ---------- bulle de saisie ---------- */
  function fermerTip() { if (pending) { pending.remove(); pending = null; } }
  function ouvrirTip(el, x, y, opts) {
    fermerTip();
    opts = opts || {};
    const texte = clean(el.textContent).slice(0, 120) || el.getAttribute("aria-label") || el.id || el.tagName.toLowerCase();
    const vise = opts.quote ? clean(opts.quote) : opts.bloc || texte;
    const tip = document.createElement("div");
    tip.id = "annoter-tip";
    tip.innerHTML = '<p class="ctx">' + esc(pageName()) + (etatOf() ? " · " + esc(etatOf()) : "") +
      (opts.bloc ? " · bloc du graphique" : opts.quote ? " · phrase sélectionnée" : "") + "</p>" +
      '<p class="cite">« ' + esc(court(vise, 90)) + " »</p>" +
      '<textarea placeholder="Ce qui ne va pas, ou ce qu\'il faut changer…"></textarea>' +
      '<div class="row"><button type="button" class="annoter-btn ghost" data-a="x">Annuler</button>' +
      '<button type="button" class="annoter-btn" data-a="ok">Ajouter</button></div>';
    document.body.appendChild(tip);
    pending = tip;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8)) + "px";
    tip.style.top = Math.max(8, Math.min(y + 14, window.innerHeight - h - 8)) + "px";
    const ta = tip.querySelector("textarea");
    ta.focus();
    const valider = () => {
      const txt = ta.value.trim();
      if (!txt) { fermerTip(); return; }
      notes.push({ ts: Date.now(), page: pageName(), url: location.href, etat: etatOf(),
        sel: selectorFor(el), texte: texte, quote: opts.quote || null, bloc: opts.bloc || null,
        px: opts.px, py: opts.py, note: txt, vw: window.innerWidth });
      save(notes); fermerTip();
      if (window.getSelection) window.getSelection().removeAllRanges();
      render(); ouvrir();
      toast("Commentaire " + notes.length + " ajouté");
    };
    ta.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) valider();
      if (ev.key === "Escape") fermerTip();
    });
    tip.addEventListener("click", (ev) => {
      const a = ev.target.getAttribute("data-a");
      if (a === "ok") valider();
      if (a === "x") fermerTip();
    });
  }

  /* ---------- export ---------- */
  function markdown() {
    const d = new Date().toLocaleDateString("fr-FR");
    const lignes = notes.map((n, i) => {
      const quoi = n.quote ? 'phrase : « ' + court(clean(n.quote), 140) + " »"
        : n.bloc ? "bloc : " + court(n.bloc, 100)
        : "élément : `" + n.sel + "`" + (n.texte ? ' — « ' + court(n.texte, 80) + " »" : "");
      return (i + 1) + ". **" + n.page + "**" + (n.etat ? " · " + n.etat : "") + " — " + n.vw + " px\n" +
        "   " + quoi + (n.quote || n.bloc ? "  (`" + n.sel + "`)" : "") + "\n" +
        "   > " + n.note.replace(/\n/g, "\n   > ");
    });
    return "## " + notes.length + " commentaire" + (notes.length > 1 ? "s" : "") +
      " sur le site — " + d + "\n\n" + lignes.join("\n\n") + "\n";
  }
  function copier(txt) {
    const ok = () => toast("Copié — coller dans le chat");
    const repli = () => {
      const ta = document.createElement("textarea");
      ta.value = txt; ta.style.cssText = "position:fixed;left:-9999px";
      document.body.appendChild(ta); ta.select();
      let fait = false;
      try { fait = document.execCommand("copy"); } catch (e) { fait = false; }
      ta.remove();
      if (fait) ok(); else window.prompt("Copier :", txt);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, repli);
    else repli();
  }

  /* ---------- actions du panneau ---------- */
  $("annoter-open").addEventListener("click", ouvrir);
  $("annoter-close").addEventListener("click", () => ui.classList.remove("open"));
  $("annoter-arm").addEventListener("click", () => (armed ? desarmer() : armer()));
  $("annoter-copy").addEventListener("click", () => {
    if (!notes.length) { toast("Aucun commentaire"); return; }
    copier(markdown());
  });
  $("annoter-clear").addEventListener("click", () => {
    if (!notes.length || !window.confirm("Effacer les " + notes.length + " commentaires ?")) return;
    notes = []; save(notes); render(); toast("Effacés");
  });
  $("annoter-quit").addEventListener("click", () => {
    LS.del(FLAG);
    location.replace(location.pathname + location.hash);
  });
  $("annoter-list").addEventListener("click", (e) => {
    const del = e.target.getAttribute("data-del"), go = e.target.getAttribute("data-go");
    if (del != null) { notes.splice(+del, 1); save(notes); render(); return; }
    if (go != null) {
      const n = notes[+go];
      if (!ici(n)) { location.href = n.url; return; }
      const el = ancre(n);
      if (!el) { toast("Élément introuvable dans cet état"); return; }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("annoter-hi");
      setTimeout(() => el.classList.remove("annoter-hi"), 1600);
    }
  });
  // clic sur une phrase surlignée → sa fiche dans le panneau
  document.addEventListener("click", (e) => {
    const m = e.target.closest ? e.target.closest("mark.annoter-mark") : null;
    if (!m) return;
    e.preventDefault(); e.stopPropagation();
    ouvrir(); surligner(+m.dataset.i);
  }, true);

  /* ---------- calage : ne pas recouvrir la barre de points du fil ---------- */
  function caler() {
    const rail = document.querySelector(".fil-rail");
    const bas = rail && window.innerWidth <= 1280 && getComputedStyle(rail).position === "fixed"
      ? Math.round(rail.getBoundingClientRect().height) + 12 : 14;
    ui.style.bottom = bas + "px";
  }
  caler();
  window.addEventListener("resize", caler);

  render();
  // les graphiques et la scène se redessinent après le chargement des données
  [900, 2500].forEach((t) => setTimeout(() => { marquer(); placePins(); }, t));
  window.addEventListener("hashchange", () => setTimeout(placePins, 400));
})();
