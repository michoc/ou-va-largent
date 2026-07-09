/* ==========================================================================
 * Où va l'argent public ? — vue TREEMAP des dépenses (treemap.html)
 * --------------------------------------------------------------------------
 * MÊME donnée que le poster (data/unified_finances.json), MÊME granularité :
 * ministères → familles → missions → programmes → actions, construits
 * récursivement depuis les mêmes plongées (DATA.drill) que le Sankey.
 *
 * Additivité STRICTE : les blocs des administrations sont présentés NETS de
 * ce qu'ils re-versent au système de retraites (ces montants vivent dans le
 * bloc « Pensions ») → la somme des feuilles = les dépenses du bandeau
 * (1 286,7 Md€), chaque euro compté une fois. Le facteur de netting d'une
 * famille est appliqué uniformément à sa descendance (convention documentée
 * en infobulle, valeurs votées brutes rappelées).
 *
 * Au sein des pensions : le DÉFICIT DE FINANCEMENT (pensions 405 − cotisations
 * 269 = 136 Md€) est rendu en HACHURES ROUGES, décomposé par origine.
 *
 * COMPARATEUR (⚖) : activable à tout moment, à n'importe quelle profondeur —
 * le dernier bloc cliqué est comparé, en carrés d'aire proportionnelle, au
 * déficit des retraites ou à des ordres de grandeur externes (références
 * versionnées ci-dessous, fournies par l'auteur — indicatives).
 * ========================================================================== */

(function () {
  "use strict";

  const el = document.getElementById("treemap");
  el.style.height = Math.max(560, Math.min(860, window.innerHeight * 0.78)) + "px";
  const chart = echarts.init(el, null, { renderer: "canvas" });

  const fmt = (v) => Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const fmt2 = (v) => Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  const PENS = "Pensions versées — 405 Md€";
  const SECU_N = "Sécurité sociale (hors retraites)";
  const ACCENT = "#C13B55";

  // hachures ROUGES du déficit de financement des retraites
  const HATCH_RED = (function () {
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    const g = c.getContext("2d");
    g.fillStyle = "#E8ADBA";
    g.fillRect(0, 0, 8, 8);
    g.strokeStyle = ACCENT;
    g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.stroke();
    return { image: c, repeat: "repeat" };
  })();

  /* ------------------- références de comparaison (⚖) -------------------
   * type "montant" : Md€ — carrés proportionnels.
   * type "unite"   : prix unitaire € — « combien on peut en payer ».
   * Ordres de grandeur indicatifs, fournis par l'auteur. */
  const REFS = [
    { id: "deficit", nom: "Déficit de financement des retraites", md: 136,
      note: "pensions 405 − cotisations 269 (COR)" },
    { nom: "Ensemble des loyers versés en France (1 an)", md: 95 },
    { nom: "Bénéfices mondiaux du CAC 40 (2025)", md: 93 },
    { nom: "Dividendes mondiaux versés par le CAC 40", md: 107 },
    { nom: "Voitures neuves achetées en France (2025)", md: 61.1 },
    { nom: "Projet Manhattan (converti, inflation comprise)", md: 35 },
    { nom: "Plan Marshall pour la France (converti)", md: 28 },
    { nom: "Les 6 nouveaux EPR2", md: 73 },
    { nom: "Tout le parc nucléaire historique (jusqu'à Flamanville)", md: 125 },
    { nom: "Porte-avions Charles de Gaulle (inflation comprise)", md: 4.5 },
    { nom: "Impôt sur le revenu (recettes 2025)", md: 93.5 },
    { nom: "Budget alimentation de tout le pays (1 an)", md: 200 },
    { nom: "Facture d'électricité de tous les ménages (1 an)", md: 18 },
    { nom: "Fortune de Bernard Arnault", md: 150 },
    { nom: "Toutes les terres agricoles françaises (28,6 M ha, prix SAFER)", md: 166 },
    { nom: "Tout le parc immobilier de l'État (préfectures, prisons, bases…)", md: 75 },
    { nom: "Années au SMIC", unite: 17900, plur: "années au SMIC (net)", type: "unite" },
    { nom: "Dacia neuves", unite: 11000, plur: "Dacia neuves", type: "unite",
      extra: (n) => { const km = n * 4.34 / 1000;
        return "— une file de " + fmt(km) + " km, soit " + fmt2(km / 40075) + " tour(s) du monde"; } },
    { nom: "Scolarités complètes", unite: 145000, plur: "scolarités complètes (maternelle → bac)",
      type: "unite", extra: (n) => "— une classe d'âge ≈ 750 000 enfants" },
  ];

  /* ---------------- construction récursive de l'arbre ---------------- */
  function kidsOf(DATA, nodeName, gross, factor, color, depth) {
    const drill = DATA.drill[nodeName];
    if (!drill || drill.kind === "retraites" || depth > 4) return undefined;
    const grouped = {};
    drill.links.forEach((k) => {
      if (k.source === nodeName) grouped[k.target] = (grouped[k.target] || 0) + k.value;
    });
    const names = Object.keys(grouped);
    if (!names.length) return undefined;
    const tot = names.reduce((s, n) => s + grouped[n], 0) || 1;
    return names.map((n) => {
      const g = grouped[n];
      const net = g * factor * (gross / tot) / (gross || 1) * tot / tot; // = g × factor
      const value = Math.round(g * factor * 100) / 100;
      return {
        name: n, value: value,
        children: kidsOf(DATA, n, g, factor, color, depth + 1),
        itemStyle: { color: color },
        upperLabel: { show: true, color: "#FFFFFF" },
        _tip: fmt(g) + " Md€ de crédits votés" + (factor < 0.999
          ? " (bloc présenté net de la part re-versée aux pensions — convention d'additivité)."
          : "."),
      };
    }).sort((a, b) => b.value - a.value);
  }

  function build(DATA) {
    const nodeColor = {};
    DATA.nodes.forEach((n) => (nodeColor[n.name] = n.color));
    const L = DATA.links;
    const sum = (p) => L.filter(p).reduce((s, l) => s + l.value, 0);

    // — familles de l'État, nettes (facteur exact par famille), descendance
    //   à la MÊME granularité que le Sankey (missions → programmes → actions)
    const versePens = {};
    L.filter((l) => l.target === PENS && l.source.indexOf("É · ") === 0)
      .forEach((l) => (versePens[l.source] = (versePens[l.source] || 0) + l.value));
    const familles = [];
    L.filter((l) => l.source === "État (budget général)" && l.target.indexOf("É · ") === 0)
      .forEach((l) => {
        const fam = l.target;
        const factor = (l.value - (versePens[fam] || 0)) / l.value;
        familles.push({
          name: fam.replace("É · ", ""),
          children: kidsOf(DATA, fam, l.value, factor, nodeColor[fam], 1),
          itemStyle: { color: nodeColor[fam] },
          upperLabel: { show: true, color: "#FFFFFF" },
          _tip: fmt(l.value) + " Md€ de crédits votés, dont " + fmt(versePens[fam] || 0) +
                " re-versés au système de retraites (comptés dans le bloc Pensions).",
        });
      });

    // — branches Sécu (déjà nettes) et leurs composantes (mêmes plongées)
    const branches = L.filter((l) => l.source === SECU_N && l.target !== PENS &&
                                     l.target.indexOf("Régimes") !== 0)
      .map((l) => ({
        name: l.target,
        children: kidsOf(DATA, l.target, l.value, 1, nodeColor[l.target], 1),
        value: DATA.drill[l.target] ? undefined : l.value,
        itemStyle: { color: nodeColor[l.target] },
        upperLabel: { show: true, color: "#FFFFFF" },
      }));

    // — Collectivités (net CNRACL) et UE
    const ctIn = sum((l) => l.target === "Collectivités territoriales");
    const ctOut = sum((l) => l.source === "Collectivités territoriales");
    const ue = sum((l) => l.target === "Union européenne");

    // — Pensions : cotisations + DÉFICIT DE FINANCEMENT (hachures rouges)
    const cot = sum((l) => l.target === "Système de retraites (tous régimes)" &&
                           l.source.indexOf("Cotisations retraites") === 0);
    const defKids = [];
    L.filter((l) => l.target === "Système de retraites (tous régimes)" &&
                    l.source.indexOf("Cotisations retraites") !== 0)
      .forEach((l) => defKids.push({
        name: l.source.indexOf("Émission de dette") === 0 ? "Dette (déficit résiduel)" : l.source,
        value: l.value, itemStyle: { color: HATCH_RED }, _tip: l.tooltip || "" }));
    L.filter((l) => l.target === PENS && l.source.indexOf("É · ") === 0)
      .forEach((l) => defKids.push({
        name: l.source.replace("É · ", "Ministères — "), value: l.value,
        itemStyle: { color: HATCH_RED }, _tip: l.tooltip || "" }));
    defKids.push({ name: "CNRACL (collectivités & hôpitaux)", value: ctOut,
                   itemStyle: { color: HATCH_RED } });
    defKids.push({ name: "Transferts des branches Sécu",
                   value: sum((l) => l.source === SECU_N && l.target.indexOf("Régimes") === 0),
                   itemStyle: { color: HATCH_RED } });
    const deficit = Math.round(defKids.reduce((s, k) => s + k.value, 0) * 10) / 10;

    const pensions = {
      name: "Pensions versées (405 Md€)",
      itemStyle: { color: "#C94A6E" },
      upperLabel: { show: true, color: "#FFFFFF" },
      children: [
        { name: "Payées par les cotisations", value: cot,
          itemStyle: { color: "#7E6BB8" },
          _tip: "269 Md€ de cotisations vieillesse tous régimes, au taux du privé (≈ 2/3 des ressources — COR)." },
        { name: "DÉFICIT de financement (" + fmt(deficit) + " Md€)",
          itemStyle: { color: HATCH_RED, borderColor: ACCENT, borderWidth: 3 },
          upperLabel: { show: true, color: ACCENT },
          children: defKids.sort((a, b) => b.value - a.value),
          _tip: "L'écart entre les cotisations reçues (269) et les pensions versées (405) : comblé " +
                "par les impôts affectés, les subventions d'équilibre des ministères (CAS Pensions), " +
                "la CNRACL, des transferts et la dette. Pas un déficit comptable : un financement " +
                "non contributif." },
      ],
    };

    return [
      { name: "Ministères de l'État", children: familles,
        itemStyle: { color: "#F09D86" }, upperLabel: { show: true, color: "#FFFFFF" },
        _tip: "Budget général : familles → missions → programmes → actions (mêmes plongées que le poster), net des re-fléchages vers les pensions." },
      { name: "Sécurité sociale (hors retraites)", children: branches,
        itemStyle: { color: "#EE8FB4" }, upperLabel: { show: true, color: "#FFFFFF" } },
      pensions,
      { name: "Collectivités (part transférée)", value: Math.round((ctIn - ctOut) * 100) / 100,
        itemStyle: { color: "#D9A441" },
        _tip: "Fractions de TVA + prélèvements sur recettes, nets des surcotisations CNRACL (re-versées aux pensions)." },
      { name: "Union européenne", value: ue, itemStyle: { color: "#A79BC8" } },
    ];
  }

  /* ---------------- comparateur (⚖) ---------------- */
  let cur = null;                    // dernier bloc cliqué {name, value}
  const cmpPanel = document.getElementById("compare-panel");
  const cmpBtn = document.getElementById("compare-btn");
  const cmpSel = document.getElementById("compare-ref");
  REFS.forEach((r, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = r.nom + (r.md ? " — " + fmt(r.md) + " Md€" : "");
    cmpSel.appendChild(o);
  });

  function renderCompare() {
    if (cmpPanel.hidden || !cur) return;
    const ref = REFS[+cmpSel.value];
    const out = document.getElementById("compare-body");
    if (ref.type === "unite") {
      const n = cur.value * 1e9 / ref.unite;
      out.innerHTML =
        '<p class="cmp-sentence"><b>' + esc(cur.name) + "</b> (" + fmt(cur.value) +
        " Md€) ≈ <b>" + fmt(Math.round(n)) + "</b> " + ref.plur +
        (ref.extra ? " " + esc(ref.extra(n)) : "") + ".</p>";
      return;
    }
    const k = 86 / Math.sqrt(Math.max(cur.value, ref.md));   // côté ∝ √aire
    const s1 = Math.max(10, Math.sqrt(cur.value) * k);
    const s2 = Math.max(10, Math.sqrt(ref.md) * k);
    const ratio = cur.value / ref.md;
    const phrase = ratio >= 1
      ? "≈ <b>" + fmt2(ratio) + " ×</b> « " + esc(ref.nom) + " »"
      : "« " + esc(ref.nom) + " » ≈ <b>" + fmt2(1 / ratio) + " ×</b> ce bloc";
    out.innerHTML =
      '<div class="cmp-squares">' +
      '<div class="cmp-item"><div class="cmp-square" style="width:' + s1 + "px;height:" + s1 +
      'px;background:#5C7FB8"></div><span>' + esc(cur.name) + "<br><b>" + fmt(cur.value) +
      " Md€</b></span></div>" +
      '<div class="cmp-item"><div class="cmp-square cmp-square-ref" style="width:' + s2 +
      "px;height:" + s2 + 'px"></div><span>' + esc(ref.nom) + "<br><b>" + fmt(ref.md) +
      " Md€</b></span></div></div>" +
      '<p class="cmp-sentence"><b>' + esc(cur.name) + "</b> " + phrase +
      (ref.note ? ' <span class="cmp-note">(' + esc(ref.note) + ")</span>" : "") + ".</p>";
  }
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  cmpBtn.addEventListener("click", () => {
    cmpPanel.hidden = !cmpPanel.hidden;
    cmpBtn.classList.toggle("active", !cmpPanel.hidden);
    renderCompare();
  });
  cmpSel.addEventListener("change", renderCompare);

  /* ---------------- boot ---------------- */
  function boot(DATA) {
    const c = (DATA.meta && DATA.meta.checks) || {};
    document.getElementById("statband").innerHTML =
      '<span class="stat stat-dep"><b>Dépenses</b> ' + fmt(c.depenses_totales) + " Md€</span>" +
      '<span class="stat-year">' + (DATA.meta || {}).exercice + "</span>";
    cur = { name: "Toutes les dépenses publiques", value: c.depenses_totales };

    chart.setOption({
      tooltip: {
        confine: true, backgroundColor: "#FFFFFF", borderColor: "#E4DCCB",
        textStyle: { color: "#1E2430" },
        formatter: (p) => {
          const tip = (p.data && p.data._tip) || "";
          return '<div class="sankey-tip"><div class="tip-title">' + p.name +
                 '</div><div class="tip-value">' + fmt(p.value) + " Md€</div>" +
                 (tip ? '<div class="tip-note">' + tip + "</div>" : "") +
                 '<div class="tip-note">⚖ Cliquer sélectionne ce bloc pour le comparateur.</div></div>';
        },
      },
      series: [{
        type: "treemap",
        data: build(DATA),
        leafDepth: 2,
        roam: false,
        width: "100%", height: "92%", top: 34,
        breadcrumb: { show: true, top: 4, left: "center",
                      itemStyle: { color: "#1E2430", textStyle: { color: "#FAF6EF" } } },
        label: { show: true, formatter: (p) => p.name + "\n" + fmt(p.value) + " Md€",
                 fontSize: 12, fontWeight: 700, overflow: "break" },
        upperLabel: { show: true, height: 24, fontSize: 12, fontWeight: 700 },
        itemStyle: { borderColor: "#FAF6EF", borderWidth: 2, gapWidth: 2 },
        levels: [
          { itemStyle: { borderColor: "#FAF6EF", borderWidth: 4, gapWidth: 4 } },
          { itemStyle: { borderColor: "#FAF6EF", borderWidth: 2, gapWidth: 2 } },
          { colorSaturation: [0.35, 0.6] },
        ],
      }],
    });

    // navigation : le dernier bloc cliqué devient le sujet du comparateur
    chart.on("click", (p) => {
      if (p.data && p.value != null) {
        cur = { name: p.name, value: Array.isArray(p.value) ? p.value[0] : p.value };
        renderCompare();
      }
    });
  }

  fetch("data/unified_finances.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(boot)
    .catch((err) => {
      el.innerHTML = '<p style="padding:40px;text-align:center;color:#B4526B">' +
        "Impossible de charger les données (" + err.message + ").</p>";
    });

  window.addEventListener("resize", () => chart.resize());
})();
