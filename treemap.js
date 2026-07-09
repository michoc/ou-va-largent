/* ==========================================================================
 * Où va l'argent public ? — LE MONDRIAN des dépenses (treemap.html)
 * --------------------------------------------------------------------------
 * Rectangles proportionnels, MÊME donnée et MÊME granularité que le poster
 * Sankey (data/unified_finances.json : ministères → familles → missions →
 * programmes → actions, via DATA.drill).
 *
 * DEUX MODES (switch), tous deux additifs (somme = 1 286,7 Md€) :
 *   • « Réalité » (défaut) : administrations NETTES de ce qu'elles re-versent
 *     aux retraites ; bloc « Retraites — 405 Md€ » avec, à l'intérieur, le
 *     « Déséquilibre du système de retraites (136 Md€) » en HACHURES ROUGES.
 *   • « Tel que présenté » : administrations BRUTES (les contributions
 *     retraites — CAS Pensions, CNRACL, transferts — apparaissent HACHURÉES à
 *     l'intérieur de leurs budgets) ; le bloc retraites ne montre alors que
 *     331,4 Md€ « financés directement ». Le basculement fait migrer 73,6 Md€
 *     des administrations vers les retraites → révèle le maquillage comptable.
 *
 * COMPARATEUR (⚖) : deux emplacements interchangeables (déficit à gauche par
 * défaut, bloc cliqué à droite) ; carrés d'aires proportionnelles reliés, ratio
 * « × N », et une PHRASE générée (déterministe, zéro API) avec unités de temps.
 * ========================================================================== */

(function () {
  "use strict";

  const el = document.getElementById("treemap");
  el.style.height = Math.max(560, Math.min(880, window.innerHeight * 0.80)) + "px";
  const chart = echarts.init(el, null, { renderer: "canvas" });

  const fmt = (v) => Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const fmt2 = (v) => Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  const fmt0 = (v) => Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  const SYST = "Système de retraites (tous régimes)";
  const PENS = "Pensions versées — 405 Md€";
  const SECU_N = "Sécurité sociale (hors retraites)";
  const ACCENT = "#C13B55";
  const COL = { etat: "#F09D86", secu: "#EE8FB4", pens: "#C94A6E", ct: "#D9A441", ue: "#A79BC8",
                cot: "#8C79C0" };

  // hachures ROUGES (déséquilibre des retraites) et GRISES (contributions
  // retraites logées dans les administrations, mode « tel que présenté »)
  function hatch(base, stroke) {
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    const g = c.getContext("2d");
    g.fillStyle = base; g.fillRect(0, 0, 8, 8);
    g.strokeStyle = stroke; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.stroke();
    return { image: c, repeat: "repeat" };
  }
  const HATCH_RED = hatch("#E8ADBA", ACCENT);
  const HATCH_GREY = hatch("#D2D6DE", "#7E8494");

  /* ============ références du comparateur (métadonnées pour les phrases) ====
   * flux:true  = montant ANNUEL (déficit, loyers, budgets…) ; false = STOCK.
   * court      = nom court pour les phrases. chantier = « financer <chantier> ».
   * Ordres de grandeur INDICATIFS (compilation de l'auteur).                  */
  const REFS = [
    { id: "deficit", nom: "Déséquilibre du système de retraites", court: "le déséquilibre des retraites",
      md: 136, flux: true, note: "pensions 405 − cotisations 269 (COR)" },
    { id: "loyers", nom: "Loyers versés en France (1 an)", court: "les loyers versés en France",
      md: 95, flux: true },
    { id: "benef_cac", nom: "Bénéfices mondiaux du CAC 40 (2025)", court: "les bénéfices du CAC 40",
      md: 93, flux: true },
    { id: "div_cac", nom: "Dividendes mondiaux du CAC 40", court: "les dividendes du CAC 40",
      md: 107, flux: true },
    { id: "autos", nom: "Voitures neuves achetées en France (1 an)", court: "les voitures neuves d'une année",
      md: 61.1, flux: true },
    { id: "manhattan", nom: "Projet Manhattan (converti)", court: "le projet Manhattan",
      md: 35, flux: false, chantier: "le projet Manhattan (inflation comprise)" },
    { id: "marshall", nom: "Plan Marshall pour la France", court: "le plan Marshall (France)",
      md: 28, flux: false, chantier: "le plan Marshall reçu par la France" },
    { id: "epr", nom: "Les 6 nouveaux réacteurs EPR2", court: "les 6 EPR2",
      md: 73, flux: false, chantier: "la construction des 6 nouveaux réacteurs EPR2" },
    { id: "nucleaire", nom: "Tout le parc nucléaire (jusqu'à Flamanville)", court: "tout le parc nucléaire",
      md: 125, flux: false,
      chantier: "la construction de tout le parc nucléaire français jusqu'à Flamanville (inflation comprise)" },
    { id: "cdg", nom: "Porte-avions Charles de Gaulle", court: "le Charles de Gaulle",
      md: 4.5, flux: false, chantier: "la construction du porte-avions Charles de Gaulle (inflation comprise)" },
    { id: "ir", nom: "Impôt sur le revenu (recettes 1 an)", court: "l'impôt sur le revenu",
      md: 93.5, flux: true },
    { id: "alim", nom: "Alimentation de tout le pays (1 an)", court: "l'alimentation du pays",
      md: 200, flux: true },
    { id: "elec", nom: "Facture d'électricité des ménages (1 an)", court: "l'électricité des ménages",
      md: 18, flux: true },
    { id: "arnault", nom: "Fortune de Bernard Arnault", court: "la fortune de Bernard Arnault",
      md: 150, flux: false, chantier: "la fortune de Bernard Arnault" },
    { id: "terres", nom: "Toutes les terres agricoles françaises", court: "toutes les terres agricoles",
      md: 166, flux: false, chantier: "l'achat de toutes les terres agricoles françaises (prix SAFER)" },
    { id: "immo_etat", nom: "Tout l'immobilier de l'État", court: "l'immobilier de l'État",
      md: 75, flux: false,
      chantier: "l'achat de tout le parc immobilier de l'État (préfectures, prisons, bases…)" },
    // références UNITAIRES (conversion « combien on peut en payer »)
    { id: "smic", nom: "Années de SMIC", type: "unite", unite: 17900, plur: "années au SMIC (net)" },
    { id: "dacia", nom: "Dacia neuves", type: "unite", unite: 11000, plur: "Dacia neuves",
      extra: (n) => { const km = n * 4.34 / 1000;
        return "— mises bout à bout, une file de " + fmt0(km) + " km, soit " + fmt2(km / 40075) +
               " fois le tour de la Terre"; } },
    { id: "scol", nom: "Scolarités complètes (maternelle→bac)", type: "unite", unite: 145000,
      plur: "scolarités complètes", extra: () => "— une classe d'âge compte ≈ 750 000 enfants" },
  ];
  const refById = {}; REFS.forEach((r) => (refById[r.id] = r));

  /* ============ phrases curées (priment sur le générateur) ============
   * clé « idA|idB ». {n} {mois} {invN} recalculés au rendu (jamais figés). */
  const CURATED = {
    "deficit|nucleaire":
      "Une seule année du déséquilibre des retraites aurait permis de financer {n} fois la " +
      "construction de tout le parc nucléaire français jusqu'à Flamanville (inflation comprise).",
    "deficit|epr":
      "Chaque année, le déséquilibre des retraites pourrait financer {n} fois les 6 nouveaux EPR2.",
    "loyers|deficit":
      "Tous les loyers versés en France représentent {ratio} le déséquilibre des retraites : de quoi " +
      "en financer environ {mois}.",
    "deficit|cdg":
      "Une année du déséquilibre des retraites équivaut à {n} porte-avions Charles de Gaulle.",
    "deficit|arnault":
      "Le déséquilibre annuel des retraites représente {ratio} la fortune de Bernard Arnault.",
  };

  /* ============ formatage du temps ============ */
  function fmtTemps(mois) {
    if (mois >= 23.5) { const a = mois / 12; return fmt2(a).replace(",00", "") + " an" + (a >= 2 ? "s" : ""); }
    if (mois >= 1.4) {
      const m = Math.round(mois);
      return (m === 8 ? "8 mois" : m + " mois") + (Math.abs(mois - m) > 0.35 && m < 12 ? " et demi" : "");
    }
    const sem = mois * 4.345;
    if (sem >= 1.3) return Math.round(sem) + " semaines";
    return Math.round(mois * 30.4) + " jours";
  }

  /* ============ générateur de phrase (déterministe) ============ */
  // élision « de + article » → du / des / de l' / de la
  function deElide(name) {
    name = String(name).trim();
    if (/^les /i.test(name)) return "des " + name.slice(4);
    if (/^le /i.test(name)) return "du " + name.slice(3);
    if (/^un /i.test(name)) return "d'un " + name.slice(3);
    return "de " + name;                       // de l'X, de la X, de X
  }
  const estPluriel = (c) => /^(les |des |toutes |tous |plusieurs |certain)/i.test(String(c).trim());
  const rep = (c) => estPluriel(c) ? "représentent" : "représente";
  function phraseFor(A, B) {
    // override curé ?
    const key = A.id + "|" + B.id;
    if (CURATED[key]) {
      const n = A.md / B.md, invN = B.md / A.md;
      return CURATED[key]
        .replace("{n}", fmt2(n)).replace("{invN}", fmt2(invN))
        .replace("{ratio}", "× " + fmt2(A.md >= B.md ? A.md / B.md : B.md / A.md))
        .replace("{mois}", fmtTemps(Math.min(A.md, B.md) / Math.max(A.md, B.md) * 12));
    }
    const parts = [];
    // phrase 1 : le multiple
    if (A.md >= B.md)
      parts.push("<b>" + esc(cap(A.court || A.nom)) + "</b> " + rep(A.court || A.nom) + " <b>× " +
                 fmt2(A.md / B.md) + "</b> " + esc(B.court || B.nom) + ".");
    else
      parts.push("<b>" + esc(cap(B.court || B.nom)) + "</b> " + rep(B.court || B.nom) + " <b>× " +
                 fmt2(B.md / A.md) + "</b> " + esc(A.court || A.nom) + ".");
    // phrase 2 : contexte flux / stock
    const flux = A.flux ? A : (B.flux ? B : null);
    const stock = !A.flux ? A : (!B.flux ? B : null);
    if (flux && stock && flux !== stock) {
      const n = flux.md / stock.md;
      if (n >= 1)
        parts.push("Une seule année " + esc(deElide(flux.court || flux.nom)) + " suffirait à financer <b>" +
                   fmt2(n) + " fois</b> " + esc(stock.chantier || stock.court || stock.nom) + ".");
      else {
        const iv = 1 / n;
        parts.push("Il faudrait <b>" + fmt2(iv) + " an" + (iv >= 2 ? "s" : "") + "</b> " +
                   esc(deElide(flux.court || flux.nom)) + " pour financer " +
                   esc(stock.chantier || stock.court || stock.nom) + ".");
      }
    } else if (A.flux && B.flux) {
      const big = A.md >= B.md ? A : B, small = A.md >= B.md ? B : A;
      parts.push("Chaque année, " + esc(cap(small.court || small.nom)) + " " + rep(small.court || small.nom) +
                 " environ <b>" + fmtTemps(small.md / big.md * 12) + "</b> " +
                 esc(deElide(big.court || big.nom)) + ".");
    }
    return parts.join(" ");
  }

  /* ============ construction récursive de l'arbre ============ */
  function alpha(depth) { return depth <= 1 ? 1 : Math.max(0.42, 1 - (depth - 1) * 0.16); }

  function kidsOf(DATA, nodeName, factor, color, depth) {
    const drill = DATA.drill[nodeName];
    if (!drill || drill.kind === "retraites" || depth > 4) return undefined;
    const grouped = {};
    drill.links.forEach((k) => {
      if (k.source === nodeName) grouped[k.target] = (grouped[k.target] || 0) + k.value;
    });
    const names = Object.keys(grouped);
    if (!names.length) return undefined;
    return names.map((n) => ({
      name: n, value: Math.round(grouped[n] * factor * 100) / 100,
      children: kidsOf(DATA, n, factor, color, depth + 1),
      itemStyle: { color: color, colorAlpha: alpha(depth + 1) },
      upperLabel: { show: true, color: "#FFFFFF" },
      _tip: fmt(grouped[n]) + " Md€ de crédits votés" +
            (factor < 0.999 ? " (net des sommes re-versées aux retraites)." : "."),
    })).sort((a, b) => b.value - a.value);
  }

  function build(DATA, mode) {
    const nodeColor = {}; DATA.nodes.forEach((n) => (nodeColor[n.name] = n.color));
    const L = DATA.links;
    const sum = (p) => L.filter(p).reduce((s, l) => s + l.value, 0);
    const official = mode === "officiel";

    const versePens = {};
    L.filter((l) => l.target === PENS && l.source.indexOf("É · ") === 0)
      .forEach((l) => (versePens[l.source] = (versePens[l.source] || 0) + l.value));

    // — Ministères de l'État —
    const familles = [];
    L.filter((l) => l.source === "État (budget général)" && l.target.indexOf("É · ") === 0)
      .forEach((l) => {
        const fam = l.target, vp = versePens[fam] || 0;
        // missions NETTES dans les deux modes ; en mode officiel, la part CAS
        // re-devient un enfant hachuré distinct (net + CAS = brut) → pas de
        // double compte, la famille retrouve sa valeur brute.
        const factor = (l.value - vp) / l.value;
        const kids = kidsOf(DATA, fam, factor, nodeColor[fam], 1) || [];
        if (official && vp > 0.01) {
          kids.push({ name: "→ Contributions retraites (CAS Pensions)", value: Math.round(vp * 100) / 100,
            itemStyle: { color: HATCH_GREY }, _est: true,
            _tip: "≈ " + fmt(vp) + " Md€ des crédits de cette famille financent en réalité les " +
                  "retraites (contributions employeur au CAS Pensions), présentés ici comme sa dépense propre." });
          kids.sort((a, b) => b.value - a.value);
        }
        familles.push({
          name: fam.replace("É · ", ""), children: kids,
          itemStyle: { color: nodeColor[fam] }, upperLabel: { show: true, color: "#FFFFFF" },
          _tip: fmt(l.value) + " Md€ de crédits votés" +
                (official ? " (bruts ; part hachurée = ce qui finance en réalité les retraites)."
                          : ", nets des " + fmt(vp) + " Md€ re-versés aux retraites."),
        });
      });

    // — Sécurité sociale (branches ± transfert retraites) —
    const secuTr = sum((l) => l.source === SECU_N && l.target.indexOf("Régimes") === 0);
    const branches = L.filter((l) => l.source === SECU_N && l.target !== PENS &&
                                     l.target.indexOf("Régimes") !== 0)
      .map((l) => ({
        name: l.target, children: kidsOf(DATA, l.target, 1, nodeColor[l.target], 1),
        value: DATA.drill[l.target] ? undefined : l.value,
        itemStyle: { color: nodeColor[l.target] }, upperLabel: { show: true, color: "#FFFFFF" },
      }));
    if (official && secuTr > 0.01)
      branches.push({ name: "→ Transferts aux retraites", value: Math.round(secuTr * 100) / 100,
        itemStyle: { color: HATCH_GREY }, _est: true,
        _tip: "≈ " + fmt(secuTr) + " Md€ de transferts des autres branches vers la vieillesse." });
    const secu = { name: "Sécurité sociale", children: branches,
      itemStyle: { color: COL.secu }, upperLabel: { show: true, color: "#FFFFFF" },
      _tip: "Branches maladie, famille, autonomie, AT-MP (hors retraites, présentées à part)." };

    // — Collectivités / UE —
    const ctIn = sum((l) => l.target === "Collectivités territoriales");
    const cnracl = sum((l) => l.source === "Collectivités territoriales");
    const ue = sum((l) => l.target === "Union européenne");
    const ct = official
      ? { name: "Collectivités territoriales", value: Math.round(ctIn * 100) / 100,
          itemStyle: { color: COL.ct },
          children: [
            { name: "Transferts (TVA, dotations)", value: Math.round((ctIn - cnracl) * 100) / 100,
              itemStyle: { color: COL.ct } },
            { name: "→ Retraites (CNRACL)", value: Math.round(cnracl * 100) / 100,
              itemStyle: { color: HATCH_GREY }, _est: true,
              _tip: "≈ " + fmt(cnracl) + " Md€ de surcotisations CNRACL des agents territoriaux/hospitaliers." },
          ], upperLabel: { show: true, color: "#FFFFFF" } }
      : { name: "Collectivités territoriales", value: Math.round((ctIn - cnracl) * 100) / 100,
          itemStyle: { color: COL.ct },
          _tip: "Fractions de TVA + prélèvements sur recettes, nets des surcotisations CNRACL (retraites)." };

    // — Retraites —
    const cot = sum((l) => l.target === SYST && l.source.indexOf("Cotisations retraites") === 0);
    const impots = sum((l) => l.target === SYST && l.source.indexOf("Cotisations retraites") !== 0);
    let retraites;
    if (official) {
      retraites = { name: "Retraites — financées directement (331 Md€)",
        itemStyle: { color: COL.pens }, upperLabel: { show: true, color: "#FFFFFF" },
        _tip: "Les retraites coûtent 405 Md€. N'apparaissent ici que les 331 financés « en direct » " +
              "(cotisations, impôts affectés, dette). Les 74 Md€ restants sont logés dans les budgets " +
              "des ministères, de la Sécu et des collectivités (parts hachurées) : le maquillage comptable.",
        children: [
          { name: "Cotisations", value: Math.round(cot * 100) / 100, itemStyle: { color: COL.pens } },
          { name: "Impôts affectés & dette", value: Math.round(impots * 100) / 100,
            itemStyle: { color: COL.pens, colorAlpha: 0.7 },
            _tip: "CSG-FSV, fractions de TVA et impôts affectés à la vieillesse, déficit résiduel." },
        ] };
    } else {
      const defKids = [];
      defKids.push({ name: "Impôts affectés & dette", value: Math.round(impots * 100) / 100,
        itemStyle: { color: HATCH_RED }, _tip: "CSG-FSV, TVA et impôts affectés à la vieillesse, dette." });
      L.filter((l) => l.target === PENS && l.source.indexOf("É · ") === 0).forEach((l) =>
        defKids.push({ name: l.source.replace("É · ", "Ministères — "), value: l.value,
          itemStyle: { color: HATCH_RED }, _tip: l.tooltip || "" }));
      defKids.push({ name: "Collectivités (CNRACL)", value: Math.round(cnracl * 100) / 100,
        itemStyle: { color: HATCH_RED } });
      defKids.push({ name: "Transferts Sécu", value: Math.round(secuTr * 100) / 100,
        itemStyle: { color: HATCH_RED } });
      const deficit = Math.round(defKids.reduce((s, k) => s + k.value, 0) * 10) / 10;
      retraites = { name: "Retraites — pensions versées (405 Md€)",
        itemStyle: { color: COL.pens }, upperLabel: { show: true, color: "#FFFFFF" },
        _tip: "405 Md€ de pensions. Les cotisations (269) n'en couvrent que les deux tiers.",
        children: [
          { name: "Couvert par les cotisations", value: Math.round(cot * 100) / 100,
            itemStyle: { color: COL.pens },
            _tip: "269 Md€ de cotisations vieillesse tous régimes (≈ 2/3 des ressources — COR)." },
          { name: "Déséquilibre du système de retraites (" + fmt(deficit) + " Md€)",
            itemStyle: { color: HATCH_RED, borderColor: ACCENT, borderWidth: 3 },
            upperLabel: { show: true, color: ACCENT },
            children: defKids.sort((a, b) => b.value - a.value),
            _tip: "L'écart entre cotisations reçues (269) et pensions versées (405) : comblé par les " +
                  "impôts affectés, les subventions d'équilibre des ministères (CAS Pensions), la CNRACL, " +
                  "des transferts et la dette. Non contributif." },
        ] };
    }

    return [
      { name: "Ministères de l'État", children: familles, itemStyle: { color: COL.etat },
        upperLabel: { show: true, color: "#FFFFFF" },
        _tip: "Budget général : familles → missions → programmes → actions (mêmes plongées que le poster)." +
              (official ? " Brut, avec les contributions retraites hachurées." : " Net des re-fléchages retraites.") },
      secu, retraites, ct,
      { name: "Union européenne", value: Math.round(ue * 100) / 100, itemStyle: { color: COL.ue } },
    ];
  }

  /* ============ comparateur ============ */
  let cur = null, DATA_G = null, MODE = "realite";
  const cmpPanel = document.getElementById("compare-panel");
  const cmpBtn = document.getElementById("compare-btn");
  const selA = document.getElementById("compare-a");
  const selB = document.getElementById("compare-b");

  function fillSelect(sel) {
    const oc = document.createElement("option");
    oc.value = "CLICK"; oc.textContent = "Le bloc que je regarde (suit la navigation)";
    sel.appendChild(oc);
    REFS.forEach((r) => {
      const o = document.createElement("option");
      o.value = r.id;
      o.textContent = r.nom + (r.md ? " — " + fmt(r.md) + " Md€" : "");
      sel.appendChild(o);
    });
  }
  fillSelect(selA); fillSelect(selB);
  selA.value = "deficit"; selB.value = "CLICK";

  function resolve(sel) {
    if (sel.value === "CLICK")
      return cur ? { id: "click", nom: cur.name, court: cur.name, md: cur.value, flux: true,
                     color: cur.color } : null;
    return refById[sel.value];
  }

  const SVG_HATCH = '<defs><pattern id="cmpHatch" width="7" height="7" patternTransform="rotate(45)" ' +
    'patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#E8ADBA"></rect>' +
    '<line x1="0" y1="0" x2="0" y2="7" stroke="#C13B55" stroke-width="4"></line></pattern></defs>';
  const fillFor = (it) => it.id === "deficit" ? "url(#cmpHatch)" : (it.color || (it.type === "unite" ? "#E8C9B8" : "#E8C9B8"));

  function renderCompare() {
    if (cmpPanel.hidden) return;
    let A = resolve(selA), B = resolve(selB);
    const out = document.getElementById("compare-body");
    if (!A || !B) { out.innerHTML = '<p class="cmp-sentence">Cliquez un bloc du Mondrian pour le comparer.</p>'; return; }

    // référence unitaire : conversion (toujours appliquée au côté « montant »)
    const uni = A.type === "unite" ? A : (B.type === "unite" ? B : null);
    if (uni) {
      const money = uni === A ? B : A;
      const n = money.md * 1e9 / uni.unite;
      out.innerHTML = '<p class="cmp-sentence"><b>' + esc(cap(money.court || money.nom)) + "</b> (" +
        fmt(money.md) + " Md€) ≈ <b>" + fmt0(n) + "</b> " + uni.plur +
        (uni.extra ? " " + esc(uni.extra(n)) : "") + ".</p>";
      return;
    }

    // — carrés proportionnels reliés + ratio —
    const k = 96 / Math.sqrt(Math.max(A.md, B.md));
    const sA = Math.max(12, Math.sqrt(A.md) * k), sB = Math.max(12, Math.sqrt(B.md) * k);
    const GAP = 96, PAD = 6, LABEL_H = 40;
    const H = Math.max(sA, sB) + 12, W = PAD + sA + GAP + sB + PAD;
    const yA = H - sA, yB = H - sB, xB = PAD + sA + GAP;
    const big = Math.max(A.md, B.md) / Math.min(A.md, B.md);
    const towardB = A.md < B.md;   // le multiple pointe vers le plus grand

    let svg = '<svg class="cmp-svg" width="' + W + '" height="' + (H + LABEL_H) +
      '" viewBox="0 0 ' + W + " " + (H + LABEL_H) + '">' + SVG_HATCH;
    const rect = (x, y, s, it) => '<rect x="' + x + '" y="' + y + '" width="' + s + '" height="' + s +
      '" rx="3" fill="' + fillFor(it) + '"' + (it.id === "deficit" ? ' stroke="#C13B55" stroke-width="2"' :
      ' stroke="rgba(0,0,0,.12)" stroke-width="1"') + "></rect>";
    svg += rect(PAD, yA, sA, A) + rect(xB, yB, sB, B);
    // liaisons + chevron/ratio
    svg += '<line x1="' + (PAD + sA) + '" y1="' + yA + '" x2="' + xB + '" y2="' + yB +
      '" stroke="#B0B4C0" stroke-width="1" stroke-dasharray="4 3"></line>';
    svg += '<line x1="' + (PAD + sA) + '" y1="' + H + '" x2="' + xB + '" y2="' + H +
      '" stroke="#B0B4C0" stroke-width="1" stroke-dasharray="4 3"></line>';
    const cx = PAD + sA + GAP / 2;
    svg += '<text x="' + cx + '" y="' + (H / 2 - 4) + '" text-anchor="middle" class="cmp-ratio">× ' +
      fmt2(big) + "</text>";
    svg += '<text x="' + cx + '" y="' + (H / 2 + 13) + '" text-anchor="middle" class="cmp-arrow">' +
      (towardB ? "→" : "←") + "</text>";
    const lbl = (x, w, it) => '<text x="' + (x + w / 2) + '" y="' + (H + 15) +
      '" text-anchor="middle" class="cmp-val">' + fmt(it.md) + " Md€</text>";
    svg += lbl(PAD, sA, A) + lbl(xB, sB, B) + "</svg>";

    out.innerHTML = '<div class="cmp-squares">' + svg + "</div>" +
      '<p class="cmp-sentence">' + phraseFor(A, B) + "</p>" +
      ((A.note || B.note) ? '<p class="cmp-note">' + esc(A.note || B.note) + "</p>" : "");
  }

  cmpBtn.addEventListener("click", () => {
    cmpPanel.hidden = !cmpPanel.hidden;
    cmpBtn.classList.toggle("active", !cmpPanel.hidden);
    renderCompare();
  });
  selA.addEventListener("change", renderCompare);
  selB.addEventListener("change", renderCompare);
  document.getElementById("compare-swap").addEventListener("click", () => {
    const a = selA.value; selA.value = selB.value; selB.value = a; renderCompare();
  });

  /* ============ switch de mode ============ */
  const modeToggle = document.getElementById("mode-toggle");
  function setMode(mode) {
    MODE = mode;
    document.body.dataset.mode = mode;
    modeToggle.checked = (mode === "officiel");
    history.replaceState(null, "", mode === "officiel" ? "#officiel" : "#realite");
    // setOption en fusion (structure identique) → animation de morphing native
    if (DATA_G) chart.setOption({ series: [{ data: build(DATA_G, mode) }] });
  }
  modeToggle.addEventListener("change", () => setMode(modeToggle.checked ? "officiel" : "realite", true));

  /* ============ boot ============ */
  function boot(DATA) {
    DATA_G = DATA;
    const c = (DATA.meta && DATA.meta.checks) || {};
    document.getElementById("statband").innerHTML =
      '<span class="stat stat-dep"><b>Dépenses</b> ' + fmt(c.depenses_totales) + " Md€</span>" +
      '<span class="stat-year">' + (DATA.meta || {}).exercice + "</span>";
    cur = { name: "Toutes les dépenses publiques", value: c.depenses_totales, color: "#5C7FB8" };

    chart.setOption({
      tooltip: {
        confine: true, backgroundColor: "#FFFFFF", borderColor: "#E4DCCB",
        textStyle: { color: "#1E2430" },
        formatter: (p) => {
          const tip = (p.data && p.data._tip) || "";
          return '<div class="sankey-tip"><div class="tip-title">' + esc(p.name) +
            '</div><div class="tip-value">' + fmt(p.value) + " Md€</div>" +
            (tip ? '<div class="tip-note">' + esc(tip) + "</div>" : "") +
            '<div class="tip-note">⚖ Cliquer sélectionne ce bloc pour le comparateur.</div></div>';
        },
      },
      series: [{
        type: "treemap", data: build(DATA, MODE), leafDepth: 2, roam: false,
        width: "100%", height: "94%", top: 30,
        animationDurationUpdate: 800, animationEasingUpdate: "cubicInOut",
        breadcrumb: { show: true, top: 2, left: "center",
          itemStyle: { color: "#1E2430", textStyle: { color: "#FAF6EF" } } },
        label: { show: true, formatter: (p) => p.name + "\n" + fmt(p.value) + " Md€",
          fontSize: 12, fontWeight: 700, overflow: "break" },
        upperLabel: { show: true, height: 22, fontSize: 12, fontWeight: 700 },
        itemStyle: { borderColor: "#FAF6EF", borderWidth: 2, gapWidth: 2 },
        emphasis: { focus: "ancestor" },
        levels: [
          { itemStyle: { borderColor: "#FAF6EF", borderWidth: 5, gapWidth: 5 } },
          { itemStyle: { borderColor: "#FAF6EF", borderWidth: 2, gapWidth: 2 } },
          { itemStyle: { gapWidth: 1 } },
        ],
      }],
    });

    chart.on("click", (p) => {
      if (p.data && p.value != null && !p.data._est) {
        cur = { name: p.name, value: Array.isArray(p.value) ? p.value[0] : p.value,
                color: (p.data.itemStyle && p.data.itemStyle.color) || p.color || "#5C7FB8" };
        if (typeof cur.color !== "string") cur.color = "#5C7FB8";   // motif hachuré → couleur neutre
        renderCompare();
      }
    });

    setMode(location.hash === "#officiel" ? "officiel" : "realite", false);
    renderCompare();
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
