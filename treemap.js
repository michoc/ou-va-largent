/* ==========================================================================
 * Où va l'argent public ? — LE MONDRIAN des dépenses (treemap.html)
 * --------------------------------------------------------------------------
 * Rectangles proportionnels, MÊME donnée et MÊME granularité que le poster
 * Sankey (data/unified_finances.json : ministères → familles → missions →
 * programmes → actions, via DATA.drill).
 *
 * DEUX MODES (switch), tous deux additifs (somme ≈ 1 286,7 Md€). L'argent NON
 * CONTRIBUTIF des retraites (136) est un APLAT CRAMOISI #8E1B38 (jamais hachuré :
 * la hachure reste réservée aux « estimations ») :
 *   • « Réalité » (défaut) : administrations NETTES ; les 136 sont REGROUPÉS en
 *     un seul encart cramoisi (= exactement 136, borderWidth 0) dans le bloc
 *     « Retraites — 405 Md€ ».
 *   • « Tel que présenté » : les 136 sont DISPERSÉS en 4 blocs cramoisis logés
 *     dans les administrations (Ministères 51,9 = CAS Pensions agrégé · Sécu 12,9
 *     · Collectivités 8,8 = CNRACL · Impôts & dette 62,4) ; le bloc retraites ne
 *     montre alors que 331 « financés directement ».
 *   Au BASCULEMENT, une CHORÉGRAPHIE en 2 temps (fonction migrate(), surcouche de
 *   divs animées via Web Animations API — le `universalTransition` d'ECharts a été
 *   essayé puis retiré : il faisait dérailler les petits blocs sur treemap) :
 *   ① révélation : chaque part « devient cramoisie » DANS son bloc (voile couleur
 *   du budget hôte qui s'estompe) ; ② vol : les 4 rectangles quittent leurs blocs
 *   et se fondent dans l'encart 136 (et inversement : scission puis dispersion).
 *
 * COMPARATEUR (⚖) : deux emplacements interchangeables (déficit à gauche par
 * défaut, bloc cliqué à droite) ; carrés d'aires proportionnelles reliés, ratio
 * « × N », et une PHRASE générée (déterministe, zéro API) avec unités de temps.
 * ========================================================================== */

(function () {
  "use strict";

  const el = document.getElementById("treemap");
  const isPhone = () => window.innerWidth < 640;
  // sur mobile : bloc plus haut (aires plus lisibles, moins d'étiquettes tronquées)
  const stageH = () => isPhone()
    ? Math.round(Math.min(760, Math.max(560, window.innerHeight * 0.92)))
    : Math.max(560, Math.min(880, window.innerHeight * 0.80));
  el.style.height = stageH() + "px";
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
  const DEFICIT = "#8E1B38";                    // cramoisi = argent NON CONTRIBUTIF des retraites
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

  // couleur d'étiquette LISIBLE sur n'importe quel bloc : on mélange la couleur
  // (avec son alpha de profondeur) sur le fond crème et on choisit encre sombre
  // ou blanc selon la luminance perçue. Corrige les blancs illisibles sur les
  // blocs pâles (profondeurs élevées) et les rouges-sur-rouges.
  function inkFor(hex, a) {
    a = a == null ? 1 : a;
    const bg = [250, 246, 239];
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const L = [0.299, 0.587, 0.114].reduce((s, w, i) =>
      s + w * (c[i] * a + bg[i] * (1 - a)), 0);
    return L > 150 ? "#25292F" : "#FFFFFF";
  }

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
      "Tous les loyers versés en France ({n} fois le déséquilibre des retraites) ne le " +
      "financeraient que pendant environ {mois}.",
    "deficit|cdg":
      "Une année du déséquilibre des retraites équivaut à {n} porte-avions Charles de Gaulle.",
    "deficit|arnault":
      "Le déséquilibre annuel des retraites représente {n} fois la fortune de Bernard Arnault.",
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

  /* ============ étiquettes : wrap au mot ============ */
  // ECharts césure en plein mot (« Administr/ation ») : on replie NOUS-MÊMES
  // aux espaces (lignes ≤ 13 caractères), l'ellipsis ne gère que le reliquat.
  function wrapMot(name, max) {
    max = max || 13;
    const mots = String(name).split(" ");
    const lignes = [];
    let cur = "";
    mots.forEach((m) => {
      if (!cur) cur = m;
      else if ((cur + " " + m).length <= max) cur += " " + m;
      else { lignes.push(cur); cur = m; }
    });
    if (cur) lignes.push(cur);
    return lignes.join("\n");
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
        .replace("{mois}", fmtTemps(Math.min(A.md, B.md) / Math.max(A.md, B.md) * 12));
    }
    const parts = [];
    // phrase 1 : le multiple (« X représente N fois Y »)
    if (A.md >= B.md)
      parts.push("<b>" + esc(cap(A.court || A.nom)) + "</b> " + rep(A.court || A.nom) + " <b>" +
                 fmt2(A.md / B.md) + " fois</b> " + esc(B.court || B.nom) + ".");
    else
      parts.push("<b>" + esc(cap(B.court || B.nom)) + "</b> " + rep(B.court || B.nom) + " <b>" +
                 fmt2(B.md / A.md) + " fois</b> " + esc(A.court || A.nom) + ".");
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
      // pas de cap() après la virgule — le nom reste en minuscule dans la phrase
      parts.push("Chaque année, " + esc(small.court || small.nom) + " " + rep(small.court || small.nom) +
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
      label: { color: inkFor(color, alpha(depth + 1)) },
      upperLabel: { show: true, color: "#1E2430" },
      _tip: fmt(grouped[n]) + " Md€ de crédits votés" +
            (factor < 0.999 ? " (net des sommes re-versées aux retraites)." : "."),
    })).sort((a, b) => b.value - a.value);
  }

  // valeurs des 4 parts migrantes (remplies par build, servent à découper
  // l'encart lors de la dispersion) + teinte « fantôme » pendant le vol
  let MIG_SRC = [];
  const PALE = "#DCB4BF";

  function build(DATA, mode, opts) {
    opts = opts || {};
    const ghost = !!opts.ghost;                 // cible(s) estompée(s) pendant le vol
    const nodeColor = {}; DATA.nodes.forEach((n) => (nodeColor[n.name] = n.color));
    const L = DATA.links;
    const sum = (p) => L.filter(p).reduce((s, l) => s + l.value, 0);
    const official = mode === "officiel";
    // pendant le vol de regroupement, l'ENCART cible du nouveau layout est
    // estompé (couleur pâle, sans étiquette) puis révélé à l'arrivée des flyers
    const migColor = ghost ? PALE : DEFICIT;
    const migLabel = (extra) => ghost ? { show: false } : Object.assign({ color: "#FFFFFF" }, extra || {});

    const versePens = {};
    L.filter((l) => l.target === PENS && l.source.indexOf("É · ") === 0)
      .forEach((l) => (versePens[l.source] = (versePens[l.source] || 0) + l.value));

    // — Ministères de l'État —
    // « Tel que présenté » = CAMOUFLAGE fidèle aux documents budgétaires : chaque
    // famille est affichée BRUTE, sa contribution CAS logée dedans en enfant de
    // la MÊME couleur que le budget (indistinguable — c'est le maquillage ; le
    // nom n'apparaît qu'en plongeant ou en infobulle). AUCUN bloc cramoisi en
    // statique : le cramoisi n'existe que pendant la chorégraphie de bascule.
    // « Réalité » = familles NETTES. MIG_SRC = où « vivent » les parts (pour la
    // révélation/le vol) : bandes ∝ vp/brut dans les familles + 3 nœuds exacts.
    const familles = [];
    const migSrc = [];
    let totalVp = 0;
    L.filter((l) => l.source === "État (budget général)" && l.target.indexOf("É · ") === 0)
      .forEach((l) => {
        const fam = l.target, vp = versePens[fam] || 0, court = fam.replace("É · ", "");
        totalVp += vp;
        const factor = (l.value - vp) / l.value;
        const kids = kidsOf(DATA, fam, factor, nodeColor[fam], 1) || [];
        if (official && vp > 0.01)
          kids.push({ name: "Contribution retraites (CAS Pensions)", value: Math.round(vp * 100) / 100,
            itemStyle: { color: nodeColor[fam] }, label: { color: inkFor(nodeColor[fam]) }, _est: true,
            _tip: "≈ " + fmt(vp) + " Md€ présentés comme une dépense de cette famille, mais versés " +
                  "au CAS Pensions : ils financent en réalité les retraites." });
        if (vp > 0.01) migSrc.push({ type: "strip", host: court, frac: vp / l.value, value: vp });
        familles.push({
          name: court, children: kids,
          itemStyle: { color: nodeColor[fam] }, upperLabel: { show: true, color: "#1E2430" },
          _tip: official
            ? fmt(l.value) + " Md€ de crédits votés (bruts), dont ≈ " + fmt(vp) +
              " Md€ de contribution retraites (CAS Pensions) fondue dans le total."
            : fmt(l.value - vp) + " Md€ de crédits votés, nets des " + fmt(vp) +
              " Md€ re-versés aux retraites (CAS Pensions).",
        });
      });

    // — Sécurité sociale (branches ± transfert retraites) —
    const secuTr = sum((l) => l.source === SECU_N && l.target.indexOf("Régimes") === 0);
    const branches = L.filter((l) => l.source === SECU_N && l.target !== PENS &&
                                     l.target.indexOf("Régimes") !== 0)
      .map((l) => ({
        name: l.target, children: kidsOf(DATA, l.target, 1, nodeColor[l.target], 1),
        value: DATA.drill[l.target] ? undefined : l.value,
        itemStyle: { color: nodeColor[l.target] }, label: { color: inkFor(nodeColor[l.target]) },
        upperLabel: { show: true, color: "#1E2430" },
      }));
    if (official && secuTr > 0.01)
      // camouflé : même rose que la Sécu — comme dans la présentation officielle
      branches.push({ name: "Transferts entre branches", value: Math.round(secuTr * 100) / 100,
        itemStyle: { color: COL.secu }, label: { color: inkFor(COL.secu) }, _est: true,
        _tip: "≈ " + fmt(secuTr) + " Md€ de transferts des autres branches vers la vieillesse : " +
              "de l'argent Sécu qui finance en réalité les retraites." });
    const secu = { name: "Sécurité sociale", children: branches,
      itemStyle: { color: COL.secu }, upperLabel: { show: true, color: "#1E2430" },
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
              itemStyle: { color: COL.ct }, label: { color: inkFor(COL.ct) } },
            { name: "CNRACL", value: Math.round(cnracl * 100) / 100,
              itemStyle: { color: COL.ct }, label: { color: inkFor(COL.ct), fontSize: 11 }, _est: true,
              _tip: "≈ " + fmt(cnracl) + " Md€ de surcotisations retraites (CNRACL) des agents " +
                    "territoriaux et hospitaliers, fondues dans le budget des collectivités." },
          ], upperLabel: { show: true, color: "#1E2430" } }
      : { name: "Collectivités territoriales", value: Math.round((ctIn - cnracl) * 100) / 100,
          itemStyle: { color: COL.ct }, label: { color: inkFor(COL.ct) },
          _tip: "Fractions de TVA + prélèvements sur recettes, nets des surcotisations CNRACL (retraites)." };

    // — Retraites —
    const cot = sum((l) => l.target === SYST && l.source.indexOf("Cotisations retraites") === 0);
    const impots = sum((l) => l.target === SYST && l.source.indexOf("Cotisations retraites") !== 0);
    let retraites;
    // MIG_SRC : où « vivent » les parts non contributives dans le layout OFFICIEL
    // (bandes ∝ dans les familles + 3 nœuds rendus) — rempli dans les DEUX modes
    // pour que la chorégraphie connaisse valeurs et positions dans chaque sens.
    migSrc.push({ type: "node", host: "Transferts entre branches", value: secuTr });
    migSrc.push({ type: "node", host: "CNRACL", value: cnracl });
    migSrc.push({ type: "node", host: "Impôts affectés & dette", value: impots });
    MIG_SRC = migSrc;
    if (official) {
      retraites = { name: "Retraites — financées directement (331 Md€)",
        itemStyle: { color: COL.pens }, upperLabel: { show: true, color: "#1E2430" },
        _tip: "Les retraites coûtent 405 Md€. N'apparaissent ici que les 331 financés « en direct » " +
              "(cotisations, impôts affectés, dette). Les 74 Md€ restants sont fondus dans les budgets " +
              "des ministères, de la Sécu et des collectivités : le maquillage comptable.",
        children: [
          { name: "Cotisations", value: Math.round(cot * 100) / 100,
            itemStyle: { color: COL.pens }, label: { color: inkFor(COL.pens) } },
          // camouflé (rose pâle, comme la présentation) — c'est pourtant de
          // l'argent NON CONTRIBUTIF : il rejoindra le 136 au basculement.
          { name: "Impôts affectés & dette", value: Math.round(impots * 100) / 100,
            itemStyle: { color: COL.pens, colorAlpha: 0.7 }, label: { color: inkFor(COL.pens, 0.7) },
            _tip: "CSG-FSV, fractions de TVA et impôts affectés à la vieillesse, dette : non contributif." },
        ] };
    } else {
      // — bloc RETRAITES : UN SEUL bloc de 405 Md€, dans lequel le DÉSÉQUILIBRE
      //   (136) est une zone rouge INTÉGRÉE, identifiable et cliquable. Les
      //   cotisations (269) prennent la couleur du bloc → on lit « 405, dont 136
      //   en rouge » plutôt que deux rectangles concurrents. Le détail du 136
      //   passe en infobulle (plus de sous-tuiles rouge-sur-rouge illisibles).
      const minCAS = sum((l) => l.target === PENS && l.source.indexOf("É · ") === 0);
      const deficit = Math.round((impots + minCAS + cnracl + secuTr) * 10) / 10;
      const brk = "Écart entre 269 Md€ de cotisations et 405 Md€ de pensions, comblé sans " +
        "cotisation par : impôts affectés & dette " + fmt(impots) + " · subventions d'équilibre " +
        "des ministères (CAS Pensions) " + fmt(minCAS) + " · CNRACL " + fmt(cnracl) +
        " · transferts Sécu " + fmt(secuTr) + ". Part non contributive.";
      // Le déséquilibre = APLAT plein cramoisi (pas de hachure : réservée aux
      // estimations). borderWidth 0 → le CRAMOISI SEUL = exactement 136 (aire
      // proportionnelle honnête) ; une légère ombre le décolle du bloc « pensions ».
      retraites = { name: "Retraites — 405 Md€",
        itemStyle: { color: COL.pens, gapWidth: 0 }, upperLabel: { show: true, color: "#1E2430" },
        _tip: "405 Md€ de pensions versées (tous régimes). Les cotisations n'en couvrent que 269 : " +
              "il manque 136 Md€ (la zone cramoisie).",
        children: [
          { name: "Financé par les cotisations", value: Math.round(cot * 100) / 100,
            itemStyle: { color: COL.pens, borderColor: COL.pens, borderWidth: 0, gapWidth: 0 },
            label: { color: inkFor(COL.pens) },
            _tip: "269 Md€ de cotisations vieillesse tous régimes (≈ 2/3 des ressources — COR)." },
          { name: "Déséquilibre des retraites", value: deficit,
            itemStyle: { color: migColor, borderColor: migColor, borderWidth: 0, gapWidth: 0,
              shadowBlur: ghost ? 0 : 12, shadowColor: "rgba(74,10,26,.40)" },
            label: migLabel({ fontWeight: 800 }), _tip: brk },
        ] };
    }

    return [
      { name: "Ministères de l'État", children: familles, itemStyle: { color: COL.etat },
        upperLabel: { show: true, color: "#1E2430" },
        _tip: "Budget général : familles → missions → programmes → actions (mêmes plongées que le poster)." +
              (official ? " Brut — les contributions retraites (CAS Pensions) sont fondues dans chaque famille."
                        : " Net des re-fléchages retraites.") },
      secu, retraites, ct,
      { name: "Union européenne", value: Math.round(ue * 100) / 100,
        itemStyle: { color: COL.ue }, label: { color: inkFor(COL.ue) },
        _tip: "Prélèvement sur recettes au profit de l'Union européenne." },
    ];
  }

  /* ============ comparateur (affiché en permanence, en tête de page) ============ */
  let cur = null, DATA_G = null, MODE = "realite";
  const cmpPanel = document.getElementById("compare-panel");
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
      // « court » sert dans les phrases : article + guillemets pour la grammaire
      return cur ? { id: "click", nom: cur.name,
                     court: cur.court || "le bloc « " + cur.name + " »",
                     md: cur.value, flux: true, color: cur.color } : null;
    return refById[sel.value];
  }

  const SVG_HATCH = '<defs><pattern id="cmpHatch" width="7" height="7" patternTransform="rotate(45)" ' +
    'patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#E8ADBA"></rect>' +
    '<line x1="0" y1="0" x2="0" y2="7" stroke="#C13B55" stroke-width="4"></line></pattern></defs>';
  // le déficit = aplat cramoisi partout (cohérent avec l'encart du Mondrian)
  const fillFor = (it) => it.id === "deficit" ? "#8E1B38" : (it.color || "#E8C9B8");

  function renderCompare() {
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

  selA.addEventListener("change", renderCompare);
  selB.addEventListener("change", renderCompare);
  document.getElementById("compare-swap").addEventListener("click", () => {
    const a = selA.value; selA.value = selB.value; selB.value = a; renderCompare();
  });

  /* ============ switch de mode + chorégraphie de migration ============
   * Bascule en DEUX TEMPS (surcouche de divs animées — le morphing auto
   * d'ECharts déraille sur treemap) :
   *   officiel → réalité : ① chaque part « devient cramoisie » DANS son bloc
   *   (un voile couleur du budget hôte s'estompe) ; ② les 4 rectangles QUITTENT
   *   leurs blocs et volent se fondre dans l'encart 136.
   *   réalité → officiel : l'encart se scinde en 4 et vole vers les budgets. */
  const modeToggle = document.getElementById("mode-toggle");
  const stageEl = document.getElementById("chart-stage");
  let migrating = false;

  const MIG_TARGET = "Déséquilibre des retraites";

  function layoutsOf(names) {
    const map = {};
    chart.getModel().getSeriesByIndex(0).getData().tree.root.eachNode((n) => {
      const l = names.indexOf(n.name) !== -1 && n.getLayout();
      if (l && l.width > 0.5) map[n.name] = { x: l.x, y: l.y, w: l.width, h: l.height };
    });
    return map;
  }
  // positions des parts non contributives dans le layout OFFICIEL courant :
  // bandes verticales à droite des familles (∝ vp/brut) + 3 nœuds rendus
  function migRects(off) {
    const strips = MIG_SRC.filter((s) => s.type === "strip");
    const nodes = MIG_SRC.filter((s) => s.type === "node");
    const lay = layoutsOf(strips.map((s) => s.host).concat(nodes.map((s) => s.host)));
    const out = [];
    strips.forEach((s) => {
      const r = lay[s.host];
      if (r) out.push({ value: s.value,
        rect: { x: r.x + r.w * (1 - s.frac) + off.x, y: r.y + off.y, w: r.w * s.frac, h: r.h } });
    });
    nodes.forEach((s) => {
      const r = lay[s.host];
      if (r) out.push({ value: s.value, rect: { x: r.x + off.x, y: r.y + off.y, w: r.w, h: r.h } });
    });
    return out.sort((a, b) => b.value - a.value);
  }
  function mkGhost(r, color, label) {
    const d = document.createElement("div");
    d.className = "mig-ghost";
    d.style.cssText = "position:absolute;z-index:4;pointer-events:none;border-radius:2px;" +
      "display:flex;align-items:center;justify-content:center;overflow:hidden;" +
      "box-shadow:0 3px 14px rgba(74,10,26,.35);" +
      "font:700 11px " + '"Helvetica Neue",Helvetica,Arial,sans-serif' + ";color:#fff;" +
      "left:" + r.x + "px;top:" + r.y + "px;width:" + r.w + "px;height:" + r.h + "px;" +
      "background:" + color + ";";
    if (label && r.w > 42 && r.h > 20) d.textContent = label;
    stageEl.appendChild(d);
    return d;
  }
  const rectOf = (l, off) => ({ x: l.x + off.x, y: l.y + off.y, w: l.w, h: l.h });

  function migrate(to) {
    migrating = true;
    const off = { x: el.offsetLeft, y: el.offsetTop };
    const ghosts = [];
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      ghosts.forEach((g) => g.remove());
      chart.setOption({ series: [{ data: build(DATA_G, to), animationDurationUpdate: 350 }] });
      migrating = false;
    };
    setTimeout(finish, 4200);                          // garde-fou (onglet en arrière-plan…)
    const FLY = { duration: 1000, easing: "cubic-bezier(.45,.05,.2,1)", fill: "forwards" };
    const css = (r) => ({ left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
    const curRect = (f) => ({ x: f.offsetLeft, y: f.offsetTop, w: f.offsetWidth, h: f.offsetHeight });

    if (to === "realite") {
      /* ---- RÉVÉLATION puis REGROUPEMENT ---- */
      // ① fond IMMOBILE : les parts cachées « deviennent cramoisies » dans leurs
      //    blocs d'origine (fondu d'apparition in situ, 800 ms)
      const flyers = migRects(off).map((s) => {
        const f = mkGhost(s.rect, DEFICIT, fmt(s.value));
        f.style.opacity = "0";
        f.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 800, easing: "ease-out", fill: "forwards" });
        ghosts.push(f);
        return f;
      });
      // ② vol : les rectangles quittent leurs blocs pendant que le fond se
      //    réarrange VITE (450 ms) — l'encart cible reste estompé jusqu'à l'arrivée
      setTimeout(() => {
        chart.setOption({ series: [{ data: build(DATA_G, to, { ghost: true }), animationDurationUpdate: 450 }] });
        setTimeout(() => {
          const t = layoutsOf([MIG_TARGET])[MIG_TARGET];
          if (!t) { finish(); return; }
          const dst = css(rectOf(t, off));
          let done = 0;
          flyers.forEach((f, i) => {
            const a = f.animate([css(curRect(f)), dst], Object.assign({ delay: i * 70 }, FLY));
            a.onfinish = () => { if (++done === flyers.length) finish(); };
          });
        }, 80);
      }, 900);
    } else {
      /* ---- SCISSION puis CAMOUFLAGE : l'encart se découpe en bandes ∝ qui
         volent chacune s'enfouir dans son budget, puis s'y fondent ---- */
      const t = layoutsOf([MIG_TARGET])[MIG_TARGET];
      if (!t) { finish(); return; }
      // il faut le détail des parts : build(officiel) remplit MIG_SRC
      const officialData = build(DATA_G, to);
      const parts = MIG_SRC.slice().sort((a, b) => b.value - a.value);
      const total = parts.reduce((s, p) => s + p.value, 0) || 1;
      const flyers = {};
      let cx = t.x + off.x;
      parts.forEach((p) => {
        const w = Math.max(2, (t.w * p.value) / total);
        flyers[p.host] = mkGhost({ x: cx, y: t.y + off.y, w: w, h: t.h }, DEFICIT, fmt(p.value));
        ghosts.push(flyers[p.host]);
        cx += w;
      });
      // le fond bascule vite vers le layout officiel (camouflé, sans cramoisi)
      chart.setOption({ series: [{ data: officialData, animationDurationUpdate: 450 }] });
      setTimeout(() => {
        const dsts = migRects(off);                    // positions dans le NOUVEAU layout
        // ré-associe par valeur (hôtes triés pareil des deux côtés)
        const sorted = parts.map((p) => flyers[p.host]);
        let done = 0, count = 0;
        dsts.forEach((d, i) => {
          const f = sorted[i];
          if (!f) return;
          count++;
          const a = f.animate([css(curRect(f)), css(d.rect)], Object.assign({ delay: i * 70 }, FLY));
          a.onfinish = () => {
            // arrivée : la part se CAMOUFLE (fondu de disparition dans le budget)
            const fade = f.animate([{ opacity: 1 }, { opacity: 0 }],
              { duration: 450, easing: "ease-in", fill: "forwards" });
            fade.onfinish = () => { if (++done === count) finish(); };
          };
        });
        if (!count) finish();
      }, 80);
    }
  }

  function setMode(mode, animate) {
    if (migrating) { modeToggle.checked = (MODE === "realite"); return; }
    const changed = mode !== MODE;
    MODE = mode;
    document.body.dataset.mode = mode;
    // curseur À DROITE (= checked) sur le libellé de droite « …finance les
    // retraites » = mode réalité ; à gauche « tel que présenté » = officiel.
    modeToggle.checked = (mode === "realite");
    history.replaceState(null, "", mode === "officiel" ? "#officiel" : "#realite");
    if (!DATA_G) return;
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!changed || animate === false || reduced) {
      chart.setOption({ series: [{ data: build(DATA_G, mode) }] });
      return;
    }
    migrate(mode);
  }
  modeToggle.addEventListener("change", () => setMode(modeToggle.checked ? "realite" : "officiel"));

  /* ============ boot ============ */
  function boot(DATA) {
    DATA_G = DATA;
    const c = (DATA.meta && DATA.meta.checks) || {};
    document.getElementById("statband").innerHTML =
      '<span class="stat stat-dep"><b>Dépenses</b> ' + fmt(c.depenses_totales) + " Md€</span>" +
      '<span class="stat-year">' + (DATA.meta || {}).exercice + "</span>";
    cur = { name: "Ensemble des dépenses publiques", court: "l'ensemble des dépenses publiques",
            value: c.depenses_totales, color: "#5C7FB8" };

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
        type: "treemap", name: "Vue d'ensemble", data: build(DATA, MODE), leafDepth: 2, roam: false,
        width: "100%", height: "94%", top: 30,
        // sur mobile, on masque les tuiles trop petites (étiquettes illisibles)
        visibleMin: isPhone() ? 24 : 8,
        // NB : universalTransition (morphing auto) fait dérailler les petits blocs
        // sur treemap (CNRACL 8,8 partait en vol aberrant) → transition par défaut,
        // propre ; la continuité de couleur (cramoisi) + la légende racontent la migration.
        animationDurationUpdate: 750, animationEasingUpdate: "cubicOut",
        // fil d'ariane discret, intégré au fond crème (pastille papier, survol jaune)
        breadcrumb: { show: true, top: 6, left: "center", height: 24, itemGap: 6, emptyItemWidth: 4,
          itemStyle: { color: "#FBF7EE", borderColor: "#E4DCCB", borderWidth: 1, borderRadius: 999,
            shadowBlur: 4, shadowColor: "rgba(30,36,48,.08)",
            textStyle: { color: "#4A5265", fontSize: 12, fontWeight: 700 } },
          emphasis: { itemStyle: { color: "#F5E663",
            textStyle: { color: "#1E2430" } } } },
        // wrap MANUEL au mot (l'overflow d'ECharts césure en plein mot) + « … »
        label: { show: true, formatter: (p) => wrapMot(p.name) + "\n" + fmt(p.value) + " Md€",
          fontSize: 12, fontWeight: 700, overflow: "truncate", ellipsis: "…" },
        // ⚠ l'upperLabel HÉRITE du label : formatter une-ligne explicite sinon
        // les noms de groupes n'affichent que la 1re ligne du wrap
        upperLabel: { show: true, height: 22, fontSize: 12, fontWeight: 700, color: "#1E2430",
          formatter: (p) => p.name, overflow: "truncate", ellipsis: "…" },
        itemStyle: { borderColor: "#FAF6EF", borderWidth: 2, gapWidth: 2 },
        emphasis: { focus: "ancestor" },
        // ⚠ levels[0] = RACINE VIRTUELLE (pas le 1er niveau de données) :
        // on y masque le label hérité du nom de série (breadcrumb seulement)
        levels: [
          { upperLabel: { show: false }, label: { show: false },
            itemStyle: { borderWidth: 0, gapWidth: 0 } },
          { itemStyle: { borderColor: "#FAF6EF", borderWidth: 5, gapWidth: 5 },
            upperLabel: { show: true, color: "#1E2430", fontWeight: 800 } },
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

    // défaut = « budget tel qu'il finance les retraites » (réalité), sauf hash
    // explicite — sans chorégraphie au chargement (animate: false)
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

  window.addEventListener("resize", () => {
    el.style.height = stageH() + "px";
    // le seuil de tuiles visibles dépend du format → on reconstruit au besoin
    if (DATA_G) chart.setOption({ series: [{ visibleMin: isPhone() ? 24 : 8 }] });
    chart.resize();
  });
})();
