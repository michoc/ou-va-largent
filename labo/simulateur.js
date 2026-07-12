/* ==========================================================================
 * 🧪 LABO — « Retraites : le compte d'une vie » (refonte design, v5)
 * --------------------------------------------------------------------------
 * ACTE ① « La même vie, née quatre fois » : 4 CARTES GÉNÉRATIONS (1950 · 1975
 * · 2000 · 2026) qui vivent la MÊME carrière — seule l'année de naissance (et
 * les règles qu'elle subit) change. Le message EST la juxtaposition : × la
 * mise en énorme, carrés versé/reçu, âge de récupération. Cliquer une carte
 * ouvre le détail (« Et vous, précisément ? ») ; les réglages fins sont
 * repliés en avancé.
 *
 * ACTE ② « Qui paie une pension ? » : la BALANCE AUX SILHOUETTES — pension à
 * gauche, cotisants à droite (1,2 cotisant = une silhouette entière + une
 * TRONQUÉE, le cotisant manquant en pointillé). Équation à somme nulle
 * pension = taux × ratio × salaire brut × 0,909 ; la démographie est
 * VERROUILLÉE (ne bougent : l'âge de départ ≈ +0,06/an de report, la natalité
 * +0,1 mais 25 ans plus tard). Scénarios en un clic.
 *
 * Conventions : euros CONSTANTS 2025 ; salaires saisis NET (÷0,78 → brut pour
 * les cotisations) ; pensions affichées NETTES (×0,909).
 * ========================================================================== */

(function () {
  "use strict";

  /* ---------- formatage (U+202F comme le site) ---------- */
  const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const fmt0 = (v) => group(Math.round(Number(v)).toString());
  const fmtK = (v) => group((Math.round(Number(v) / 1000) * 1000).toString());
  const fmt2 = (v) => group(Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/\s/g, ""));
  const pct1 = (v) => (v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const $ = (id) => document.getElementById(id);

  /* ---------- paramètres sourcés (prototype — « à consolider ») ---------- */
  const P = {
    taux: [[1970, 0.155], [1980, 0.19], [1990, 0.225], [2000, 0.25],
           [2010, 0.267], [2017, 0.279], [2025, 0.281], [2110, 0.281]],
    // cotisants/retraité : RÉTROSPECTIVE estimée (≈ 3,0 en 1970) puis COR
    ratio: [[1970, 3.0], [1980, 2.6], [1990, 2.3], [2000, 2.05],
            [2005, 2.0], [2010, 1.85], [2020, 1.71], [2025, 1.67],
            [2040, 1.5], [2055, 1.35], [2070, 1.2], [2120, 1.2]],
    NET2BRUT: 0.78, PNET: 0.909,
    subvParActif: 4470, salaireMoyenBrut: 3466,
    smicNetAnnuel: 17900, heuresParAn: 1600,
    evBase: 86.5, evPente: 0.09, evMin: -1.5, evMax: 5, evCadre: 2.5, evOuvrier: -3,
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
  function evGen(naissance) {
    const drift = clamp((naissance + 65 - 2025) * P.evPente, P.evMin, P.evMax);
    return { mixte: Math.round(P.evBase + drift),
             cadre: Math.round(P.evBase + drift + P.evCadre),
             ouvrier: Math.round(P.evBase + drift + P.evOuvrier) };
  }
  const tauxRemplacement = (brutFin) =>
    clamp(0.80 - (brutFin - 1800) * (0.15 / 3700), 0.50, 0.85);

  /* ---------- profils (carrières types, salaires NETS 2025) ---------- */
  const PROFILS = [
    { id: "smic", nom: "Smicard", s0: 1426, s1: 1426, entree: 18 },
    { id: "median", nom: "Salaire médian", s0: 1700, s1: 2600, entree: 20 },
    { id: "ens", nom: "Enseignante", s0: 1900, s1: 3100, entree: 23 },
    { id: "cadre", nom: "Cadre", s0: 1950, s1: 4290, entree: 22 },
    { id: "ouvrier", nom: "Ouvrier", s0: 1480, s1: 1870, entree: 18 },
  ];
  // âge de départ RÉALISTE par génération (règles vécues / prévisibles)
  const GENS = [
    { naissance: 1950, depart: 61 },
    { naissance: 1975, depart: 64 },
    { naissance: 2000, depart: 65 },
    { naissance: 2026, depart: 66 },
  ];

  /* ---------- état ---------- */
  let profil = PROFILS[3];              // Cadre (la vedette du tableur)
  let detteOn = false;
  let selGen = 2000;                    // carte sélectionnée
  let custom = null;                    // réglage avancé (sinon : profil × génération)

  /* ---------- moteur : une vie ---------- */
  function lifeParams(naissance, depart) {
    return { naissance: naissance, entree: profil.entree, depart: depart,
             deces: Math.max(evGen(naissance).mixte, depart + 1),
             s0: profil.s0, s1: profil.s1 };
  }
  function computeLife(L) {
    const anDepart = L.naissance + L.depart;
    const futur = anDepart > 2025;
    const nAns = L.depart - L.entree;
    const netM = (a) => L.s0 + (L.s1 - L.s0) * (nAns <= 1 ? 1 : (a - L.entree) / (nAns - 1));
    const brutM = (a) => netM(a) / P.NET2BRUT;

    let cot = 0, impots = 0, tauxSum = 0;
    const cumVerse = [];
    for (let a = L.entree; a < L.depart; a++) {
      const an = L.naissance + a, tx = interp(P.taux, an);
      tauxSum += tx;
      cot += brutM(a) * 12 * tx;
      if (detteOn && an > 2025) impots += P.subvParActif * (brutM(a) / P.salaireMoyenBrut);
      cumVerse.push([a + 1, cot + impots]);
    }
    const verse = cot + impots;
    const ratio = interp(P.ratio, anDepart);
    const brutFin = L.s1 / P.NET2BRUT;
    const pensionBrute = futur ? interp(P.taux, anDepart) * ratio * brutFin
                               : tauxRemplacement(brutFin) * brutFin;
    const pension = pensionBrute * P.PNET;
    const duree = L.deces - L.depart;
    const recu = pension * 12 * duree;
    const beAge = L.depart + verse / (pension * 12);
    const brutMoyAn = (L.s0 + L.s1) / 2 / P.NET2BRUT * 12;
    return { L, anDepart, futur, ratio, cot, impots, verse, pension, duree, recu,
             ratioMise: recu / verse, beAge: beAge <= L.deces ? beAge : null,
             heures: verse / (brutMoyAn / P.heuresParAn), smicAns: recu / P.smicNetAnnuel,
             cumVerse, tauxDebut: interp(P.taux, L.naissance + L.entree),
             tauxFin: interp(P.taux, anDepart - 1), tauxMoyen: nAns > 0 ? tauxSum / nAns : 0 };
  }

  /* ---------- ACTE ① : les 4 cartes ---------- */
  function miniSquares(verse, recu) {
    const k = 42 / Math.sqrt(Math.max(verse, recu));
    const sv = Math.max(8, Math.sqrt(verse) * k), sr = Math.max(8, Math.sqrt(recu) * k);
    const H = Math.max(sv, sr) + 16, W = sv + sr + 40;
    return '<svg class="gc-squares" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">' +
      '<rect x="0" y="' + (H - 16 - sv) + '" width="' + sv + '" height="' + sv + '" rx="2" fill="#8C79C0"></rect>' +
      '<text x="' + sv / 2 + '" y="' + (H - 4) + '" text-anchor="middle" style="font:600 9px Helvetica">versé</text>' +
      '<rect x="' + (sv + 40 - sr) + '" y="' + (H - 16 - sr) + '" width="' + sr + '" height="' + sr + '" rx="2" fill="#8E1B38"></rect>' +
      '<text x="' + (sv + 40 - sr / 2) + '" y="' + (H - 4) + '" text-anchor="middle" style="font:600 9px Helvetica">reçu</text></svg>';
  }
  function renderCards() {
    $("gen-cards").innerHTML = GENS.map((g) => {
      const r = computeLife(lifeParams(g.naissance, g.depart));
      const win = r.ratioMise >= 1;
      return '<button type="button" class="gen-card' + (selGen === g.naissance && !custom ? " on" : "") +
        '" data-annee="' + g.naissance + '">' +
        '<span class="gc-year">Né en ' + g.naissance + "</span>" +
        '<span class="gc-ratio ' + (win ? "gagnant" : "perdant") + '">× ' + fmt2(r.ratioMise) + "</span>" +
        '<span class="gc-sub">' + (win ? "récupère " : "ne récupère que ") + fmt2(r.ratioMise) +
        " € par € versé</span>" + miniSquares(r.verse, r.recu) +
        '<span class="gc-facts">départ à <b>' + g.depart + "</b> ans · pension <b>" +
        fmt0(r.pension) + "</b> €/mois net<br>" +
        (r.beAge ? "mise récupérée à <b>" + Math.round(r.beAge) + " ans</b>"
                 : "<b>mise jamais récupérée</b>") + "</span>" +
        '<span class="gc-mode ' + (r.futur ? "futur" : "passe") + '">' +
        (r.futur ? "équilibre de sa génération" : "règles réelles") + "</span></button>";
    }).join("");
    $("gen-caption").textContent =
      "Même carrière de " + profil.nom.toLowerCase() + " (" + fmt0(profil.s0) + " → " +
      fmt0(profil.s1) + " € nets/mois), mêmes euros constants — seule l'année de naissance change." +
      (detteOn ? " Dette incluse pour les années travaillées après 2025." : "");
  }
  $("gen-cards").addEventListener("click", (e) => {
    const c = e.target.closest(".gen-card"); if (!c) return;
    selGen = +c.dataset.annee; custom = null;
    syncAdv(); renderAll();
  });

  const profBox = $("profils");
  PROFILS.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "profil-chip" + (p === profil ? " on" : "");
    b.textContent = p.nom;
    b.addEventListener("click", () => {
      profil = p; custom = null;
      [].forEach.call(profBox.children, (x) => x.classList.remove("on"));
      b.classList.add("on");
      syncAdv(); renderAll();
    });
    profBox.appendChild(b);
  });
  $("sw-dette").addEventListener("change", (e) => { detteOn = e.target.checked; renderAll(); });

  /* ---------- détail « Et vous, précisément ? » ---------- */
  const ADV = [
    { id: "naissance", lab: "Année de naissance", min: 1940, max: 2026, step: 1, fmt: (v) => v },
    { id: "entree", lab: "Âge d'entrée dans la vie active", min: 16, max: 30, step: 1, fmt: (v) => v + " ans" },
    { id: "depart", lab: "Âge de départ", min: 52, max: 75, step: 1, fmt: (v) => v + " ans" },
    { id: "deces", lab: "Fin de vie", min: 72, max: 105, step: 1, fmt: (v) => v + " ans" },
    { id: "s0", lab: "Salaire net — début de carrière", min: 1200, max: 12000, step: 50, fmt: (v) => fmt0(v) + " €" },
    { id: "s1", lab: "Salaire net — fin de carrière", min: 1200, max: 12000, step: 50, fmt: (v) => fmt0(v) + " €" },
  ];
  $("controls-adv").innerHTML = ADV.map((c) =>
    '<div class="ctl"><label for="in-' + c.id + '">' + c.lab +
    ' <output id="out-' + c.id + '"></output></label>' +
    '<input type="range" id="in-' + c.id + '" min="' + c.min + '" max="' + c.max +
    '" step="' + c.step + '"></div>').join("");
  function currentLife() {
    if (custom) return custom;
    const g = GENS.find((x) => x.naissance === selGen) || GENS[2];
    return lifeParams(g.naissance, g.depart);
  }
  function syncAdv() {
    const L = currentLife();
    ADV.forEach((c) => { $("in-" + c.id).value = L[c.id]; $("out-" + c.id).textContent = c.fmt(L[c.id]); });
  }
  ADV.forEach((c) => {
    $("in-" + c.id).addEventListener("input", (e) => {
      const L = Object.assign({}, currentLife());
      L[c.id] = +e.target.value;
      // cohérences minimales
      L.depart = clamp(L.depart, L.entree + 1, 75);
      L.deces = Math.max(L.deces, L.depart + 1);
      if (L.s1 < L.s0) (c.id === "s0") ? L.s1 = L.s0 : L.s0 = L.s1;
      custom = L;
      syncAdv(); renderAll();
    });
  });

  const chart = echarts.init($("sim-chart"), null, { renderer: "canvas" });

  function renderCoherence(r) {
    const L = r.L, ev = evGen(L.naissance);
    $("coherence").innerHTML =
      "<h4>⚙ Repères — génération née en " + L.naissance + "</h4>" +
      "Espérance de vie (à 65 ans) : <b>≈ " + ev.mixte + " ans</b> " +
      '<span class="use" data-set="' + ev.mixte + '">→ utiliser</span> · cadre <b>' + ev.cadre +
      '</b> <span class="use" data-set="' + ev.cadre + '">→</span> · ouvrier <b>' + ev.ouvrier +
      '</b> <span class="use" data-set="' + ev.ouvrier + '">→</span><br>' +
      "Démographie à son départ (" + r.anDepart + ") : <b>" + fmt2(r.ratio) + " cotisant(s)</b> / retraité<br>" +
      "Taux de cotisation vécus : <b>" + pct1(r.tauxDebut) + " %</b> (" + (L.naissance + L.entree) +
      ") → <b>" + pct1(r.tauxFin) + " %</b>, moyenne <b>" + pct1(r.tauxMoyen) + " %</b><br>" +
      "Salaires nets 2025 : SMIC <b>1 426 €</b> · médian <b>2 183 €</b> · cadre <b>≈ 4 290 €</b>";
  }
  $("coherence").addEventListener("click", (e) => {
    const u = e.target.closest(".use"); if (!u) return;
    const L = Object.assign({}, currentLife());
    L.deces = Math.max(+u.dataset.set, L.depart + 1);
    custom = L;
    syncAdv(); renderAll();
  });

  function renderDetail() {
    const r = computeLife(currentLife());
    $("detail").classList.toggle("custom", !!custom);

    $("mode-tag").className = "mode-tag " + (r.futur ? "futur" : "passe");
    $("mode-tag").textContent = r.futur
      ? "⚖ Génération future — équilibre strict : " + fmt2(r.ratio) + " cotisant(s) par retraité à son départ (" + r.anDepart + ")"
      : "Génération partie (départ " + r.anDepart + ") — règles réelles observées";

    const phr = ["Né en " + r.L.naissance + ", parti à " + r.L.depart + " ans : <b>≈ " +
      fmtK(r.verse) + " €</b> versés au système, <b>≈ " + fmtK(r.recu) + " €</b> touchés (" +
      fmt0(r.pension) + " €/mois nets pendant " + r.duree + " ans) — <b>" + fmt2(r.ratioMise) +
      " fois la mise</b>."];
    phr.push(r.beAge
      ? "La mise est épuisée à <b>" + Math.round(r.beAge) + " ans</b> ; au-delà, ce sont les cotisants d'alors qui paient."
      : "<b>La mise n'est jamais récupérée.</b>");
    $("res-phrase").innerHTML = phr.join(" ");

    $("verse-detail").innerHTML = r.impots > 0
      ? "Détail du versé : " + fmtK(r.cot) + " € de cotisations + <b>" + fmtK(r.impots) +
        " € d'impôts</b> (quote-part des 136 Md€/an, années > 2025)."
      : (r.futur && !detteOn ? "Hors quote-part du déficit actuel (interrupteur « dette » ci-dessus)." : "");

    $("mini-stats").innerHTML =
      '<div class="mini"><b>' + fmt0(r.pension) + " €/mois net</b><span>pension simulée" +
      (r.futur ? " (équilibre)" : " (règles réelles)") + "</span></div>" +
      '<div class="mini"><b>' + (r.beAge ? Math.round(r.beAge) + " ans" : "jamais") +
      "</b><span>mise récupérée à</span></div>" +
      '<div class="mini"><b>' + fmt0(r.heures) + " h</b><span>de travail pour cotiser</span></div>" +
      '<div class="mini"><b>' + fmt0(r.smicAns) + "</b><span>années de SMIC net reçues</span></div>";

    renderCoherence(r);

    const ages = [], vSer = [], rSer = [];
    let vFin = 0;
    for (let a = r.L.entree; a <= r.L.deces; a++) {
      ages.push(a);
      const cv = r.cumVerse.filter((p) => p[0] <= a);
      if (cv.length) vFin = cv[cv.length - 1][1];
      vSer.push(Math.round(vFin));
      rSer.push(a >= r.L.depart ? Math.round(r.pension * 12 * (a - r.L.depart)) : 0);
    }
    chart.setOption({
      grid: { left: 64, right: 14, top: 32, bottom: 26 },
      legend: { data: ["Cumul versé", "Cumul reçu (net)"], top: 0, textStyle: { fontSize: 11 } },
      tooltip: { trigger: "axis", valueFormatter: (v) => fmtK(v) + " €" },
      xAxis: { type: "category", data: ages, name: "âge", nameGap: 4, axisLabel: { fontSize: 10 } },
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
    return r;
  }

  /* ---------- ACTE ② : la balance dans le temps ----------
   * La PENSION est le RÉSULTAT de l'équation (demande commanditaire) :
   *   pension nette = taux × ratio(année) × salaire moyen brut France × 0,909
   * · SALAIRE des cotisants : FIGÉ au salaire moyen France (on isole
   *   démographie et taux — le modifier n'avait pas de sens).
   * · CURSEUR ANNÉE 1975 → 2070 : dans le PASSÉ tout est figé (taux et âge
   *   légal de l'époque, démographie historique) ; dans le FUTUR, démographie
   *   projetée et deux seuls leviers — taux et âge (≈ +0,06 ratio/an de
   *   report ; natalité +0,1 mais seulement après 2050).
   * Contrôle de cohérence : 2025 → ≈ 1 480 € nets ≈ pension moyenne réelle. */
  const INV = { annee: 2050, cible: 1480, tauxPct: 28.1, age: 64, natal: false };
  const ageHisto = (an) => an < 1983 ? 65 : an < 2011 ? 60 : an < 2023 ? 62 : 64;
  const estPasse = () => INV.annee <= 2025;
  const effTauxPct = () => estPasse() ? interp(P.taux, INV.annee) * 100 : INV.tauxPct;
  const effAge = () => estPasse() ? ageHisto(INV.annee) : INV.age;
  function ratioEff() {
    const base = interp(P.ratio, INV.annee);
    if (estPasse()) return base;               // l'histoire intègre déjà les âges réels
    return clamp(base + 0.06 * (INV.age - 64) +
                 (INV.natal && INV.annee >= 2050 ? 0.1 : 0), 0.5, 3.2);
  }
  // ce que les réglages courants FINANCENT (l'objectif, lui, est fixé par l'utilisateur)
  const financeOut = () => (effTauxPct() / 100) * ratioEff() * P.salaireMoyenBrut * P.PNET;
  const BASELINE = 0.281 * interp(P.ratio, 2025) * P.salaireMoyenBrut * P.PNET;   // ≈ 1 478 €
  const SAL_NET_MOYEN = Math.round(P.salaireMoyenBrut * P.NET2BRUT);
  // leviers nécessaires pour ATTEINDRE la cible (ferment l'écart à somme nulle)
  const tauxNecessaire = () => INV.cible / (ratioEff() * P.salaireMoyenBrut * P.PNET) * 100;
  function ageNecessaire() {
    const needRatio = INV.cible / ((INV.tauxPct / 100) * P.salaireMoyenBrut * P.PNET);
    return 64 + (needRatio - interp(P.ratio, INV.annee) -
                 (INV.natal && INV.annee >= 2050 ? 0.1 : 0)) / 0.06;
  }

  $("inv-controls").innerHTML =
    '<div class="cible-block"><span class="titre">🎯 VOTRE OBJECTIF — la variable de base</span>' +
    '<div class="ctl"><label for="inv-cible">« Je veux une pension de… » ' +
    '<output id="out-inv-cible"></output></label>' +
    '<input type="range" id="inv-cible" min="500" max="4000" step="10">' +
    '<div class="reperes" style="display:flex;gap:4px 10px;flex-wrap:wrap;font-size:11px;color:var(--ink-soft);margin-top:3px">Repères : ' +
    '<span class="repere" data-cible="1426" style="cursor:pointer;border-bottom:1px dotted #B9AE97">SMIC 1 426</span> · ' +
    '<span class="repere" data-cible="1480" style="cursor:pointer;border-bottom:1px dotted #B9AE97">pension moyenne 1 480</span> · ' +
    '<span class="repere" data-cible="2000" style="cursor:pointer;border-bottom:1px dotted #B9AE97">confortable 2 000</span></div></div></div>' +
    '<div class="ctl" id="ctl-inv-annee"><label for="inv-annee">…en quelle année ? (le contexte) ' +
    '<output id="out-inv-annee"></output></label>' +
    '<input type="range" id="inv-annee" min="1975" max="2070" step="1">' +
    '<div class="reperes" style="display:flex;gap:4px 10px;flex-wrap:wrap;font-size:11px;color:var(--ink-soft);margin-top:3px">Repères : ' +
    '<span class="repere" data-an="1980" style="cursor:pointer;border-bottom:1px dotted #B9AE97">1980</span> · ' +
    '<span class="repere" data-an="2000" style="cursor:pointer;border-bottom:1px dotted #B9AE97">2000</span> · ' +
    '<span class="repere" data-an="2025" style="cursor:pointer;border-bottom:1px dotted #B9AE97">aujourd\u2019hui</span> · ' +
    '<span class="repere" data-an="2050" style="cursor:pointer;border-bottom:1px dotted #B9AE97">2050</span> · ' +
    '<span class="repere" data-an="2070" style="cursor:pointer;border-bottom:1px dotted #B9AE97">2070</span></div></div>' +
    '<div class="ctl" id="ctl-inv-taux"><label for="inv-taux">LEVIER 1 — taux de cotisation vieillesse ' +
    '<output id="out-inv-taux"></output></label>' +
    '<input type="range" id="inv-taux" min="8" max="60" step="0.1"></div>' +
    '<div class="ctl" id="ctl-inv-age"><label for="inv-age">LEVIER 2 — âge de départ (durée de cotisation) ' +
    '<output id="out-inv-age"></output></label>' +
    '<input type="range" id="inv-age" min="60" max="70" step="1"></div>' +
    '<div class="sal-fixe">💶 Salaire des cotisants : <b>figé</b> au salaire moyen France — ' +
    fmt0(SAL_NET_MOYEN) + ' € nets (' + fmt0(P.salaireMoyenBrut) +
    ' € bruts, INSEE). Pas un levier : on isole démographie et taux.</div>';

  $("inv-cible").addEventListener("input", (e) => { INV.cible = +e.target.value; renderInverse(); });
  $("inv-annee").addEventListener("input", (e) => { INV.annee = +e.target.value; renderInverse(); });
  $("inv-taux").addEventListener("input", (e) => {
    if (estPasse()) return;
    INV.tauxPct = +e.target.value; renderInverse();
  });
  $("inv-age").addEventListener("input", (e) => {
    if (estPasse()) return;
    INV.age = +e.target.value; renderInverse();
  });
  $("inv-controls").addEventListener("click", (e) => {
    const r = e.target.closest(".repere"); if (!r) return;
    if (r.dataset.cible) INV.cible = +r.dataset.cible;
    if (r.dataset.an) INV.annee = +r.dataset.an;
    renderInverse();
  });

  const SCENARIOS = [
    { lab: "→ Fermer l\u2019écart par le TAUX", run: () => {
        if (estPasse()) return "passe";
        INV.tauxPct = clamp(tauxNecessaire(), 8, 60);
      } },
    { lab: "→ Fermer l\u2019écart par l\u2019ÂGE", run: () => {
        if (estPasse()) return "passe";
        INV.age = Math.round(clamp(ageNecessaire(), 60, 70));
      } },
    { lab: "Natalité +0,2 enfant/femme", run: () => { INV.natal = !INV.natal; } },
    { lab: "↺ Règles d\u2019aujourd\u2019hui", run: () => {
        INV.tauxPct = 28.1; INV.age = 64; INV.natal = false;
      } },
  ];
  let scenNote = "";
  const scBox = $("scenarios");
  SCENARIOS.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "scenar"; b.textContent = s.lab;
    b.addEventListener("click", () => {
      scenNote = (s.run() === "passe")
        ? "Le passé est figé : placez d\u2019abord le curseur après 2025." : "";
      renderInverse();
    });
    scBox.appendChild(b);
  });

  // silhouette (tête + buste) dessinée dans un viewBox 60×110
  function silhouette(x, frac, fill, dash) {
    const H = 110;
    const body = 'M30 26 C14 26 10 44 10 62 L10 96 Q10 104 18 104 L42 104 Q50 104 50 96 L50 62 C50 44 46 26 30 26 Z';
    let s = '<g transform="translate(' + x + ',0)">';
    if (dash)
      s += '<circle cx="30" cy="13" r="11" fill="none" stroke="#B9AE97" stroke-width="2" stroke-dasharray="4 3"></circle>' +
           '<path d="' + body + '" fill="none" stroke="#B9AE97" stroke-width="2" stroke-dasharray="4 3"></path>';
    if (frac > 0.01) {
      const clipY = H * (1 - frac);
      const cid = "clip" + Math.round(x) + Math.round(frac * 100);
      s += '<clipPath id="' + cid + '"><rect x="0" y="' + clipY + '" width="60" height="' + (H - clipY) + '"></rect></clipPath>' +
           '<g clip-path="url(#' + cid + ')">' +
           '<circle cx="30" cy="13" r="11" fill="' + fill + '"></circle>' +
           '<path d="' + body + '" fill="' + fill + '"></path></g>';
    }
    return s + "</g>";
  }
  // le bloc pension = L'OBJECTIF : rempli à hauteur du FINANCÉ, le manque
  // en POINTILLÉ cramoisi (même langage que le cotisant manquant)
  function renderBalance(cible, finance) {
    const R = ratioEff();
    const full = Math.floor(R + 1e-9), frac = R - full;
    const nSil = full + (frac > 0.01 ? 1 : 0);
    const parCot = (finance / P.PNET) / R;
    const SW = 78;
    const W = 210 + 70 + Math.max(nSil, 1) * SW + 10, H = 196;
    let s = '<svg id="balance-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">';
    const hC = clamp(cible / 4000 * 150, 16, 150);
    const hF = hC * clamp(finance / cible, 0, 1);
    const y0 = 132;
    // objectif : cadre pointillé cramoisi ; financé : rempli plein depuis le bas
    s += '<rect x="30" y="' + (y0 - hC) + '" width="150" height="' + hC +
         '" rx="4" fill="none" stroke="#8E1B38" stroke-width="2" stroke-dasharray="6 4"></rect>' +
         '<rect x="30" y="' + (y0 - hF) + '" width="150" height="' + hF +
         '" rx="3" fill="#C94A6E"></rect>';
    if (hF > 24)
      s += '<text x="105" y="' + (y0 - hF / 2 + 5) + '" text-anchor="middle" style="font:800 15px Helvetica" fill="#fff">' +
           fmt0(finance) + " €</text>";
    if (finance < cible * 0.99 && hC - hF > 15)
      s += '<text x="105" y="' + (y0 - hF - (hC - hF) / 2 + 4) + '" text-anchor="middle" style="font:700 11px Helvetica" fill="#8E1B38">manque ' +
           fmt0(cible - finance) + " €</text>";
    s += '<text x="105" y="152" text-anchor="middle" style="font:700 12px Helvetica" fill="#1E2430">L\u2019OBJECTIF : ' +
         fmt0(cible) + " €</text>" +
         '<text x="105" y="167" text-anchor="middle" style="font:600 10.5px Helvetica" fill="#4A5265">rempli = financé par les réglages</text>';
    s += '<text x="' + (210 + 20) + '" y="88" style="font:800 26px Georgia" fill="#1E2430">⚖</text>';
    const x0 = 210 + 70;
    for (let i = 0; i < full; i++)
      s += '<g transform="translate(' + (x0 + i * SW) + ',20)">' + silhouette(0, 1, "#8C79C0", false) + "</g>";
    if (frac > 0.01)
      s += '<g transform="translate(' + (x0 + full * SW) + ',20)">' + silhouette(0, frac, "#8C79C0", true) + "</g>";
    for (let i = 0; i < nSil; i++) {
      const last = (i === nSil - 1) && frac > 0.01;
      s += '<text x="' + (x0 + i * SW + 30) + '" y="152" text-anchor="middle" style="font:700 11px Helvetica" fill="#1E2430">' +
        (last ? "× " + fmt2(frac) : fmt0(parCot) + " €") + "</text>";
      if (!last)
        s += '<text x="' + (x0 + i * SW + 30) + '" y="166" text-anchor="middle" style="font:600 9.5px Helvetica" fill="#4A5265">/mois</text>';
    }
    s += "</svg>";
    $("balance-svg").outerHTML = s;              // remplace le svg (garde l'id)
  }

  function renderInverse() {
    const passe = estPasse();
    const R = ratioEff(), finance = financeOut(), txt = effTauxPct(), age = effAge();
    const gap = INV.cible - finance;
    const atteint = Math.abs(gap) <= INV.cible * 0.01 || finance > INV.cible;

    $("inv-cible").value = Math.round(INV.cible / 10) * 10;
    $("inv-annee").value = INV.annee;
    $("inv-taux").value = Math.round(txt * 10) / 10;
    $("inv-age").value = age;
    $("inv-taux").disabled = passe; $("inv-age").disabled = passe;
    $("ctl-inv-taux").classList.toggle("locked", passe);
    $("ctl-inv-age").classList.toggle("locked", passe);
    $("out-inv-cible").textContent = fmt0(INV.cible) + " € nets";
    $("out-inv-annee").textContent = INV.annee + (passe ? " (figé)" : "");
    $("out-inv-taux").textContent = pct1(txt / 100) + " %" + (passe ? " 🔒" : "");
    $("out-inv-age").textContent = age + " ans" + (passe ? " 🔒" : "");

    $("inv-verrou").textContent = "🔒 Démographie " + INV.annee + " : " +
      fmt2(interp(P.ratio, INV.annee)) + " cotisant(s) par retraité — " +
      (passe ? "historique (le passé ne se refait pas)" : "projection COR (seuls l\u2019âge et la natalité, 25 ans plus tard, la font bouger)");

    // — LE TABLEAU DE BORD DE L'ÉCART —
    const pctFill = clamp(finance / INV.cible * 100, 0, 100);
    $("inv-result").innerHTML = atteint
      ? '<span class="big ok">✓ objectif financé</span>' +
        '<span class="lab">votre pension de ' + fmt0(INV.cible) + " € en " + INV.annee +
        " est payée : taux " + pct1(txt / 100) + " %, départ à " + age + " ans</span>" +
        '<div class="jauge"><div class="fill ok" style="width:100%"></div></div>'
      : '<span class="big">' + fmt0(finance) + " € financés</span>" +
        '<span class="delta neg">manque ' + fmt0(gap) + " €/mois</span>" +
        '<span class="lab">pour VOTRE objectif de ' + fmt0(INV.cible) + " € en " + INV.annee +
        " — fermez l\u2019écart avec les leviers</span>" +
        '<div class="jauge"><div class="fill" style="width:' + pctFill + '%"></div></div>';

    renderBalance(INV.cible, finance);
    const parCot = (finance / P.PNET) / R;
    $("bal-caption").innerHTML = "<b>" + fmt2(R) + " cotisant" + (R >= 2 ? "s" : "") +
      "</b> au salaire moyen — pas un de plus — versent chacun <b>" + fmt0(parCot) +
      " €/mois</b> (" + pct1(txt / 100) + " % de leur brut)" +
      (R % 1 > 0.01 ? ". En pointillé : le cotisant qui manque" : "") + ".";

    let phr;
    if (passe) {
      phr = "En <b>" + INV.annee + "</b> : " + fmt2(R) + " cotisants, " + pct1(txt / 100) +
        " % de cotisation (départ à " + age + " ans) finançaient <b>≈ " + fmt0(finance) +
        " € nets</b>" +
        (INV.cible <= finance
          ? " — votre objectif de " + fmt0(INV.cible) + " € était <b>couvert sans effort</b>."
          : " — votre objectif de " + fmt0(INV.cible) + " € aurait déjà manqué de " +
            fmt0(INV.cible - finance) + " €.") +
        " Le passé est figé.";
    } else if (atteint) {
      phr = "<b>Voilà ce que coûte votre pension de " + fmt0(INV.cible) + " € en " + INV.annee +
        "</b> : " + fmt2(R) + " cotisant(s) y consacrent " + pct1(txt / 100) +
        " % de leur salaire brut (" + fmt0(parCot) + " €/mois chacun)" +
        (txt > 28.4 ? ", contre 28,1 % aujourd\u2019hui (+" + pct1((txt - 28.1) / 100) + " pt)." : ".");
    } else {
      const tN = tauxNecessaire(), aN = ageNecessaire();
      phr = "Avec ces réglages, il manque <b>" + fmt0(gap) + " €/mois</b>. Pour obtenir VOS " +
        fmt0(INV.cible) + " € en " + INV.annee + " : taux à <b>" +
        (tN > 60 ? "plus de 60 %" : pct1(Math.min(tN, 60) / 100) + " %") + "</b> <b>OU</b> départ à <b>" +
        (aN > 70 ? "plus de 70 ans" : Math.ceil(aN) + " ans") +
        "</b> — ou réviser l\u2019objectif à la baisse.";
    }
    $("inv-phrase").innerHTML = phr;

    $("inv-note").textContent = scenNote ||
      (INV.natal && INV.annee < 2050 && !passe
        ? "⚠ Natalité : aucun effet avant ~2050 (les bébés d\u2019aujourd\u2019hui cotisent dans 25 ans)."
        : (INV.natal && INV.annee >= 2050 ? "Natalité +0,2 : ratio +0,1 — le levier le plus lent." : ""));
    scenNote = "";
  }

  /* ---------- orchestration ---------- */
  function renderAll() {
    renderCards();
    const r = renderDetail();
    renderInverse();
  }
  window.addEventListener("resize", () => chart.resize());
  syncAdv();
  renderAll();
})();
