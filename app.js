/* ==========================================================================
 * Où va l'argent public ? — Sankey ECharts façon « poster »  (front, zéro build)
 * --------------------------------------------------------------------------
 * Rôle : charger data/unified_finances.json (généré par scraper.py) et le
 * rendre en un unique diagramme de Sankey interactif. Aucun framework : cette
 * IIFE + ECharts 5 (CDN) suffisent. Toute la donnée vient du JSON ; ce fichier
 * ne fait que du rendu et de la navigation.
 *
 * Le diagramme est UNIFIÉ (une seule instance ECharts) :
 *   • Vue d'ensemble VERTICALE : recettes → blocs État/Sécu → dépenses, avec la
 *     VOIE RETRAITES sur le côté droit — cotisations (270,3 en 2025) et impôts affectés
 *     descendent directement vers le nœud terminal « Pensions versées —
 *     » (constante PENS, 422,2 Md€ en 2025), rejoints par les apports re-fléchés de
 *     l'État (CAS Pensions), des Collectivités (CNRACL) et de la Sécu.
 *     L'ordre gauche→droite est DÉTERMINISTE (MACRO_COL0 + macroRank) pour
 *     garder la voie retraites au bord droit.
 *   • PLONGÉE (clic sur un nœud OU sur un flux) : toutes les vues restent
 *     VERTICALES ; la nouvelle vue naît du rectangle exact du nœud cliqué
 *     pendant que l'ancienne grossit et se dissout (diveTransition) — on ne
 *     quitte jamais le diagramme, on s'y enfonce. Breadcrumb pour remonter.
 *   • Échap ou clic sur le fond = ressortir d'un niveau (animation inverse).
 *
 * Structure du JSON consommé : voir BRIEF.md § « Modèle de données ».
 * ========================================================================== */

(function () {
  "use strict";

  const chartEl = document.getElementById("chart");
  const stageEl = document.getElementById("chart-stage");
  const crumbEl = document.getElementById("breadcrumb");
  const statEl = document.getElementById("statband");
  const casLegendEl = document.getElementById("cas-legend");
  const histoEl = document.getElementById("histo-card");
  const retPanel = document.getElementById("panel-retraites");
  const chart = echarts.init(chartEl, null, { renderer: "canvas" });

  let DATA = null;
  let viewStack = [];          // [] = vue d'ensemble ; sinon [{key,label,rect}, …]
  // État « thèse » (U5) : au premier affichage, seuls les flux qui financent les
  // retraites SOUS UN AUTRE NOM (ministères → pensions, Sécu → régimes) sont en
  // cramoisi ; tout le reste est estompé. « Voir tout le poster » ou une plongée
  // rendent le poster complet.
  let THESE = true;
  // mode « embed » (scène du fil, index.html) : chrome masqué, hauteur = la fenêtre,
  // état piloté par le hash (#these, #poster, #dive=…, #retraites)
  const EMBED = new URLSearchParams(location.search).has("embed");
  if (EMBED) document.body.classList.add("embed");
  const REG_N = "Régimes de base & complémentaires";
  const SECU_N = "Sécurité sociale (hors retraites)";
  const isTheseLink = (l) => (l.target === PENS && l.source.indexOf("É · ") === 0) ||
                             (l.source === SECU_N && l.target === REG_N);

  const PENS = "Pensions versées";
  const DETTE_NAMES = ["Émission de dette (Déficit)", "Déficit résiduel (dette sociale)"];
  // nœuds de la voie retraites (bord gauche) — pastilles rentrées sur mobile
  const LANE_NODES = {   // valeur = sens du décalage mobile (vers l'intérieur)
    "Cotisations retraites (tous régimes)": 1,   // F11 : coupée au bord gauche sinon
    "Système de retraites (tous régimes)": 1,
    "Régimes de base & complémentaires": 1,
    "Pensions versées": 1,
    "É · Autres missions": -1,          // agrégat mobile collé au bord droit
  };
  const REDUCED_MOTION = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- utilitaires ---------------- */

  // fr-FR ne groupe pas les nombres à 4 chiffres (« 1144,1 ») : groupement forcé
  const group = (t) => { const i = t.search(/,/); const e = i < 0 ? t : t.slice(0, i), d = i < 0 ? "" : t.slice(i);
    return e.replace(/\s/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0") + d; };
  const fmt = (v) =>
    group(Number(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + " Mds €";
  const fmt0 = (v) => group(Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 }));
  const fmt2 = (v) => group(Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 }));
  // chiffres transverses (meta.chiffres, un seul endroit : retraites_2025.json > cadrage_2025)
  const CH = () => (DATA && DATA.meta && DATA.meta.chiffres) || {};
  const tauxCas = (y) => { const t = CH().taux_cas_civils || {}; return t[String(y)] || null; };
  const population = () => ((CH().population_france || {}).millions) || null;
  const parHabitant = (md) => { const p = population(); return p ? Math.round(md * 1000 / p / 10) * 10 : null; };
  const esc = (s) =>
    String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function tooltipHtml(title, value, note) {
    return (
      '<div class="sankey-tip">' +
      '<div class="tip-title">' + esc(title) + "</div>" +
      (value != null ? '<div class="tip-value">' + fmt(value) + "</div>" : "") +
      (note ? '<div class="tip-note">' + esc(note) + "</div>" : "") +
      "</div>"
    );
  }

  function nodeValue(links, name) {
    let vIn = 0, vOut = 0;
    for (const l of links) {
      if (l.target === name) vIn += l.value;
      if (l.source === name) vOut += l.value;
    }
    return Math.max(vIn, vOut);
  }

  // Libellés courts pour les pastilles (les intitulés complets restent au survol).
  const SHORT = {
    "Impôts et taxes affectés (Sécu)": "Taxes affectées",
    "Pensions versées": "Pensions versées",
    "É · Défense, sécurité, justice": "Défense & sécurité",
    "É · Solidarités, travail & santé": "Solidarités & santé",
    "É · Écologie, territoires & agriculture": "Écologie & territoires",
    "É · Économie & investissements d'avenir": "Économie & invest.",
    "É · Administration & autres missions": "Administration",
    "É · Enseignement & recherche": "Éducation & recherche",
    "Collectivités territoriales": "Collectivités",
    "É · Culture, médias, sport": "Culture & sport",
    "É · Charge de la dette": "Charge de la dette",
    "Régimes de base & complémentaires": "Régimes de retraite",
  };
  const shortLabel = (name) =>
    SHORT[name] ||
    name.replace(/^É · /, "").replace(/^\d+ · /, "").replace(/ \(.*\)$/, "");

  // Coupe un libellé en lignes ≤ max caractères (wrap MANUEL : le wrap natif
  // d'ECharts tronque au lieu de replier — vécu). La pastille épouse le texte.
  function wrapText(s, max) {
    const words = String(s).split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      if (cur && (cur + " " + w).length > max) { lines.push(cur); cur = w; }
      else cur = cur ? cur + " " + w : w;
    }
    if (cur) lines.push(cur);
    return lines.join("\n");
  }

  // Motif hachuré (canvas) pour les parts CAS ESTIMÉES (opérateurs) —
  // les parts sourcées restent en gris uni.
  const HATCH = (function () {
    const c = document.createElement("canvas");
    c.width = c.height = 7;
    const g = c.getContext("2d");
    g.fillStyle = "#C9CDD6";
    g.fillRect(0, 0, 7, 7);
    g.strokeStyle = "#6E7686";
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(-2, 9); g.lineTo(9, -2); g.stroke();
    return { image: c, repeat: "repeat" };
  })();

  /* ---------------- ordre déterministe de la vue d'ensemble ----------------
   * layoutIterations: 0 + ordre explicite. La VOIE RETRAITES longe le bord
   * GAUCHE (cotisations → pensions en bande droite : ECharts cale au bord le
   * nœud unique de la dernière colonne) ; puis Sécu, dette au centre, État à
   * droite. Les contributions CAS des ministères « redescendent » en biais
   * vers les pensions, en bas à gauche.
   */
  const MACRO_COL0 = [
    "Cotisations retraites (tous régimes)", "Unédic (assurance chômage)",
    "CSG · CRDS", "Impôts et taxes affectés (Sécu)", "Taxes affectées & transferts",
    "Cotisations sociales", "Autres recettes Sécu", "Émission de dette (Déficit)",
    "TVA", "Impôt sur le revenu", "Impôt sur les sociétés", "Autres impôts d'État",
    "Recettes non fiscales", "Autres impôts & recettes",
  ];
  function macroSorted(nodes) {
    const rank = (n, i) => {
      if (n.col === 0) { const k = MACRO_COL0.indexOf(n.name); return k < 0 ? 49 : k; }
      if (n.col === 1) {
        if (n.name.indexOf("Système de retraites") === 0) return 0;
        return n.name.indexOf("État") === 0 ? 2 : 1;
      }
      if (n.col === 2) {
        if (n.name.indexOf("Régimes de base") === 0) return 5;     // épine de la voie
        if (n.name.indexOf("É · ") === 0) return 50 + i;           // familles (déjà par valeur)
        if (n.name === "Collectivités territoriales") return 40;
        if (n.name === "Union européenne") return 41;
        return 10 + i;                                             // branches Sécu
      }
      return 0;                                                    // col 3 : pensions
    };
    return nodes.map((n, i) => [n, rank(n, i)])
      .sort((a, b) => (a[0].col - b[0].col) || (a[1] - b[1]))
      .map((p) => p[0]);
  }

  /* ---------------- option ECharts ---------------- */

  // Construit l'option ECharts d'une vue Sankey (toujours VERTICALE : poster
  // haut→bas, cohérent entre la vue d'ensemble et les plongées).
  // La colonne d'un nœud = n.col (macro/pensions) ou n.depth (drills).
  // opts :
  //   lastCol    : index de la dernière colonne (place le label des nœuds finaux)
  //   noDrill    : n'affiche pas l'invite « cliquer pour zoomer » (vues terminales)
  //   labelMin   : valeur mini (Md€) pour afficher un label (sinon seuil = % du total)
  //   labelWidth : largeur du label (px) — fait passer les libellés longs
  //   nodeGap    : écart entre nœuds d'une même colonne
  //   left/right : marges (px) — élargies dans la vue pensions pour les libellés
  //   iterations : layoutIterations ECharts (0 = ordre des données respecté)
  //   n.noLabel  : masque le label d'un nœud précis (info au survol)
  function buildOption(nodes, links, opts) {
    const totalAll = links.reduce((s, l) => s + l.value, 0);
    const labelThreshold = opts.labelMin != null ? opts.labelMin : totalAll * 0.012;
    const labelWidth = opts.labelWidth || 86;
    const nodeMeta = {};
    nodes.forEach((n) => (nodeMeta[n.name] = n));
    const colOf = (n) => (n.col != null ? n.col : n.depth);

    // Quinconce : dans une même rangée, une pastille sur deux est décalée pour
    // éviter les chevauchements (l'intitulé complet reste au survol).
    const labIdx = {};
    const data = nodes.map((n) => {
      const v = nodeValue(links, n.name);
      const isDette = DETTE_NAMES.includes(n.name) || n.color === "#FFFFFF";
      const short = shortLabel(n.name);
      const drillable = !!(DATA.drill && DATA.drill[n.name]) && !opts.noDrill;
      const col = colOf(n);
      const involved = !opts.these || opts.theseNodes.has(n.name);
      const show = !n.noLabel && v >= labelThreshold && involved;
      const isRoot = !!opts.rootWide && col === 0;   // racine d'une plongée : pastille large
      let offset = [0, 0];
      if (show && !isRoot) {
        const k = labIdx[col] || 0;
        labIdx[col] = k + 1;
        const st = opts.stagger || 28;   // écart du quinconce (plus grand sur mobile)
        if (col === 0) {
          // recettes : quinconce à 3 niveaux vers le haut (la rangée est dense à droite)
          offset = opts.col0Levels === 3 ? [[0, 0], [0, -(st + 8)], [0, -2 * (st + 8)]][k % 3]
                                         : (k % 2 ? [0, -(st + 8)] : [0, 0]);
        } else if (col === opts.lastCol) {
          if (k % 2) offset = [0, st + 8];
        } else {
          // rangées médianes chargées : quinconce à 3 niveaux
          offset = [[0, 0], [0, st], [0, -st]][k % 3];
        }
        // voie retraites collée au bord gauche : sur écran étroit, on rentre
        // les pastilles vers l'intérieur pour qu'elles ne soient pas rognées.
        if (opts.laneNudge && LANE_NODES[n.name]) {
          offset = [offset[0] + opts.laneNudge * LANE_NODES[n.name], offset[1]];
        }
      }
      return {
        name: n.name,
        depth: col,
        itemStyle: {
          color: isDette ? "#FDFCF8" : n.color,
          borderColor: isDette ? "#1E2430" : n.color,
          borderWidth: isDette ? 1.6 : 0,
          opacity: involved ? 1 : 0.28,
        },
        label: {
          show: show,
          offset: offset,
          formatter: "{t|" + wrapText(short, isRoot ? 34 : opts.wrapChars || 14) +
                     "}\n{v|" + fmt0(v) + " Md€}" +
                     // la glose du nœud de dette (F7) : le contour vide = l'argent qu'on n'a pas
                     (isDette && col === 0 && !opts.noGlose ? "\n{g|l'argent qu'on n'a pas}" : ""),
          rich: {
            t: { color: isDette ? "#1E2430" : "#FFFFFF", fontSize: isRoot ? 13.5 : (opts.fontSize || 12.5),
                 fontWeight: 700, lineHeight: isRoot ? 16 : 15, align: "center" },
            v: { color: isDette ? "#1E2430" : "rgba(255,255,255,.92)", fontSize: isRoot ? 11.5 : (opts.fontSizeV || 11),
                 fontWeight: 700, align: "center" },
            g: { color: "#8E1B38", fontSize: 10, fontStyle: "italic", align: "center", lineHeight: 14 },
          },
          backgroundColor: isDette ? "#FFFFFF" : n.color,
          borderColor: isDette ? "#1E2430" : "rgba(0,0,0,.14)",
          borderWidth: isDette ? 1.4 : 1,
          borderRadius: 9,
          padding: [4, 7],
          position: col === 0 ? "top" : col === opts.lastCol ? "bottom" : "inside",
        },
        _tooltip: n.tooltip || "",
        _drillable: drillable,
      };
    });

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item", confine: true,
        backgroundColor: "#FFFFFF", borderColor: "#E4DCCB",
        textStyle: { color: "#1E2430" },
        formatter: (p) => {
          if (p.dataType === "edge") {
            return tooltipHtml(p.data.source + " → " + p.data.target, p.data.value, p.data.tooltip || "");
          }
          const meta = nodeMeta[p.name] || {};
          let note = meta.tooltip || "";
          if (p.data._drillable) note += (note ? " " : "") + "➜ Cliquer pour plonger dans ce nœud.";
          return tooltipHtml(p.name, nodeValue(links, p.name), note);
        },
      },
      series: [{
        type: "sankey",
        data: data,
        links: links.map((l) => ({
          source: l.source, target: l.target, value: l.value, tooltip: l.tooltip,
          // part CAS Pensions : GRIS UNI = contribution directe sourcée ;
          // HACHURES = part opérateurs estimée (cf. légende sous le fil d'ariane).
          // État « thèse » : les flux non contributifs en cramoisi, le reste estompé.
          lineStyle: opts.these
            ? (isTheseLink(l)
                ? { color: l.est ? HATCH : "#8E1B38", opacity: l.est ? 0.9 : 0.82, curveness: 0.5 }
                : { color: "#9CA3B0", opacity: 0.09, curveness: 0.5 })
            : l.est
              ? { color: HATCH, opacity: 0.85, curveness: 0.5 }
              : l.cas
                ? { color: "#9CA3B0", opacity: 0.62, curveness: 0.5 }
                : { color: "gradient", opacity: 0.34, curveness: 0.5 },
        })),
        orient: "vertical",
        nodeAlign: "justify",
        nodeGap: opts.nodeGap != null ? opts.nodeGap : 22,
        nodeWidth: 20,
        layoutIterations: opts.iterations != null ? opts.iterations : 0,
        left: opts.left != null ? opts.left : 10,
        top: opts.top != null ? opts.top : 46,
        right: opts.right != null ? opts.right : 10,
        bottom: opts.bottom != null ? opts.bottom : 52,
        emphasis: { focus: "adjacency" },
        blur: { itemStyle: { opacity: 0.25 }, lineStyle: { opacity: 0.08 } },
        label: { fontFamily: "Helvetica Neue, Arial, sans-serif" },
      }],
    };
  }

  const lastCol = (nodes) => Math.max(...nodes.map((n) => (n.col != null ? n.col : n.depth)));

  /* ---------------- vues ---------------- */

  /* Vue d'ensemble MOBILE : le poster complet est illisible à 390 px — on
   * regroupe les petits nœuds en agrégats (recettes diverses, petites familles
   * de missions, petites branches) pour ne garder que l'histoire principale.
   * Les agrégats ne sont pas plongeables ; leur composition est au tap. */
  const MOBILE_GROUPS = {
    "Impôt sur les sociétés": "Autres impôts & recettes",
    "Autres impôts d'État": "Autres impôts & recettes",
    "Recettes non fiscales": "Autres impôts & recettes",
    "Impôts et taxes affectés (Sécu)": "Taxes affectées & transferts",
    "Autres recettes Sécu": "Taxes affectées & transferts",
    "Unédic (assurance chômage)": "Taxes affectées & transferts",
    "É · Écologie, territoires & agriculture": "É · Autres missions",
    "É · Économie & investissements d'avenir": "É · Autres missions",
    "É · Administration & autres missions": "É · Autres missions",
    "É · Culture, médias, sport": "É · Autres missions",
    "Famille": "Autres branches Sécu",
    "Autonomie": "Autres branches Sécu",
    "Accidents du travail": "Autres branches Sécu",
  };
  const MOBILE_GROUP_NODES = [
    { name: "Autres impôts & recettes", col: 0, color: "#7B68B5",
      tooltip: "Regroupé sur mobile : impôt sur les sociétés, autres impôts d'État (TICPE, successions…), recettes non fiscales." },
    { name: "Taxes affectées & transferts", col: 0, color: "#7E6BB8",
      tooltip: "Regroupé sur mobile : impôts et taxes affectés à la Sécu, autres recettes des régimes, transfert Unédic. Une part descend vers les retraites (taxes affectées à la vieillesse)." },
    { name: "É · Autres missions", col: 2, color: "#E5A07A",
      tooltip: "Regroupé sur mobile : Écologie & territoires, Économie & investissements, Administration, Culture & sport. Détail sur grand écran." },
    { name: "Autres branches Sécu", col: 2, color: "#F2A9C4",
      tooltip: "Regroupé sur mobile : Famille, Autonomie, Accidents du travail. Détail sur grand écran." },
  ];
  /* Vue d'ensemble DESKTOP (U8) : les trois plus petites familles de l'État
   * (Administration, Culture, Économie — 53 Md€ à elles trois) et l'Unédic sont
   * regroupées ; le groupe reste PLONGEABLE (vue synthétique = leurs missions). */
  const DESKTOP_GROUPS = {
    "É · Administration & autres missions": "É · Autres missions",
    "É · Culture, médias, sport": "É · Autres missions",
    "É · Économie & investissements d'avenir": "É · Autres missions",
    "Unédic (assurance chômage)": "Autres recettes Sécu",
  };
  const DESKTOP_GROUP_NODES = [
    { name: "É · Autres missions", col: 2, color: "#E5A07A",
      tooltip: "Administration générale, Culture & médias, Économie & investissements d'avenir — " +
               "regroupées pour la lisibilité ; cliquer pour voir leurs missions." },
  ];
  // plongée synthétique d'un groupe = les missions de ses familles, en une vue
  function ensureGroupDrill(gname, groups, color) {
    if (!DATA.drill || DATA.drill[gname]) return;
    const members = Object.keys(groups).filter((k) => groups[k] === gname && DATA.drill[k]);
    if (!members.length) return;
    const nodes = [{ name: gname, depth: 0, color: color }], links = [];
    members.forEach((fam) => {
      const v = DATA.drill[fam];
      v.nodes.filter((n) => n.depth > 0).forEach((n) => {
        if (!nodes.some((x) => x.name === n.name)) nodes.push(n);
      });
      v.links.forEach((l) => links.push(Object.assign({}, l, { source: l.source === fam ? gname : l.source })));
    });
    DATA.drill[gname] = { title: shortLabel(gname), nodes: nodes, links: links,
      note: "Regroupement : " + members.map(shortLabel).join(", ") + "." };
  }
  function aggregate(nodes, links, GROUPS, GROUP_NODES) {
    const gnames = new Set(GROUP_NODES.map((n) => n.name));
    GROUP_NODES.forEach((g) => ensureGroupDrill(g.name, GROUPS, g.color));
    const outNodes = nodes.filter((n) => !GROUPS[n.name])
      .concat(GROUP_NODES.filter((g) => !nodes.some((n) => n.name === g.name)));
    const merged = {};
    for (const l of links) {
      const s = GROUPS[l.source] || l.source;
      const t = GROUPS[l.target] || l.target;
      if (s === t) continue;
      const k = s + "→" + t + (l.cas ? "|c" : "") + (l.est ? "|e" : "");
      if (!merged[k]) {
        merged[k] = { source: s, target: t, value: 0 };
        if (l.cas) merged[k].cas = true;
        if (l.est) merged[k].est = true;
        if (l.tooltip && !gnames.has(s) && !gnames.has(t)) merged[k].tooltip = l.tooltip;
      }
      merged[k].value = Math.round((merged[k].value + l.value) * 100) / 100;
    }
    return { nodes: outNodes, links: Object.values(merged) };
  }
  const mobileAggregate = (nodes, links) => aggregate(nodes, links, MOBILE_GROUPS, MOBILE_GROUP_NODES);

  function renderMacro() {
    viewStack = [];
    // Mobile : poster plus HAUT + vue AGRÉGÉE ; desktop : 0,52 × largeur (U9),
    // petites familles regroupées (U8), étiquettes 12,5 px.
    const narrow = window.innerWidth < 700;
    const H = EMBED
      ? Math.max(380, window.innerHeight - 20)
      : narrow
        ? Math.max(900, Math.round(window.innerHeight * 1.15))
        : Math.max(560, Math.min(760, Math.round(window.innerWidth * 0.52)));
    chartEl.style.height = H + "px";
    chart.resize();
    let nodes = macroSorted(DATA.nodes), links = DATA.links;
    const agg = narrow ? mobileAggregate(nodes, links) : aggregate(nodes, links, DESKTOP_GROUPS, DESKTOP_GROUP_NODES);
    nodes = macroSorted(agg.nodes);
    links = agg.links;
    const theseNodes = new Set();
    links.forEach((l) => { if (isTheseLink(l)) { theseNodes.add(l.source); theseNodes.add(l.target); } });
    theseNodes.add(REG_N);
    const top = EMBED && narrow ? 124 : narrow ? 168 : 138, bottom = EMBED ? 44 : narrow ? 60 : 56;
    chart.setOption(buildOption(nodes, links,
      { lastCol: lastCol(nodes), iterations: 0, top: top, bottom: bottom,
        wrapChars: narrow ? 11 : 15, labelMin: narrow ? 58 : 20,
        left: narrow ? 8 : 16, right: narrow ? 8 : 44,
        stagger: narrow ? 44 : 30, laneNudge: narrow ? 52 : 0, col0Levels: 3,
        fontSize: narrow ? 11 : 12.5, fontSizeV: narrow ? 10 : 11, noGlose: narrow,
        these: THESE, theseNodes: theseNodes }), true);
    retPanel.classList.remove("open");
    casLegendEl.hidden = true;
    histoEl.hidden = true;
    renderBreadcrumb();
    renderStageRail(H, top, bottom);
    renderTheseBanner(links);
  }

  /* ---------- repères d'étage (U6) : à gauche du canvas, un libellé par rangée ---------- */
  function renderStageRail(H, top, bottom) {
    const rail = document.getElementById("stage-rail");
    if (!rail) return;
    const rows = [["D'où vient l'argent", 0], ["Qui le reçoit", 1], ["Ce qu'il finance", 2], ["Les retraites versées", 3]];
    const inner = H - top - bottom;
    rail.innerHTML = rows.map((r) => '<span class="stage-lbl" style="top:' +
      Math.round(top + inner * r[1] / 3 + 10) + 'px">' + r[0] + "</span>").join("");
    rail.hidden = false;
  }
  function hideStageRail() { const rail = document.getElementById("stage-rail"); if (rail) rail.hidden = true; }

  /* ---------- bandeau « thèse » (U5) ---------- */
  function renderTheseBanner(links) {
    const b = document.getElementById("these-banner");
    if (!b) return;
    if (!THESE) { b.hidden = true; return; }
    const tot = links.filter(isTheseLink).reduce((s, l) => s + l.value, 0);
    const minist = links.filter((l) => isTheseLink(l) && l.target === PENS && !l.cotisation && !l.est).reduce((s, l) => s + l.value, 0);
    const oper = links.filter((l) => isTheseLink(l) && l.target === PENS && (l.cotisation || l.est)).reduce((s, l) => s + l.value, 0);
    const secu = links.filter((l) => isTheseLink(l) && l.source === SECU_N).reduce((s, l) => s + l.value, 0);
    b.querySelector(".these-text").innerHTML =
      "<b>" + fmt0(Math.round(tot)) + " milliards</b> sortent des budgets des ministères et de la Sécurité " +
      "sociale pour payer des retraites — comptés comme des dépenses d'éducation, de défense, de santé. " +
      "Ministères " + fmt0(Math.round(minist)) + " · leurs opérateurs " + fmt0(Math.round(oper)) +
      " (hachures) · autres branches de la Sécu " + fmt0(Math.round(secu)) + ".";
    b.hidden = false;
  }
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "these-all") { THESE = false; renderMacro(); }
  });

  function renderDrill() {
    const key = viewStack[viewStack.length - 1].key;
    const d = DATA.drill[key];
    THESE = false;                       // une plongée = le lecteur explore ; poster complet au retour
    hideStageRail();
    const tb = document.getElementById("these-banner"); if (tb) tb.hidden = true;
    if (d.kind === "retraites") {
      // Plongée retraites : décomposition verticale façon poster (COR, comptes 2025),
      // financeurs (ministères CAS Pensions + sources) → régimes → pensions versées.
      chartEl.style.height = Math.max(940, Math.min(1180, window.innerWidth * 0.78)) + "px";
      chart.resize();
      chart.setOption(buildOption(d.nodes, d.links,
        { lastCol: lastCol(d.nodes), noDrill: true, iterations: 0,
          labelMin: 1.5, labelWidth: 96, nodeGap: 26, left: 20, right: 20 }), true);
      retPanel.classList.add("open");
    } else {
      // Plongée standard (famille → missions → programmes…) : VERTICALE elle
      // aussi — le nœud parent devient la bande-source colorée en haut.
      const depthMax = lastCol(d.nodes);
      chartEl.style.height =
        Math.max(540, Math.min(860, 340 + depthMax * 150 + d.nodes.length * 4)) + "px";
      chart.resize();
      chart.setOption(buildOption(d.nodes, d.links,
        { lastCol: depthMax, iterations: 0, nodeGap: 14, labelWidth: 92, bottom: 96,
          rootWide: true }), true);
      retPanel.classList.remove("open");
    }
    // légende du grisé CAS Pensions : seulement si la vue contient un flux
    // scindé ; la puce « hachures » seulement si une part opérateurs existe
    casLegendEl.hidden = !(d.links || []).some((l) => l.cas);
    document.getElementById("legend-est").hidden = !(d.links || []).some((l) => l.est);
    // carte historique : plongée dans une famille de dépenses de l'État
    renderHistoCard(key);
    renderBreadcrumb();
    // en scène (embed) : tout doit tenir dans le cadre — la carte historique, le fil
    // d'Ariane et le graphique se partagent la hauteur de la fenêtre, sans défilement
    if (EMBED) {
      const used = (histoEl.hidden ? 0 : histoEl.offsetHeight + 10) +
                   (document.getElementById("breadcrumb").offsetHeight || 0) +
                   (casLegendEl.hidden ? 0 : casLegendEl.offsetHeight + 8) + 30;
      chartEl.style.height = Math.max(300, window.innerHeight - used) + "px";
      chart.resize();
      window.scrollTo(0, 0);
    }
  }

  function currentRender() {
    if (viewStack.length) renderDrill();
    else renderMacro();
  }

  /* ---------------- transition « plongée » ----------------
   * dir "in"  : l'ancienne vue (capturée en image) grossit autour du nœud
   *             cliqué et se dissout, pendant que la nouvelle vue NAÎT du
   *             rectangle exact de ce nœud et s'étend — on s'enfonce.
   * dir "out" : la vue détaillée se résorbe dans le rectangle d'origine du
   *             nœud tandis que la vue parente réapparaît en dessous.
   * rect : {x,y,w,h} en px, coordonnées du conteneur ; null → centre.
   */
  function diveTransition(renderFn, dir, rect) {
    if (REDUCED_MOTION) { renderFn(); return; }
    const W = chartEl.clientWidth, H = chartEl.clientHeight;
    const r = rect || { x: W / 2 - 60, y: H * 0.4 - 20, w: 120, h: 40 };
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const K = Math.min(5, Math.max(1.7, W / Math.max(60, r.w)));   // grossissement caméra
    const s0 = Math.min(0.8, Math.max(0.14, r.w / W));             // naissance dans le nœud

    // 1) capture de la vue actuelle → calque fantôme au-dessus de la scène
    let ghost = null;
    try {
      const url = chart.getDataURL({ pixelRatio: 1, backgroundColor: "#FFFFFF" });
      ghost = document.createElement("div");
      ghost.className = "dive-ghost";
      ghost.style.height = H + "px";
      ghost.style.backgroundImage = "url(" + url + ")";
      ghost.style.transformOrigin = cx + "px " + cy + "px";
      stageEl.appendChild(ghost);
    } catch (e) { /* capture impossible → transition simple */ }

    // 2) nouvelle vue rendue sous le fantôme, posée à son état de départ
    renderFn();
    chartEl.style.transition = "none";
    chartEl.style.transformOrigin = cx + "px " + cy + "px";
    chartEl.style.transform = dir === "in" ? "scale(" + s0 + ")" : "scale(" + (1 / K) * 1.6 + ")";
    chartEl.style.opacity = dir === "in" ? "0.3" : "0.35";
    void chartEl.offsetWidth;                       // reflow : fige l'état de départ

    // 3) animation (FLIP synchrone — pas de rAF : throttlé en arrière-plan)
    const ease = "cubic-bezier(.22,.61,.21,1)";
    chartEl.style.transition = "transform .5s " + ease + ", opacity .42s ease";
    chartEl.style.transform = "scale(1)";
    chartEl.style.opacity = "1";
    if (ghost) {
      ghost.style.transition = "transform .5s " + ease + ", opacity .38s ease";
      ghost.style.transform = dir === "in" ? "scale(" + K + ")" : "scale(" + s0 + ")";
      ghost.style.opacity = "0";
    }
    clearTimeout(diveTransition._t);
    diveTransition._t = setTimeout(() => {
      chartEl.style.transition = chartEl.style.transform =
        chartEl.style.transformOrigin = chartEl.style.opacity = "";
      stageEl.querySelectorAll(".dive-ghost").forEach((g) => g.remove());
    }, 540);
  }

  // Rectangle (px, coordonnées conteneur) de l'élément graphique cliqué —
  // le nœud rectangle OU le ruban d'un flux ; repli sur le point de clic.
  function clickedRect(p) {
    try {
      const el = p.event && p.event.target;
      if (el && el.getBoundingRect) {
        const b = el.getBoundingRect().clone();
        if (el.transform) b.applyTransform(el.transform);
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      }
    } catch (e) { /* structure interne inattendue → repli */ }
    if (p.event && p.event.offsetX != null) {
      return { x: p.event.offsetX - 50, y: p.event.offsetY - 16, w: 100, h: 32 };
    }
    return null;
  }

  /* ---------------- breadcrumb (pile de vues) ---------------- */

  function renderBreadcrumb() {
    crumbEl.innerHTML = "";
    const mk = (label, current, onclick) => {
      const b = document.createElement("button");
      b.className = "crumb";
      b.textContent = label;
      if (current) b.setAttribute("aria-current", "page");
      else b.addEventListener("click", onclick);
      return b;
    };
    crumbEl.appendChild(mk("Vue d'ensemble", !viewStack.length, () => {
      const rect = viewStack.length ? viewStack[0].rect : null;
      viewStack = [];
      diveTransition(renderMacro, "out", rect);
    }));
    viewStack.forEach((v, i) => {
      const sep = document.createElement("span"); sep.className = "sep"; sep.textContent = "›";
      crumbEl.appendChild(sep);
      crumbEl.appendChild(mk(v.label, i === viewStack.length - 1, () => {
        const rect = viewStack[i + 1] ? viewStack[i + 1].rect : null;
        viewStack = viewStack.slice(0, i + 1);
        diveTransition(renderDrill, "out", rect);
      }));
    });
  }

  /* ---------------- carte « évolution du budget » ----------------
   * Affichée en tête de la plongée dans une famille de dépenses de l'État :
   * barres 2020→2025 (crédits votés), segment GRIS = part retraites estimée
   * (CAS Pensions), et l'addition qui résume la période. Données :
   * DATA.historique (build_historique.py + scraper.py).
   */
  function renderHistoCard(key) {
    const H = DATA.historique;
    const serie = H && ((H.familles && H.familles[key]) || (H.missions && H.missions[key]));
    if (!serie || !serie.cp || Object.keys(serie.cp).length < 2) {
      histoEl.hidden = true;
      return;
    }
    const years = H.annees.map(String).filter((y) => serie.cp[y] != null);
    const y0 = years[0], y1 = years[years.length - 1];
    const cas = serie.cas || {};
    const hasCas = cas[y0] != null && cas[y1] != null;

    // — mini graphique en barres (SVG inline, thème poster) —
    const bw = 34, gap = 14, hMax = 74, pad = 4;
    const vMax = Math.max.apply(null, years.map((y) => serie.cp[y]));
    const W = years.length * (bw + gap) - gap + pad * 2;
    const HT = hMax + 34;
    let svg = '<svg width="' + W + '" height="' + HT + '" viewBox="0 0 ' + W + " " + HT +
              '" role="img" aria-label="Évolution du budget par année">';
    years.forEach((y, i) => {
      const x = pad + i * (bw + gap);
      const h = Math.max(3, (serie.cp[y] / vMax) * hMax);
      const yTop = 14 + (hMax - h);
      svg += '<rect class="bar-total" x="' + x + '" y="' + yTop + '" width="' + bw +
             '" height="' + h + '" rx="2"></rect>';
      if (cas[y] != null) {
        const hc = Math.max(2, (cas[y] / vMax) * hMax);
        svg += '<rect class="bar-cas" x="' + x + '" y="' + (14 + hMax - hc) + '" width="' + bw +
               '" height="' + hc + '" rx="2"></rect>';
      }
      svg += '<text x="' + (x + bw / 2) + '" y="' + (yTop - 3) + '" text-anchor="middle">' +
             fmt0(serie.cp[y]) + "</text>";
      svg += '<text class="axis-year" x="' + (x + bw / 2) + '" y="' + (14 + hMax + 12) +
             '" text-anchor="middle">' + y + "</text>";
    });
    svg += "</svg>";

    // — « Où va chaque hausse annuelle ? » : barres divergentes ΔCAS (gris)
    //   vs Δ moyens hors retraites (beige au-dessus, ROUGE sous l'axe quand la
    //   hausse du CAS dépasse celle du budget → de facto moins de moyens) —
    let svg2 = "";
    if (hasCas && years.length >= 3) {
      const pairs = [];
      for (let i = 1; i < years.length; i++) {
        const ya = years[i - 1], yb = years[i];
        if (cas[ya] == null || cas[yb] == null) continue;
        const dTot = serie.cp[yb] - serie.cp[ya];
        const dCasY = cas[yb] - cas[ya];
        pairs.push({ y: yb, dCas: dCasY, dReste: dTot - dCasY });
      }
      if (pairs.length >= 2) {
        const bw2 = 30, gap2 = 12, pad2 = 4;
        const mAbs = Math.max.apply(null, pairs.map((p) =>
          Math.max(Math.max(p.dCas, 0) + Math.max(p.dReste, 0),
                   Math.abs(Math.min(p.dReste, 0)), Math.abs(p.dCas))));
        const sc = 52 / Math.max(mAbs, 0.1);          // px par Md€
        const axisY = 72;                              // ligne du zéro
        const W2 = pairs.length * (bw2 + gap2) - gap2 + pad2 * 2;
        svg2 = '<svg width="' + W2 + '" height="116" viewBox="0 0 ' + W2 + ' 116" role="img"' +
               ' aria-label="Décomposition de la hausse annuelle : retraites contre moyens">' +
               '<text x="' + (W2 / 2) + '" y="10" text-anchor="middle" class="axis-year">' +
               "hausse annuelle : CAS (gris) vs moyens</text>";
        pairs.forEach((p, i) => {
          const x = pad2 + i * (bw2 + gap2);
          const hCas = Math.abs(p.dCas) * sc;
          svg2 += '<rect class="bar-cas" x="' + x + '" y="' +
                  (p.dCas >= 0 ? axisY - hCas : axisY) + '" width="' + bw2 +
                  '" height="' + Math.max(hCas, 1) + '" rx="2"></rect>';
          const hR = Math.abs(p.dReste) * sc;
          if (p.dReste >= 0) {  // moyens en hausse : beige, empilé au-dessus du gris
            svg2 += '<rect class="bar-total" x="' + x + '" y="' +
                    (axisY - Math.max(p.dCas, 0) * sc - hR) + '" width="' + bw2 +
                    '" height="' + Math.max(hR, 1) + '" rx="2"></rect>';
          } else {              // moyens en RECUL : rouge, sous l'axe
            svg2 += '<rect class="bar-neg" x="' + x + '" y="' + axisY + '" width="' + bw2 +
                    '" height="' + Math.max(hR, 2) + '" rx="2"></rect>';
          }
          svg2 += '<text class="axis-year" x="' + (x + bw2 / 2) + '" y="110" ' +
                  'text-anchor="middle">' + p.y + "</text>";
        });
        svg2 += '<line x1="0" y1="' + axisY + '" x2="' + W2 + '" y2="' + axisY +
                '" stroke="#1E2430" stroke-width="1"></line></svg>';
      }
    }

    // — l'addition qui résume la période (formulations selon le signe) —
    const dCp = serie.cp[y1] - serie.cp[y0];
    const pct = Math.round((dCp / serie.cp[y0]) * 100);
    let punch = "De " + y0 + " à " + y1 + " : budget <b>" + (dCp >= 0 ? "+" : "−") +
                fmt0(Math.abs(dCp)) + " Md€</b> (" + (pct >= 0 ? "+" : "−") +
                Math.abs(pct) + " %)";
    if (hasCas) {
      const dCas = cas[y1] - cas[y0];
      const part = dCp > 0 && dCas > 0 ? Math.round((dCas / dCp) * 100) : null;
      // « part retraites » = ce qui finance les retraites, Y COMPRIS via les
      // opérateurs (universités, CNRS, CNES…) — sans eux le chiffre serait
      // trompeur pour les missions à opérateurs (cf. note_cas).
      const CAS = "contributions retraites (CAS Pensions, <b>opérateurs compris</b>" +
                  "&nbsp;: universités, CNRS, CNES…)";
      if (dCas >= 0.05) {
        punch += " — dont <b>≈ " + fmt0(dCas) + " Md€</b> absorbés par la hausse des " + CAS +
                 (part != null && part > 0 && part <= 100
                 ? ", soit <b>" + part + " %</b> de la hausse" : "") + ".";
      } else if (dCas <= -0.05) {
        punch += " — la part retraites (opérateurs compris) a, elle, baissé de <b>≈ " +
                 fmt0(Math.abs(dCas)) + " Md€</b>.";
      } else {
        punch += " — la part retraites (opérateurs compris) est restée stable.";
      }
      // ⚠ le moment-clé : la dernière hausse du CAS dépasse celle du budget
      const yPrev = years[years.length - 2];
      if (yPrev && cas[yPrev] != null) {
        const dL = serie.cp[y1] - serie.cp[yPrev], dCL = cas[y1] - cas[yPrev];
        if (dCL > 0.02 && dCL > dL) {
          const tx = tauxCas(y1);
          punch += ' <span class="histo-alert">⚠ En ' + y1 + ", la hausse des contributions " +
                   "retraites (+" + fmt0(dCL) + " Md€" + (tx ? ", taux relevé à " + fmt2(tx) + " %" : "") +
                   ") dépasse celle " +
                   "du budget (" + (dL >= 0 ? "+" : "−") + fmt0(Math.abs(dL)) +
                   ") : les moyens hors retraites reculent.</span>";
        }
      }
    } else {
      punch += ".";
    }
    let noteOp = "";
    if (serie.op25) {
      const t1 = tauxCas(2025), t0 = tauxCas(2024);
      const surcout = t1 && t0 ? serie.op25 * (t1 - t0) / t1 : 0;
      noteOp = " Dont opérateurs (universités, CNRS, CNES…) : ≈ " + fmt0(serie.op25) +
               " Md€ versés au CAS en 2025 (estimation, hachures)" +
               (surcout ? " — le relèvement du taux à " + fmt2(t1) + " % leur coûte ≈ " + fmt0(surcout) +
               " Md€ de plus, non compensés dans le budget de la mission (Sénat, PLF 2025)." : ".");
    }
    histoEl.innerHTML =
      '<div class="histo-text"><h3>Évolution du budget ' + y0 + " → " + y1 + "</h3>" +
      '<p class="histo-punch">' + punch + "</p>" +
      '<p class="histo-note">Crédits de paiement votés (LFI ; 2024 : PLF), budget général. ' +
      esc(H.note_cas || "") + esc(noteOp) + "</p></div>" +
      '<div class="histo-charts">' + svg + svg2 + "</div>";
    histoEl.hidden = false;
  }

  /* ---------------- bande de chiffres ---------------- */

  function renderStatband(meta) {
    const c = meta.checks || {};
    const hab = parHabitant(c.depenses_totales);
    statEl.innerHTML =
      "<b>" + fmt0(c.recettes_hors_dette) + " Md€</b> de recettes + <b>" + fmt0(c.dette) +
      " Md€</b> empruntés = <b>" + fmt0(c.depenses_totales) + " Md€</b> dépensés en " + meta.exercice +
      (hab ? '<span class="sep">·</span><b>' + fmt0(hab) + " €</b> par habitant" : "");
  }

  /* ---------------- panneau pensions (explication) ---------------- */

  function renderRetraitesPanel(meta) {
    const r = meta.retraites;
    if (!r || !retPanel) { if (retPanel) retPanel.style.display = "none"; return; }
    const f = r.decomposition || {};
    const ch = CH();
    const P = r.pensions_versees;
    const pct = (v) => Math.round(100 * v / P);
    // UN chiffre par ministère : sa contribution au CAS Pensions (= le grisé des
    // plongées = son flux vers les pensions ; convention COR : tout est
    // contribution d'équilibre).
    const rows = Object.entries(r.contributions_par_mission || {})
      .sort((a, b) => b[1] - a[1])
      .map(([m, v]) => "<tr><td>" + esc(m) + "</td><td>" + fmt0(v) + " Md€</td></tr>")
      .join("");
    const four = ch.subvention_equilibre_fpe_fourchette || {};
    const tp = f.taux_prive || {};
    const hab = parHabitant(r.ecart);
    const reste = (f.transferts_branches || 0) + (f.subventions_regimes_speciaux || 0) + (f.deficit || 0) + (f.divers || 0);
    retPanel.innerHTML =
      "<h3>Qui paie les " + fmt0(P) + " Md€ de retraites ?</h3>" +
      '<p class="ret-big"><b>' + fmt0(r.cotisations_directes) + " Md€</b> de cotisations pour <b>" +
      fmt0(P) + " Md€</b> de pensions : <b>" + fmt0(r.ecart) + " Md€</b> financés autrement" +
      (hab ? " — ≈ " + fmt0(hab) + " € par habitant et par an" : "") + ".</p>" +
      "<p>D'après le <b>COR</b> (" + esc(ch.cor_millesime || "rapport annuel") + ") : cotisations " +
      pct(r.cotisations_directes) + " % · contribution d'équilibre de l'État pour ses fonctionnaires " +
      pct(f.contribution_etat || 0) + " % (<b>" + fmt0(f.contribution_etat) + " Md€</b>, la « contribution employeur » " +
      "au CAS Pensions, inscrite dans les budgets des ministères) · impôts et taxes affectés " + pct(f.itaf || 0) +
      " % · régimes spéciaux, transferts et solde " + pct(reste) + " %." +
      (tp.surcotisation_etat_fpe ? " Au taux du privé, " + fmt0(tp.surcotisation_etat_fpe) + " des " + fmt0(f.contribution_etat) +
        " Md€ de l'État sont une subvention (de " + fmt0(four.cae) + " à " + fmt0(four.dg_budget_jaune_2026) +
        " selon la convention — détail dans la Méthodologie)." : "") + "</p>" +
      "<p>Ce que chaque ministère verse au CAS Pensions, déjà compris dans ses crédits (le gris des plongées) :</p>" +
      "<table>" + rows + "</table>" +
      '<p class="ret-src">Sources : COR (' + esc(ch.cor_millesime || "") + "), Cour des comptes (budget de l'État en 2025), " +
      "Sénat (avis PLF 2026, CAS Pensions), PLFSS 2026 — détail et calculs dans data/reference/retraites_2025.json.</p>";
  }

  /* ---------------- méthodologie ---------------- */

  function renderMetho(meta) {
    document.getElementById("exercice").textContent = meta.exercice;
    document.getElementById("generated-at").textContent =
      new Date(meta.generated_at).toLocaleDateString("fr-FR");
    const c = meta.checks || {};
    const src = meta.sources || {};
    // le caveat « parts retraites des flux (gris/hachures) » fait doublon avec la
    // section CAS Pensions ci-dessous → on l'écarte de la liste Périmètre.
    const caveats = (meta.caveats || [])
      .filter((x) => !/parts retraites des flux/i.test(x))
      .map((x) => "<li>" + esc(x) + "</li>").join("");
    document.getElementById("metho-body").innerHTML =
      "<h4>Périmètre &amp; choix de méthode</h4>" +
      "<ul>" + caveats + "</ul>" +
      "<h4>Le CAS Pensions — la « subvention d'équilibre » cachée dans le budget des ministères</h4>" +
      "<p>Le <strong>compte d'affectation spéciale « Pensions »</strong> (créé par la LOLF, en " +
      "vigueur depuis 2006) encaisse les cotisations des fonctionnaires de l'État et les " +
      "« contributions employeur » des ministères, et verse leurs pensions. Comme il doit être " +
      "équilibré en permanence, le taux de contribution employeur des civils (en % du " +
      "traitement indiciaire) est relevé à mesure que le déséquilibre se creuse&nbsp;: " +
      "<strong>49,9&nbsp;% (2006)</strong> · 55,71 (2008) · 62,14 (2010) · 68,59 (2012) · " +
      "74,28&nbsp;% (2013-2024) · <strong>78,28&nbsp;% (2025, décret n°&nbsp;2025-61)</strong> · " +
      "<strong>82,28&nbsp;% (2026, décret n°&nbsp;2025-1341)</strong> — militaires&nbsp;: " +
      "100&nbsp;% → <strong>126,07&nbsp;%</strong> (inchangé depuis 2013) — à comparer aux " +
      "16,58&nbsp;% de cotisation retraite employeur de droit commun dans le privé. Cette hausse est une " +
      "<strong>subvention d'équilibre du système de retraites prélevée sur le budget de chaque " +
      "ministère</strong>&nbsp;: ce n'est <strong>ni une augmentation du salaire des " +
      "fonctionnaires, ni une ouverture de droits supplémentaires</strong> — la retenue payée " +
      "par l'agent (11,10&nbsp;%) est, elle, alignée sur le privé depuis la réforme de 2010.</p>" +
      "<p><strong>Combien vaut cette subvention&nbsp;?</strong> Cela dépend de la convention. Le " +
      "<strong>Jaune « Pensions » annexé au PLF 2026</strong> a refait le calcul au taux du privé (16,58&nbsp;%)&nbsp;: " +
      "les contributions employeur tomberaient de 52,4 à 11&nbsp;Md€, soit <strong>41&nbsp;Md€</strong> de subvention " +
      "d'équilibre. Le <strong>Conseil d'analyse économique</strong> (Focus n°&nbsp;121, sept. 2025) conteste le mot " +
      "« caché » — « pas de déficit caché mais un coût salarial surévalué » — et, à assiette corrigée (le traitement " +
      "indiciaire exclut les primes), situe le « juste taux » entre 25,4 et 34,7&nbsp;% et la contribution d'équilibre à " +
      "<strong>21,5&nbsp;Md€</strong> (2023). L'<strong>Institut des politiques publiques</strong> chiffre le coût du " +
      "déséquilibre démographique à 18&nbsp;Md€ (44&nbsp;% de la contribution). Ce site retient <strong>" +
      fmt0((((meta.chiffres || {}).subvention_equilibre_fpe_fourchette) || {}).site) + "&nbsp;Md€</strong> " +
      "(part au-delà du taux employeur privé, civils et militaires) — dans la fourchette. Le COR, dont ce site adopte la " +
      "convention, compte l'intégralité de la contribution de l'État (49,3&nbsp;Md€ en 2025&nbsp;; 49,2 exécutés selon la Cour " +
      "des comptes) en « contribution d'équilibre »&nbsp;: c'est le chiffre des flux de la voie retraites et du Mondrian.</p>" +
      "<p><strong>Le CAS Pensions en 2025</strong> (Cour des comptes, avril 2026)&nbsp;: 69,3&nbsp;Md€ de dépenses, 67,3 de recettes, " +
      "solde −2,0&nbsp;Md€ — quatrième déficit consécutif —, solde cumulé ramené à 2,6&nbsp;Md€. Le régime des fonctionnaires " +
      "de l'État compte 1,1 cotisant par pensionné de droit direct (1,5 au régime général).</p>" +
      "<p><strong>Réforme des retraites suspendue</strong> (LFSS 2026, art.&nbsp;105)&nbsp;: l'âge légal est gelé à " +
      "62&nbsp;ans et 9&nbsp;mois et la durée requise à 170&nbsp;trimestres jusqu'au 1er&nbsp;janvier 2028, pour les " +
      "pensions prenant effet à partir du 1er&nbsp;septembre 2026 (générations 1964-1968). Le COR (juin 2026) projette " +
      "un besoin de financement du système de −5,1&nbsp;Md€ en 2025 et −5,0 en 2026, hors produits financiers.</p>" +
      "<h4>Comment lire les parts « retraites » des flux</h4>" +
      "<p><strong>Gris uni</strong> = contribution directe versée au CAS Pensions (catégorie 22 " +
      "des crédits votés, calibrée sur les recettes réelles du CAS — <strong>donnée sourcée</strong>). " +
      "<strong>Hachures</strong> = contribution des <strong>opérateurs</strong> financés par la " +
      "mission (universités, CNRS, musées… — leurs établissements versent ≈ " +
      fmt0((((meta.retraites || {}).operateurs_cas) || {})["2025"] || 6.3) + "&nbsp;Md€/an au CAS, " +
      "ligne réelle de recettes, répartie au prorata des subventions pour charges de service " +
      "public&nbsp;: une <strong>estimation</strong>).</p>" +
      "<p>Pour ne compter chaque euro qu'une fois, la <strong>voie retraites</strong> de la vue " +
      "d'ensemble re-flèche vers les pensions ce que les autres administrations leur versent déjà dans " +
      "leurs propres dépenses (convention du <strong>COR</strong>)&nbsp;: la contribution d'équilibre de l'État (" +
      fmt0((((meta.retraites || {}).decomposition) || {}).contribution_etat) + "&nbsp;Md€, dans les crédits des ministères), " +
      "les subventions aux régimes spéciaux (" + fmt0((((meta.retraites || {}).decomposition) || {}).subventions_regimes_speciaux) +
      "), les cotisations des opérateurs financées par leurs subventions (" +
      fmt0((((meta.retraites || {}).decomposition) || {}).cotisations_operateurs) + ", hachures) et les transferts de " +
      "branches de la Sécu&nbsp;: ces sommes ne sont pas ajoutées au total du bandeau. La CNRACL (collectivités et " +
      "hôpitaux, taux employeur 34,65&nbsp;%) est une cotisation au sens du COR et n'est pas re-fléchée.</p>" +
      "<h4>Contrôle d'équilibre</h4>" +
      "<p>Axiome fondateur&nbsp;: recettes hors dette <strong>" + fmt(c.recettes_hors_dette) +
      "&nbsp;Md€</strong> + émission de dette <strong>" + fmt(c.dette) +
      "&nbsp;Md€</strong> = dépenses totales <strong>" + fmt(c.depenses_totales) + "&nbsp;Md€</strong>.</p>" +
      '<p class="src"><strong>Sources</strong> — État&nbsp;: ' + esc(src.etat_depenses || "") +
      "&nbsp;· Recettes&nbsp;: " + esc(src.etat_recettes || "") +
      "&nbsp;· Sécu&nbsp;: " + esc(src.secu || "") +
      "&nbsp;· CAS Pensions&nbsp;: recettes par ligne, PLF 2025 (data.economie.gouv.fr) ; taux " +
      "de contribution&nbsp;: décrets 2012-1507/1508, 2025-61, 2025-1341&nbsp;· Retraites tous régimes&nbsp;: COR, " +
      "rapport annuel juin 2026 (comptes 2025, tableau 2.2)&nbsp;· Population&nbsp;: INSEE, bilan démographique 2025.</p>" +
      (meta.seed ? '<p class="src">⚠ ' + esc(meta.seed_note || "") + "</p>" : "");
  }

  /* ---------------- événements ---------------- */

  // Plongée dans un nœud OU un flux (toute la zone du flux est cliquable).
  function drillInto(name, p) {
    if (!DATA.drill || !DATA.drill[name]) return false;
    // jamais re-plonger dans la vue courante (ex. clic sur un flux dont la
    // source est le nœud racine de la vue affichée)
    if (viewStack.length && viewStack[viewStack.length - 1].key === name) return false;
    const rect = clickedRect(p);
    const label = DATA.drill[name].kind === "retraites" ? "Retraites" : shortLabel(name);
    viewStack.push({ key: name, label: label, rect: rect });
    diveTransition(renderDrill, "in", rect);
    return true;
  }
  chart.on("click", (p) => {
    if (p.dataType === "node") {
      drillInto(p.name, p);
    } else if (p.dataType === "edge" && p.data) {
      // un flux mène d'une source à une cible : on plonge dans la cible
      // éclatable, sinon dans la source — toute la bande est utile.
      if (!drillInto(p.data.target, p)) drillInto(p.data.source, p);
    }
  });
  function surface() {
    if (!viewStack.length) return;
    const popped = viewStack.pop();
    diveTransition(currentRender, "out", popped.rect);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") surface();
  });
  chart.getZr().on("click", (e) => {
    if (!e.target) surface();
  });
  let resizeT = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { chart.resize(); currentRender(); }, 120);
  });

  /* ---------------- boot ---------------- */

  function boot(json) {
    DATA = json;
    renderMetho(json.meta || {});
    renderStatband(json.meta || {});
    renderRetraitesPanel(json.meta || {});
    renderMacro();
    deepLink();
  }

  /* ---------------- liens profonds (depuis le fil, index.html) ----------------
   *   #retraites          → la plongée « Qui paie les 422 Md€ ? »
   *   #dive=<nom de vue>  → plongée directe (famille, mission ou programme :
   *                         le chemin famille → mission → programme est reconstitué,
   *                         un niveau par vue, carte historique comprise)
   *   #metho              → ouvre la Méthodologie et y descend
   *   #signaler           → ouvre « Signaler une erreur »
   */
  function deepLink() {
    let h = "";
    try { h = decodeURIComponent(location.hash || ""); } catch (e) { h = location.hash || ""; }
    if (!h) return;
    if (h === "#metho") {
      const det = document.querySelector("footer.metho details");
      if (det) { det.open = true; det.scrollIntoView({ behavior: "smooth", block: "start" }); }
      return;
    }
    if (h === "#signaler") { document.getElementById("report-btn").click(); return; }
    if (h === "#these") { THESE = true; renderMacro(); return; }
    if (h === "#poster") { THESE = false; renderMacro(); return; }
    let target = null;
    if (h === "#retraites") target = PENS;
    else if (h.indexOf("#dive=") === 0) target = h.slice(6);
    if (!target || !DATA.drill || !DATA.drill[target]) return;
    // chemin jusqu'à la racine : parent = la vue dont un flux vise la cible
    const isMacro = (n) => DATA.nodes.some((x) => x.name === n);
    const path = [target];
    let guard = 0;
    while (!isMacro(path[0]) && guard++ < 4) {
      const cur = path[0];
      const parent = Object.keys(DATA.drill).find((k) => k !== cur &&
        (DATA.drill[k].links || []).some((l) => l.target === cur));
      if (!parent) break;
      path.unshift(parent);
    }
    viewStack = path.map((k) => ({ key: k, rect: null,
      label: DATA.drill[k].kind === "retraites" ? "Retraites" : shortLabel(k) }));
    renderDrill();
    if (!EMBED) stageEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  // même page, hash qui change (liens du fil ouverts depuis une page déjà chargée)
  window.addEventListener("hashchange", () => {
    if (!DATA) return;
    if (!location.hash) { THESE = false; renderMacro(); return; }
    deepLink();
  });

  /* ---------------- « Signaler une erreur » ----------------
   * Envoi via FormSubmit (service e-mail pour sites statiques) vers l'adresse
   * de l'auteur ; en cas d'échec réseau, repli sur un mailto: prérempli.
   * La vue en cours est jointe pour situer le signalement.
   */
  const REPORT_TO = "papayes_29amphore@icloud.com";
  const reportDlg = document.getElementById("report-dlg");
  document.getElementById("report-btn").addEventListener("click", () => {
    document.getElementById("report-status").hidden = true;
    reportDlg.showModal();
  });
  document.getElementById("report-cancel").addEventListener("click", () => reportDlg.close());
  document.getElementById("report-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = document.getElementById("report-msg").value.trim();
    if (!msg) return;
    const email = document.getElementById("report-email").value.trim();
    const vue = viewStack.length ? viewStack.map((v) => v.label).join(" › ") : "Vue d'ensemble";
    const status = document.getElementById("report-status");
    status.hidden = false;
    status.textContent = "Envoi en cours…";
    fetch("https://formsubmit.co/ajax/" + REPORT_TO, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        _subject: "[Où va l'argent public] Signalement d'erreur",
        vue: vue, message: msg, email: email || "(non renseigné)",
        page: location.href,
      }),
    }).then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      status.textContent = "Merci ! Votre signalement a bien été envoyé.";
      document.getElementById("report-msg").value = "";
      setTimeout(() => reportDlg.close(), 1600);
    }).catch(() => {
      // repli : ouvre le client mail prérempli
      status.textContent = "Envoi direct impossible — ouverture de votre messagerie…";
      location.href = "mailto:" + REPORT_TO +
        "?subject=" + encodeURIComponent("[Où va l'argent public] Signalement d'erreur") +
        "&body=" + encodeURIComponent("Vue : " + vue + "\n\n" + msg);
    });
  });

  // hook de debug/tests (non documenté) : window.__ouva.dive("nom de nœud")
  window.__ouva = { chart: chart, dive: (name) => drillInto(name, {}), surface: surface };

  if (window.__DATA__) {
    boot(window.__DATA__);
  } else {
    fetch("data/unified_finances.json", { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(boot)
      .catch((err) => {
        chartEl.innerHTML =
          '<p style="padding:40px;text-align:center;color:#B4526B">' +
          "Impossible de charger <code>data/unified_finances.json</code> (" + esc(err.message) +
          "). Servez le dossier via <code>python -m http.server</code> puis rechargez.</p>";
      });
  }
})();
