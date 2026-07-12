/* ==========================================================================
 * 🧪 LABO — Simulateur « Ma retraite : combien je verse, combien je touche ? »
 * --------------------------------------------------------------------------
 * Prototype (non lié depuis le site). Tout en EUROS CONSTANTS 2025.
 * Les SALAIRES se saisissent en NET (ce que les gens connaissent) ; le moteur
 * reconvertit en brut (net ÷ 0,78) car les cotisations se prélèvent sur le
 * brut. Les PENSIONS s'affichent NETTES (−9,1 % CSG-CRDS-Casa).
 *
 * Deux régimes de calcul :
 *  · départ ≤ 2025 (générations parties) : règles RÉELLES observées —
 *    pension brute = taux de remplacement (dégressif) × salaire brut fin.
 *  · départ  > 2025 (générations futures) : JEU À SOMME NULLE — la pension
 *    est celle que l'ÉQUILIBRE de la génération peut payer :
 *    pension brute = taux cotisation × ratio cotisants/retraité (année du
 *    départ) × salaire brut fin.  (formule du tableur de travail)
 *  · interrupteur DETTE : les années travaillées après 2025 paient en plus
 *    la quote-part des 136 Md€/an de subventions d'équilibre (impôts+dette).
 *
 * DONNÉES DE PÉRIODE (rendues visibles dans l'encadré « repères ») :
 *  · taux de cotisation vieillesse de CHAQUE année de la carrière ;
 *  · ratio démographique à l'année du départ ;
 *  · espérance de vie PROJETÉE de la cohorte (à 65 ans, +≈1 mois/an,
 *    plafonné +5 ans — scénario central INSEE ; cadre +2,5 / ouvrier −3).
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
    // taux de cotisation vieillesse GLOBAL (salarié+employeur, tous régimes),
    // par année civile — calé sur les moyennes générationnelles 22 % / 28 %
    // (S. Catherine) et le taux actuel ≈ 28,1 %. Interpolation linéaire.
    taux: [[1970, 0.155], [1980, 0.19], [1990, 0.225], [2000, 0.25],
           [2010, 0.267], [2017, 0.279], [2025, 0.281], [2110, 0.281]],
    // ratio cotisants / retraité à l'année du DÉPART (COR 2025 : 1,67 ;
    // projections → 1,5 en 2040, ~1,2 en 2070, stable ensuite)
    ratio: [[2005, 2.0], [2010, 1.85], [2020, 1.71], [2025, 1.67],
            [2040, 1.5], [2055, 1.35], [2070, 1.2], [2120, 1.2]],
    NET2BRUT: 0.78,                // net ≈ brut × 0,78 (approx. privé — à consolider)
    PNET: 0.909,                   // pension nette ≈ brute × (1 − 9,1 % CSG-CRDS-Casa)
    subvParActif: 4470,            // 136 Md€ / ~30,4 M cotisants (COR 2025)
    salaireMoyenBrut: 3466,        // €/mois brut EQTP privé (INSEE 2023)
    smicNetAnnuel: 17900,          // référentiel du comparateur du site
    heuresParAn: 1600,
    // espérance de vie à 65 ans, MIXTE, en 2025 → âge ≈ 86,5 ; dérive
    // +0,09 an/an (≈ +1 mois), bornée [−1,5 ; +5] (scénario central INSEE)
    evBase: 86.5, evPente: 0.09, evMin: -1.5, evMax: 5,
    evCadre: 2.5, evOuvrier: -3,
    // salaires NETS de repère (2025)
    salReps: { smic: 1426, median: 2183, cadre: 4290 },
  };
  const interp = (T, x) => {
    if (x <= T[0][0]) return T[0][1];
    if (x >= T[T.length - 1][0]) return T[T.length - 1][1];
    for (let i = 1; i < T.length; i++) if (x <= T[i][0]) {
      const [x0, y0] = T[i - 1], [x1, y1] = T[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
    return T[T.length - 1][1];
  };
  // espérance de vie (âge de fin de vie) projetée pour la cohorte née en Y
  function evGen(naissance) {
    const drift = Math.max(P.evMin, Math.min(P.evMax, (naissance + 65 - 2025) * P.evPente));
    const mixte = P.evBase + drift;
    return { mixte: Math.round(mixte), cadre: Math.round(mixte + P.evCadre),
             ouvrier: Math.round(mixte + P.evOuvrier) };
  }
  // taux de remplacement OBSERVÉ (générations parties), sur le salaire BRUT :
  // ≈ 80 % au SMIC, dégressif (≈ 65 % pour un cadre) — approximation DREES
  const tauxRemplacement = (brutFin) =>
    Math.min(0.85, Math.max(0.50, 0.80 - (brutFin - 1800) * (0.15 / 3700)));

  /* ---------- curseurs (bornes LARGES : l'utilisateur fait SES hypothèses) -- */
  const CTLS = [
    { id: "naissance", lab: "Année de naissance", min: 1940, max: 2026, step: 1, val: 1950,
      fmt: (v) => v,
      reps: [["1950 (boom)", 1950], ["1975", 1975], ["2000", 2000], ["2026", 2026]] },
    { id: "entree", lab: "Âge d'entrée dans la vie active", min: 16, max: 30, step: 1, val: 20,
      fmt: (v) => v + " ans",
      reps: [["apprenti 16", 16], ["bac+2 20", 20], ["bac+5 23", 23], ["doctorat 27", 27]] },
    { id: "depart", lab: "Âge de départ à la retraite", min: 52, max: 75, step: 1, val: 60,
      fmt: (v) => v + " ans",
      reps: [["SNCF ≈ 57", 57], ["moyen 62,8", 63], ["âge légal 64", 64], ["tardif 70", 70]] },
    { id: "s0", lab: "Salaire NET mensuel — début de carrière", min: 1200, max: 12000, step: 50, val: 1950,
      fmt: (v) => fmt0(v) + " € net",
      reps: [["SMIC 1 426", 1426], ["enseignant déb. 1 900", 1900], ["cadre déb. 2 350", 2350]] },
    { id: "s1", lab: "Salaire NET mensuel — fin de carrière", min: 1200, max: 12000, step: 50, val: 4290,
      fmt: (v) => fmt0(v) + " € net",
      reps: [["médian 2 183", 2183], ["cadre 4 290", 4290], ["haut cadre 7 000", 7000]] },
    { id: "deces", lab: "Fin de vie (espérance)", min: 72, max: 105, step: 1, val: 85,
      fmt: (v) => v + " ans",
      reps: [["ouvrier ≈ 82", 82], ["homme 85", 85], ["femme 88", 88], ["centenaire 100", 100]] },
  ];

  /* ---------- profils types (salaires en NET) ---------- */
  const PROFILS = [
    { nom: "Cadre né en 1950", v: { naissance: 1950, entree: 20, depart: 60, s0: 1950, s1: 4290, deces: 85 } },
    { nom: "Cadre né en 2000", v: { naissance: 2000, entree: 22, depart: 65, s0: 1950, s1: 4290, deces: 87 } },
    { nom: "Smicard né en 1975", v: { naissance: 1975, entree: 18, depart: 64, s0: 1426, s1: 1426, deces: 84 } },
    { nom: "Enseignante née en 1980", v: { naissance: 1980, entree: 23, depart: 64, s0: 1900, s1: 3100, deces: 89 } },
    { nom: "Ouvrier né en 1965", v: { naissance: 1965, entree: 18, depart: 62, s0: 1480, s1: 1870, deces: 82 } },
    { nom: "Née en 2026", v: { naissance: 2026, entree: 22, depart: 66, s0: 1950, s1: 3500, deces: 92 } },
  ];

  /* ---------- état + construction de l'UI ---------- */
  const S = {};
  CTLS.forEach((c) => (S[c.id] = c.val));
  let detteOn = false;

  const $ = (id) => document.getElementById(id);
  const ctlBox = $("controls");
  CTLS.forEach((c) => {
    const div = document.createElement("div");
    div.className = "ctl";
    div.innerHTML = '<label for="in-' + c.id + '">' + c.lab +
      ' <output id="out-' + c.id + '"></output></label>' +
      '<input type="range" id="in-' + c.id + '" min="' + c.min + '" max="' + c.max +
      '" step="' + c.step + '" value="' + c.val + '">' +
      '<div class="reperes">Repères : ' + c.reps.map((r) =>
        '<span class="repere" data-ctl="' + c.id + '" data-v="' + r[1] + '">' + r[0] + "</span>"
      ).join(" · ") + "</div>";
    ctlBox.appendChild(div);
    $("in-" + c.id).addEventListener("input", (e) => {
      S[c.id] = +e.target.value;
      // cohérence : fin ≥ début, décès > départ, départ > entrée
      if (c.id === "s0" && S.s1 < S.s0) { S.s1 = S.s0; $("in-s1").value = S.s0; }
      if (c.id === "s1" && S.s1 < S.s0) { S.s0 = S.s1; $("in-s0").value = S.s1; }
      if (c.id === "depart" && S.depart <= S.entree) { S.depart = S.entree + 1; e.target.value = S.depart; }
      if ((c.id === "deces" || c.id === "depart") && S.deces <= S.depart) {
        S.deces = S.depart + 1; $("in-deces").value = S.deces;
      }
      clearProfil(); render();
    });
  });
  ctlBox.addEventListener("click", (e) => {
    const r = e.target.closest(".repere"); if (!r) return;
    S[r.dataset.ctl] = +r.dataset.v; $("in-" + r.dataset.ctl).value = r.dataset.v;
    clearProfil(); render();
  });

  const profBox = $("profils");
  PROFILS.forEach((p, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "profil-chip"; b.textContent = p.nom; b.dataset.i = i;
    b.addEventListener("click", () => {
      Object.assign(S, p.v);
      CTLS.forEach((c) => ($("in-" + c.id).value = S[c.id]));
      [].forEach.call(profBox.children, (x) => x.classList.remove("on"));
      b.classList.add("on");
      render();
    });
    profBox.appendChild(b);
  });
  function clearProfil() { [].forEach.call(profBox.children, (x) => x.classList.remove("on")); }

  $("sw-dette").addEventListener("change", (e) => { detteOn = e.target.checked; render(); });

  /* ---------- moteur ---------- */
  function compute() {
    const anDepart = S.naissance + S.depart;
    const futur = anDepart > 2025;
    const nAns = S.depart - S.entree;
    const netMensuel = (age) =>
      S.s0 + (S.s1 - S.s0) * (nAns <= 1 ? 1 : (age - S.entree) / (nAns - 1));
    const brutMensuel = (age) => netMensuel(age) / P.NET2BRUT;

    // — versé : cotisations sur le BRUT, année par année (+ quote-part dette) —
    let cot = 0, impots = 0, tauxSum = 0;
    const cumVerse = [];
    for (let a = S.entree; a < S.depart; a++) {
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
    const tauxFin = interp(P.taux, S.naissance + S.depart - 1);
    const tauxMoyen = nAns > 0 ? tauxSum / nAns : 0;

    // — pension : brute selon le régime de calcul, AFFICHÉE nette —
    const ratio = interp(P.ratio, anDepart);
    const brutFin = S.s1 / P.NET2BRUT;
    const pensionBrute = futur
      ? interp(P.taux, anDepart) * ratio * brutFin       // équilibre de la génération
      : tauxRemplacement(brutFin) * brutFin;             // règles réelles observées
    const pension = pensionBrute * P.PNET;               // nette
    const duree = S.deces - S.depart;
    const recu = pension * 12 * duree;

    // — indicateurs —
    const ratioMise = recu / verse;
    const beAge = S.depart + verse / (pension * 12);
    const brutMoyenAnnuel = (S.s0 + S.s1) / 2 / P.NET2BRUT * 12;
    const heures = verse / (brutMoyenAnnuel / P.heuresParAn);
    const smicAns = recu / P.smicNetAnnuel;

    return { futur, anDepart, ratio, cot, impots, verse, pension, duree, recu,
             ratioMise, beAge: beAge <= S.deces ? beAge : null, heures, smicAns,
             cumVerse, tauxDebut, tauxFin, tauxMoyen };
  }

  /* ---------- rendu ---------- */
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

  // encadré « repères de cohérence » : les données SPÉCIFIQUES à la génération
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
      (S.naissance + S.depart - 1) + "), moyenne <b>" + pct1(r.tauxMoyen) + " %</b><br>" +
      "Salaires nets 2025 : SMIC <b>1 426 €</b> · médian <b>2 183 €</b> · cadre moyen <b>≈ 4 290 €</b>";
  }
  $("coherence").addEventListener("click", (e) => {
    const u = e.target.closest(".use"); if (!u) return;
    S.deces = Math.max(+u.dataset.set, S.depart + 1);
    $("in-deces").value = S.deces;
    clearProfil(); render();
  });

  function render() {
    const r = compute();

    // valeurs courantes affichées à droite des labels
    CTLS.forEach((c) => { $("out-" + c.id).textContent = c.fmt(S[c.id]); });

    // dette : interrupteur grisé si aucune année travaillée après 2025
    const finCarriere = S.naissance + S.depart;
    $("sw-dette-wrap").classList.toggle("off", finCarriere <= 2025);

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

    // — courbe cumulée versé / reçu (le croisement = récupération de la mise) —
    const ages = [], vSer = [], rSer = [];
    let vFin = 0;
    for (let a = S.entree; a <= S.deces; a++) {
      ages.push(a);
      const cv = r.cumVerse.filter((p) => p[0] <= a);
      if (cv.length) vFin = cv[cv.length - 1][1];
      vSer.push(Math.round(vFin));
      rSer.push(a >= S.depart ? Math.round(r.pension * 12 * (a - S.depart)) : 0);
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
  }

  window.addEventListener("resize", () => chart.resize());
  // profil d'ouverture : le cadre né en 1950 (la vedette du tableur)
  profBox.children[0].classList.add("on");
  render();
})();
