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
      "<b>" + f1(dep) + " Md€</b> de dépenses publiques en " + (meta.exercice || "2025") +
      (hab ? '<span class="sep">·</span><b>' + f0(hab) + " €</b> par habitant" : "") +
      '<span class="sep">·</span>' + f1(rec) + " de recettes, " + f1(dette) + " empruntés";

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
      const cotise = (G.taux_moyen_carriere_pct / 100) * G.duree_carriere;
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
  }

  /* ---------- 1 · recettes et emprunt ---------- */
  function svgT1(rec, dette, dep) {
    const W = 300, x0 = 16, w = 268, wr = Math.round(w * rec / dep), wd = w - wr;
    SVG("svg-t1", W, 96,
      R(x0, 30, wr, 26, C.etat, ' opacity=".8"') +
      R(x0 + wr, 30, wd, 26, "none", ' stroke="' + C.dette + '" stroke-width="1.5" stroke-dasharray="3 2"') +
      T(x0 + 6, 47, "recettes " + f0(100 * rec / dep) + " %", { c: "#fff", s: 10, w: 600 }) +
      T(x0 + w, 24, "emprunt " + f0(100 * dette / dep) + " %", { a: "end", s: 8.5 }) +
      T(x0 + w, 70, "l'argent qu'on n'a pas", { a: "end", s: 8, c: C.cram }) +
      T(x0, 86, "1 euro sur " + Math.round(dep / dette) + " est emprunté", { s: 8.5, c: C.faint }));
  }

  /* ---------- 2 · trois masses ---------- */
  function svgT2(pens, sante, p) {
    const W = 300, x0 = 104, wmax = 176, sc = wmax / pens;
    const cinq = p.ecole + p.armee + p.police + p.justice + p.interets;
    let s = "";
    s += R(x0, 14, Math.round(pens * sc), 18, C.pens) + T(10, 27, "Retraites", {}) + T(x0 + pens * sc - 4, 27, f0(pens), { a: "end", c: "#fff", w: 600 });
    s += R(x0, 42, Math.round(sante * sc), 18, C.secu, ' opacity=".8"') + T(10, 55, "Assurance maladie", {}) + T(x0 + sante * sc - 4, 55, f0(sante), { a: "end", c: "#fff" });
    // barre empilée : école, armée, police, justice, intérêts (pointillé)
    const segs = [["école", p.ecole, .9], ["armée", p.armee, .7], ["police", p.police, .55], ["justice", p.justice, .42]];
    let x = x0;
    segs.forEach((sg) => { const ww = sg[1] * sc; s += R(x, 70, ww, 18, C.etat, ' opacity="' + sg[2] + '"'); x += ww; });
    s += R(x, 70, p.interets * sc, 18, "none", ' stroke="' + C.dette + '" stroke-width="1.2" stroke-dasharray="2 2"');
    s += T(10, 79, "École, armée, police,", {}) + T(10, 89, "justice, intérêts de la dette", {}) + T(x0 + cinq * sc + 5, 83, f0(cinq), { c: C.ink, w: 600 });
    s += T(10, 108, "école " + f0(p.ecole) + " · armée " + f0(p.armee) + " · police " + f0(p.police) + " · justice " + f0(p.justice) +
           " · intérêts de la dette " + f0(p.interets) + " (pointillé)", { s: 7.5, c: C.faint });
    SVG("svg-t2", W, 118, s);
  }

  /* ---------- 3 · versé, cotisé, l'écart ---------- */
  function svgT3(pens, cot, nc, pop) {
    const W = 300, x0 = 40, wmax = 240, sc = wmax / pens, wc = cot * sc;
    SVG("svg-t3", W, 110,
      R(x0, 18, wmax, 22, C.pens) + T(x0 + 6, 33, "VERSÉ " + f0(pens), { c: "#fff", s: 10, w: 600 }) +
      R(x0, 52, wc, 22, C.pens, ' opacity=".38"') + T(x0 + 6, 67, "COTISÉ " + f0(cot), { c: C.ink, s: 10 }) +
      R(x0 + wc, 52, wmax - wc, 22, C.cram) +
      '<line x1="' + (x0 + wc) + '" y1="48" x2="' + (x0 + wc) + '" y2="88" stroke="' + C.cram + '" stroke-width="1" stroke-dasharray="2 2"/>' +
      '<line x1="' + (x0 + wmax) + '" y1="48" x2="' + (x0 + wmax) + '" y2="88" stroke="' + C.cram + '" stroke-width="1" stroke-dasharray="2 2"/>' +
      T(x0 + wc + (wmax - wc) / 2, 67, f0(nc), { a: "middle", c: "#fff", s: 10, w: 700 }) +
      (pop ? T(x0 + wc + (wmax - wc) / 2, 100, f0(round100(nc * 1000 / pop)) + " € par habitant", { a: "middle", s: 8.5, c: C.cram }) : ""));
  }

  /* ---------- 4 · le taux employeur ---------- */
  function svgT4(taux, tPriv) {
    const W = 300, base = 124, hmax = 54;
    const T2006 = 49.9;                       // taux à la création du CAS (LOLF, 2006)
    const bars = [["2006", T2006], ["2013-24", taux["2024"]], ["2025", taux["2025"]], ["2026", taux["2026"]]].filter((b) => b[1]);
    const top = Math.max.apply(null, bars.map((b) => b[1]).concat([tPriv || 0]));
    let s = T(12, 16, "Cotisation retraite payée par l'EMPLOYEUR", { s: 9, w: 600, c: C.ink }) +
            T(12, 27, "en % de la paie de l'agent (traitement indiciaire / salaire brut)", { s: 8 }) +
            '<line x1="12" y1="' + base + '" x2="288" y2="' + base + '" stroke="' + C.rule + '"/>' +
            T(34, 44, "L'ÉTAT, pour ses fonctionnaires civils", { s: 8, c: C.cram, w: 600 });
    bars.forEach((b, i) => {
      const h = hmax * b[1] / top, x = 34 + i * 32;
      s += R(x, base - h, 24, h, C.cram) + T(x + 12, base - h - 4, f1(b[1]) + " %", { a: "middle", s: 8.5, c: C.cram, w: 600 }) +
           T(x + 12, base + 12, b[0], { a: "middle", s: 8 });
    });
    if (tPriv) {
      const h = hmax * tPriv / top;
      s += T(240, 44, "UN EMPLOYEUR PRIVÉ", { s: 8, w: 600, a: "middle" }) + R(228, base - h, 24, h, C.dette) +
           T(240, base - h - 4, f1(tPriv) + " %", { a: "middle", s: 8.5, c: C.ink, w: 600 }) + T(240, base + 12, "2026", { a: "middle", s: 8 });
    }
    SVG("svg-t4", W, 140, s);
  }

  /* ---------- 5 · l'enseignement supérieur, six ans ---------- */
  function svgT5(e) {
    const W = 300, base = 100, hmax = 58, top = Math.max.apply(null, e.ys.map((y) => e.cp[y]));
    let s = T(24, 18, "Enseignement sup. & recherche, Md€ · gris = part retraites", { s: 8, c: C.faint });
    e.ys.forEach((y, i) => {
      const x = 24 + i * 40, h = hmax * e.cp[y] / top, hc = hmax * (e.cas[y] || 0) / top, last = y === e.y1;
      s += R(x, base - h, 28, h - hc, C.etat, ' opacity=".55"') + R(x, base - hc, 28, hc, last ? C.cram : C.cas) +
           T(x + 14, base + 12, y, { a: "middle", s: 8 });
      if (i === 0 || i === e.ys.length - 2 || last)
        s += T(x + 14, base - h - 5, f1(e.cp[y]), { a: "middle", s: 8.5, c: last ? C.cram : C.soft, w: last ? 600 : 400 });
    });
    s += T(268, 60, signed(e.dcp, true), { s: 7.5, c: C.cram, w: 600 }) + T(268, 92, signed(e.dcas, true), { s: 7.5, c: C.cram, w: 600 }) +
         T(24, 125, e.y1 + " : budget " + signed(e.dcp, true) + ", retraites " + signed(e.dcas, true) + " → moyens réels " + signed(e.moyens, true), { s: 7.5, c: C.faint });
    SVG("svg-t5", W, 130, s);
  }

  /* ---------- 6a · cotisants pour un retraité : le régime général à ses débuts (Cnav),
   * puis tous régimes (COR). Deux séries, deux champs : séparées par un filet. ---------- */
  function svgT6(ratio, rgHist) {
    const years = Object.keys(ratio).sort();
    if (!years.length) return;
    const hist = ["1965", "1970"].filter((y) => rgHist && rgHist[y]).map((y) => ({ y: y, v: rgHist[y], rg: true }));
    const cols = hist.concat(years.map((y, i) => ({ y: y, v: ratio[y], last: i === years.length - 1, now: i === 1 })));
    const W = 300, H = 128, colW = W / cols.length, bw = Math.min(40, colW - 10);
    const vMax = Math.max.apply(null, cols.map((c) => c.v)), base = 100, hMax = 62, sc = hMax / vMax;
    let s = "";
    const y1 = base - 1 * sc;
    s += '<line x1="6" y1="' + y1 + '" x2="' + (W - 6) + '" y2="' + y1 + '" stroke="' + C.pens + '" stroke-width="1" stroke-dasharray="3 3"/>';
    cols.forEach((c, i) => {
      const x = i * colW + (colW - bw) / 2, h = c.v * sc;
      s += R(x, base - h, bw, h, c.rg ? C.cas : C.etat, ' rx="3"' + (c.last ? ' opacity=".55"' : ""));
      s += T(x + bw / 2, base - h - 5, f1(c.v), { a: "middle", s: c.rg ? 12 : 15, c: C.ink, w: 700, f: "Georgia, serif" });
      s += T(x + bw / 2, base + 12, c.y, { a: "middle", s: 7.5, c: C.soft, w: c.now ? 700 : 400 });
      if (c.now) s += T(x + bw / 2, base + 22, "aujourd'hui", { a: "middle", s: 6.5, c: C.soft });
      if (c.last) s += T(x + bw / 2, base + 22, "projection", { a: "middle", s: 6.5, c: C.soft });
    });
    if (hist.length) {
      const xs = hist.length * colW;
      s += '<line x1="' + xs + '" y1="14" x2="' + xs + '" y2="' + (base + 24) + '" stroke="' + C.rule + '" stroke-width="1"/>';
      s += T(xs - 6, 10, "régime général (Cnav)", { a: "end", s: 6.5, c: C.soft });
      s += T(xs + 6, 10, "tous régimes (COR)", { s: 6.5, c: C.soft });
    }
    s += TAG(W - 6, y1 + 11, "pour 1 retraité", C.pens, 7);   // sous la ligne : la valeur 1,3 reste lisible au-dessus
    SVG("svg-t6", W, H, s);
  }

  /* ---------- 6b · ce qu'on verse à une génération pour 1 € cotisé ---------- */
  /* Temps 6b : € versés pour 1 € cotisé, par la formule. Passé : une seule barre (la pension
   * versée, paramètres de l'époque). Futur : part financée par les 28 % de cotisations (violet)
   * + part financée autrement, à taux inchangé (hachures cramoisies). */
  function svgT6b(gens) {
    if (!gens.length) return;
    const W = 300, H = 150, colW = W / gens.length, bw = Math.min(26, colW - 8);
    const base = 100, hMax = 62, vMax = Math.max.apply(null, gens.map((G) => G.tot)), sc = hMax / vMax;
    let s = '<defs><pattern id="hachT6" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
            '<rect width="4" height="4" fill="' + C.paper + '"/><line x1="0" y1="0" x2="0" y2="4" stroke="' + C.cram + '" stroke-width="1.6"/></pattern></defs>';
    const y1 = base - 1 * sc;
    const fx = (v) => (v >= 2 ? v.toFixed(1) : v.toFixed(2).replace(/0$/, "")).replace(".", ",");
    let xSplit = null;
    gens.forEach((G, i) => {
      const x = i * colW + (colW - bw) / 2, key = i === 0 || G.g === 1950 || G.g === 1980 || G.g === 2000;
      if (G.futur && xSplit == null) xSplit = i * colW;
      const hc = G.cot * sc, ha = G.aut * sc;
      s += R(x, base - hc, bw, hc, C.pens, ' rx="2"' + (key ? "" : ' opacity=".55"'));
      if (G.futur) {
        s += R(x, base - hc - ha, bw, ha, "url(#hachT6)", ' rx="2" stroke="' + C.cram + '" stroke-width=".6"');
        s += T(x + bw / 2, base - hc + 4, fx(G.cot), { a: "middle", s: 6.5, c: C.paper, w: 700 });
        if (ha > 8) s += T(x + bw / 2, base - hc - ha / 2 + 2.2, "+" + fx(G.aut), { a: "middle", s: 5.8, c: C.cram, w: 700 });
      }
      s += T(x + bw / 2, base - hc - ha - 4, fx(G.tot) + (key ? " €" : ""), { a: "middle", s: key ? 9 : 7, c: key ? C.ink : C.soft, w: key ? 700 : 400 });
      s += T(x + bw / 2, base + 12, String(G.g), { a: "middle", s: 7.5, c: key ? C.ink : C.soft, w: key ? 700 : 400 });
    });
    s += '<line x1="6" y1="' + y1 + '" x2="' + (W - 6) + '" y2="' + y1 + '" stroke="' + C.ink + '" stroke-width="1" stroke-dasharray="3 3"/>';
    s += TAG(6 + ("1 € cotisé".length * 7 * 0.56 + 8), y1 - 1, "1 € cotisé", C.ink, 7);
    if (xSplit != null) {
      s += '<line x1="' + xSplit + '" y1="14" x2="' + xSplit + '" y2="' + (base + 16) + '" stroke="' + C.ink + '" stroke-width=".8" stroke-dasharray="2 2"/>';
      s += T(xSplit - 5, 10, "pensions versées, paramètres de l'époque", { a: "end", s: 6.5, c: C.soft }) + T(xSplit + 5, 10, "à paramètres constants", { s: 6.5, c: C.soft });
    }
    s += R(6, base + 20, 9, 6, C.pens) + T(19, base + 25.5, "financé par les 28 % de cotisations", { s: 6.4, c: C.ink }) +
         R(140, base + 20, 9, 6, "url(#hachT6)", ' stroke="' + C.cram + '" stroke-width=".6"') +
         T(153, base + 25.5, "financé autrement, à taux inchangé (impôts, dette, budgets)", { s: 6.4, c: C.cram }) +
         T(6, base + 35, "versé = actifs par retraité × (cotisation + part prise ailleurs par actif) × années de retraite ;", { s: 6.4, c: C.soft }) +
         T(6, base + 43, "cotisé = taux moyen de la carrière × années de carrière — en salaires de l'année, sans croissance", { s: 6.4, c: C.soft });
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
    6: { tool: "svg",     hash: "",         title: "Moins de cotisants par retraité, moins récupéré par génération" },
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
