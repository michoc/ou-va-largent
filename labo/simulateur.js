/* ==========================================================================
 * LE LABO — « La même vie, née quatre fois » + le jeu « Équilibrer 2050 » (v17)
 * --------------------------------------------------------------------------
 * ACTE ① : 4 cartes générations, même carrière. CASCADE DE LA DETTE : chaque
 * carte peut cocher « maintenir la pension et léguer la dette » — la dette
 * passe à la génération suivante (cumulable). Chaque carte affiche DEUX
 * chiffres : en petit le contrefactuel « à l'équilibre, sans dette », en
 * grand la situation résultant des cases cochées. Compenser une dette
 * héritée = cotisations supplémentaires chiffrées en €/mois, converties en
 * Md€/an et en « fois les loyers versés en France » (95 Md€/an).
 *
 * ACTE ② : le jeu « Équilibrer 2050 ». La pension est une PROMESSE (la pension
 * moyenne réelle par retraité : 422,2 Md€ ÷ 17,4 M ≈ 1 840 € nets) ; les cotisations
 * seules en financent 66 % ; l'écart est « pris ailleurs » (impôts, dette, budgets des
 * ministères), le levier réellement utilisé aujourd'hui. Trois leviers le
 * réduisent (taux → cotisants, âge → futurs retraités, promesse → retraités) ;
 * chaque levier affiche son coût humain ; des niveaux = scénarios réels ; une
 * carte « Mon équilibre 2050 » dit qui paie quoi. La balance aux silhouettes
 * dessine les cotisants disponibles et manquants en nombre exact.
 *
 * Ton NEUTRE et factuel partout (pas de « vous » pour le retraité, pas
 * d'idiomes). Euros d'aujourd'hui ; salaires nets saisis (÷ 0,78 → brut) ;
 * pensions nettes (× 0,909). Calage : salaire moyen par tête → 277 Md€ de
 * cotisations réelles. Heures cotisées = Σ taux(an) × heures travaillées(an).
 * ========================================================================== */

(function () {
  "use strict";

  /* ---------- formatage (U+202F comme le site) ---------- */
  const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");   // espace insécable (comme le site)
  const fmt0 = (v) => group(Math.round(Number(v)).toString());
  const fmtK = (v) => group((Math.round(Number(v) / 1000) * 1000).toString());
  const fmt2 = (v) => group(Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/\s/g, ""));
  const fmt1 = (v) => Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const pct1 = (v) => (v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const $ = (id) => document.getElementById(id);

  /* ---------- paramètres sourcés (prototype — « à consolider ») ---------- */
  const P = {
    // taux de cotisation vieillesse GLOBAL (salarié + employeur, complémentaires
    // comprises) : ≈ 13 % en 1970 (RG 8,5 % + ARRCO naissante) → 28,1 % en 2025 ;
    // série calée sur les 2 ancres solides : moyenne de carrière 22 % pour les
    // générations 65+ (S. Catherine) et taux actuel 28,1 %
    taux: [[1970, 0.13], [1980, 0.185], [1990, 0.23], [2000, 0.255],
           [2010, 0.267], [2017, 0.279], [2025, 0.281], [2110, 0.281]],
    ratio: [[1970, 3.0], [1980, 2.6], [1990, 2.3], [2000, 2.05],
            [2005, 2.0], [2010, 1.9], [2020, 1.8], [2025, 1.76],
            [2040, 1.55], [2055, 1.42], [2070, 1.3], [2120, 1.3]],
    // ratio COR juin 2026 : 2,1 (2002) → 1,8 (2025 : 30,6 M cotisants / 17,4 M retraités) → 1,3 (2070)
    heuresAn: [[1970, 1850], [1982, 1745], [2000, 1715], [2002, 1610], [2120, 1607]],
    NET2BRUT: 0.78, PNET: 0.909,
    salBase: { moyen: 2685, median: 2175 },   // bruts PAR TÊTE ; moyen calé sur 277 Md€ de cotisations (COR 2025)
    subvParActif: 4750,                       // 145,2 Md€/an (non contributif, COR 2025) ÷ 30,6 M cotisants
    nbCotisants: 30.6e6,
    nbRetraites: 17.4e6,                      // retraités de droit direct (COR 2025) — remplacé par la donnée du site si joignable
    pensionsMd: 422.2, cotisationsMd: 277.0,  // COR juin 2026, tableau 2.2 — idem
    // croissance réelle du salaire moyen (SMPT) : ≈ 1 %/an observé jusqu'en 2025, 0,7 % en
    // projection (COR, scénario de référence). Les pensions sont indexées sur les PRIX :
    // relativement au salaire moyen, une pension perd g par an — c'est l'actualisation
    // « SMPT » de l'INSEE, qui rend les ratios des cartes comparables à ses taux de récupération.
    gSmpt: (an) => (an <= 2025 ? 0.010 : 0.007),
    loyersMdAn: 95,                           // loyers versés en France (Md€/an)
    smicNetAnnuel: 17900,
    // fin de vie (à 65 ans) : 86,5 en 2025, pente ≈ +1 mois/an ; plancher −6
    // pour l'HISTORIQUE (≈ 81-82 ans vers 1975-80), plafond +5 pour le futur
    evBase: 86.5, evPente: 0.09, evMin: -6, evMax: 5, evCadre: 2.5, evOuvrier: -3,
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
  // part du dernier BRUT servie en pension (règles réelles), dégressive avec le salaire ;
  // calée pour que la génération 1950 au salaire médian récupère ≈ 1,75 € par € cotisé
  // (INSEE, Dubois & Marino 2016, actualisation SMPT) — soit ≈ 77 % du dernier net.
  const tauxRemplacement = (brutFin) =>
    clamp(0.72 - (brutFin - 1800) * (0.135 / 3700), 0.45, 0.765);

  /* ---------- profils ---------- */
  const PROFILS = [
    { id: "smic", nom: "Carrière au SMIC", carr: "au SMIC", s0: 1426, s1: 1426, entree: 18 },
    { id: "median", nom: "Salaire médian", carr: "au salaire médian", s0: 1700, s1: 2600, entree: 20 },
    { id: "ens", nom: "Enseignante", carr: "d'enseignante", s0: 1900, s1: 3100, entree: 23 },
    { id: "cadre", nom: "Cadre", carr: "de cadre", s0: 1950, s1: 4290, entree: 22 },
    { id: "ouvrier", nom: "Ouvrier", carr: "d'ouvrier", s0: 1480, s1: 1870, entree: 18 },
  ];
  const GENS = [
    { naissance: 1950, depart: 61 },
    { naissance: 1975, depart: 64 },
    { naissance: 2000, depart: 65 },
    { naissance: 2026, depart: 66 },
  ];

  /* ---------- état ---------- */
  let profil = PROFILS[3];
  let selGen = 2000;
  let custom = null;                    // situation personnalisée {…, dette:bool}
  const legs = { 1950: true, 1975: false, 2000: false, 2026: false };
  let chain = {};

  /* ---------- moteur : une vie ---------- */
  function lifeParams(naissance, depart) {
    return { naissance: naissance, entree: profil.entree, depart: depart,
             deces: Math.max(evGen(naissance).mixte, depart + 1),
             s0: profil.s0, s1: profil.s1 };
  }
  // opts : maintenir (pension aux règles actuelles) · ardoise (dette héritée à
  // rembourser, € sur la carrière) · detteSysteme (part des 145 Md€/an après 2025)
  function computeLife(L, opts) {
    opts = opts || {};
    const ardoise = opts.ardoise || 0;
    const anDepart = L.naissance + L.depart;
    const futur = anDepart > 2025;
    const nAns = L.depart - L.entree;
    const netM = (a) => L.s0 + (L.s1 - L.s0) * (nAns <= 1 ? 1 : (a - L.entree) / (nAns - 1));
    const brutM = (a) => netM(a) / P.NET2BRUT;

    let cot = 0, impotsSys = 0, impAcc = 0, tauxSum = 0, heures = 0;
    const impotArdoiseAn = nAns > 0 ? ardoise / nAns : 0;
    const cumVerse = [], cumCot = [], cumImp = [];
    for (let a = L.entree; a < L.depart; a++) {
      const an = L.naissance + a, tx = interp(P.taux, an);
      tauxSum += tx;
      cot += brutM(a) * 12 * tx;
      heures += tx * interp(P.heuresAn, an);
      let impAnnee = impotArdoiseAn;
      if (opts.detteSysteme && an > 2025) {
        const x = P.subvParActif * (brutM(a) / P.salBase.moyen);
        impotsSys += x; impAnnee += x;
      }
      impAcc += impAnnee;
      cumCot.push([a + 1, cot]);
      cumImp.push([a + 1, impAcc]);
      cumVerse.push([a + 1, cot + impAcc]);
    }
    const verse = cot + ardoise + impotsSys;
    const ratio = interp(P.ratio, anDepart);
    const brutFin = L.s1 / P.NET2BRUT;
    const duree = L.deces - L.depart;
    const pensionEq = interp(P.taux, anDepart) * ratio * brutFin * P.PNET;
    const pensionMaint = tauxRemplacement(brutFin) * brutFin * P.PNET;
    const pension = opts.forceEq ? pensionEq
      : (!futur ? pensionMaint : (opts.maintenir ? pensionMaint : pensionEq));
    // le REÇU, année par année, relativement au salaire moyen de l'année (la pension,
    // indexée sur les prix, perd gSmpt par an face aux salaires) ; cumuls pour le graphique
    const gapMois = Math.max(0, pension - pensionEq);
    let recu = 0, recuEq = 0, f = 1, beAge = null;
    const cumRecu = [], cumRecuEq = [];
    for (let a = L.depart; a < L.deces; a++) {
      f /= (1 + P.gSmpt(L.naissance + a));
      const prev = recu;
      recu += pension * 12 * f;
      recuEq += Math.min(pension, pensionEq) * 12 * f;
      if (beAge == null && recu >= verse && verse > 0) beAge = a + (recu - prev > 0 ? (verse - prev) / (recu - prev) : 0);
      cumRecu.push([a + 1, recu]); cumRecuEq.push([a + 1, recuEq]);
    }
    const detteLeguee = gapMois * 12 * duree / ratio;    // par actif de la génération suivante
    return { L, anDepart, futur, ratio, cot, ardoise, impotsSys, verse, pension, pensionEq,
             pensionMaint, gapMois, detteLeguee, duree, recu, ratioMise: recu / verse,
             beAge, heures, smicAns: recu / P.smicNetAnnuel,
             cumVerse, cumCot, cumImp, cumRecu, cumRecuEq, tauxDebut: interp(P.taux, L.naissance + L.entree),
             tauxFin: interp(P.taux, anDepart - 1), tauxMoyen: nAns > 0 ? tauxSum / nAns : 0 };
  }
  function computeChain() {
    chain = {};
    let dette = 0;
    GENS.forEach((g) => {
      const coche = legs[g.naissance];
      const r = computeLife(lifeParams(g.naissance, g.depart),
        { maintenir: coche, ardoise: coche ? 0 : dette });
      r.herite = coche ? 0 : dette;
      dette = coche ? dette + r.detteLeguee : 0;
      r.transmet = coche ? dette : 0;
      // contrefactuel : la même vie À L'ÉQUILIBRE, sans dette héritée ni léguée
      r.eq = (coche || r.herite > 0)
        ? computeLife(lifeParams(g.naissance, g.depart), { forceEq: true }) : null;
      chain[g.naissance] = r;
    });
    return dette;
  }

  /* ---------- ACTE ① : les 4 cartes ---------- */
  function miniSquares(verse, recu) {
    const k = 42 / Math.sqrt(Math.max(verse, recu));
    const sv = Math.max(8, Math.sqrt(verse) * k), sr = Math.max(8, Math.sqrt(recu) * k);
    const H = Math.max(sv, sr) + 16, W = sv + sr + 40;
    return '<svg class="gc-squares" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">' +
      '<rect x="0" y="' + (H - 16 - sv) + '" width="' + sv + '" height="' + sv + '" rx="2" fill="#6E5BAE"></rect>' +
      '<text x="' + sv / 2 + '" y="' + (H - 4) + '" text-anchor="middle" style="font:600 9px Helvetica">versé</text>' +
      '<rect x="' + (sv + 40 - sr) + '" y="' + (H - 16 - sr) + '" width="' + sr + '" height="' + sr + '" rx="2" fill="#8E1B38"></rect>' +
      '<text x="' + (sv + 40 - sr / 2) + '" y="' + (H - 4) + '" text-anchor="middle" style="font:600 9px Helvetica">reçu</text></svg>';
  }
  const enImpotsMois = (dette, nAnsCarriere) => dette / ((nAnsCarriere || 43) * 12);
  // conversion macro d'un supplément de cotisation par tête : Md€/an et loyers
  const enMdAn = (parMois) => parMois * P.nbCotisants * 12 / 1e9;

  function renderCards() {
    const resteEnfants = computeChain();
    $("gen-cards").innerHTML = GENS.map((g, i) => {
      const r = chain[g.naissance];
      const win = r.ratioMise >= 1;
      const coche = legs[g.naissance];
      const nAns = g.depart - profil.entree;
      // contrefactuel « à l'équilibre, sans dette » quand la situation en diffère
      const eqLigne = r.eq
        ? '<span class="gc-eq">à l’équilibre, sans dette : × ' + fmt2(r.eq.ratioMise) + "</span>" : "";
      let lignes = "";
      if (r.herite > 0) {
        const parMois = enImpotsMois(r.herite, nAns);
        const mdAn = enMdAn(parMois);
        lignes += '<br><span class="gc-dette">Compenser la dette laissée : ≈ <b>' + fmt0(parMois) +
          " €</b> de cotisations en plus par mois, toute la carrière — au global ≈ <b>" +
          fmt0(mdAn) + " Md€ par an</b>, soit " + fmt1(mdAn / P.loyersMdAn) +
          " fois les loyers versés en France</span>";
      }
      if (coche)
        lignes += '<br><span class="gc-dette">Lègue une dette ≈ <b>' +
          fmt0(enImpotsMois(r.transmet, 43)) + " €/mois</b> (une carrière entière) " +
          (i < GENS.length - 1 ? "à la génération suivante" : "aux enfants nés vers 2050") + "</span>";
      return '<div class="gen-card' + (selGen === g.naissance && !custom ? " on" : "") +
        '" data-annee="' + g.naissance + '" role="button" tabindex="0">' +
        '<span class="gc-year">Né en ' + g.naissance + "</span>" + eqLigne +
        '<span class="gc-ratio ' + (win ? "gagnant" : "perdant") + '">× ' + fmt2(r.ratioMise) + "</span>" +
        '<span class="gc-sub">' + (win ? "récupère " : "récupère ") + fmt2(r.ratioMise) +
        " € par € versé</span>" + miniSquares(r.verse, r.recu) +
        '<span class="gc-facts">départ à <b>' + g.depart + "</b> ans · pension <b>" +
        fmt0(r.pension) + "</b> €/mois net<br>" +
        (r.beAge ? "versements remboursés à <b>" + Math.round(r.beAge) + " ans</b>"
                 : "<b>versements jamais remboursés</b>") + lignes + "</span>" +
        '<label class="gc-leg"><input type="checkbox" data-leg="' + g.naissance + '"' +
        (coche ? " checked" : "") + "> maintenir la pension et léguer la dette" +
        (g.naissance === 1950 ? " (ce qui s’est réellement passé)" : "") + "</label></div>";
    }).join("");
    $("gen-caption").innerHTML =
      "Même carrière " + profil.carr + " (" + fmt0(profil.s0) + " → " + fmt0(profil.s1) +
      " € nets par mois), chaque euro compté relativement au salaire moyen de son année — seule l’année de naissance change." +
      (legs[1950]
        ? " <b>La dette léguée se paie en impôts</b> — aujourd’hui, elle est comblée en prenant " +
          "ailleurs dans le budget : 145 Md€ par an (2025), 1,6 fois le budget de l’Éducation nationale."
        : "") +
      (resteEnfants > 0 && legs[2026]
        ? " <b>Dette finale laissée aux enfants : ≈ " +
          fmt0(enImpotsMois(resteEnfants, 43)) + " €/mois pendant toute leur carrière.</b>" : "");
  }
  $("gen-cards").addEventListener("click", (e) => {
    if (e.target.closest(".gc-leg")) return;
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
    { id: "depart", lab: "Âge de départ", min: 52, max: 85, step: 1, fmt: (v) => v + " ans" },
    { id: "deces", lab: "Fin de vie", min: 72, max: 105, step: 1, fmt: (v) => v + " ans" },
    { id: "s0", lab: "Salaire net — début de carrière", min: 1200, max: 12000, step: 50, fmt: (v) => fmt0(v) + " €" },
    { id: "s1", lab: "Salaire net — fin de carrière", min: 1200, max: 12000, step: 50, fmt: (v) => fmt0(v) + " €" },
  ];
  $("controls-adv").innerHTML =
    '<label class="adv-dette" id="lbl-maintenir"><input type="checkbox" id="in-maintenir"> ' +
    "maintenir la pension au niveau actuel — la différence est financée par la dette (léguée)</label>" +
    '<label class="adv-dette" id="lbl-dette"><input type="checkbox" id="in-dette"> ' +
    "rembourser la dette actuelle du système — part des 145 Md€/an, en impôts, années travaillées après 2025</label>" +
    ADV.map((c) =>
      '<div class="ctl"><label for="in-' + c.id + '">' + c.lab +
      ' <output id="out-' + c.id + '"></output></label>' +
      '<input type="range" id="in-' + c.id + '" min="' + c.min + '" max="' + c.max +
      '" step="' + c.step + '"></div>').join("");
  function currentLife() {
    if (custom) return custom;
    const g = GENS.find((x) => x.naissance === selGen) || GENS[2];
    return lifeParams(g.naissance, g.depart);
  }
  // premier réglage personnalisé : on HÉRITE de l'état de la carte sélectionnée
  // (pension maintenue ou non) — pas de bascule silencieuse de financement
  function spawnCustom(mods) {
    const base = custom ? Object.assign({}, custom)
      : Object.assign({ maintenir: !!legs[selGen], dette: false }, currentLife());
    return Object.assign(base, mods);
  }
  function currentResult() {
    if (custom) return computeLife(custom,
      { maintenir: !!custom.maintenir, detteSysteme: !!custom.dette });
    return chain[selGen] || computeLife(currentLife(), {});
  }
  function syncAdv() {
    const L = currentLife();
    ADV.forEach((c) => { $("in-" + c.id).value = L[c.id]; $("out-" + c.id).textContent = c.fmt(L[c.id]); });
    const anDep = L.naissance + L.depart;
    const passe = anDep <= 2025;
    $("in-maintenir").checked = custom ? !!custom.maintenir : !!legs[selGen];
    $("in-dette").checked = !!(custom && custom.dette);
    // sans effet pour une vie déjà partie : le passé a eu les règles réelles,
    // et la part des 145 Md€ ne concerne que les années travaillées après 2025
    $("in-maintenir").disabled = passe;
    $("in-dette").disabled = passe;
    $("lbl-maintenir").classList.toggle("off", passe);
    $("lbl-dette").classList.toggle("off", passe);
    $("lbl-maintenir").title = passe ? "Départ avant 2026 : les pensions ont été servies aux règles réelles." : "";
    $("lbl-dette").title = passe ? "Aucune année travaillée après 2025 : pas de part des 145 Md€/an." : "";
  }
  ADV.forEach((c) => {
    $("in-" + c.id).addEventListener("input", (e) => {
      const L = spawnCustom({});
      L[c.id] = +e.target.value;
      L.depart = clamp(L.depart, L.entree + 1, 85);
      L.deces = Math.max(L.deces, L.depart + 1);
      if (L.s1 < L.s0) (c.id === "s0") ? L.s1 = L.s0 : L.s0 = L.s1;
      custom = L;
      syncAdv(); renderAll();
    });
  });
  $("in-maintenir").addEventListener("change", (e) => {
    custom = spawnCustom({ maintenir: e.target.checked });
    syncAdv(); renderAll();
  });
  $("in-dette").addEventListener("change", (e) => {
    custom = spawnCustom({ dette: e.target.checked });
    syncAdv(); renderAll();
  });

  const chart = echarts.init($("sim-chart"), null, { renderer: "canvas" });
  // hachures OCRE = la part « dette » (couleur dédiée, distincte du versé violet
  // et du reçu cramoisi ; motif canvas comme les hachures du poster Sankey)
  const DETTE_COL = "#B07E1F";
  const HATCH_DETTE = (function () {
    const c = document.createElement("canvas"); c.width = c.height = 8;
    const g = c.getContext("2d");
    g.fillStyle = "rgba(217,164,65,.30)"; g.fillRect(0, 0, 8, 8);
    g.strokeStyle = "#D9A441"; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.stroke();
    return { image: c, repeat: "repeat" };
  })();

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
    custom = spawnCustom({});
    custom.deces = Math.max(+u.dataset.set, custom.depart + 1);
    syncAdv(); renderAll();
  });

  /* « La vie en détail » : TROIS colonnes — VERSÉ pendant la carrière · REÇU
   * pendant la retraite · L'ÉCART — puis la règle appliquée, puis le graphique
   * des cumuls (versé en violet, reçu en cramoisi, la part payée ou reçue au
   * titre de la dette en hachures ocre). */
  function renderDetail() {
    const r = currentResult();
    const L = r.L;
    $("detail").classList.toggle("custom", !!custom);
    const coche = custom ? !!custom.maintenir : !!legs[L.naissance];
    const nAns = L.depart - L.entree;
    const hasImp = r.ardoise > 0 || r.impotsSys > 0;
    const impName = r.ardoise > 0 ? "impôts pour la dette laissée par les aînés" : "impôts pour la dette du système (part des 145 Md€/an)";
    const recuDette = r.futur && coche && r.gapMois > 10;
    const ecart = r.recu - r.verse;

    $("vie-titre").textContent = "Né en " + L.naissance + " · carrière " + profil.carr +
      (custom ? " (situation personnalisée)" : "") + " · " + fmt0(L.s0) + " → " + fmt0(L.s1) + " € nets par mois";

    $("vie-cols").innerHTML =
      '<div class="vie-col verse"><span class="lab">Versé pendant la carrière</span>' +
        "<b>≈ " + fmtK(r.verse) + " €</b>" +
        "<small>de " + L.entree + " à " + L.depart + " ans (" + nAns + " ans) · cotisations retraite " +
        pct1(r.tauxMoyen) + " % du brut en moyenne (" + pct1(r.tauxDebut) + " % → " + pct1(r.tauxFin) + " %)" +
        (hasImp ? " · dont ≈ <b>" + fmtK(r.ardoise + r.impotsSys) + " €</b> d'" + impName : "") + "</small></div>" +
      '<div class="vie-col recu"><span class="lab">Reçu pendant la retraite</span>' +
        "<b>≈ " + fmtK(r.recu) + " €</b>" +
        "<small>de " + L.depart + " à " + L.deces + " ans (" + r.duree + " ans) · <b>" + fmt0(r.pension) +
        " € nets par mois</b> au départ" +
        (recuDette ? " · dont ≈ <b>" + fmtK(r.recu - r.cumRecuEq[r.cumRecuEq.length - 1][1]) + " €</b> financés par la dette léguée" : "") +
        "</small></div>" +
      '<div class="vie-col ecart ' + (ecart >= 0 ? "pos" : "neg") + '"><span class="lab">L\'écart</span>' +
        "<b>" + (ecart >= 0 ? "+" : "−") + " " + fmtK(Math.abs(ecart)) + " €</b>" +
        "<small><b>" + fmt2(r.ratioMise) + " € reçu pour 1 € versé</b> · " +
        (r.beAge ? "versements remboursés à " + Math.round(r.beAge) + " ans, le reste est payé par les cotisants du moment"
                 : "versements jamais remboursés") + "</small></div>";

    // la règle appliquée à cette vie, en une phrase
    let regle;
    if (!r.futur) regle = "Départ en " + r.anDepart + " : règles réellement appliquées — pension ≈ " +
      Math.round(r.pension / L.s1 * 100) + " % du dernier salaire net, indexée sur les prix.";
    else if (coche) regle = "Pension maintenue aux règles d'aujourd'hui (" + fmt0(r.pension) + " €) alors que " +
      fmt2(r.ratio) + " cotisant(s) par retraité n'en financent que " + fmt0(r.pensionEq) + " € : la différence est une dette léguée à la génération suivante.";
    else if (r.herite > 0) regle = "Pension à l'équilibre (ce que " + fmt2(r.ratio) + " cotisant(s) par retraité financent en " + r.anDepart +
      ") + remboursement de la dette laissée par les aînés : ≈ " + fmt0(enImpotsMois(r.ardoise, nAns)) + " € par mois toute la carrière.";
    else regle = "Pension à l'équilibre : ce que " + fmt2(r.ratio) + " cotisant(s) par retraité financent en " + r.anDepart +
      (r.impotsSys > 0 ? ", plus la part des 145 Md€/an de dette du système, en impôts, sur les années travaillées après 2025." : " — aucune dette laissée.");
    $("vie-regle").innerHTML = "<b>Règle appliquée :</b> " + regle +
      " Montants relatifs au salaire moyen de chaque année (actualisation « SMPT », comme l'INSEE).";

    $("mini-stats").innerHTML =
      '<div class="mini"><b>' + fmt0(r.heures) + " h</b><span>de travail pour payer ses cotisations</span></div>" +
      '<div class="mini"><b>' + fmt0(r.smicAns) + " an" + (r.smicAns >= 2 ? "s" : "") + "</b><span>de SMIC net reçus en pension</span></div>" +
      '<div class="mini"><b>' + fmt2(r.ratio) + "</b><span>cotisant(s) par retraité à son départ (" + r.anDepart + ")</span></div>";

    renderCoherence(r);

    // — le graphique des cumuls —
    const ages = [], vSer = [], cSer = [], iSer = [], rSer = [], rEqSer = [], rDetteSer = [];
    let vFin = 0, cFin = 0, iFin = 0, rFin = 0, reFin = 0;
    const last = (arr, a) => { const f = arr.filter((p) => p[0] <= a); return f.length ? f[f.length - 1][1] : null; };
    for (let a = L.entree; a <= L.deces; a++) {
      ages.push(a);
      let v; if ((v = last(r.cumVerse, a)) != null) vFin = v;
      if ((v = last(r.cumCot, a)) != null) cFin = v;
      if ((v = last(r.cumImp, a)) != null) iFin = v;
      if ((v = last(r.cumRecu, a)) != null) rFin = v;
      if ((v = last(r.cumRecuEq, a)) != null) reFin = v;
      vSer.push(Math.round(vFin)); cSer.push(Math.round(cFin)); iSer.push(Math.round(iFin));
      rSer.push(a >= L.depart ? Math.round(rFin) : 0);
      rEqSer.push(a >= L.depart ? Math.round(reFin) : 0);
      rDetteSer.push(a >= L.depart ? Math.round(rFin - reFin) : 0);
    }
    const series = [], legend = [];
    if (hasImp) {
      series.push({ name: "Versé — " + (r.ardoise > 0 ? "impôts (dette des aînés)" : "impôts (dette du système)"), type: "line", stack: "verse", data: iSer, symbol: "none",
        lineStyle: { color: DETTE_COL, width: 2 }, color: DETTE_COL, areaStyle: { color: HATCH_DETTE } });
      series.push({ name: "Versé — cotisations", type: "line", stack: "verse", data: cSer, symbol: "none",
        lineStyle: { color: "#6E5BAE", width: 3 }, color: "#6E5BAE", areaStyle: { color: "rgba(110,91,174,.14)" } });
      legend.push(series[0].name, "Versé — cotisations");
    } else {
      series.push({ name: "Versé — cotisations", type: "line", data: vSer, symbol: "none",
        lineStyle: { color: "#6E5BAE", width: 3 }, color: "#6E5BAE", areaStyle: { color: "rgba(110,91,174,.14)" } });
      legend.push("Versé — cotisations");
    }
    if (recuDette) {
      series.push({ name: "Reçu — financé par les cotisants", type: "line", stack: "recu", data: rEqSer, symbol: "none",
        lineStyle: { color: "#8E1B38", width: 3 }, color: "#8E1B38", areaStyle: { color: "rgba(142,27,56,.12)" } });
      series.push({ name: "Reçu — financé par la dette", type: "line", stack: "recu", data: rDetteSer, symbol: "none",
        lineStyle: { color: DETTE_COL, width: 2, type: "dashed" }, color: "#D9A441", areaStyle: { color: HATCH_DETTE } });
      legend.push("Reçu — financé par les cotisants", "Reçu — financé par la dette");
    } else {
      series.push({ name: "Reçu — pension", type: "line", data: rSer, symbol: "none",
        lineStyle: { color: "#8E1B38", width: 3 }, color: "#8E1B38", areaStyle: { color: "rgba(142,27,56,.12)" } });
      legend.push("Reçu — pension");
    }
    const marks = [{ xAxis: String(L.depart), label: { formatter: "départ " + L.depart + " ans", fontSize: 10, color: "#4A5265" }, lineStyle: { color: "#B9AE97", type: "dashed" } }];
    if (r.beAge) marks.push({ xAxis: String(Math.round(r.beAge)), label: { formatter: "remboursé", fontSize: 10, color: "#8E1B38" }, lineStyle: { color: "#8E1B38", type: "dotted" } });
    series[series.length - 1].markLine = { symbol: "none", silent: true, data: marks };
    chart.setOption({
      grid: { left: 64, right: 14, top: 40, bottom: 26 },
      legend: { data: legend, top: 0, textStyle: { fontSize: 10.5 } },
      tooltip: { trigger: "axis", valueFormatter: (v) => fmtK(v) + " €" },
      xAxis: { type: "category", data: ages.map(String), name: "âge", nameGap: 4, axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", axisLabel: { fontSize: 10, formatter: (v) => group(String(v / 1000)) + " k€" } },
      series: series,
    }, { replaceMerge: ["series", "legend"] });
    return r;
  }

  /* ---------- ACTE ② : le jeu « Équilibrer 2050 » ----------
   * La pension est une PROMESSE : la pension moyenne réelle par retraité, toutes
   * pensions comprises (422,2 Md€ ÷ 17,4 M retraités = 2 022 € bruts ≈ 1 840 € nets
   * par mois) ; les cotisations seules en financent 277 Md€, soit 66 % — l'écart
   * (145,2 Md€ en 2025, exactement le non contributif du site) est « pris ailleurs »
   * (impôts, dette, budgets des ministères) — le levier réellement utilisé
   * aujourd'hui, à son maximum. Trois leviers le réduisent : le taux (payé par
   * les cotisants), l'âge (payé par les futurs retraités en années de retraite),
   * la promesse (payée par les retraités). Les quatre parts sont mesurées par
   * rapport à la RÉFÉRENCE (28,1 % · 64 ans · promesse intacte). */
  const REF = { tauxPct: 28.1, age: 64, ciblePct: 100 };    // 100 % = la pension moyenne d'aujourd'hui
  const INV = { annee: 2050, ciblePct: 100, cible: 1840, tauxPct: 28.1, age: 64,
                natal: false, base: "moyen", niveau: null };
  // âge légal : 65 → 60 (réforme 1982, effective 1983) → montée 60→62
  // (réforme 2010, effective 2017) → montée 62→64 (réforme 2023) SUSPENDUE par la
  // LFSS 2026 (art. 105) : 62 ans 9 mois gelés jusqu'au 1er janvier 2028, puis
  // reprise à +3 mois par génération → 64 ans vers 2032 (si la réforme reprend)
  const ageHisto = (an) => an < 1983 ? 65 : an < 2011 ? 60 : an < 2017 ? 61
    : an < 2023 ? 62 : an < 2028 ? 62.75 : an < 2030 ? 63 : an < 2032 ? 63.5 : 64;
  const estPasse = () => INV.annee <= 2025;
  const effTauxPct = () => estPasse() ? interp(P.taux, INV.annee) * 100 : INV.tauxPct;
  const effAge = () => estPasse() ? ageHisto(INV.annee) : INV.age;
  const salBrutRef = () => P.salBase[INV.base];
  const salNetRef = () => Math.round(salBrutRef() * P.NET2BRUT);
  const baseLabel = () => INV.base === "moyen" ? "moyen" : "médian";
  const natalBonus = () => (INV.natal && INV.annee >= 2050 ? 0.1 : 0);
  function ratioAt(age) {
    const base = interp(P.ratio, INV.annee);
    if (estPasse()) return base;
    return clamp(base + 0.06 * (age - 64) + natalBonus(), 0.5, 3.2);
  }
  const ratioEff = () => ratioAt(effAge());
  const financeAt = (tauxPct, age) => (tauxPct / 100) * ratioAt(age) * salBrutRef() * P.PNET;
  const financeOut = () => financeAt(effTauxPct(), effAge());
  // la pension moyenne réelle par retraité (toutes pensions, tous régimes), en net
  const pensionMoyBrut = () => P.pensionsMd * 1e9 / P.nbRetraites / 12;
  const pensionMoyNet = () => pensionMoyBrut() * P.PNET;
  const cibleDe = (pct) => Math.round(pct / 100 * pensionMoyNet() / 10) * 10;
  // l'écart net par retraité → Md€ bruts par an (2025 : 145,2 par construction)
  const enMdAnRetraites = (gapNet, nRet) => gapNet / P.PNET * nRet * 12 / 1e9;
  const tauxNecessaire = () => INV.cible / (ratioEff() * salBrutRef() * P.PNET) * 100;
  function ageNecessaire() {
    const needRatio = INV.cible / ((INV.tauxPct / 100) * salBrutRef() * P.PNET);
    return 64 + (needRatio - interp(P.ratio, INV.annee) - natalBonus()) / 0.06;
  }
  // nombre de retraités de l'année : cotisants (≈ stables, COR) ÷ ratio
  const nbRetraites = () => P.nbCotisants / ratioEff();
  const ageTxt = (a) => {
    const y = Math.floor(a + 1e-9), m = Math.round((a - y) * 12);
    return y + " ans" + (m ? " " + m + " mois" : "");
  };
  const signe = (v, dec) => (v > 0 ? "+" : v < 0 ? "−" : "") + (dec ? fmt1(Math.abs(v)) : fmt0(Math.abs(v)));

  /* --- les leviers : un curseur, un coût humain, un payeur --- */
  const LEVIERS = [
    { id: "taux", nom: "Cotiser plus", qui: "payé par les cotisants, sur chaque fiche de paie",
      col: "#3D6FB4", min: 20, max: 45, step: 0.1, key: "tauxPct",
      fmt: (v) => pct1(v / 100) + " %",
      reperes: [["aujourd'hui", 28.1], ["+2 pts", 30.1], ["+4 pts", 32.1]] },
    { id: "age", nom: "Partir plus tard", qui: "payé par les futurs retraités, en années de retraite",
      col: "#7AA3D8", min: 60, max: 72, step: 0.25, key: "age",
      fmt: (v) => ageTxt(v),
      reperes: [["suspension 2026 : 62 ans 9 mois", 62.75], ["réforme 2023 : 64 ans", 64], ["66 ans", 66]] },
    { id: "pens", nom: "Baisser les pensions", qui: "payé par les retraités, chaque mois",
      col: "#D9A441", min: 50, max: 110, step: 0.5, key: "ciblePct",
      fmt: (v) => fmt0(cibleDe(v)) + " € nets" + (Math.abs(v - 100) < 0.25 ? " (comme aujourd'hui)" : " (" + (v > 100 ? "+" : "−") + fmt1(Math.abs(v - 100)) + " %)"),
      reperes: [["la pension d'aujourd'hui", 100], ["scénario COR 2050 : −9 % (indexation sur les prix)", 91], ["−20 %", 80]] },
  ];
  const LIMITES = { taux: 40, age: 70, pensMin: Math.round(REF.ciblePct * 0.7) };
  $("leviers").innerHTML = LEVIERS.map((l) =>
    '<div class="levier" id="lev-' + l.id + '">' +
      '<div class="l-head"><span class="l-nom"><i class="n" style="background:' + l.col + '"></i>' + l.nom +
      '</span><output class="l-val" id="val-' + l.id + '"></output></div>' +
      '<span class="l-qui">' + l.qui + "</span>" +
      '<input type="range" id="in-' + l.id + '" min="' + l.min + '" max="' + l.max + '" step="' + l.step + '">' +
      '<div class="l-cout" id="cout-' + l.id + '"></div>' +
      '<div class="l-reperes">' + l.reperes.map((r) =>
        '<span class="repere" data-lev="' + l.id + '" data-val="' + r[1] + '">' + r[0] + "</span>").join("") + "</div>" +
      '<div class="l-alerte" id="al-' + l.id + '"></div>' +
    "</div>").join("") +
    '<div class="levier levier-reste" id="lev-reste">' +
      '<div class="l-head"><span class="l-nom"><i class="n" style="background:#8E1B38"></i>Prélever ailleurs</span>' +
      '<output class="l-val" id="val-reste"></output></div>' +
      '<span class="l-qui">payé par tout le monde : impôts, dette, budgets des ministères — le levier utilisé aujourd\'hui, à son maximum</span>' +
      '<div class="l-cout" id="cout-reste"></div>' +
    "</div>";
  LEVIERS.forEach((l) => {
    $("in-" + l.id).addEventListener("input", (e) => {
      if (estPasse()) return;
      INV[l.key] = +e.target.value; INV.niveau = null; renderInverse();
    });
  });
  $("leviers").addEventListener("click", (e) => {
    const r = e.target.closest(".repere"); if (!r || estPasse()) return;
    const l = LEVIERS.find((x) => x.id === r.dataset.lev);
    INV[l.key] = +r.dataset.val; INV.niveau = null; renderInverse();
  });
  $("inv-annee").addEventListener("input", (e) => { INV.annee = +e.target.value; renderInverse(); });

  /* --- réglages avancés --- */
  function renderAvance() {
    const chip = (b, txt) => INV.base === b ? "<b>" + txt + "</b>"
      : '<span class="repere" data-base="' + b + '">' + txt + "</span>";
    $("avance-jeu").innerHTML =
      "<p>Les cotisants gagnent le " + chip("moyen", "salaire moyen") + " · " + chip("median", "salaire médian") +
      " — soit " + fmt0(salBrutRef()) + " € bruts (≈ " + fmt0(salNetRef()) + " € nets) par mois. " +
      (INV.base === "moyen"
        ? "Le salaire moyen par tête est calé pour retrouver les 277 Md€ de cotisations encaissées en 2025 (COR)."
        : "Le salaire médian (≈ 81 % du moyen) décrit mieux le cotisant type : la moitié des salariés gagne moins.") + "</p>" +
      '<p><label style="cursor:pointer"><input type="checkbox" id="in-natal"' + (INV.natal ? " checked" : "") +
      "> Natalité +0,2 enfant par femme — +0,1 cotisant par retraité, à partir de 2050 seulement (les enfants nés aujourd'hui cotisent dans 25 ans).</label></p>" +
      "<p>Années passées : " + ["1980", "2000", "2025"].map((a) =>
        '<span class="repere" data-an="' + a + '">' + a + "</span>").join(" · ") +
      " — les réglages sont alors historiques (taux et âge de l'époque) et montrent la part déjà payée par les cotisations.</p>";
  }
  $("avance-jeu").addEventListener("click", (e) => {
    const r = e.target.closest(".repere");
    if (r) {
      if (r.dataset.base) INV.base = r.dataset.base;
      if (r.dataset.an) INV.annee = +r.dataset.an;
      INV.niveau = null; renderInverse();
    }
  });
  $("avance-jeu").addEventListener("change", (e) => {
    if (e.target.id === "in-natal") { INV.natal = e.target.checked; INV.niveau = null; renderInverse(); }
  });

  /* --- les niveaux : des scénarios réels --- */
  const SCENARIOS = [
    { id: "rien", lab: "Ne rien faire (suspension 2026 : 62 ans 9 mois)", set: { tauxPct: 28.1, age: 62.75, ciblePct: 70 } },
    { id: "r2023", lab: "Réforme 2023 : 64 ans", set: { tauxPct: 28.1, age: 64, ciblePct: 70 } },
    { id: "a66", lab: "66 ans", set: { tauxPct: 28.1, age: 66, ciblePct: 70 } },
    { id: "t4", lab: "+4 points de cotisation", set: { tauxPct: 32.1, age: 64, ciblePct: 70 } },
    { id: "cor", lab: "Scénario COR : 64 ans, pension relative −9 %", set: { tauxPct: 28.1, age: 64, ciblePct: 91 } },
    { id: "p10", lab: "Pensions −10 %", set: { tauxPct: 28.1, age: 64, ciblePct: 90 } },
    { id: "mix", lab: "Un peu de tout : 65 ans, +2 pts, −5 %", set: { tauxPct: 30.1, age: 65, ciblePct: 95 } },
  ];
  let scenNote = "";
  const scBox = $("scenarios");
  scBox.innerHTML = '<span class="lab">Niveaux — des choix réels</span>';
  SCENARIOS.forEach((sc) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "scenar"; b.textContent = sc.lab; b.dataset.id = sc.id;
    b.addEventListener("click", () => {
      if (estPasse()) { INV.annee = 2050; }
      Object.assign(INV, sc.set); INV.niveau = sc.id;
      renderInverse();
    });
    scBox.appendChild(b);
  });

  // silhouette (tête + buste), viewBox 60×110 — outline : "solid" | "dash" | null
  function silhouette(frac, fill, outline) {
    const H = 110;
    const body = 'M30 26 C14 26 10 44 10 62 L10 96 Q10 104 18 104 L42 104 Q50 104 50 96 L50 62 C50 44 46 26 30 26 Z';
    let s = "";
    if (outline) {
      const dash = outline === "dash" ? ' stroke-dasharray="4 3"' : "";
      const col = outline === "dash" ? "#B9AE97" : "#CFC5B2";
      s += '<circle cx="30" cy="13" r="11" fill="none" stroke="' + col + '" stroke-width="2"' + dash + "></circle>" +
           '<path d="' + body + '" fill="none" stroke="' + col + '" stroke-width="2"' + dash + "></path>";
    }
    if (frac > 0.01 && fill) {
      const clipY = H * (1 - frac);
      const cid = "clip" + Math.round(Math.random() * 1e9);
      s += '<clipPath id="' + cid + '"><rect x="0" y="' + clipY + '" width="60" height="' + (H - clipY) + '"></rect></clipPath>' +
           '<g clip-path="url(#' + cid + ')">' +
           '<circle cx="30" cy="13" r="11" fill="' + fill + '"></circle>' +
           '<path d="' + body + '" fill="' + fill + '"></path></g>';
    }
    return s;
  }
  // la balance : à gauche la promesse (rempli = financé), à droite les cotisants
  // DISPONIBLES (pleins) puis les cotisants MANQUANTS (pointillés), en nombre exact
  function renderBalance(cible, finance) {
    const R = ratioEff(), txt = effTauxPct();
    const nNeed = (cible / P.PNET) / ((txt / 100) * salBrutRef());
    const manque = Math.max(0, nNeed - R);
    const parCot = (finance / P.PNET) / R;
    const slots = [];
    for (let i = 0; i < Math.floor(R + 1e-9); i++) slots.push({ t: "plein" });
    if (R % 1 > 0.01) slots.push({ t: "partiel", f: R % 1 });
    let manqueReste = 0;
    for (let i = 0; i < Math.floor(manque + 1e-9); i++) slots.push({ t: "manque" });
    if (manque % 1 > 0.05) slots.push({ t: "manque", f: manque % 1 });
    const MAX = 6;
    if (slots.length > MAX) {
      manqueReste = manque - (MAX - Math.ceil(R));
      slots.length = MAX;
    }
    const SW = 72;
    const W = 200 + 60 + Math.max(slots.length, 1) * SW + 10, H = 196;
    let s = '<svg id="balance-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">';
    const ok = finance >= cible * 0.99;
    const hC = clamp(cible / 4000 * 150, 16, 150);
    const hF = hC * clamp(finance / cible, 0, 1);
    const y0 = 132;
    s += '<rect x="30" y="' + (y0 - hC) + '" width="150" height="' + hC +
         '" rx="4" fill="none" stroke="' + (ok ? "#3E7A4E" : "#8E1B38") +
         '" stroke-width="2"' + (ok ? "" : ' stroke-dasharray="6 4"') + "></rect>" +
         '<rect x="30" y="' + (y0 - hF) + '" width="150" height="' + hF +
         '" rx="3" fill="' + (ok ? "#3E7A4E" : "#6E5BAE") + '"></rect>';
    if (hF > 24)
      s += '<text x="105" y="' + (y0 - hF / 2 + 5) + '" text-anchor="middle" style="font:800 15px Helvetica" fill="#fff">' +
           (ok ? "✓ " : "") + fmt0(finance) + " €</text>";
    if (!ok && hC - hF > 15)
      s += '<text x="105" y="' + (y0 - hF - (hC - hF) / 2 + 4) + '" text-anchor="middle" style="font:700 11px Helvetica" fill="#8E1B38">manque ' +
           fmt0(cible - finance) + " €</text>";
    s += '<text x="105" y="152" text-anchor="middle" style="font:700 12px Helvetica" fill="' +
         (ok ? "#3E7A4E" : "#1E2430") + '">' + (ok ? "✓ PROMESSE TENUE : " : "LA PROMESSE : ") +
         fmt0(cible) + " €</text>" +
         '<text x="105" y="167" text-anchor="middle" style="font:600 10.5px Helvetica" fill="#4A5265">rempli = financé par les cotisations</text>';
    s += '<text x="' + (200 + 16) + '" y="88" style="font:800 26px Georgia" fill="#1E2430">⚖</text>';
    const x0 = 200 + 60;
    slots.forEach((sl, i) => {
      const x = x0 + i * SW;
      let inner = "", lab = "", lab2 = "";
      if (sl.t === "plein") { inner = silhouette(1, "#3D6FB4", null); lab = fmt0(parCot) + " €"; lab2 = "/mois"; }
      else if (sl.t === "partiel") { inner = silhouette(sl.f, "#3D6FB4", "solid"); lab = "× " + fmt2(sl.f); }
      else { inner = silhouette(sl.f || 0, null, "dash") +
             (sl.f ? silhouette(sl.f, "rgba(185,174,151,.25)", null) : "");
             lab = sl.f ? "× " + fmt2(sl.f) : "manquant"; }
      s += '<g transform="translate(' + x + ',20)">' + inner + "</g>";
      s += '<text x="' + (x + 30) + '" y="152" text-anchor="middle" style="font:700 11px Helvetica" fill="' +
        (sl.t === "manque" ? "#8E1B38" : "#1E2430") + '">' + lab + "</text>";
      if (lab2)
        s += '<text x="' + (x + 30) + '" y="166" text-anchor="middle" style="font:600 9.5px Helvetica" fill="#4A5265">' + lab2 + "</text>";
    });
    if (manqueReste > 0.05)
      s += '<text x="' + (x0 + slots.length * SW) + '" y="86" style="font:700 12px Helvetica" fill="#8E1B38">+ ' +
        fmt2(manqueReste) + "…</text>";
    s += "</svg>";
    $("balance-svg").outerHTML = s;
    return { nNeed: nNeed, manque: manque };
  }

  function renderInverse() {
    const passe = estPasse();
    INV.cible = cibleDe(INV.ciblePct);
    const R = ratioEff(), finance = financeOut(), txt = effTauxPct(), age = effAge();
    const gap = Math.max(0, INV.cible - finance);
    const atteint = gap <= INV.cible * 0.01;
    const cible0 = cibleDe(REF.ciblePct);
    const finance0 = passe ? finance : financeAt(REF.tauxPct, REF.age);
    const gap0 = Math.max(0, cible0 - finance0);          // l'écart de référence, avant tout levier
    const anTitre = passe ? INV.annee : INV.annee;

    $("jeu-annee-titre").textContent = anTitre;
    $("out-inv-annee").textContent = INV.annee;
    $("inv-annee").value = clamp(INV.annee, 2026, 2070);
    renderAvance();

    // ---- la mission ----
    $("mission").innerHTML = passe
      ? '<span class="m-kicker">Année passée · ' + INV.annee + "</span>En <b>" + INV.annee + "</b>, " + fmt2(R) +
        " cotisants par retraité, " + pct1(txt / 100) + " % de cotisation, départ à " + ageTxt(age) +
        " : les cotisations finançaient <b>" + fmt0(finance) + " € nets</b> par retraité. " +
        (INV.cible <= finance ? "Une pension de " + fmt0(INV.cible) + " € était couverte."
          : "Pour " + fmt0(INV.cible) + " €, il manquait " + fmt0(gap) + " € — comblés par les impôts et la dette.") +
        " Les leviers s'utilisent à partir de 2026."
      : '<span class="m-kicker">Mission</span>En <b>' + INV.annee + "</b>, verser à chaque retraité la même pension qu'aujourd'hui : " +
        "en moyenne <b>≈ " + fmt0(cible0) + " € nets</b> par mois, toutes pensions comprises (" + fmt1(P.pensionsMd) + " Md€ pour " +
        fmt1(P.nbRetraites / 1e6) + " millions de retraités) — avec <b>" + fmt2(interp(P.ratio, INV.annee)) + " cotisant" +
        (interp(P.ratio, INV.annee) >= 2 ? "s" : "") + " par retraité</b> au lieu de 1,8. Aujourd'hui, les cotisations en financent " +
        "<b>" + Math.round(P.cotisationsMd / P.pensionsMd * 100) + " %</b> (" + fmt0(P.cotisationsMd) + " Md€ sur " + fmt0(P.pensionsMd) +
        ") ; en " + INV.annee + ", aux règles de référence (28,1 %, 64 ans), <b>" + fmt0(finance0) + " €</b> par retraité, soit " +
        Math.round(finance0 / cible0 * 100) + " % : il manque <b>" + fmt0(gap0) + " € par mois et par retraité</b>. Fermer l'écart, et choisir qui paie.";

    // ---- le verdict, en mots ----
    const v = $("verdict");
    v.className = "verdict" + (atteint ? " ok" : "");
    const partFin = clamp(finance / INV.cible, 0, 1);
    // parts de l'écart de référence : taux, âge, promesse, reste
    let dTaux = passe ? 0 : Math.max(0, financeAt(INV.tauxPct, REF.age) - finance0);
    let dAge = passe ? 0 : Math.max(0, financeAt(INV.tauxPct, INV.age) - financeAt(INV.tauxPct, REF.age));
    let dPens = passe ? 0 : Math.max(0, cible0 - INV.cible);
    // au-delà de l'équilibre, les leviers dépassent l'écart : on les ramène à 100 %
    const sumL = dTaux + dAge + dPens;
    if (sumL > gap0 && sumL > 0) { const k = gap0 / sumL; dTaux *= k; dAge *= k; dPens *= k; }
    const reste = passe ? gap : Math.max(0, gap0 - dTaux - dAge - dPens);
    const tot = Math.max(gap0, 1);
    const pctOf = (x) => Math.round(x / tot * 100);
    v.innerHTML =
      '<span class="v-lab">' + (atteint ? "Équilibre atteint en " + INV.annee : "Il manque encore, en " + INV.annee) + "</span>" +
      '<span class="v-big">' + (atteint ? "✓ 0 €" : fmt0(gap) + " €") + "</span>" +
      '<span class="v-sub">' + (atteint
        ? "La pension de " + fmt0(INV.cible) + " € est financée : taux " + pct1(txt / 100) + " %, départ à " + ageTxt(age) + "."
        : "par mois et par retraité — les cotisations financent " + fmt0(finance) + " € sur " + fmt0(INV.cible) + " € (" +
          Math.round(partFin * 100) + " %). Le reste est pris ailleurs.") + "</span>" +
      '<div class="jauge" title="La promesse de référence : part financée par les cotisations (violet), par la hausse du taux (bleu), par le report d\'âge (bleu clair), pris ailleurs (cramoisi), renoncé par les retraités (ocre)">' +
        '<div class="seg seg-fin" style="width:' + (Math.min(finance0, cible0) / cible0 * 100) + '%"></div>' +
        '<div class="seg seg-taux" style="width:' + (dTaux / cible0 * 100) + '%"></div>' +
        '<div class="seg seg-age" style="width:' + (dAge / cible0 * 100) + '%"></div>' +
        '<div class="seg seg-reste" style="width:' + (reste / cible0 * 100) + '%"></div>' +
        '<div class="seg seg-pens" style="width:' + (dPens / cible0 * 100) + '%"></div>' +
      "</div>";

    // ---- les leviers : valeur + coût humain ----
    LEVIERS.forEach((l) => {
      const val = l.id === "taux" ? txt : l.id === "age" ? age : INV.ciblePct;
      $("in-" + l.id).value = l.id === "taux" ? Math.round(val * 10) / 10 : val;
      $("in-" + l.id).disabled = passe;
      $("lev-" + l.id).classList.toggle("locked", passe);
      $("val-" + l.id).textContent = l.fmt(val) + (passe ? " 🔒" : "");
      let cout = "", alerte = "";
      if (l.id === "taux") {
        const d = txt - REF.tauxPct, eur = d / 100 * salBrutRef();
        cout = Math.abs(d) < 0.05 ? "Comme aujourd'hui : " + fmt0(REF.tauxPct / 100 * salBrutRef()) + " € de cotisations retraite par mois et par cotisant."
          : "<b>" + signe(eur) + " €</b> de cotisations par mois pour chaque cotisant (" + signe(d, true) + " point" + (Math.abs(d) >= 2 ? "s" : "") +
            "), soit " + signe(enMdAn(eur)) + " Md€ par an" + (d > 0 ? ' <span class="ok">→ ' + signe(dTaux) + " € de pension financés</span>" : "") + ".";
        if (txt > LIMITES.taux) alerte = "⚠ Au-delà de 40 % du brut, aucun pays comparable ne cotise autant pour la retraite.";
      } else if (l.id === "age") {
        const ev = evGen(INV.annee - age).mixte, dur = Math.max(0, ev - age), dur0 = Math.max(0, evGen(INV.annee - REF.age).mixte - REF.age);
        const d = age - REF.age;
        cout = "Retraite ≈ <b>" + fmt0(dur) + " an" + (dur > 1 ? "s" : "") + "</b> (espérance de vie ≈ " + ev + " ans)" +
          (Math.abs(d) >= 0.24 ? " : <b>" + signe(-d, true) + " an" + (Math.abs(d) >= 2 ? "s" : "") + "</b> de retraite par rapport à 64 ans" +
            (d > 0 ? ', <span class="ok">' + signe(dAge) + " € de pension financés</span>" : "") : "") + ".";
        if (age > LIMITES.age) alerte = "⚠ Au-delà de 70 ans, une part des personnes n'atteint pas la retraite en bonne santé.";
        if (dur <= 5) alerte = "⚠ À cet âge, la retraite ne durerait plus que ≈ " + fmt0(dur) + " an" + (dur > 1 ? "s" : "") + ".";
      } else {
        const d = INV.cible - cible0;
        cout = Math.abs(d) < 1 ? "La pension moyenne d'aujourd'hui : ≈ " + fmt0(cible0) + " € nets par mois par retraité, toutes pensions comprises."
          : "<b>" + signe(d) + " €</b> par mois pour chaque retraité" +
            (d < 0 ? ', <span class="ok">' + fmt0(-d) + " € d'écart en moins</span>" : "") + ".";
        if (INV.ciblePct < LIMITES.pensMin) alerte = "⚠ Plus de 30 % de baisse : la pension passe sous le niveau de vie des actifs les plus modestes.";
      }
      $("cout-" + l.id).innerHTML = cout;
      $("al-" + l.id).textContent = alerte;
      $("lev-" + l.id).classList.toggle("hors", !!alerte);
    });
    const mdReste = enMdAnRetraites(reste, nbRetraites()), parCotReste = reste / R;
    $("val-reste").textContent = (atteint ? "0 €" : fmt0(reste) + " €") + " / retraité / mois";
    $("cout-reste").innerHTML = atteint
      ? '<span class="ok">✓ Plus rien à prendre ailleurs.</span>'
      : "≈ <b>" + fmt0(parCotReste) + " €</b> par mois et par cotisant, en impôts ou en dette — ≈ <b>" + fmt0(mdReste) +
        " Md€ par an</b> pris sur les budgets publics, en euros d'aujourd'hui (2025 : " +
        "<a href=\"../treemap.html#realite\">" + fmt0(P.pensionsMd - P.cotisationsMd) + " Md€, le bloc cramoisi</a>).";

    // ---- niveaux : surligner celui en cours ----
    [].forEach.call(scBox.querySelectorAll(".scenar"), (b) => b.classList.toggle("on", b.dataset.id === INV.niveau));

    // ---- la balance ----
    const bal = renderBalance(INV.cible, finance);
    const parCot = (finance / P.PNET) / R;
    $("bal-caption").innerHTML = bal.manque > 0.05
      ? "Cette pension demande <b>" + fmt2(bal.nNeed) + " cotisants</b> au salaire " + baseLabel() +
        " ; la démographie n'en fournit que <b>" + fmt2(R) + "</b>. En pointillé : les cotisants manquants."
      : "Cette pension repose sur <b>" + fmt2(R) + " cotisant" + (R >= 2 ? "s" : "") +
        "</b>. Chacun y consacre <b>" + fmt0(parCot) + " €/mois</b>, soit " + pct1(txt / 100) + " % de son salaire brut.";

    // ---- la carte résultat : qui paie quoi ----
    const parts = [
      { k: "Les cotisants", c: "#3D6FB4", v: dTaux, s: "par la hausse du taux" },
      { k: "Les futurs retraités", c: "#7AA3D8", v: dAge, s: "en années de retraite (départ plus tard)" },
      { k: "Les retraités", c: "#D9A441", v: dPens, s: "par une pension plus basse" },
      { k: "Tout le monde, ailleurs", c: "#8E1B38", v: reste, s: "impôts, dette, budgets des ministères" },
    ];
    const gagnants = parts.filter((p) => p.v > 0.5);
    let phrase;
    if (passe) phrase = "En " + INV.annee + ", l'écart était comblé par les impôts et la dette.";
    else if (atteint) {
      phrase = "<b>Équilibre atteint</b> : " + gagnants.filter((p) => p.k !== "Tout le monde, ailleurs").map((p) =>
        p.k.toLowerCase() + " (" + pctOf(p.v) + " %)").join(", ") + " — plus rien n'est pris sur les services publics.";
    } else {
      phrase = "Il reste <b>" + pctOf(reste) + " %</b> de l'écart pris ailleurs" +
        (gagnants.length > 1 ? " ; le reste est payé par " + gagnants.filter((p) => p.v !== reste).map((p) => p.k.toLowerCase() + " (" + pctOf(p.v) + " %)").join(", ") : " — c'est la situation d'aujourd'hui, prolongée") + ".";
    }
    $("resultat").innerHTML =
      "<h3>Mon équilibre " + INV.annee + "</h3>" +
      '<p class="r-sous">Qui paie l\'écart de ' + fmt0(passe ? gap : gap0) + " € par mois et par retraité (référence : 28,1 %, 64 ans, promesse intacte)</p>" +
      '<div class="parts">' + parts.map((p) =>
        '<div class="part"><i style="background:' + p.c + '"></i><span>' + p.k + "<small>" + p.s + "</small></span><b>" +
        (passe && p.k !== "Tout le monde, ailleurs" ? "—" : pctOf(p.v) + " %") + "</b></div>").join("") + "</div>" +
      '<p class="r-phrase">' + phrase + "</p>" +
      '<div class="r-actions"><button type="button" id="copier-res">Copier mon équilibre</button>' +
      '<a href="../index.html#t6">◀ Retour au récit</a><span class="r-toast" id="res-toast"></span></div>';
    $("copier-res").addEventListener("click", () => {
      const txtRes = "Mon équilibre " + INV.annee + " — " + fmt0(INV.cible) + " € promis, taux " + pct1(txt / 100) + " %, départ à " +
        ageTxt(age) + " : " + parts.map((p) => p.k + " " + pctOf(p.v) + " %").join(" · ") + " — " + location.href.split("#")[0] + "#equilibre";
      const done = () => { $("res-toast").textContent = "copié"; setTimeout(() => { $("res-toast").textContent = ""; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(txtRes).then(done, () => window.prompt("Copier :", txtRes));
      else window.prompt("Copier :", txtRes);
    });

    $("inv-note").textContent = scenNote ||
      (INV.natal && INV.annee < 2050 && !passe ? "⚠ Natalité : aucun effet avant 2050 (les enfants nés aujourd'hui cotisent dans 25 ans)." :
      (INV.natal && INV.annee >= 2050 ? "Natalité +0,2 : +0,1 cotisant par retraité — le levier le plus lent." : ""));
    scenNote = "";
  }

  /* ---------- orchestration ---------- */
  function renderAll() {
    renderCards();
    renderDetail();
    renderInverse();
  }
  $("custom-reset").addEventListener("click", () => {
    custom = null;
    syncAdv(); renderAll();
  });
  window.addEventListener("resize", () => chart.resize());
  syncAdv();
  renderAll();

  /* ---------- fil d'Ariane : l'acte en cours ---------- */
  if ("IntersectionObserver" in window) {
    const crumbs = {};
    document.querySelectorAll(".labo-crumb a[data-crumb]").forEach((a) => (crumbs[a.dataset.crumb] = a));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        Object.keys(crumbs).forEach((k) => crumbs[k].classList.toggle("is-current", k === en.target.id));
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    ["vies", "equilibre"].forEach((id) => { const el = $(id); if (el) io.observe(el); });
  }

  /* ---------- chiffres du site (data-ch), si la donnée est joignable ---------- */
  fetch("../data/unified_finances.json").then((r) => r.json()).then((d) => {
    const ch = (d.meta || {}).chiffres || {}, ratio = ch.ratio_cotisants_retraites || {};
    const set = (k, v) => document.querySelectorAll('[data-ch="' + k + '"]').forEach((el) => (el.textContent = v));
    if (ratio["2025"]) set("ratio_2025", fmt1(ratio["2025"]));
    set("ratio_2050", fmt2(interp(P.ratio, 2050)));
    if (ch.non_contributif) set("non_contributif", fmt0(ch.non_contributif));
    if (ch.pensions_versees) set("pensions", fmt1(ch.pensions_versees));
    if (ch.cotisations) set("cotisations", fmt0(ch.cotisations));
    if (ch.retraites_droit_direct_millions) set("retraites_m", fmt1(ch.retraites_droit_direct_millions));
    if (ch.pensions_versees && ch.cotisations) set("part_cot", Math.round(ch.cotisations / ch.pensions_versees * 100));
    // les mêmes chiffres que le site : 422,2 / 277 / 17,4 M / 30,6 M (COR)
    let touche = false;
    if (ch.pensions_versees) { P.pensionsMd = ch.pensions_versees; touche = true; }
    if (ch.cotisations) { P.cotisationsMd = ch.cotisations; touche = true; }
    if (ch.retraites_droit_direct_millions) { P.nbRetraites = ch.retraites_droit_direct_millions * 1e6; touche = true; }
    if (ch.cotisants_millions) { P.nbCotisants = ch.cotisants_millions * 1e6; touche = true; }
    if (touche) renderInverse();
  }).catch(() => { /* hors ligne : les valeurs écrites dans le code restent */ });
})();
