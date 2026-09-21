/* ==========================================================================
 * Où va l'argent public ? — LE FIL (index.html)
 * --------------------------------------------------------------------------
 * Le récit en sept temps. Règle : aucun montant en dur dans la page — tout
 * vient de data/unified_finances.json (meta.chiffres, meta.retraites, flux,
 * historique) ; les valeurs écrites dans le HTML ne sont que des replis
 * lisibles avant le chargement. Six vignettes SVG, dessinées ici à l'échelle.
 * ========================================================================== */
(function () {
  "use strict";

  // fr-FR ne groupe pas les nombres à 4 chiffres (« 1300 ») : on force « 1 300 » (espace fine insécable)
  const group = (s) => s.replace(/\s/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  const loc = (v, d) => Number(v).toLocaleString("fr-FR", { maximumFractionDigits: d });
  const fx = (v, d) => { const t = loc(v, d), i = t.search(/[,]/); return i < 0 ? group(t) : group(t.slice(0, i)) + t.slice(i); };
  const f0 = (v) => fx(v, 0);
  const f1 = (v) => fx(v, 1);
  const f2 = (v) => fx(v, 2);
  const round100 = (v) => Math.round(v / 100) * 100;
  const signed = (v, d) => (v > 0 ? "+" : v < 0 ? "−" : "") + (d ? f1(Math.abs(v)) : f0(Math.abs(v)));
  const MOTS = { 2: "deux", 3: "trois", 4: "quatre", 5: "cinq", 6: "six", 7: "sept", 8: "huit", 9: "neuf", 10: "dix", 11: "onze", 12: "douze" };
  const set = (key, txt) => document.querySelectorAll('[data-ch="' + key + '"]').forEach((el) => { el.textContent = txt; });
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  // palette du site
  const C = { etat: "#3D6FB4", secu: "#D95970", pens: "#6E5BAE", cram: "#8E1B38", ct: "#D9A441",
              dette: "#4B4F58", cas: "#7E8494", ink: "#1E2430", soft: "#4A5265", faint: "#8A8F96",
              bg: "#FAF6EF", rule: "#E4DCCB", paper: "#FFFFFF" };
  const T = (x, y, txt, opt) => '<text x="' + x + '" y="' + y + '" font-size="' + (opt.s || 9) + '" fill="' + (opt.c || C.soft) + '"' +
    (opt.a ? ' text-anchor="' + opt.a + '"' : "") + (opt.w ? ' font-weight="' + opt.w + '"' : "") +
    (opt.f ? ' font-family="' + opt.f + '"' : "") + ">" + esc(txt) + "</text>";
  // étiquette posée sur un fond papier, ancrée à droite : lisible par-dessus une barre
  const TAG = (xEnd, y, txt, color, fs) => {
    const w = txt.length * fs * 0.56 + 8, h = fs + 5;
    return R(xEnd - w, y - h + 2, w, h, C.paper, ' rx="3" stroke="' + color + '" stroke-width=".6"') +
           T(xEnd - 4, y - 2, txt, { a: "end", s: fs, c: color, w: 600 });
  };
  const R = (x, y, w, h, fill, extra) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"' + (extra || "") + "/>";
  const SVG = (id, vbW, vbH, inner) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<svg viewBox="0 0 ' + vbW + " " + vbH + '" xmlns="http://www.w3.org/2000/svg" ' +
      'font-family="Helvetica Neue, Helvetica, Arial, sans-serif">' + inner + "</svg>";
  };

  function fill(d) {
    const meta = d.meta || {}, c = meta.checks || {}, ch = meta.chiffres || {}, r = meta.retraites || {};
    const dec = r.decomposition || {}, tp = dec.taux_prive || {}, four = ch.subvention_equilibre_fpe_fourchette || {};
    const L = d.links || [];
    const sum = (p) => L.filter(p).reduce((s, l) => s + l.value, 0);
    const drillLink = (view, target) => {
      const v = d.drill && d.drill[view];
      return v ? v.links.filter((l) => l.target === target).reduce((s, l) => s + l.value, 0) : 0;
    };

    const pens = ch.pensions_versees, cot = ch.cotisations, nc = ch.non_contributif;
    const pop = (ch.population_france || {}).millions, cotisants = ch.cotisants_millions;
    const dep = c.depenses_totales, rec = c.recettes_hors_dette, dette = c.dette;

    // ---- masthead / bandeau ----
    document.getElementById("exercice").textContent = meta.exercice || "2025";
    const hab = pop ? round100(dep * 1000 / pop) : null;
    document.getElementById("statband").innerHTML =
      '<span class="stat"><b>' + f1(dep) + " Md€</b> de dépenses publiques en " + (meta.exercice || "2025") + "</span>" +
      (hab ? '<span class="sep">·</span><span class="stat"><b>' + f0(hab) + " €</b> par habitant</span>" : "") +
      '<span class="sep">·</span><span class="stat">' + f1(rec) + " de recettes, " + f1(dette) + " empruntés</span>";

    // ---- chiffres transverses ----
    set("pensions", f0(pens)); set("pensions_1", f1(pens));
    set("cotisations", f0(cot));
    set("non_contributif", f0(nc)); set("non_contributif_1", f1(nc));
    set("depenses", f1(dep)); set("depenses_md", f0(round100(dep)));
    if (hab) set("hab", f0(hab));
    if (pop) set("pop", f1(pop));
    set("dette_un_sur", MOTS[Math.round(dep / dette)] || f0(Math.round(dep / dette)));
    if (ch.part_pib_pct) set("part_pib", f1(ch.part_pib_pct));
    if (ch.part_depenses_publiques_pct) set("part_dep", f1(ch.part_depenses_publiques_pct));
    if (ch.solde_systeme_2025 != null) set("solde", signed(ch.solde_systeme_2025, true));
    if (pop) set("nc_hab", f0(round100(nc * 1000 / pop)));
    if (cotisants) { set("nc_cot", f0(round100(nc * 1000 / cotisants))); set("pens_cot", f0(round100(pens * 1000 / cotisants))); set("cotisants", f1(cotisants)); }
    if (ch.retraites_droit_direct_millions) set("retraites_m", f1(ch.retraites_droit_direct_millions));
    const ratio = ch.ratio_cotisants_retraites || {};
    Object.keys(ratio).forEach((y) => set("ratio_" + y, f1(ratio[y])));

    // ---- temps 2 : les masses ----
    const sante = sum((l) => l.target === "Santé (maladie)");
    const ecole = drillLink("É · Enseignement & recherche", "Éducation nationale");
    const armee = drillLink("É · Défense, sécurité, justice", "Défense");
    const police = drillLink("É · Défense, sécurité, justice", "Police, gendarmerie & sécurité civile");
    const justice = drillLink("É · Défense, sécurité, justice", "Justice");
    const interets = sum((l) => l.target === "É · Charge de la dette");
    set("sante", f0(sante)); set("cinq", f0(ecole + armee + police + justice + interets));

    // ---- temps 3 : les caisses ----
    const etatTotal = (dec.contribution_etat || 0) + (dec.subventions_regimes_speciaux || 0);
    set("etat_total", f1(etatTotal)); set("contribution_etat", f0(dec.contribution_etat));
    set("regimes_speciaux", f0(dec.subventions_regimes_speciaux));
    set("itaf", f1(dec.itaf)); set("transferts", f1(dec.transferts_branches));
    set("solde_pf", f1((dec.deficit || 0) + (dec.divers || 0)));

    // ---- temps 4 : le taux ----
    const taux = ch.taux_cas_civils || {};
    const t26 = taux["2026"], tPriv = ch.taux_prive_employeur;
    if (t26) { set("taux_2026", f2(t26)); set("taux_2026_0", f0(t26)); }
    if (tPriv) set("taux_prive", f2(tPriv));
    if (ch.taux_cas_militaires) set("taux_mil", f2(ch.taux_cas_militaires));
    if (tp.part_etat_au_taux_prive) set("part_privee", f0(tp.part_etat_au_taux_prive));
    if (tp.surcotisation_etat_fpe) { set("surco", f0(tp.surcotisation_etat_fpe)); set("surco_1", f1(tp.surcotisation_etat_fpe)); }
    if (four.dg_budget_jaune_2026) set("dgb", f0(four.dg_budget_jaune_2026));
    if (four.cae) set("cae", f1(four.cae));

    // ---- temps 5 : l'enseignement supérieur ----
    const H = d.historique || {}, HM = H.missions || {};
    const esr = HM["Enseignement sup. & recherche (ESR)"], edu = HM["Éducation nationale"];
    if (esr && esr.cp) {
      const ys = Object.keys(esr.cp).sort(), y1 = ys[ys.length - 1], y0 = ys[0], yp = ys[ys.length - 2];
      const cas = esr.cas || {};
      const dcp = esr.cp[y1] - esr.cp[yp], dcas = (cas[y1] || 0) - (cas[yp] || 0), moyens = dcp - dcas;
      const cp5 = esr.cp[y1] - esr.cp[y0], cas5 = (cas[y1] || 0) - (cas[y0] || 0);
      set("esr_y1", y1);
      set("esr_dcp", (dcp < 0 ? "baisse de " : "augmente de ") + f1(Math.abs(dcp)) + " milliard" + (Math.abs(dcp) >= 2 ? "s" : ""));
      set("esr_dcas", (dcas < 0 ? "baisse de " : "augmente de ") + f1(Math.abs(dcas)));
      set("esr_moyens", f1(Math.abs(moyens)) + " milliard" + (Math.abs(moyens) >= 2 ? "s" : ""));
      set("esr_moyens_md", signed(moyens, true)); set("esr_dcp_s", signed(dcp, true)); set("esr_dcas_s", signed(dcas, true));
      set("esr_cas5", f1(cas5)); set("esr_cp5", f1(cp5));
      const part = cp5 > 0 ? cas5 / cp5 : 0;
      set("esr_part5", part < 0.2 ? "moins d'un cinquième" : part < 0.3 ? "un quart" : part < 0.4 ? "un tiers" :
                       part < 0.6 ? "la moitié" : f0(part * 100) + " %");
    }
    if (edu && edu.cp) {
      const ys = Object.keys(edu.cp).sort(), y1 = ys[ys.length - 1], yp = ys[ys.length - 2];
      set("edu_dcp", f0(edu.cp[y1] - edu.cp[yp])); set("edu_dcas", f1(((edu.cas || {})[y1] || 0) - ((edu.cas || {})[yp] || 0)));
    }

    // ---- temps 6a : cotisants par retraité (COR) précédés du régime général à ses débuts (Cnav)
    const rgHist = (ch.ratio_regime_general_historique || {}).serie || {};
    if (rgHist["1965"]) set("rg_1965", f1(rgHist["1965"]));
    svgT6(ratio, rgHist);
    // INSEE / SMPT (rapporté au salaire de l'époque), gardé en mémoire dans les textes
    const recupSmpt = (ch.taux_recuperation || {}).cotisations_seules || {};
    if (recupSmpt["1950"]) set("rect_1950", f2(recupSmpt["1950"]));
    if (recupSmpt["1980"]) set("rect_1980", f2(recupSmpt["1980"]));

    // ---- temps 6b : le taux de récupération PAR LA FORMULE (« compte d'une année »),
    // sans croissance des salaires. Passé : la pension versée, calculée avec les paramètres
    // de l'époque (actifs par retraité, taux de cotisation, part prise ailleurs, durées) ;
    // futur : paramètres constants — part financée par les 28 % de cotisations, et part
    // financée autrement à taux inchangé, montrées séparément.
    const TR = ch.taux_recuperation || {}, FM = TR.formule || {};
    const partCot = pens && cot ? cot / pens : 0;                      // 66 %
    const interp = (tbl, y) => {
      const ks = Object.keys(tbl).map(Number).sort((a, b) => a - b);
      if (!ks.length) return null;
      if (y <= ks[0]) return tbl[ks[0]];
      if (y >= ks[ks.length - 1]) return tbl[ks[ks.length - 1]];
      for (let i = 1; i < ks.length; i++) if (y <= ks[i]) {
        const a = ks[i - 1], b = ks[i];
        return tbl[a] + (tbl[b] - tbl[a]) * (y - a) / (b - a);
      }
      return null;
    };
    const ratioTbl = Object.assign({}, ratio);
    if (FM.ratio_1990_estime && !ratioTbl["1990"]) ratioTbl["1990"] = FM.ratio_1990_estime;
    const ratioAt = (y) => interp(ratioTbl, y);
    const tauxAt = (y) => (interp(FM.taux_cotisation_serie || { 2025: 28.1 }, y) || 28.1) / 100;
    const ncHist = (ch.part_non_contributive_historique || {}).ancres || {};
    const ncAt = (y) => { const v = interp(ncHist, y); return v == null ? 1 - partCot : v; };
    const tauxNow = tauxAt(2025), ncNow = 1 - partCot;
    const autreParActifNow = tauxNow * ncNow / (1 - ncNow);              // 14,7 % du salaire
    const gens = (FM.generations || []).map((G) => {
      const futur = G.depart > 2025, mid = G.depart + G.duree_retraite / 2;
      // taux moyen de la carrière : la série intégrée année par année, de l'entrée au départ
      let tsum = 0;
      for (let y = G.depart - G.duree_carriere; y < G.depart; y++) tsum += tauxAt(y);
      const cotise = tsum;                          // = taux moyen × années de carrière
      const r = ratioAt(mid) || 1.8;
      let vCot, vAut;
      if (futur) {                                    // paramètres constants
        vCot = r * tauxNow * G.duree_retraite / cotise;
        vAut = r * autreParActifNow * G.duree_retraite / cotise;
      } else {                                        // paramètres de l'époque, tout est « versé »
        const t = tauxAt(mid), nc = ncAt(mid);
        vCot = r * (t / (1 - nc)) * G.duree_retraite / cotise;
        vAut = 0;
      }
      return { g: G.naissance, futur: futur, cot: vCot, aut: vAut, tot: vCot + vAut, ratio: r };
    });
    gens.forEach((G) => {
      set("rec_" + G.g, f1(G.tot));
      if (G.futur) { set("cot_" + G.g, f2(G.cot)); set("aut_" + G.g, f2(G.aut)); set("tot_" + G.g, f2(G.tot)); }
    });
    set("autre_actif", f1(autreParActifNow * 100));
    svgT6b(gens);

    // ---- comparaisons sourcées (chapô, temps 7) ----
    const cac = (ch.comparaisons || {}).cac40_benefices_2025_md;
    if (cac) { const x = nc / cac; set("cac40_fois", x >= 1.9 ? "deux fois" : x >= 1.4 ? "une fois et demie" : x >= 1.15 ? "une fois et quart" : "près d'une fois"); }
  }

  /* ---------- temps 6 : deux panneaux, UN style ----------
   * viewBox 300 × H ; zone de tracé 0..PLOT (240), marge droite pour l'étiquette de
   * référence (« 1 retraité », « 1 € cotisé ») qui ne chevauche ainsi aucune barre ;
   * valeurs en sans 8,5 (clés : 10, encre), années en 7,5 ; légendes ≤ 88 caractères. */
  const T6 = { W: 300, PLOT: 236, base: 96, hMax: 60, bw: 24 };
  const refTag = (y, txt) => {                       // étiquette dans la marge droite, sur la ligne
    const x0 = T6.PLOT + 8;
    return R(x0, y - 7, T6.W - x0 - 4, 12, C.paper, ' rx="3" stroke="' + C.ink + '" stroke-width=".6"') +
           T(x0 + (T6.W - x0 - 4) / 2, y + 2.2, txt, { a: "middle", s: 6.6, c: C.ink, w: 700 });
  };
  const fxv = (v) => (v >= 2 ? v.toFixed(1) : v.toFixed(2).replace(/0$/, "")).replace(".", ",");

  /* 6a · cotisants pour un retraité : régime général à ses débuts (Cnav), puis tous régimes (COR) */
  function svgT6(ratio, rgHist) {
    const years = Object.keys(ratio).sort();
    if (!years.length) return;
    const hist = ["1965", "1970"].filter((y) => rgHist && rgHist[y]).map((y) => ({ y: y, v: rgHist[y], rg: true }));
    const cols = hist.concat(years.map((y, i) => ({ y: y, v: ratio[y], last: i === years.length - 1, now: i === 1 })));
    const W = T6.W, H = 126, colW = T6.PLOT / cols.length, bw = Math.min(T6.bw + 4, colW - 10);
    const vMax = Math.max.apply(null, cols.map((c) => c.v)), base = T6.base, sc = T6.hMax / vMax;
    const y1 = base - 1 * sc;
    let s = '<line x1="4" y1="' + y1 + '" x2="' + (T6.PLOT + 4) + '" y2="' + y1 + '" stroke="' + C.pens + '" stroke-width="1" stroke-dasharray="3 3"/>';
    cols.forEach((c, i) => {
      const x = i * colW + (colW - bw) / 2, h = c.v * sc, key = c.rg && i === 0 || c.now || c.last;
      s += R(x, base - h, bw, h, c.rg ? C.cas : C.etat, ' rx="2"' + (c.last ? ' opacity=".55"' : ""));
      s += T(x + bw / 2, base - h - 4, f1(c.v), { a: "middle", s: key ? 10 : 8.5, c: C.ink, w: 700 });
      s += T(x + bw / 2, base + 12, c.y, { a: "middle", s: 7.5, c: key ? C.ink : C.soft, w: key ? 700 : 400 });
      if (c.now) s += T(x + bw / 2, base + 21, "aujourd'hui", { a: "middle", s: 6.4, c: C.soft });
      if (c.last) s += T(x + bw / 2, base + 21, "projection", { a: "middle", s: 6.4, c: C.soft });
    });
    if (hist.length) {
      const xs = hist.length * colW;
      s += '<line x1="' + xs + '" y1="12" x2="' + xs + '" y2="' + (base + 24) + '" stroke="' + C.ink + '" stroke-width=".8" stroke-dasharray="2 2"/>';
      s += T(xs - 5, 9, "régime général (Cnav)", { a: "end", s: 6.4, c: C.soft }) + T(xs + 5, 9, "tous régimes (COR)", { s: 6.4, c: C.soft });
    }
    s += refTag(y1, "1 retraité");
    SVG("svg-t6", W, H, s);
  }

  /* 6b · € versés pour 1 € cotisé, par la formule : passé = une barre (pension versée,
   * paramètres de l'époque) ; futur = 28 % de cotisations (violet) + autrement, à taux
   * inchangé (hachures cramoisies) */
  function svgT6b(gens) {
    if (!gens.length) return;
    const W = T6.W, H = 152, colW = T6.PLOT / gens.length, bw = Math.min(T6.bw, colW - 6);
    const vMax = Math.max.apply(null, gens.map((G) => G.tot)), base = T6.base, sc = T6.hMax / vMax;
    let s = '<defs><pattern id="hachT6" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
            '<rect width="4" height="4" fill="' + C.paper + '"/><line x1="0" y1="0" x2="0" y2="4" stroke="' + C.cram + '" stroke-width="1.6"/></pattern></defs>';
    const y1 = base - 1 * sc;
    let xSplit = null;
    gens.forEach((G, i) => {
      const x = i * colW + (colW - bw) / 2, key = i === 0 || G.g === 1950 || G.g === 1980 || G.g === 2000;
      if (G.futur && xSplit == null) xSplit = i * colW;
      const hc = G.cot * sc, ha = G.aut * sc;
      s += R(x, base - hc, bw, hc, C.pens, ' rx="2"' + (key ? "" : ' opacity=".55"'));
      if (G.futur) s += R(x, base - hc - ha, bw, ha, "url(#hachT6)", ' rx="2" stroke="' + C.cram + '" stroke-width=".6"');
      s += T(x + bw / 2, base - hc - ha - 4, fxv(G.tot), { a: "middle", s: key ? 10 : 8.5, c: C.ink, w: 700 });
      if (G.futur) s += T(x + bw / 2, base - hc + 5.5, fxv(G.cot), { a: "middle", s: 6.2, c: C.paper, w: 700 });
      s += T(x + bw / 2, base + 12, String(G.g), { a: "middle", s: 7.5, c: key ? C.ink : C.soft, w: key ? 700 : 400 });
    });
    s += '<line x1="4" y1="' + y1 + '" x2="' + (T6.PLOT + 4) + '" y2="' + y1 + '" stroke="' + C.ink + '" stroke-width="1" stroke-dasharray="3 3"/>';
    s += refTag(y1, "1 € cotisé");
    if (xSplit != null) {
      s += '<line x1="' + xSplit + '" y1="12" x2="' + xSplit + '" y2="' + (base + 16) + '" stroke="' + C.ink + '" stroke-width=".8" stroke-dasharray="2 2"/>';
      s += T(xSplit - 5, 9, "à la retraite aujourd'hui", { a: "end", s: 6.4, c: C.soft }) + T(xSplit + 5, 9, "à paramètres constants", { s: 6.4, c: C.soft });
    }
    // légende : une ligne de pastilles, puis la formule en deux lignes courtes
    const ly = base + 25;
    s += R(4, ly - 6, 8, 6, C.pens) + T(15, ly, "financé par les 28 % de cotisations", { s: 6.2, c: C.ink }) +
         R(128, ly - 6, 8, 6, "url(#hachT6)", ' stroke="' + C.cram + '" stroke-width=".6"') +
         T(139, ly, "financé autrement, à taux inchangé", { s: 6.2, c: C.cram }) +
         T(4, ly + 10, "versé = actifs par retraité × (cotisation + part prise ailleurs) × années de retraite", { s: 6, c: C.soft }) +
         T(4, ly + 18, "cotisé = taux moyen de la carrière × années de carrière · sans croissance des salaires", { s: 6, c: C.soft });
    SVG("svg-t6b", W, H, s);
  }

  /* ---------- la scène : le vrai graphique, dans l'état du temps en cours ----------
   * Les deux outils sont embarqués (?embed=1) ; leur état est piloté par le hash
   * (sankey : #these / #poster / #dive=… ; treemap : #mode ou #mode:chemin/chemin).
   * Le temps 0 (la thèse) ouvre sur le Sankey en mode « thèse » — les flux cramoisis. */
  const STAGES = {
    0: { tool: "sankey",  hash: "#these",   title: "Les flux · ce qui finance les retraites sous un autre nom" },
    1: { tool: "sankey",  hash: "#poster",  title: "Les flux · d'où vient l'argent, où il va" },
    2: { tool: "treemap", hash: "#realite", title: "Les masses · ce que ça coûte vraiment" },
    3: { tool: "treemap", hash: "#realite:Retraites/Déséquilibre des retraites", title: "Les masses · d'où viennent les 145 milliards" },
    4: { tool: "treemap", hash: "#revele",  title: "Les masses · ce qui s'y cache" },
    5: { tool: "sankey",  hash: "#dive=Enseignement sup. & recherche (ESR)", title: "Les flux · enseignement supérieur et recherche, 2020 → 2025" },
    6: { tool: "svg",     hash: "",         title: "Moins de cotisants par retraité, moins versé pour 1 € cotisé" },
    7: { tool: "sankey",  hash: "#these",   title: "Les flux · ce qui finance les retraites sous un autre nom" },
  };
  const PAGES = { sankey: "sankey.html", treemap: "treemap.html" };
  const frames = { sankey: document.getElementById("stage-sankey"), treemap: document.getElementById("stage-treemap") };
  const stageSvg = document.getElementById("stage-svg");
  const stageTitle = document.getElementById("stage-title"), stageOpen = document.getElementById("stage-open");
  let stageCur = null;
  function setStage(t) {
    const st = STAGES[t];
    if (!st || stageCur === t) return;
    stageCur = t;
    if (stageTitle) stageTitle.textContent = st.title;
    Object.keys(frames).forEach((k) => { if (frames[k]) frames[k].hidden = st.tool !== k; });
    if (stageSvg) stageSvg.hidden = st.tool !== "svg";
    if (st.tool === "svg") { if (stageOpen) stageOpen.hidden = true; return; }
    const f = frames[st.tool];
    if (stageOpen) { stageOpen.hidden = false; stageOpen.href = PAGES[st.tool] + st.hash; }
    if (!f) return;
    try {
      const w = f.contentWindow;
      if (w && w.location && w.location.href !== "about:blank") {
        if (decodeURIComponent(w.location.hash || "") !== st.hash) w.location.hash = st.hash;
        // le cadre vient d'être montré : l'outil se redimensionne à sa taille réelle
        setTimeout(() => { try { w.dispatchEvent(new Event("resize")); } catch (e) { /* rien */ } }, 60);
      } else {
        f.src = PAGES[st.tool] + "?embed=1" + st.hash;
      }
    } catch (e) { f.src = PAGES[st.tool] + "?embed=1" + st.hash; }
  }

  /* ---------- rail 1-7 + scène : le temps courant ---------- */
  const rail = document.getElementById("fil-rail");
  if ("IntersectionObserver" in window) {
    const links = {};
    if (rail) rail.querySelectorAll("a[data-t]").forEach((a) => (links[a.dataset.t] = a));
    let pending = null;
    const io = new IntersectionObserver((entries) => {
      // tout en haut de la page, la scène reste sur la thèse (temps 0)
      if (window.scrollY < 40) { Object.values(links).forEach((a) => a.classList.toggle("is-current", a.dataset.t === "1")); return; }
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const t = e.target.id.replace("t", "");
        Object.values(links).forEach((a) => a.classList.toggle("is-current", a.dataset.t === t));
        clearTimeout(pending);
        pending = setTimeout(() => setStage(t), 120);   // un temps par geste de lecture, pas par pixel
      });
    }, { rootMargin: "-35% 0px -45% 0px", threshold: 0 });
    document.querySelectorAll(".temps[id], .masthead#t0").forEach((sec) => io.observe(sec));
    if (links["1"] && rail && !rail.querySelector(".is-current")) links["1"].classList.add("is-current");
  }
  setStage(0);

  /* ---------- partage ---------- */
  const shareBtn = document.getElementById("share-btn"), toast = document.getElementById("share-toast");
  if (shareBtn) shareBtn.addEventListener("click", () => {
    const data = { title: document.title, text: document.querySelector(".fil-these").textContent.trim(), url: location.href.split("#")[0] };
    if (navigator.share) { navigator.share(data).catch(() => {}); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(data.url) : Promise.reject())
      .then(() => { toast.hidden = false; setTimeout(() => { toast.hidden = true; }, 2200); })
      .catch(() => { prompt("Copier le lien :", data.url); });
  });

  fetch("data/unified_finances.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(fill)
    .catch(() => { /* les replis écrits dans la page restent affichés */ });
})();
