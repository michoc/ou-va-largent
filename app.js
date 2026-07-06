/* ==========================================================================
 * Où va l'argent public ? — Sankey ECharts façon « poster »
 * --------------------------------------------------------------------------
 * - Vue d'ensemble VERTICALE (recettes → administrations → dépenses).
 * - Clic sur un nœud : ZOOM en place sur ses flux (détail missions →
 *   programmes → dispositifs), avec animation « on ne quitte jamais le
 *   diagramme » ; pile de vues + breadcrumb cliquable, Échap/clic-fond pour
 *   dézoomer.
 * - Étage « pensions » PERMANENT sous le diagramme principal : d'où viennent
 *   les 405 Md€ de pensions (tous régimes, nomenclature COR juin 2025), avec
 *   les flux de chaque ministère (CAS Pensions) et de chaque financeur.
 * ========================================================================== */

(function () {
  "use strict";

  const chartEl = document.getElementById("chart");
  const pensEl = document.getElementById("chart-pensions");
  const crumbEl = document.getElementById("breadcrumb");
  const statEl = document.getElementById("statband");
  const retPanel = document.getElementById("panel-retraites");
  const chart = echarts.init(chartEl, null, { renderer: "canvas" });
  const chartPensions = pensEl ? echarts.init(pensEl, null, { renderer: "canvas" }) : null;

  let DATA = null;
  let viewStack = [];          // [] = vue d'ensemble ; sinon [{key,label}, …]
  let zoomOrigin = null;       // point de clic (px) pour l'origine du zoom

  const DETTE_NAMES = ["Émission de dette (Déficit)", "Déficit résiduel (dette sociale)"];

  /* ---------------- utilitaires ---------------- */

  const fmt = (v) =>
    Number(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Mds €";
  const fmt0 = (v) => Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
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

  const shortLabel = (name) =>
    name.replace(/^É · /, "").replace(/^\d+ · /, "").replace(/ \(.*\)$/, "");

  /* ---------------- option ECharts ---------------- */

  function buildOption(nodes, links, opts) {
    const vertical = !!opts.vertical;
    const totalAll = links.reduce((s, l) => s + l.value, 0);
    const labelThreshold = opts.labelMin != null
      ? opts.labelMin
      : totalAll * (vertical ? 0.012 : 0.004);
    const labelWidth = opts.labelWidth || (vertical ? 86 : undefined);
    const nodeMeta = {};
    nodes.forEach((n) => (nodeMeta[n.name] = n));

    const data = nodes.map((n) => {
      const v = nodeValue(links, n.name);
      const isDette = DETTE_NAMES.includes(n.name) || n.color === "#FFFFFF";
      const short = shortLabel(n.name);
      const drillable = !!(DATA.drill && DATA.drill[n.name]) && !opts.noDrill;
      return {
        name: n.name,
        depth: n.col != null ? n.col : n.depth,
        itemStyle: {
          color: isDette ? "#FDFCF8" : n.color,
          borderColor: isDette ? "#1E2430" : n.color,
          borderWidth: isDette ? 1.6 : 0,
        },
        label: {
          show: !n.noLabel && v >= labelThreshold,
          formatter: vertical
            ? "{t|" + short + "}\n{v|" + fmt0(v) + " Md€}"
            : "{t|" + short + "}  {v|" + fmt0(v) + " Md€}",
          rich: {
            t: { color: isDette ? "#1E2430" : "#FFFFFF", fontSize: 11, fontWeight: 700,
                 lineHeight: 13, width: labelWidth, overflow: "break", align: "center" },
            v: { color: isDette ? "#1E2430" : "rgba(255,255,255,.92)", fontSize: 10,
                 fontWeight: 700, align: "center" },
          },
          backgroundColor: isDette ? "#FFFFFF" : n.color,
          borderColor: isDette ? "#1E2430" : "rgba(0,0,0,.14)",
          borderWidth: isDette ? 1.4 : 1,
          borderRadius: 9,
          padding: [4, 7],
          position: vertical
            ? ((n.col != null ? n.col : n.depth) === 0 ? "top"
               : (n.col != null ? n.col : n.depth) === opts.lastCol ? "bottom" : "inside")
            : "right",
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
          if (p.data._drillable) note += (note ? " " : "") + "➜ Cliquer pour zoomer sur ce nœud.";
          return tooltipHtml(p.name, nodeValue(links, p.name), note);
        },
      },
      series: [{
        type: "sankey",
        data: data,
        links: links.map((l) => ({
          source: l.source, target: l.target, value: l.value, tooltip: l.tooltip,
          lineStyle: { color: "gradient", opacity: 0.4, curveness: 0.5 },
        })),
        orient: vertical ? "vertical" : "horizontal",
        nodeAlign: "justify",
        nodeGap: opts.nodeGap != null ? opts.nodeGap : (vertical ? 22 : 10),
        nodeWidth: vertical ? 20 : 14,
        layoutIterations: 80,
        left: opts.left != null ? opts.left : (vertical ? 10 : 14),
        top: vertical ? 46 : 26,
        right: opts.right != null ? opts.right : (vertical ? 10 : 210),
        bottom: vertical ? 52 : 18,
        emphasis: { focus: "adjacency" },
        blur: { itemStyle: { opacity: 0.25 }, lineStyle: { opacity: 0.08 } },
        label: { fontFamily: "Helvetica Neue, Arial, sans-serif" },
      }],
    };
  }

  const lastCol = (nodes) => Math.max(...nodes.map((n) => (n.col != null ? n.col : n.depth)));

  /* ---------------- vues ---------------- */

  function renderMacro() {
    viewStack = [];
    chartEl.style.height = Math.max(680, Math.min(860, window.innerWidth * 0.62)) + "px";
    chart.resize();
    chart.setOption(buildOption(DATA.nodes, DATA.links,
      { vertical: true, lastCol: lastCol(DATA.nodes) }), true);
    renderBreadcrumb();
  }

  function renderDrill() {
    const key = viewStack[viewStack.length - 1].key;
    const d = DATA.drill[key];
    chartEl.style.height = Math.max(560, Math.min(1500, d.nodes.length * 30)) + "px";
    chart.resize();
    chart.setOption(buildOption(d.nodes, d.links, { vertical: false }), true);
    renderBreadcrumb();
  }

  // Étage « pensions » permanent (tous régimes, ~405 Md€) — vue verticale façon
  // poster : financeurs (ministères CAS Pensions + sources) → régimes → 405.
  function renderPensions() {
    if (!chartPensions || !DATA.retraites_view) { if (pensEl) pensEl.style.display = "none"; return; }
    const v = DATA.retraites_view;
    pensEl.style.height = Math.max(940, Math.min(1180, window.innerWidth * 0.78)) + "px";
    chartPensions.resize();
    chartPensions.setOption(buildOption(v.nodes, v.links,
      { vertical: true, lastCol: lastCol(v.nodes), noDrill: true,
        labelMin: 1.5, labelWidth: 96, nodeGap: 30, left: 150, right: 205 }), true);
  }

  function currentRender() {
    if (viewStack.length) renderDrill();
    else renderMacro();
  }

  /* ---------------- transition « zoom » ---------------- */
  // dir "in"  : on plonge dans le nœud cliqué (l'ancienne vue grossit & disparaît,
  //             la nouvelle apparaît depuis un état réduit) ;
  // dir "out" : on prend du recul (effet inverse).
  function zoom(fn, dir) {
    if (zoomOrigin) {
      chartEl.style.transformOrigin = zoomOrigin.x + "px " + zoomOrigin.y + "px";
    } else {
      chartEl.style.transformOrigin = "50% 40%";
    }
    chartEl.classList.remove("zoom-enter-in", "zoom-enter-out");
    chartEl.classList.add(dir === "in" ? "zoom-exit-in" : "zoom-exit-out");
    setTimeout(() => {
      fn();
      chartEl.classList.remove("zoom-exit-in", "zoom-exit-out");
      chartEl.classList.add(dir === "in" ? "zoom-enter-in" : "zoom-enter-out");
      void chartEl.offsetWidth;                 // reflow → l'anim part de l'état réduit/agrandi
      chartEl.classList.remove("zoom-enter-in", "zoom-enter-out");
      zoomOrigin = null;
    }, 190);
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
      zoomOrigin = null; viewStack = []; zoom(renderMacro, "out");
    }));
    viewStack.forEach((v, i) => {
      const sep = document.createElement("span"); sep.className = "sep"; sep.textContent = "›";
      crumbEl.appendChild(sep);
      crumbEl.appendChild(mk(v.label, i === viewStack.length - 1, () => {
        viewStack = viewStack.slice(0, i + 1);
        zoomOrigin = null; zoom(renderDrill, "out");
      }));
    });
  }

  /* ---------------- bande de chiffres ---------------- */

  function renderStatband(meta) {
    const c = meta.checks || {};
    statEl.innerHTML =
      '<span class="stat"><b>Recettes</b> ' + fmt0(c.recettes_hors_dette) + " Md€</span>" +
      '<span class="stat stat-dette"><b>+ Dette</b> ' + fmt0(c.dette) + " Md€</span>" +
      '<span class="stat-eq">=</span>' +
      '<span class="stat stat-dep"><b>Dépenses</b> ' + fmt0(c.depenses_totales) + " Md€</span>" +
      '<span class="stat-year">' + meta.exercice + "</span>";
  }

  /* ---------------- panneau pensions (explication) ---------------- */

  function renderRetraitesPanel(meta) {
    const r = meta.retraites;
    if (!r || !retPanel) { if (retPanel) retPanel.style.display = "none"; return; }
    const f = r.ifrap || {};
    const rows = Object.entries(r.contributions_par_mission || {})
      .sort((a, b) => b[1] - a[1])
      .map(([m, v]) => "<tr><td>" + esc(m) + "</td><td>" + fmt0(v) + " Md€</td></tr>")
      .join("");
    retPanel.innerHTML =
      "<h3>Qui paie les 405 Md€ de retraites ?</h3>" +
      '<p class="ret-big"><b>' + fmt0(r.cotisations_directes) + " Md€</b> de cotisations (au taux du privé) pour <b>" +
      fmt0(r.pensions_versees) + " Md€</b> de pensions : <b>" + fmt0(r.ecart) + " Md€</b> financés autrement.</p>" +
      "<p>Le diagramme ci-dessus décompose ces ressources selon la nomenclature du <b>COR (rapport juin 2025)</b> : " +
      "cotisations ≈ 65 %, contributions de l'État employeur ≈ 12 % (<b>" + fmt0(f.surcotisations_fp_total || 52.9) +
      " Md€</b> : État " + fmt0(f.fpe || 39.5) + ", opérateurs " + fmt0(f.operateurs || 4.6) + ", CNRACL " +
      fmt0(f.cnracl || 8.8) + "), impôts &amp; taxes affectés ≈ 15 % (" + fmt0(f.itaf || 56.6) + " Md€), " +
      "subventions d'équilibre et transferts ≈ 8 % (" + fmt0((f.transferts_branches || 16.8) + (f.subventions_regimes_speciaux || 7.8)) +
      " Md€).</p>" +
      "<p>Le canal budgétaire de l'État est le <b>CAS Pensions</b> (compte spécial, hors budget général) : " +
      "des contributions employeur imputées sur les crédits de chaque ministère — la dépense retraite cachée " +
      "du budget de l'État, visible en haut du diagramme (chaque flux au survol) :</p>" +
      "<table>" + rows + "</table>" +
      '<p class="ret-src">Sources : COR (rapport juin 2025), iFRAP (fév. 2025), PLFSS 2026 — détail dans data/reference/retraites_2025.json.</p>';
  }

  /* ---------------- méthodologie ---------------- */

  function renderMetho(meta) {
    document.getElementById("exercice").textContent = meta.exercice;
    document.getElementById("generated-at").textContent =
      new Date(meta.generated_at).toLocaleDateString("fr-FR");
    const c = meta.checks || {};
    const src = meta.sources || {};
    const caveats = (meta.caveats || []).map((x) => "<li>" + esc(x) + "</li>").join("");
    document.getElementById("metho-body").innerHTML =
      "<ul>" + caveats + "</ul>" +
      "<p><strong>Contrôle d'équilibre</strong> (axiome n°2)&nbsp;: recettes hors dette " +
      fmt(c.recettes_hors_dette) + " + émission de dette " + fmt(c.dette) +
      " = dépenses totales " + fmt(c.depenses_totales) + ".</p>" +
      '<p class="src"><strong>Sources</strong> — État&nbsp;: ' + esc(src.etat_depenses || "") +
      "&nbsp;· Recettes&nbsp;: " + esc(src.etat_recettes || "") +
      "&nbsp;· Sécu&nbsp;: " + esc(src.secu || "") + "</p>" +
      (meta.seed ? '<p class="src">⚠ ' + esc(meta.seed_note || "") + "</p>" : "");
  }

  /* ---------------- événements ---------------- */

  chart.on("click", (p) => {
    if (p.dataType !== "node") return;
    if (DATA.drill && DATA.drill[p.name]) {
      zoomOrigin = (p.event && p.event.event)
        ? { x: p.event.event.zrX != null ? p.event.event.zrX : p.event.offsetX,
            y: p.event.event.zrY != null ? p.event.event.zrY : p.event.offsetY }
        : null;
      viewStack.push({ key: p.name, label: shortLabel(p.name) });
      zoom(renderDrill, "in");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !viewStack.length) return;
    viewStack.pop(); zoomOrigin = null; zoom(currentRender, "out");
  });
  chart.getZr().on("click", (e) => {
    if (!e.target && viewStack.length) { viewStack.pop(); zoomOrigin = null; zoom(currentRender, "out"); }
  });
  let resizeT = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      chart.resize();
      if (chartPensions) renderPensions();
      if (!viewStack.length) currentRender();
    }, 120);
  });

  /* ---------------- boot ---------------- */

  function boot(json) {
    DATA = json;
    renderMetho(json.meta || {});
    renderStatband(json.meta || {});
    renderRetraitesPanel(json.meta || {});
    renderMacro();
    renderPensions();
  }

  if (window.__DATA__) {
    boot(window.__DATA__);
  } else {
    fetch("data/unified_finances.json")
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
