/* ==========================================================================
 * Où va l'argent public ? — vue TREEMAP des dépenses (treemap.html)
 * --------------------------------------------------------------------------
 * Même donnée que le poster (data/unified_finances.json), en rectangles
 * proportionnels et STRICTEMENT ADDITIFS : les blocs des administrations sont
 * présentés NETS de ce qu'ils re-versent au système de retraites (ces montants
 * vivent dans le bloc « Pensions ») → la somme des feuilles = les dépenses
 * totales du bandeau (1 286,7 Md€), chaque euro compté une fois.
 * Au sein des pensions : la part non couverte par les cotisations (405 − 269 =
 * 136 Md€) est mise en évidence en ROUGE, décomposée par origine.
 * ========================================================================== */

(function () {
  "use strict";

  const el = document.getElementById("treemap");
  el.style.height = Math.max(560, Math.min(860, window.innerHeight * 0.78)) + "px";
  const chart = echarts.init(el, null, { renderer: "canvas" });

  const fmt = (v) => Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const PENS = "Pensions versées — 405 Md€";
  const SECU_N = "Sécurité sociale (hors retraites)";
  const ACCENT = "#C13B55";

  function build(DATA) {
    const nodeColor = {};
    DATA.nodes.forEach((n) => (nodeColor[n.name] = n.color));
    const surco = DATA.surco || {};
    const L = DATA.links;
    const sum = (pred) => L.filter(pred).reduce((s, l) => s + l.value, 0);

    // — familles de l'État : nettes de leurs re-versements aux pensions.
    //   La déduction EXACTE par famille = son lien vers le bloc Pensions ;
    //   les missions sont nettées de leur surco connue puis NORMALISÉES pour
    //   que la somme tombe juste (additivité stricte avec le bandeau) —
    const versePens = {};
    L.filter((l) => l.target === PENS && l.source.indexOf("É · ") === 0)
      .forEach((l) => (versePens[l.source] = (versePens[l.source] || 0) + l.value));
    const familles = [];
    L.filter((l) => l.source === "État (budget général)" && l.target.indexOf("É · ") === 0)
      .forEach((l) => {
        const fam = l.target;
        const famNet = l.value - (versePens[fam] || 0);
        const drill = DATA.drill[fam];
        const missions = {};
        (drill ? drill.links : []).forEach((k) => {
          if (k.source === fam) missions[k.target] = (missions[k.target] || 0) + k.value;
        });
        let kids = Object.entries(missions).map(([m, cp]) => ({
          name: m, cp: cp, net: Math.max(cp - (surco[m] || 0), 0.01),
        }));
        const kidsTot = kids.reduce((s, k) => s + k.net, 0) || 1;
        kids = kids.map((k) => ({
          name: k.name, value: Math.round(k.net * famNet / kidsTot * 100) / 100,
          itemStyle: { color: nodeColor[fam] },
          _tip: fmt(k.cp) + " Md€ de crédits votés, présentés nets de la part re-versée " +
                "au système de retraites (bloc Pensions).",
        })).sort((a, b) => b.value - a.value);
        familles.push({
          name: fam.replace("É · ", ""), children: kids,
          itemStyle: { color: nodeColor[fam] },
          upperLabel: { show: true, color: "#FFFFFF" },
        });
      });

    // — branches Sécu (le bloc était déjà net : les transferts re-versés
    //   étaient AJOUTÉS aux branches ; ici on ne garde que les branches) —
    const branches = L.filter((l) => l.source === SECU_N && l.target !== PENS &&
                                     l.target.indexOf("Régimes") !== 0)
      .map((l) => {
        const kids = (DATA.drill[l.target] ? DATA.drill[l.target].links : [])
          .map((k) => ({ name: k.target, value: k.value,
                         itemStyle: { color: nodeColor[l.target] } }));
        return { name: l.target, value: kids.length ? undefined : l.value,
                 children: kids.length ? kids : undefined,
                 itemStyle: { color: nodeColor[l.target] },
                 upperLabel: { show: true, color: "#FFFFFF" } };
      });

    // — Collectivités (net de la CNRACL re-versée) et UE —
    const ctIn = sum((l) => l.target === "Collectivités territoriales");
    const ctOut = sum((l) => l.source === "Collectivités territoriales");
    const ue = sum((l) => l.target === "Union européenne");

    // — Pensions 405 : cotisations 269 + LE TROU (136) décomposé par origine —
    const cot = sum((l) => l.target === "Système de retraites (tous régimes)" &&
                           l.source.indexOf("Cotisations retraites") === 0);
    const trouKids = [];
    L.filter((l) => l.target === "Système de retraites (tous régimes)" &&
                    l.source.indexOf("Cotisations retraites") !== 0)
      .forEach((l) => trouKids.push({
        name: l.source.indexOf("Émission de dette") === 0 ? "Dette (déficit résiduel)" : l.source,
        value: l.value, itemStyle: { color: "#D96A80" }, _tip: l.tooltip || "" }));
    L.filter((l) => l.target === PENS && l.source.indexOf("É · ") === 0)
      .forEach((l) => trouKids.push({
        name: l.source.replace("É · ", "Ministères — "), value: l.value,
        itemStyle: { color: "#D96A80" }, _tip: l.tooltip || "" }));
    trouKids.push({ name: "CNRACL (collectivités & hôpitaux)", value: ctOut,
                    itemStyle: { color: "#D96A80" } });
    trouKids.push({ name: "Transferts des branches Sécu", value:
                    sum((l) => l.source === SECU_N && l.target.indexOf("Régimes") === 0),
                    itemStyle: { color: "#D96A80" } });
    const trou = Math.round(trouKids.reduce((s, k) => s + k.value, 0) * 10) / 10;

    const pensions = {
      name: "Pensions versées (405 Md€)",
      itemStyle: { color: "#C94A6E" },
      upperLabel: { show: true, color: "#FFFFFF" },
      children: [
        { name: "Payées par les cotisations", value: cot,
          itemStyle: { color: "#7E6BB8" },
          _tip: "269 Md€ de cotisations vieillesse tous régimes, au taux du privé (≈ 2/3 des ressources — COR)." },
        { name: "LE TROU — au-delà des cotisations (" + fmt(trou) + " Md€)",
          itemStyle: { color: ACCENT, borderColor: "#7E1D33", borderWidth: 3 },
          upperLabel: { show: true, color: "#FFFFFF" },
          children: trouKids.sort((a, b) => b.value - a.value),
          _tip: "La part des pensions que les cotisations ne couvrent pas : impôts affectés, " +
                "subventions d'équilibre des ministères (CAS Pensions), CNRACL, transferts et dette. " +
                "Ce n'est pas un déficit comptable, mais un financement non contributif." },
      ],
    };

    return [
      { name: "Ministères de l'État", children: familles,
        itemStyle: { color: "#F09D86" }, upperLabel: { show: true, color: "#FFFFFF" },
        _tip: "Budget général par famille puis mission, net des re-fléchages vers les pensions." },
      { name: "Sécurité sociale (hors retraites)", children: branches,
        itemStyle: { color: "#EE8FB4" }, upperLabel: { show: true, color: "#FFFFFF" } },
      pensions,
      { name: "Collectivités (part transférée)", value: Math.round((ctIn - ctOut) * 100) / 100,
        itemStyle: { color: "#D9A441" },
        _tip: "Fractions de TVA + prélèvements sur recettes, nets des surcotisations CNRACL (re-versées aux pensions)." },
      { name: "Union européenne", value: ue, itemStyle: { color: "#A79BC8" } },
    ];
  }

  function boot(DATA) {
    const c = (DATA.meta && DATA.meta.checks) || {};
    document.getElementById("statband").innerHTML =
      '<span class="stat stat-dep"><b>Dépenses</b> ' + fmt(c.depenses_totales) + " Md€</span>" +
      '<span class="stat-year">' + (DATA.meta || {}).exercice + "</span>";

    chart.setOption({
      tooltip: {
        confine: true, backgroundColor: "#FFFFFF", borderColor: "#E4DCCB",
        textStyle: { color: "#1E2430" },
        formatter: (p) => {
          const tip = (p.data && p.data._tip) || "";
          return '<div class="sankey-tip"><div class="tip-title">' + p.name +
                 '</div><div class="tip-value">' + fmt(p.value) + " Md€</div>" +
                 (tip ? '<div class="tip-note">' + tip + "</div>" : "") + "</div>";
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
