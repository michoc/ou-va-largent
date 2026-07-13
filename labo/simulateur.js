/* ==========================================================================
 * 🧪 LABO — « Retraites : le compte d'une vie » (v15)
 * --------------------------------------------------------------------------
 * ACTE ① « La même vie, née quatre fois » : 4 cartes générations, même
 * carrière, seule l'année de naissance change. CASCADE DE LA DETTE : chaque
 * carte peut cocher « maintenir sa pension et léguer le trou » — l'ardoise
 * (part non financée de sa pension, par tête) passe alors à la génération
 * suivante, qui la rembourse en impôts… sauf si elle coche à son tour
 * (cumulable). La carte 1950 est cochée par défaut : c'est l'histoire réelle.
 *
 * ACTE ② « Qui paie une pension ? » : balance aux silhouettes. L'OBJECTIF
 * (une pension de X € nets, départ en YYYY) se règle en % du revenu net de
 * référence (salaire MOYEN par défaut, MÉDIAN au choix) ; la démographie est
 * verrouillée par l'année ; les seuls leviers sont le taux de cotisation
 * (en % du salaire brut) et l'âge de départ.
 *
 * Conventions : euros d'AUJOURD'HUI (constants 2025) ; salaires saisis NETS
 * (÷ 0,78 → brut pour les cotisations) ; pensions affichées NETTES (× 0,909).
 * Calibration : salaire moyen PAR TÊTE calé sur les 269 Md€ de cotisations
 * réelles → le rouge existe dès 2025 (l'écart = les 136 Md€ du Mondrian).
 * Heures cotisées = Σ (taux de l'année × heures travaillées de l'époque),
 * série 1 850 h (1970) → 1 607 h (35 heures) — méthode S. Catherine.
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
    // cotisants/retraité : rétrospective estimée (≈ 3,0 en 1970) puis COR
    ratio: [[1970, 3.0], [1980, 2.6], [1990, 2.3], [2000, 2.05],
            [2005, 2.0], [2010, 1.85], [2020, 1.71], [2025, 1.67],
            [2040, 1.5], [2055, 1.35], [2070, 1.2], [2120, 1.2]],
    // heures travaillées par an (39 h → 35 h en 2002) — série estimée,
    // calée sur 1 749 h (carrières 65+) / 1 609 h (actuelles), S. Catherine
    heuresAn: [[1970, 1850], [1982, 1745], [2000, 1715], [2002, 1610], [2120, 1607]],
    NET2BRUT: 0.78, PNET: 0.909,
    // salaires bruts PAR TÊTE des ~30,4 M de cotisants — le MOYEN est calé
    // pour retrouver les 269 Md€ de cotisations réelles (30,4 M × 2 620 ×
    // 12 × 28,1 % ≈ 269) ; ⚠ ne PAS remettre le 3 466 EQTP privé (il gonfle
    // les cotisations de ~30 % et masque le déficit). Médian ≈ 81 % du moyen.
    salBase: { moyen: 2620, median: 2120 },
    smicNetAnnuel: 17900,
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
    { id: "smic", nom: "Carrière au SMIC", carr: "au SMIC", s0: 1426, s1: 1426, entree: 18 },
    { id: "median", nom: "Salaire médian", carr: "au salaire médian", s0: 1700, s1: 2600, entree: 20 },
    { id: "ens", nom: "Enseignante", carr: "d'enseignante", s0: 1900, s1: 3100, entree: 23 },
    { id: "cadre", nom: "Cadre", carr: "de cadre", s0: 1950, s1: 4290, entree: 22 },
    { id: "ouvrier", nom: "Ouvrier", carr: "d'ouvrier", s0: 1480, s1: 1870, entree: 18 },
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
  let selGen = 2000;                    // carte sélectionnée
  let custom = null;                    // situation personnalisée (sinon : profil × génération)
  // la CASCADE : qui coche « maintenir sa pension et léguer le trou » ?
  // 1950 cochée par défaut — c'est ce qui s'est réellement passé.
  const legs = { 1950: true, 1975: false, 2000: false, 2026: false };
  let chain = {};                       // résultats par génération, cascade comprise

  /* ---------- moteur : une vie ---------- */
  function lifeParams(naissance, depart) {
    return { naissance: naissance, entree: profil.entree, depart: depart,
             deces: Math.max(evGen(naissance).mixte, depart + 1),
             s0: profil.s0, s1: profil.s1 };
  }
  // opts : { maintenir: garde la pension au niveau des règles actuelles,
  //          ardoise: € hérités à rembourser en impôts au fil de la carrière }
  function computeLife(L, opts) {
    opts = opts || {};
    const ardoise = opts.ardoise || 0;
    const anDepart = L.naissance + L.depart;
    const futur = anDepart > 2025;
    const nAns = L.depart - L.entree;
    const netM = (a) => L.s0 + (L.s1 - L.s0) * (nAns <= 1 ? 1 : (a - L.entree) / (nAns - 1));
    const brutM = (a) => netM(a) / P.NET2BRUT;

    let cot = 0, tauxSum = 0, heures = 0;
    const impotAn = nAns > 0 ? ardoise / nAns : 0;   // remboursement étalé sur la carrière
    const cumVerse = [];
    for (let a = L.entree; a < L.depart; a++) {
      const an = L.naissance + a, tx = interp(P.taux, an);
      tauxSum += tx;
      cot += brutM(a) * 12 * tx;
      // heures « pour cotiser » = part du temps de travail de l'année qui part
      // aux retraites : taux × heures travaillées DE L'ÉPOQUE (39 h → 35 h)
      heures += tx * interp(P.heuresAn, an);
      cumVerse.push([a + 1, cot + impotAn * (a - L.entree + 1)]);
    }
    const verse = cot + ardoise;
    const ratio = interp(P.ratio, anDepart);
    const brutFin = L.s1 / P.NET2BRUT;
    const duree = L.deces - L.depart;
    // deux pensions possibles : « équilibre » (ce que la démographie finance)
    // et « maintenue » (règles d'aujourd'hui, taux de remplacement observé)
    const pensionEq = interp(P.taux, anDepart) * ratio * brutFin * P.PNET;
    const pensionMaint = tauxRemplacement(brutFin) * brutFin * P.PNET;
    const pension = !futur ? pensionMaint : (opts.maintenir ? pensionMaint : pensionEq);
    const recu = pension * 12 * duree;
    // le trou de CETTE pension si elle est maintenue au-dessus de l'équilibre :
    // cumulé sur la retraite, rapporté à UN actif suivant via le ratio
    const gapMois = Math.max(0, pension - pensionEq);
    const ardoiseLeguee = gapMois * 12 * duree / ratio;
    const beAge = L.depart + verse / (pension * 12);
    return { L, anDepart, futur, ratio, cot, ardoise, verse, pension, pensionEq, pensionMaint,
             gapMois, ardoiseLeguee, duree, recu, ratioMise: recu / verse,
             beAge: beAge <= L.deces ? beAge : null, heures, smicAns: recu / P.smicNetAnnuel,
             cumVerse, tauxDebut: interp(P.taux, L.naissance + L.entree),
             tauxFin: interp(P.taux, anDepart - 1), tauxMoyen: nAns > 0 ? tauxSum / nAns : 0 };
  }
  // la CASCADE : on déroule les 4 générations dans l'ordre ; l'ardoise passe
  // de l'une à l'autre tant que la case « léguer » est cochée
  function computeChain() {
    chain = {};
    let ardoise = 0;
    GENS.forEach((g) => {
      const coche = legs[g.naissance];
      const r = computeLife(lifeParams(g.naissance, g.depart),
        { maintenir: coche, ardoise: coche ? 0 : ardoise });
      r.herite = coche ? 0 : ardoise;               // ce qu'elle rembourse
      ardoise = coche ? ardoise + r.ardoiseLeguee : 0;
      r.transmet = coche ? ardoise : 0;             // ce qu'elle fait glisser
      chain[g.naissance] = r;
    });
    return ardoise;                                 // ce qui reste aux enfants (~2050)
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
  // une ardoise s'exprime en « impôts par mois pendant toute une carrière »
  const enImpotsMois = (ard, nAnsCarriere) => ard / ((nAnsCarriere || 43) * 12);

  function renderCards() {
    const resteEnfants = computeChain();
    $("gen-cards").innerHTML = GENS.map((g, i) => {
      const r = chain[g.naissance];
      const win = r.ratioMise >= 1;
      const coche = legs[g.naissance];
      const nAns = g.depart - profil.entree;
      const modeLab = !r.futur
        ? "règles réellement appliquées"
        : (coche ? "pension maintenue, trou légué"
                 : (r.herite > 0 ? "à l'équilibre + rembourse le trou hérité"
                                 : "pension réduite pour être à l'équilibre"));
      let badges = "";
      if (r.herite > 0)
        badges += '<br><span class="gc-dette">🧾 hérite du trou : ≈ <b>' +
          fmt0(enImpotsMois(r.herite, nAns)) + " €/mois</b> d'impôts pendant toute sa carrière</span>";
      if (coche)
        badges += '<br><span class="gc-dette">🧾 lègue ≈ <b>' +
          fmt0(enImpotsMois(r.transmet, 43)) + " €/mois</b> (une carrière entière) " +
          (i < GENS.length - 1 ? "à la génération suivante" : "aux enfants nés vers 2050") + "</span>";
      return '<div class="gen-card' + (selGen === g.naissance && !custom ? " on" : "") +
        '" data-annee="' + g.naissance + '" role="button" tabindex="0">' +
        '<span class="gc-year">Né en ' + g.naissance + "</span>" +
        '<span class="gc-ratio ' + (win ? "gagnant" : "perdant") + '">× ' + fmt2(r.ratioMise) + "</span>" +
        '<span class="gc-sub">' + (win ? "récupère " : "ne récupère que ") + fmt2(r.ratioMise) +
        " € par € versé</span>" + miniSquares(r.verse, r.recu) +
        '<span class="gc-facts">départ à <b>' + g.depart + "</b> ans · pension <b>" +
        fmt0(r.pension) + "</b> €/mois net<br>" +
        (r.beAge ? "versements remboursés à <b>" + Math.round(r.beAge) + " ans</b>"
                 : "<b>versements jamais remboursés</b>") + badges + "</span>" +
        '<span class="gc-mode ' + (r.futur ? "futur" : "passe") + '">' + modeLab + "</span>" +
        '<label class="gc-leg"><input type="checkbox" data-leg="' + g.naissance + '"' +
        (coche ? " checked" : "") + "> maintenir sa pension et léguer le trou" +
        (g.naissance === 1950 ? " (c'est ce qui s'est passé)" : "") + "</label></div>";
    }).join("");
    $("gen-caption").innerHTML =
      "Même carrière " + profil.carr + " (" + fmt0(profil.s0) + " → " + fmt0(profil.s1) +
      " € nets par mois), montants en euros d'aujourd'hui — seule l'année de naissance change." +
      (legs[1950]
        ? " <b>Le trou légué se paie en impôts</b> — aujourd'hui, il est comblé en prenant ailleurs " +
          "dans le budget : 136 Md€ par an, près de 2 fois le budget de l'Éducation nationale."
        : "") +
      (resteEnfants > 0 && legs[2026]
        ? " <b>Ardoise finale laissée aux enfants : ≈ " +
          fmt0(enImpotsMois(resteEnfants, 43)) + " €/mois pendant toute leur carrière.</b>" : "");
  }
  $("gen-cards").addEventListener("click", (e) => {
    if (e.target.closest(".gc-leg")) return;        // la case gère son propre événement
    const c = e.target.closest(".gen-card"); if (!c) return;
    selGen = +c.dataset.annee; custom = null;
    syncAdv(); renderAll();
  });
  $("gen-cards").addEventListener("change", (e) => {
    const inp = e.target.closest("input[data-leg]"); if (!inp) return;
    legs[+inp.dataset.leg] = inp.checked;
    renderAll();
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

  /* ---------- « La vie en détail » ---------- */
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
  function currentResult() {
    if (custom) return computeLife(custom, {});     // exploration libre : à l'équilibre
    return chain[selGen] || computeLife(currentLife(), {});
  }
  function syncAdv() {
    const L = currentLife();
    ADV.forEach((c) => { $("in-" + c.id).value = L[c.id]; $("out-" + c.id).textContent = c.fmt(L[c.id]); });
  }
  ADV.forEach((c) => {
    $("in-" + c.id).addEventListener("input", (e) => {
      const L = Object.assign({}, currentLife());
      L[c.id] = +e.target.value;
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
      "Démographie à son départ (" + r.anDepart + ") : <b>" + fmt2(r.ratio) + " cotisant(s)</b> par retraité<br>" +
      "Taux de cotisation subis : <b>" + pct1(r.tauxDebut) + " %</b> du brut (" + (L.naissance + L.entree) +
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
    const r = currentResult();
    $("detail").classList.toggle("custom", !!custom);

    const coche = !custom && legs[r.L.naissance];
    $("mode-tag").className = "mode-tag " + (r.futur ? "futur" : "passe");
    $("mode-tag").textContent = !r.futur
      ? "Départ en " + r.anDepart + " — règles réellement appliquées"
      : (coche
        ? "Pension maintenue au niveau actuel — le trou est légué (" + fmt2(r.ratio) + " cotisant(s) par retraité)"
        : (r.herite > 0
          ? "Pension réduite pour être à l'équilibre + remboursement du trou hérité"
          : "Pension réduite pour être à l'équilibre (" + fmt2(r.ratio) + " cotisant(s) par retraité en " + r.anDepart + ")"));

    const phr = ["Né en " + r.L.naissance + ", parti à " + r.L.depart + " ans : <b>≈ " +
      fmtK(r.verse) + " €</b> versés au système" +
      (r.ardoise > 0 ? " (cotisations + impôts hérités)" : "") + ", <b>≈ " + fmtK(r.recu) +
      " €</b> touchés (" + fmt0(r.pension) + " €/mois nets pendant " + r.duree + " ans) — <b>" +
      fmt2(r.ratioMise) + " fois la somme versée</b>."];
    phr.push(r.beAge
      ? "Les versements sont remboursés à <b>" + Math.round(r.beAge) + " ans</b> ; au-delà, ce sont les cotisants du moment qui paient."
      : "<b>Les versements ne sont jamais remboursés.</b>");
    $("res-phrase").innerHTML = phr.join(" ");

    $("verse-detail").innerHTML = !r.futur ? "" :
      (coche
        ? "Pension maintenue : les cotisations n'en financent que <b>" + fmt0(r.pensionEq) +
          " €/mois</b> — le reste glisse en dette vers la génération suivante."
        : (r.ardoise > 0
          ? "Dont ≈ <b>" + fmt0(enImpotsMois(r.ardoise, r.L.depart - r.L.entree)) +
            " €/mois</b> d'impôts, toute sa carrière, pour rembourser le trou laissé par ses aînés."
          : "Pension ajustée au niveau que la démographie finance — aucune dette laissée."));

    $("mini-stats").innerHTML =
      '<div class="mini"><b>' + fmt0(r.pension) + " €/mois net</b><span>pension" +
      (r.futur ? (coche ? " (maintenue)" : " (à l'équilibre)") : " (règles réelles)") + "</span></div>" +
      '<div class="mini"><b>' + (r.beAge ? Math.round(r.beAge) + " ans" : "jamais") +
      "</b><span>versements remboursés à</span></div>" +
      '<div class="mini"><b>' + fmt0(r.heures) + " h</b><span>de travail pour payer ses cotisations</span></div>" +
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
   * L'OBJECTIF (pension de X € nets, départ en YYYY) se règle en % du revenu
   * net de référence — salaire MOYEN par défaut, MÉDIAN au choix. La pension
   * financée = taux × ratio(année) × salaire brut de référence × 0,909.
   * Passé ≤ 2025 : tout est figé (taux, âge légal, démographie de l'époque).
   * Futur : deux leviers seulement — taux (% du brut) et âge (jusqu'à 95 ans,
   * ≈ +0,06 cotisant/retraité par année de report ; natalité +0,1 après 2050). */
  const INV = { annee: 2050, ciblePct: 72, cible: 1470, tauxPct: 28.1, age: 64,
                natal: false, base: "moyen" };
  const ageHisto = (an) => an < 1983 ? 65 : an < 2011 ? 60 : an < 2023 ? 62 : 64;
  const estPasse = () => INV.annee <= 2025;
  const effTauxPct = () => estPasse() ? interp(P.taux, INV.annee) * 100 : INV.tauxPct;
  const effAge = () => estPasse() ? ageHisto(INV.annee) : INV.age;
  const salBrutRef = () => P.salBase[INV.base];
  const salNetRef = () => Math.round(salBrutRef() * P.NET2BRUT);
  const baseLabel = () => INV.base === "moyen" ? "moyen" : "médian";
  function ratioEff() {
    const base = interp(P.ratio, INV.annee);
    if (estPasse()) return base;               // l'histoire intègre déjà les âges réels
    return clamp(base + 0.06 * (INV.age - 64) +
                 (INV.natal && INV.annee >= 2050 ? 0.1 : 0), 0.5, 3.2);
  }
  const financeOut = () => (effTauxPct() / 100) * ratioEff() * salBrutRef() * P.PNET;
  const tauxNecessaire = () => INV.cible / (ratioEff() * salBrutRef() * P.PNET) * 100;
  function ageNecessaire() {
    const needRatio = INV.cible / ((INV.tauxPct / 100) * salBrutRef() * P.PNET);
    return 64 + (needRatio - interp(P.ratio, INV.annee) -
                 (INV.natal && INV.annee >= 2050 ? 0.1 : 0)) / 0.06;
  }

  const REP = '<div class="reperes" style="display:flex;gap:4px 10px;flex-wrap:wrap;font-size:11px;color:var(--ink-soft);margin-top:3px">';
  const rep = (data, val, txt) =>
    '<span class="repere" ' + data + '="' + val + '" style="cursor:pointer;border-bottom:1px dotted #B9AE97">' + txt + "</span>";
  $("inv-controls").innerHTML =
    '<div class="cible-block"><span class="titre" id="cible-titre"></span>' +
    '<div class="ctl"><label for="inv-cible">Niveau de pension (en % du revenu net <span id="lbl-base">moyen</span>) ' +
    '<output id="out-inv-cible"></output></label>' +
    '<input type="range" id="inv-cible" min="30" max="110" step="1">' +
    REP + "Repères : " + rep("data-pct", 50, "modeste 50 %") + " · " +
    rep("data-pct", 72, "pension moyenne actuelle 72 %") + " · " +
    rep("data-pct", 100, "égale au salaire 100 %") + "</div>" +
    '<div style="font-size:11px;color:var(--ink-soft);margin-top:6px">ℹ️ 72 % du revenu ne veut pas dire ' +
    "72 % du niveau de vie : logement souvent possédé, deux pensions par ménage, fiscalité plus douce — " +
    "le niveau de vie des retraités égale celui du reste de la population (COR 2025).</div>" +
    '<div class="ctl" id="ctl-inv-annee" style="margin-top:12px"><label for="inv-annee">Année du départ à la retraite ' +
    '<output id="out-inv-annee"></output></label>' +
    '<input type="range" id="inv-annee" min="1975" max="2070" step="1">' +
    REP + "Repères : " + rep("data-an", 1980, "1980") + " · " + rep("data-an", 2000, "2000") + " · " +
    rep("data-an", 2025, "aujourd’hui") + " · " + rep("data-an", 2050, "2050") + " · " +
    rep("data-an", 2070, "2070") + "</div></div>" +
    '<div class="ctl" id="ctl-inv-taux"><label for="inv-taux">LEVIER 1 — taux de cotisation retraite (en % du salaire brut) ' +
    '<output id="out-inv-taux"></output></label>' +
    '<input type="range" id="inv-taux" min="8" max="60" step="0.1">' +
    REP + "Situation actuelle : " + rep("data-taux", 28.1, "<b>28,1 %</b>") + " · 1980 : 19 %</div></div>" +
    '<div class="ctl" id="ctl-inv-age"><label for="inv-age">LEVIER 2 — âge de départ à la retraite ' +
    '<output id="out-inv-age"></output></label>' +
    '<input type="range" id="inv-age" min="60" max="95" step="1">' +
    REP + "Situation actuelle : " + rep("data-age", 64, "<b>64 ans</b> (âge légal)") +
    " · départ moyen constaté ≈ 62,8 ans</div></div>" +
    '<div class="sal-fixe" id="sal-fixe"></div>';

  function renderSalFixe() {
    const chip = (b, txt) => INV.base === b ? "<b>" + txt + "</b>"
      : '<span class="repere" data-base="' + b + '" style="cursor:pointer;border-bottom:1px dotted #B9AE97">' + txt + "</span>";
    $("sal-fixe").innerHTML = "💶 Hypothèse : les cotisants gagnent le " +
      chip("moyen", "salaire moyen") + " · " + chip("median", "salaire médian") +
      " — soit " + fmt0(salBrutRef()) + " € bruts (≈ " + fmt0(salNetRef()) + " € nets) par mois. " +
      (INV.base === "moyen"
        ? "Le salaire moyen est calculé pour retrouver exactement les 269 Md€ de cotisations retraite encaissées chaque année."
        : "Le salaire médian (≈ 81 % du moyen) décrit mieux le cotisant type : la moitié des salariés gagne moins.") +
      " Ce n'est pas un levier : la richesse des cotisants ne se décrète pas.";
  }

  $("inv-cible").addEventListener("input", (e) => { INV.ciblePct = +e.target.value; renderInverse(); });
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
    if (r.dataset.pct) INV.ciblePct = +r.dataset.pct;
    if (r.dataset.an) INV.annee = +r.dataset.an;
    if (r.dataset.taux && !estPasse()) INV.tauxPct = +r.dataset.taux;
    if (r.dataset.age && !estPasse()) INV.age = +r.dataset.age;
    if (r.dataset.base) INV.base = r.dataset.base;
    renderInverse();
  });

  const SCENARIOS = [
    { lab: "→ Fermer l’écart par le TAUX", run: () => {
        if (estPasse()) return "passe";
        INV.tauxPct = clamp(tauxNecessaire(), 8, 60);
      } },
    { lab: "→ Fermer l’écart par l’ÂGE", run: () => {
        if (estPasse()) return "passe";
        INV.age = Math.round(clamp(ageNecessaire(), 60, 95));
      } },
    { lab: "Natalité +0,2 enfant/femme", run: () => { INV.natal = !INV.natal; } },
    { lab: "↺ Règles d’aujourd’hui", run: () => {
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
        ? "Le passé est figé : placez d’abord le curseur après 2025." : "";
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
  // le bloc pension = L'OBJECTIF : rempli à hauteur du financé, le manque en pointillé
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
    s += '<text x="105" y="152" text-anchor="middle" style="font:700 12px Helvetica" fill="#1E2430">L’OBJECTIF : ' +
         fmt0(cible) + " €</text>" +
         '<text x="105" y="167" text-anchor="middle" style="font:600 10.5px Helvetica" fill="#4A5265">rempli = financé par les cotisations</text>';
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
    INV.cible = Math.round(INV.ciblePct / 100 * salNetRef() / 10) * 10;   // € dérivé du %
    const R = ratioEff(), finance = financeOut(), txt = effTauxPct(), age = effAge();
    const gap = INV.cible - finance;
    const atteint = Math.abs(gap) <= INV.cible * 0.01 || finance > INV.cible;

    $("cible-titre").innerHTML = "🎯 L’OBJECTIF — une pension de <b>" + fmt0(INV.cible) +
      " € nets</b>, départ à la retraite en <b>" + INV.annee + "</b>";
    $("lbl-base").textContent = baseLabel();
    renderSalFixe();

    $("inv-cible").value = INV.ciblePct;
    $("inv-annee").value = INV.annee;
    $("inv-taux").value = Math.round(txt * 10) / 10;
    $("inv-age").value = age;
    $("inv-taux").disabled = passe; $("inv-age").disabled = passe;
    $("ctl-inv-taux").classList.toggle("locked", passe);
    $("ctl-inv-age").classList.toggle("locked", passe);
    $("out-inv-cible").textContent = INV.ciblePct + " % ≈ " + fmt0(INV.cible) + " € nets/mois";
    $("out-inv-annee").textContent = INV.annee + (passe ? " (figé)" : "");
    const dT = txt - 28.1;
    $("out-inv-taux").textContent = pct1(txt / 100) + " %" + (passe ? " 🔒"
      : (Math.abs(dT) >= 0.3 ? " (" + (dT > 0 ? "+" : "−") + pct1(Math.abs(dT) / 100) +
         " pt" + (Math.abs(dT) >= 2 ? "s" : "") + ")" : ""));
    const neRet = INV.annee - age, durRet = Math.max(0, evGen(neRet).mixte - age);
    $("out-inv-age").textContent = age + " ans" + (passe ? " 🔒"
      : (age !== 64 ? " (" + (age > 64 ? "+" : "−") + Math.abs(age - 64) + ")" : "") +
        " · retraite ≈ " + durRet + " an" + (durRet > 1 ? "s" : ""));

    $("inv-verrou").textContent = "🔒 Démographie " + INV.annee + " : " +
      fmt2(interp(P.ratio, INV.annee)) + " cotisant(s) par retraité — " +
      (passe ? "historique (le passé ne se refait pas)" : "projection COR (seuls l’âge et la natalité, 25 ans plus tard, la font bouger)");

    // — LE TABLEAU DE BORD DE L'ÉCART (bandeau d'état pleine largeur) —
    const pctFill = clamp(finance / INV.cible * 100, 0, 100);
    $("inv-result").className = atteint ? "ok" : "ko";
    $("inv-result").innerHTML = atteint
      ? '<span class="big ok">✓ objectif financé</span>' +
        '<span class="lab">la pension de ' + fmt0(INV.cible) + " € en " + INV.annee +
        " est payée : taux " + pct1(txt / 100) + " %, départ à " + age + " ans</span>" +
        '<div class="jauge"><div class="fill ok" style="width:100%"></div></div>'
      : '<span class="big">' + fmt0(finance) + " € financés</span>" +
        '<span class="delta neg">manque ' + fmt0(gap) + " €/mois (" +
        Math.round(finance / salNetRef() * 100) + " % du revenu, objectif " + INV.ciblePct + " %)</span>" +
        '<span class="lab">pour une pension de ' + fmt0(INV.cible) + " € en " + INV.annee +
        (passe ? " — c’est la part payée par les cotisations ; le reste vient des impôts et de la dette"
               : " — fermez l’écart avec les leviers") + "</span>" +
        '<div class="jauge"><div class="fill" style="width:' + pctFill + '%"></div></div>';

    renderBalance(INV.cible, finance);
    const parCot = (finance / P.PNET) / R;
    $("bal-caption").innerHTML = "Cette pension repose sur <b>" + fmt2(R) + " cotisant" +
      (R >= 2 ? "s" : "") + "</b> — pas un de plus. Chacun y consacre <b>" + fmt0(parCot) +
      " €/mois</b>, soit " + pct1(txt / 100) + " % de son salaire brut." +
      (R % 1 > 0.01 ? " La silhouette en pointillé : le cotisant qui manque." : "");

    let phr;
    if (passe) {
      phr = "En <b>" + INV.annee + "</b>, chaque retraité était porté par " + fmt2(R) +
        " cotisants : " + pct1(txt / 100) + " % de cotisation (départ à " + age +
        " ans) suffisaient à verser <b>≈ " + fmt0(finance) + " € nets</b>." +
        (INV.cible <= finance
          ? " Une pension de " + fmt0(INV.cible) + " € était <b>couverte sans effort</b>."
          : " Pour une pension de " + fmt0(INV.cible) + " €, il manquait déjà " +
            fmt0(INV.cible - finance) + " €" +
            (INV.annee >= 2000
              ? " — un manque bien réel, comblé par les <b>impôts et la dette</b> : " +
                "aujourd’hui <b>136 Md€ par an</b>, <a href=\"../treemap.html#realite\">le bloc " +
                "cramoisi du Mondrian</a>"
              : "") + ".") +
        " Le passé est figé.";
    } else if (atteint) {
      phr = "<b>Voilà ce que coûte une pension de " + fmt0(INV.cible) + " € en " + INV.annee +
        "</b> : " + fmt2(R) + " cotisant(s) y consacrent " + pct1(txt / 100) +
        " % de leur salaire brut (" + fmt0(parCot) + " €/mois chacun)" +
        (txt > 28.4 ? ", contre 28,1 % aujourd’hui (+" + pct1((txt - 28.1) / 100) + " pt)." : ".");
    } else {
      const tN = tauxNecessaire(), aN = ageNecessaire();
      phr = "Avec ces réglages, il manque <b>" + fmt0(gap) + " €/mois</b>. Pour servir " +
        fmt0(INV.cible) + " € en " + INV.annee + " : taux à <b>" +
        (tN > 60 ? "plus de 60 %" : pct1(Math.min(tN, 60) / 100) + " %") + "</b> <b>OU</b> départ à <b>" +
        (aN > 95 ? "plus de 95 ans (autant dire jamais)" : Math.ceil(aN) + " ans") +
        "</b> — ou réviser l’objectif à la baisse.";
    }
    $("inv-phrase").innerHTML = phr;

    const dR2 = evGen(INV.annee - age).mixte - age;
    $("inv-note").textContent = scenNote ||
      (!passe && dR2 <= 5 ? "⚠ À ce départ, la retraite ne durerait plus que ≈ " + Math.max(0, dR2) +
        " an" + (dR2 > 1 ? "s" : "") + " (espérance de vie de cette génération : ≈ " +
        evGen(INV.annee - age).mixte + " ans)." :
      (INV.natal && INV.annee < 2050 && !passe
        ? "⚠ Natalité : aucun effet avant ~2050 (les bébés d’aujourd’hui cotisent dans 25 ans)."
        : (INV.natal && INV.annee >= 2050 ? "Natalité +0,2 : ratio +0,1 — le levier le plus lent." : "")));
    scenNote = "";
  }

  /* ---------- orchestration ---------- */
  function renderAll() {
    renderCards();
    renderDetail();
    renderInverse();
  }
  window.addEventListener("resize", () => chart.resize());
  syncAdv();
  renderAll();
})();
