/* ==========================================================================
 * 🧪 LABO — Simulateur « Ma retraite : combien je verse, combien je touche ? »
 * --------------------------------------------------------------------------
 * Prototype (non lié depuis le site). Tout en EUROS CONSTANTS 2025.
 * SALAIRES saisis en NET (÷ 0,78 → brut pour les cotisations) ; PENSIONS
 * affichées NETTES (−9,1 % CSG-CRDS-Casa).
 *
 * UI resserrée (demande commanditaire) : DEUX commandes principales —
 *  · la « frise de vie » : UN double curseur naissance → année de départ ;
 *  · UN curseur « salaire net moyen de carrière ».
 * Le reste (âge d'entrée, fin de vie, salaires début/fin) vit dans
 * « Réglages avancés » ; la fin de vie SUIT l'espérance de vie projetée de la
 * génération tant que l'utilisateur n'y a pas touché.
 *
 * Régimes de calcul :
 *  · départ ≤ 2025 : règles RÉELLES (taux de remplacement dégressif) ;
 *  · départ  > 2025 : JEU À SOMME NULLE — pension = taux × ratio
 *    cotisants/retraité (année du départ) × salaire brut fin ;
 *  · interrupteur DETTE : quote-part des 136 Md€/an (années > 2025).
 *
 * SIMULATEUR INVERSE (« qui paiera votre pension ? ») : même équation, lue à
 * l'envers — pension nette = taux × ratio × salaire brut cotisants × 0,909,
 * ratio FIXÉ par la démographie ; bouger un curseur ajuste les autres.
 * ========================================================================== */

(function () {
  "use strict";

  /* ---------- formatage (mêmes conventions que le site : U+202F) ---------- */
  const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const fmt0 = (v) => group(Math.round(Number(v)).toString());
  const fmtK = (v) => group((Math.round(Number(v) / 1000) * 1000).toString());
  const fmt2 = (v) => group(Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/\s/g, ""));
  const pct1 = (v) => (v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 });

  /* ---------- paramètres sourcés (prototype — « à consolider ») ---------- */
  const P = {
    taux: [[1970, 0.155], [1980, 0.19], [1990, 0.225], [2000, 0.25],
           [2010, 0.267], [2017, 0.279], [2025, 0.281], [2110, 0.281]],
    ratio: [[2005, 2.0], [2010, 1.85], [2020, 1.71], [2025, 1.67],
            [2040, 1.5], [2055, 1.35], [2070, 1.2], [2120, 1.2]],
    NET2BRUT: 0.78,                // net ≈ brut × 0,78 (approx. privé — à consolider)
    PNET: 0.909,                   // pension nette ≈ brute × (1 − 9,1 %)
    subvParActif: 4470,            // 136 Md€ / ~30,4 M cotisants (COR 2025)
    salaireMoyenBrut: 3466,        // €/mois brut EQTP privé (INSEE 2023)
    smicNetAnnuel: 17900,
    heuresParAn: 1600,
    evBase: 86.5, evPente: 0.09, evMin: -1.5, evMax: 5,
    evCadre: 2.5, evOuvrier: -3,
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const interp = (T, x) => {
    if (x <= T[0][0]) return T[0][1];
    if (x >= T[T.length - 1][0]) return T[T.length - 1][1];
    for (let i = 1; i < T.length; i++) if (x <= T[i][0]) {
      const [x0, y0] = T[i - 1], [x1, y1] = T[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
    return T[T.length - 1][1];
  };
  function evGen(naissance) {
    const drift = clamp((naissance + 65 - 2025) * P.evPente, P.evMin, P.evMax);
    const mixte = P.evBase + drift;
    return { mixte: Math.round(mixte), cadre: Math.round(mixte + P.evCadre),
             ouvrier: Math.round(mixte + P.evOuvrier) };
  }
  const tauxRemplacement = (brutFin) =>
    clamp(0.80 - (brutFin - 1800) * (0.15 / 3700), 0.50, 0.85);

  /* ---------- état ---------- */
  const S = { naissance: 1950, anDepart: 2010, entree: 20, deces: 85, s0: 1950, s1: 4290 };
  let detteOn = false, decesTouche = true;      // le profil d'ouverture fixe sa fin de vie
  const departAge = () => S.anDepart - S.naissance;

  /* ---------- profils types (salaires en NET) ---------- */
  const PROFILS = [
    { nom: "Cadre né en 1950", v: { naissance: 1950, anDepart: 2010, entree: 20, s0: 1950, s1: 4290, deces: 85 } },
    { nom: "Cadre né en 2000", v: { naissance: 2000, anDepart: 2065, entree: 22, s0: 1950, s1: 4290, deces: 87 } },
    { nom: "Smicard né en 1975", v: { naissance: 1975, anDepart: 2039, entree: 18, s0: 1426, s1: 1426, deces: 84 } },
    { nom: "Enseignante née en 1980", v: { naissance: 1980, anDepart: 2044, entree: 23, s0: 1900, s1: 3100, deces: 89 } },
    { nom: "Ouvrier né en 1965", v: { naissance: 1965, anDepart: 2027, entree: 18, s0: 1480, s1: 1870, deces: 82 } },
    { nom: "Née en 2026", v: { naissance: 2026, anDepart: 2092, entree: 22, s0: 1950, s1: 3500, deces: 92 } },
  ];

  const $ = (id) => document.getElementById(id);

  /* ---------- UI : commandes PRINCIPALES ---------- */
  // 1) la « frise de vie » : un DOUBLE curseur naissance → année de départ
  const AXE0 = 1940, AXE1 = 2101;
  $("controls").innerHTML =
    '<div class="ctl"><label>Votre vie — naissance → départ en retraite ' +
    '<output id="out-vie"></output></label>' +
    '<div class="dual">' +
    '<input type="range" id="in-naissance" min="' + AXE0 + '" max="' + AXE1 + '" step="1">' +
    '<input type="range" id="in-anDepart" min="' + AXE0 + '" max="' + AXE1 + '" step="1">' +
    "</div>" +
    '<div class="reperes">Repères : ' +
    '<span class="repere" data-act="nais" data-v="1950">né en 1950</span> · ' +
    '<span class="repere" data-act="nais" data-v="2000">né en 2000</span> · ' +
    '<span class="repere" data-act="nais" data-v="2026">né en 2026</span> · ' +
    '<span class="repere" data-act="dep63">départ 62,8 (moyen)</span> · ' +
    '<span class="repere" data-act="dep64">départ 64 (légal)</span></div></div>' +
    '<div class="ctl"><label for="in-smoyen">Salaire NET mensuel moyen de carrière ' +
    '<output id="out-smoyen"></output></label>' +
    '<input type="range" id="in-smoyen" min="1200" max="10000" step="50">' +
    '<div class="reperes">Repères : ' +
    '<span class="repere" data-act="sal" data-v="1426">SMIC 1 426</span> · ' +
    '<span class="repere" data-act="sal" data-v="2183">médian 2 183</span> · ' +
    '<span class="repere" data-act="sal" data-v="3120">cadre (carrière) 3 120</span> · ' +
    '<span class="repere" data-act="sal" data-v="6000">très haut 6 000</span></div></div>';

  // 2) réglages AVANCÉS (dépliés à la demande)
  const ADV = [
    { id: "entree", lab: "Âge d'entrée dans la vie active", min: 16, max: 30, step: 1,
      fmt: (v) => v + " ans" },
    { id: "deces", lab: "Fin de vie (suit l'espérance de vie de votre génération tant que vous n'y touchez pas)",
      min: 72, max: 105, step: 1, fmt: (v) => v + " ans" },
    { id: "s0", lab: "Salaire net — début de carrière", min: 1200, max: 12000, step: 50,
      fmt: (v) => fmt0(v) + " €" },
    { id: "s1", lab: "Salaire net — fin de carrière", min: 1200, max: 12000, step: 50,
      fmt: (v) => fmt0(v) + " €" },
  ];
  $("controls-adv").innerHTML = ADV.map((c) =>
    '<div class="ctl"><label for="in-' + c.id + '">' + c.lab +
    ' <output id="out-' + c.id + '"></output></label>' +
    '<input type="range" id="in-' + c.id + '" min="' + c.min + '" max="' + c.max +
    '" step="' + c.step + '"></div>').join("");

  /* ---------- synchronisation des commandes ---------- */
  function syncInputs() {
    $("in-naissance").value = S.naissance;
    $("in-anDepart").value = S.anDepart;
    $("in-smoyen").value = Math.round((S.s0 + S.s1) / 2 / 10) * 10;
    ADV.forEach((c) => { $("in-" + c.id).value = S[c.id]; });
  }
  function contraintes() {
    S.naissance = clamp(S.naissance, 1940, 2026);
    S.anDepart = clamp(S.anDepart, S.naissance + S.entree + 1, Math.min(S.naissance + 75, AXE1));
    if (!decesTouche) S.deces = Math.max(evGen(S.naissance).mixte, departAge() + 1);
    S.deces = clamp(Math.max(S.deces, departAge() + 1), 72, 105);
    if (S.s1 < S.s0) S.s1 = S.s0;
  }

  $("in-naissance").addEventListener("input", (e) => {
    const age = departAge();
    S.naissance = clamp(+e.target.value, 1940, 2026);
    S.anDepart = S.naissance + age;            // on préserve l'âge de départ
    contraintes(); clearProfil(); syncInputs(); render();
  });
  $("in-anDepart").addEventListener("input", (e) => {
    S.anDepart = +e.target.value;
    contraintes(); clearProfil(); syncInputs(); render();
  });
  $("in-smoyen").addEventListener("input", (e) => {
    // un seul curseur : on fait GLISSER début et fin proportionnellement
    const cible = +e.target.value, m = (S.s0 + S.s1) / 2, k = cible / m;
    S.s0 = clamp(Math.round(S.s0 * k / 10) * 10, 1200, 12000);
    S.s1 = clamp(Math.round(S.s1 * k / 10) * 10, 1200, 12000);
    contraintes(); clearProfil(); syncInputs(); render();
  });
  ADV.forEach((c) => {
    $("in-" + c.id).addEventListener("input", (e) => {
      S[c.id] = +e.target.value;
      if (c.id === "deces") decesTouche = true;
      if (c.id === "s0" && S.s1 < S.s0) S.s1 = S.s0;
      if (c.id === "s1" && S.s1 < S.s0) S.s0 = S.s1;
      contraintes(); clearProfil(); syncInputs(); render();
    });
  });
  $("controls").addEventListener("click", (e) => {
    const r = e.target.closest(".repere"); if (!r) return;
    if (r.dataset.act === "nais") {
      const age = departAge();
      S.naissance = +r.dataset.v; S.anDepart = S.naissance + age;
    } else if (r.dataset.act === "dep63") S.anDepart = S.naissance + 63;
    else if (r.dataset.act === "dep64") S.anDepart = S.naissance + 64;
    else if (r.dataset.act === "sal") {
      const m = (S.s0 + S.s1) / 2, k = (+r.dataset.v) / m;
      S.s0 = clamp(Math.round(S.s0 * k / 10) * 10, 1200, 12000);
      S.s1 = clamp(Math.round(S.s1 * k / 10) * 10, 1200, 12000);
    }
    contraintes(); clearProfil(); syncInputs(); render();
  });

  const profBox = $("profils");
  PROFILS.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "profil-chip"; b.textContent = p.nom;
    b.addEventListener("click", () => {
      Object.assign(S, p.v); decesTouche = true;
      contraintes(); syncInputs();
      [].forEach.call(profBox.children, (x) => x.classList.remove("on"));
      b.classList.add("on");
      render();
    });
    profBox.appendChild(b);
  });
  function clearProfil() { [].forEach.call(profBox.children, (x) => x.classList.remove("on")); }

  $("sw-dette").addEventListener("change", (e) => { detteOn = e.target.checked; render(); });

  /* ---------- moteur (identique v2, âge de départ dérivé de la frise) ------ */
  function compute() {
    const futur = S.anDepart > 2025;
    const aDep = departAge();
    const nAns = aDep - S.entree;
    const netMensuel = (age) =>
      S.s0 + (S.s1 - S.s0) * (nAns <= 1 ? 1 : (age - S.entree) / (nAns - 1));
    const brutMensuel = (age) => netMensuel(age) / P.NET2BRUT;

    let cot = 0, impots = 0, tauxSum = 0;
    const cumVerse = [];
    for (let a = S.entree; a < aDep; a++) {
      const an = S.naissance + a;
      const tx = interp(P.taux, an);
      tauxSum += tx;
      cot += brutMensuel(a) * 12 * tx;
      if (detteOn && an > 2025)
        impots += P.subvParActif * (brutMensuel(a) / P.salaireMoyenBrut);
      cumVerse.push([a + 1, cot + impots]);
    }
    const verse = cot + impots;
    const tauxDebut = interp(P.taux, S.naissance + S.entree);
    const tauxFin = interp(P.taux, S.anDepart - 1);
    const tauxMoyen = nAns > 0 ? tauxSum / nAns : 0;

    const ratio = interp(P.ratio, S.anDepart);
    const brutFin = S.s1 / P.NET2BRUT;
    const pensionBrute = futur
      ? interp(P.taux, S.anDepart) * ratio * brutFin
      : tauxRemplacement(brutFin) * brutFin;
    const pension = pensionBrute * P.PNET;
    const duree = S.deces - aDep;
    const recu = pension * 12 * duree;

    const ratioMise = recu / verse;
    const beAge = aDep + verse / (pension * 12);
    const brutMoyenAnnuel = (S.s0 + S.s1) / 2 / P.NET2BRUT * 12;
    const heures = verse / (brutMoyenAnnuel / P.heuresParAn);
    const smicAns = recu / P.smicNetAnnuel;

    return { futur, anDepart: S.anDepart, aDep, ratio, cot, impots, verse, pension, duree, recu,
             ratioMise, beAge: beAge <= S.deces ? beAge : null, heures, smicAns,
             cumVerse, tauxDebut, tauxFin, tauxMoyen };
  }

  /* ---------- SIMULATEUR INVERSE : « qui paiera votre pension ? » ----------
   * pensionNette = taux × ratio × (salaireNetCotisant ÷ 0,78) × 0,909
   * ratio FIXÉ par la démographie de l'année de départ. Somme nulle :
   * pension bougée → le TAUX s'ajuste ; taux ou salaire bougés → la PENSION. */
  const INV = { pension: 1500, tauxPct: 28.1, salNet: 2700, actif: false };
  $("inv-controls").innerHTML = [
    ['inv-pension', "Votre pension NETTE visée (€/mois)", 400, 6000, 10],
    ['inv-taux', "Taux de cotisation vieillesse des actifs (%)", 8, 60, 0.1],
    ['inv-sal', "Salaire NET moyen des cotisants d'alors (€/mois)", 1200, 8000, 50],
  ].map((c) =>
    '<div class="ctl"><label for="' + c[0] + '">' + c[1] +
    ' <output id="out-' + c[0] + '"></output></label>' +
    '<input type="range" id="' + c[0] + '" min="' + c[2] + '" max="' + c[3] +
    '" step="' + c[4] + '"></div>').join("") +
    '<div class="reperes">Repères salaire : <span class="repere" data-inv="1426">SMIC 1 426</span> · ' +
    '<span class="repere" data-inv="2183">médian 2 183</span> · ' +
    '<span class="repere" data-inv="2700">moyen 2 700</span> — taux 2025 : 28,1 %</div>';

  function invRatio() { return interp(P.ratio, S.anDepart); }
  function invPensionFrom() {
    return (INV.tauxPct / 100) * invRatio() * (INV.salNet / P.NET2BRUT) * P.PNET;
  }
  $("inv-pension").addEventListener("input", (e) => {
    INV.pension = +e.target.value; INV.actif = true;
    // la pension est visée → le TAUX encaisse (somme nulle)
    INV.tauxPct = clamp(INV.pension / (invRatio() * (INV.salNet / P.NET2BRUT) * P.PNET) * 100, 8, 60);
    INV.pension = invPensionFrom();            // re-cohérence si le taux a saturé
    renderInverse();
  });
  $("inv-taux").addEventListener("input", (e) => {
    INV.tauxPct = +e.target.value; INV.actif = true;
    INV.pension = invPensionFrom();
    renderInverse();
  });
  $("inv-sal").addEventListener("input", (e) => {
    INV.salNet = +e.target.value; INV.actif = true;
    INV.pension = invPensionFrom();
    renderInverse();
  });
  $("inv-controls").addEventListener("click", (e) => {
    const r = e.target.closest(".repere"); if (!r || !r.dataset.inv) return;
    INV.salNet = +r.dataset.inv; INV.actif = true;
    INV.pension = invPensionFrom();
    renderInverse();
  });

  function renderInverse(simPension) {
    // tant que l'utilisateur n'a pas touché la carte, elle SUIT la pension simulée
    if (!INV.actif && simPension != null) {
      INV.pension = simPension;
      INV.tauxPct = clamp(INV.pension / (invRatio() * (INV.salNet / P.NET2BRUT) * P.PNET) * 100, 8, 60);
      INV.pension = invPensionFrom();
    }
    $("inv-pension").value = Math.round(INV.pension / 10) * 10;
    $("inv-taux").value = Math.round(INV.tauxPct * 10) / 10;
    $("inv-sal").value = INV.salNet;
    $("out-inv-pension").textContent = fmt0(INV.pension) + " € net";
    $("out-inv-taux").textContent = pct1(INV.tauxPct / 100) + " %";
    $("out-inv-sal").textContent = fmt0(INV.salNet) + " € net";
    const R = invRatio();
    $("inv-ratio").textContent = "Démographie verrouillée : " + fmt2(R) +
      " cotisant(s) par retraité à votre départ (" + S.anDepart + ")";
    // chaque retraité mobilise l'INTÉGRALITÉ des cotisations vieillesse de R cotisants
    const parCot = (INV.pension / P.PNET) / R;
    const haussePts = INV.tauxPct - 28.1;
    $("inv-phrase").innerHTML =
      "Pour vous verser <b>" + fmt0(INV.pension) + " € nets/mois</b>, il faudra que <b>" +
      fmt2(R) + " cotisant(s)</b> (salaire net moyen " + fmt0(INV.salNet) +
      " €) y consacrent chacun <b>" + fmt0(parCot) + " €/mois</b> — la totalité de leur " +
      "cotisation vieillesse, soit <b>" + pct1(INV.tauxPct / 100) +
      " % de leur salaire brut</b>" +
      (Math.abs(haussePts) >= 0.3
        ? haussePts > 0
          ? ", contre <b>28,1 %</b> aujourd'hui (+" + pct1(haussePts / 100) + " point" +
            (haussePts >= 2 ? "s" : "") + ")."
          : ", contre 28,1 % aujourd'hui."
        : " (le taux actuel).");
    $("inv-note").textContent = INV.tauxPct >= 59.9
      ? "⚠ Taux saturé à 60 % : cette pension n'est pas finançable par les cotisations à ce niveau de salaire."
      : "";
  }

  /* ---------- rendu principal ---------- */
  const chart = echarts.init($("sim-chart"), null, { renderer: "canvas" });

  function squares(verse, recu) {
    const k = 92 / Math.sqrt(Math.max(verse, recu));
    const sv = Math.max(14, Math.sqrt(verse) * k), sr = Math.max(14, Math.sqrt(recu) * k);
    const H = Math.max(sv, sr) + 26, W = sv + sr + 74;
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">' +
      '<rect x="0" y="' + (H - 26 - sv) + '" width="' + sv + '" height="' + sv +
      '" rx="3" fill="#8C79C0"></rect>' +
      '<rect x="' + (sv + 74 - sr) + '" y="' + (H - 26 - sr) + '" width="' + sr + '" height="' + sr +
      '" rx="3" fill="#8E1B38"></rect>' +
      '<text x="' + (sv / 2) + '" y="' + (H - 8) + '" text-anchor="middle" ' +
      'style="font:700 11px Helvetica,Arial">versé</text>' +
      '<text x="' + (sv + 74 - sr / 2) + '" y="' + (H - 8) + '" text-anchor="middle" ' +
      'style="font:700 11px Helvetica,Arial">reçu</text></svg>';
  }

  function renderCoherence(r) {
    const ev = evGen(S.naissance);
    $("coherence").innerHTML =
      "<h4>⚙ Repères de cohérence — génération née en " + S.naissance + "</h4>" +
      "Espérance de vie (fin de vie, à 65 ans) : <b>≈ " + ev.mixte + " ans</b> " +
      '<span class="use" data-set="' + ev.mixte + '">→ utiliser</span> · cadre <b>' +
      ev.cadre + '</b> <span class="use" data-set="' + ev.cadre + '">→</span> · ouvrier <b>' +
      ev.ouvrier + '</b> <span class="use" data-set="' + ev.ouvrier + '">→</span><br>' +
      "Démographie à votre départ (" + r.anDepart + ") : <b>" + fmt2(r.ratio) +
      " cotisant(s)</b> pour 1 retraité<br>" +
      "Taux de cotisation vieillesse sur VOTRE carrière : <b>" + pct1(r.tauxDebut) +
      " %</b> (" + (S.naissance + S.entree) + ") → <b>" + pct1(r.tauxFin) + " %</b> (" +
      (S.anDepart - 1) + "), moyenne <b>" + pct1(r.tauxMoyen) + " %</b><br>" +
      "Salaires nets 2025 : SMIC <b>1 426 €</b> · médian <b>2 183 €</b> · cadre moyen <b>≈ 4 290 €</b>";
  }
  $("coherence").addEventListener("click", (e) => {
    const u = e.target.closest(".use"); if (!u) return;
    S.deces = Math.max(+u.dataset.set, departAge() + 1);
    decesTouche = true;
    clearProfil(); syncInputs(); render();
  });

  function render() {
    const r = compute();

    $("out-vie").textContent = S.naissance + " → " + S.anDepart + " (départ à " + r.aDep + " ans)";
    $("out-smoyen").textContent = fmt0((S.s0 + S.s1) / 2) + " € net" +
      (S.s0 !== S.s1 ? " (" + fmt0(S.s0) + " → " + fmt0(S.s1) + ")" : "");
    ADV.forEach((c) => { $("out-" + c.id).textContent = c.fmt(S[c.id]); });

    $("sw-dette-wrap").classList.toggle("off", S.anDepart <= 2025);

    renderCoherence(r);

    $("mode-tag").className = "mode-tag " + (r.futur ? "futur" : "passe");
    $("mode-tag").textContent = r.futur
      ? "⚖ Génération future — équilibre strict : " + fmt2(r.ratio) + " cotisant(s) par retraité à votre départ (" + r.anDepart + ")"
      : "Génération partie (départ " + r.anDepart + ") — règles réelles observées";

    $("res-ratio").innerHTML = "× " + fmt2(r.ratioMise) +
      "<small>votre mise " + (r.ratioMise >= 1 ? "multipliée" : "réduite") + "</small>";
    $("res-squares").innerHTML = squares(r.verse, r.recu);

    const phr = [];
    phr.push("Vous versez <b>≈ " + fmtK(r.verse) + " €</b> au système de retraites sur votre carrière, " +
      "et touchez <b>≈ " + fmtK(r.recu) + " €</b> de pensions (" +
      fmt0(r.pension) + " €/mois <b>nets</b> pendant " + r.duree + " ans) — <b>" + fmt2(r.ratioMise) +
      " fois votre mise</b>.");
    if (r.beAge) phr.push("Votre mise est épuisée à <b>" + Math.round(r.beAge) + " ans</b> ; " +
      "au-delà, ce sont les cotisants d'alors qui paient.");
    else phr.push("<b>Vous ne récupérez jamais votre mise.</b>");
    $("res-phrase").innerHTML = phr.join(" ");

    $("verse-detail").innerHTML = r.impots > 0
      ? "Détail du versé : " + fmtK(r.cot) + " € de cotisations + <b>" + fmtK(r.impots) +
        " € d'impôts</b> (quote-part des 136 Md€/an de subventions d'équilibre, années > 2025)."
      : (r.futur && !detteOn
        ? "Hors quote-part du déficit actuel (activez l'interrupteur « dette » pour l'inclure)."
        : "");

    $("mini-stats").innerHTML =
      '<div class="mini"><b>' + fmt0(r.pension) + " €/mois net</b><span>pension simulée" +
        (r.futur ? " (équilibre)" : " (règles réelles)") + "</span></div>" +
      '<div class="mini"><b>' + (r.beAge ? Math.round(r.beAge) + " ans" : "jamais") +
        "</b><span>âge où la mise est récupérée</span></div>" +
      '<div class="mini"><b>' + fmt0(r.heures) + " h</b><span>de travail consacrées à cotiser</span></div>" +
      '<div class="mini"><b>' + fmt0(r.smicAns) + "</b><span>années de SMIC net reçues</span></div>";

    const ages = [], vSer = [], rSer = [];
    let vFin = 0;
    for (let a = S.entree; a <= S.deces; a++) {
      ages.push(a);
      const cv = r.cumVerse.filter((p) => p[0] <= a);
      if (cv.length) vFin = cv[cv.length - 1][1];
      vSer.push(Math.round(vFin));
      rSer.push(a >= r.aDep ? Math.round(r.pension * 12 * (a - r.aDep)) : 0);
    }
    chart.setOption({
      grid: { left: 70, right: 16, top: 34, bottom: 28 },
      legend: { data: ["Cumul versé", "Cumul reçu (net)"], top: 2, textStyle: { fontSize: 11 } },
      tooltip: { trigger: "axis", valueFormatter: (v) => fmtK(v) + " €" },
      xAxis: { type: "category", data: ages, name: "âge", nameGap: 4,
        axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", axisLabel: { fontSize: 10, formatter: (v) => group(String(v / 1000)) + " k€" } },
      series: [
        { name: "Cumul versé", type: "line", data: vSer, symbol: "none",
          lineStyle: { color: "#8C79C0", width: 3 }, color: "#8C79C0",
          areaStyle: { color: "rgba(140,121,192,.14)" } },
        { name: "Cumul reçu (net)", type: "line", data: rSer, symbol: "none",
          lineStyle: { color: "#8E1B38", width: 3 }, color: "#8E1B38",
          areaStyle: { color: "rgba(142,27,56,.12)" } },
      ],
    });

    renderInverse(r.pension);
  }

  window.addEventListener("resize", () => chart.resize());
  contraintes(); syncInputs();
  profBox.children.length || PROFILS.length;   // no-op lisible
  // profil d'ouverture : le cadre né en 1950 (la vedette du tableur)
  profBox.children[0].classList.add("on");
  render();
})();
