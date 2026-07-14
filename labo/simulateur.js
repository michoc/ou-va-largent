/* ==========================================================================
 * 🧪 LABO — « Retraites : le compte d'une vie » (v16)
 * --------------------------------------------------------------------------
 * ACTE ① : 4 cartes générations, même carrière. CASCADE DE LA DETTE : chaque
 * carte peut cocher « maintenir la pension et léguer la dette » — la dette
 * passe à la génération suivante (cumulable). Chaque carte affiche DEUX
 * chiffres : en petit le contrefactuel « à l'équilibre, sans dette », en
 * grand la situation résultant des cases cochées. Compenser une dette
 * héritée = cotisations supplémentaires chiffrées en €/mois, converties en
 * Md€/an et en « fois les loyers versés en France » (95 Md€/an).
 *
 * ACTE ② : balance aux silhouettes. L'objectif (pension moyenne en % du
 * revenu de référence, année de départ) est isolé ; leviers = taux (% du
 * salaire brut) et âge. Les silhouettes MANQUANTES (pointillés) sont
 * dessinées en nombre exact : cotisants nécessaires − cotisants disponibles.
 *
 * Ton NEUTRE et factuel partout (pas de « vous » pour le retraité, pas
 * d'idiomes). Euros d'aujourd'hui ; salaires nets saisis (÷ 0,78 → brut) ;
 * pensions nettes (× 0,909). Calage : salaire moyen par tête → 269 Md€ de
 * cotisations réelles. Heures cotisées = Σ taux(an) × heures travaillées(an).
 * ========================================================================== */

(function () {
  "use strict";

  /* ---------- formatage (U+202F comme le site) ---------- */
  const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
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
            [2005, 2.0], [2010, 1.85], [2020, 1.71], [2025, 1.67],
            [2040, 1.5], [2055, 1.35], [2070, 1.2], [2120, 1.2]],
    heuresAn: [[1970, 1850], [1982, 1745], [2000, 1715], [2002, 1610], [2120, 1607]],
    NET2BRUT: 0.78, PNET: 0.909,
    salBase: { moyen: 2620, median: 2120 },   // bruts PAR TÊTE ; moyen calé sur 269 Md€
    subvParActif: 4470,                       // 136 Md€/an ÷ 30,4 M cotisants
    nbCotisants: 30.4e6,
    loyersMdAn: 95,                           // loyers versés en France (Md€/an)
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
  // rembourser, € sur la carrière) · detteSysteme (part des 136 Md€/an après 2025)
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
    const recu = pension * 12 * duree;
    const gapMois = Math.max(0, pension - pensionEq);
    const detteLeguee = gapMois * 12 * duree / ratio;    // par actif de la génération suivante
    const beAge = L.depart + verse / (pension * 12);
    return { L, anDepart, futur, ratio, cot, ardoise, impotsSys, verse, pension, pensionEq,
             pensionMaint, gapMois, detteLeguee, duree, recu, ratioMise: recu / verse,
             beAge: beAge <= L.deces ? beAge : null, heures, smicAns: recu / P.smicNetAnnuel,
             cumVerse, cumCot, cumImp, tauxDebut: interp(P.taux, L.naissance + L.entree),
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
      '<rect x="0" y="' + (H - 16 - sv) + '" width="' + sv + '" height="' + sv + '" rx="2" fill="#8C79C0"></rect>' +
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
      " € nets par mois), montants en euros d’aujourd’hui — seule l’année de naissance change." +
      (legs[1950]
        ? " <b>La dette léguée se paie en impôts</b> — aujourd’hui, elle est comblée en prenant " +
          "ailleurs dans le budget : 136 Md€ par an, près de 2 fois le budget de l’Éducation nationale."
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
    "rembourser la dette actuelle du système — part des 136 Md€/an, en impôts, années travaillées après 2025</label>" +
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
    // et la part des 136 Md€ ne concerne que les années travaillées après 2025
    $("in-maintenir").disabled = passe;
    $("in-dette").disabled = passe;
    $("lbl-maintenir").classList.toggle("off", passe);
    $("lbl-dette").classList.toggle("off", passe);
    $("lbl-maintenir").title = passe ? "Départ avant 2026 : les pensions ont été servies aux règles réelles." : "";
    $("lbl-dette").title = passe ? "Aucune année travaillée après 2025 : pas de part des 136 Md€/an." : "";
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

  function renderDetail() {
    const r = currentResult();
    $("detail").classList.toggle("custom", !!custom);

    const coche = custom ? !!custom.maintenir : !!legs[r.L.naissance];
    $("mode-tag").className = "mode-tag " + (r.futur ? "futur" : "passe");
    $("mode-tag").textContent = !r.futur
      ? "Départ en " + r.anDepart + " — règles réellement appliquées"
      : (coche
        ? "Pension maintenue au niveau actuel — la dette est léguée (" + fmt2(r.ratio) + " cotisant(s) par retraité)"
        : (r.herite > 0
          ? "Pension à l'équilibre + remboursement de la dette héritée"
          : "Pension à l'équilibre (" + fmt2(r.ratio) + " cotisant(s) par retraité en " + r.anDepart + ")"));

    const verseNote = (r.ardoise > 0 || r.impotsSys > 0) ? " (cotisations + impôts)" : "";
    const phr = ["Né en " + r.L.naissance + ", parti à " + r.L.depart + " ans : <b>≈ " +
      fmtK(r.verse) + " €</b> versés au système" + verseNote + ", <b>≈ " + fmtK(r.recu) +
      " €</b> touchés (" + fmt0(r.pension) + " €/mois nets pendant " + r.duree + " ans) — <b>" +
      fmt2(r.ratioMise) + " fois la somme versée</b>."];
    phr.push(r.beAge
      ? "Les versements sont remboursés à <b>" + Math.round(r.beAge) + " ans</b> ; au-delà, ce sont les cotisants du moment qui paient."
      : "<b>Les versements ne sont jamais remboursés.</b>");
    $("res-phrase").innerHTML = phr.join(" ");

    $("verse-detail").innerHTML = !r.futur ? "" :
      (coche
        ? "Pension maintenue : les cotisations n'en financent que <b>" + fmt0(r.pensionEq) +
          " €/mois</b> — la différence est une dette laissée à la génération suivante."
        : (r.ardoise > 0
          ? "Dont ≈ <b>" + fmt0(enImpotsMois(r.ardoise, r.L.depart - r.L.entree)) +
            " €/mois</b> de cotisations supplémentaires, toute la carrière, pour compenser la dette laissée par les aînés."
          : (r.impotsSys > 0
            ? "Dont ≈ <b>" + fmtK(r.impotsSys) + " €</b> d'impôts (années après 2025) — la part des 136 Md€/an de dettes du système."
            : "Pension ajustée au niveau que la démographie finance — aucune dette laissée.")));

    $("mini-stats").innerHTML =
      '<div class="mini"><b>' + fmt0(r.pension) + " €/mois net</b><span>pension" +
      (r.futur ? (coche ? " (maintenue)" : " (à l'équilibre)") : " (règles réelles)") + "</span></div>" +
      '<div class="mini"><b>' + (r.beAge ? Math.round(r.beAge) + " ans" : "jamais") +
      "</b><span>versements remboursés à</span></div>" +
      '<div class="mini"><b>' + fmt0(r.heures) + " h</b><span>de travail pour payer ses cotisations</span></div>" +
      '<div class="mini"><b>' + fmt0(r.smicAns) + "</b><span>années de SMIC net reçues</span></div>";

    renderCoherence(r);

    const ages = [], vSer = [], cSer = [], iSer = [], rSer = [], rEqSer = [], rDetteSer = [];
    let vFin = 0, cFin = 0, iFin = 0;
    for (let a = r.L.entree; a <= r.L.deces; a++) {
      ages.push(a);
      const cv = r.cumVerse.filter((p) => p[0] <= a);
      if (cv.length) vFin = cv[cv.length - 1][1];
      const cc = r.cumCot.filter((p) => p[0] <= a);
      if (cc.length) cFin = cc[cc.length - 1][1];
      const ci = r.cumImp.filter((p) => p[0] <= a);
      if (ci.length) iFin = ci[ci.length - 1][1];
      vSer.push(Math.round(vFin));
      cSer.push(Math.round(cFin));
      iSer.push(Math.round(iFin));
      const dep = a >= r.L.depart ? (a - r.L.depart) : 0;
      rSer.push(a >= r.L.depart ? Math.round(r.pension * 12 * dep) : 0);
      rEqSer.push(a >= r.L.depart ? Math.round(r.pensionEq * 12 * dep) : 0);
      rDetteSer.push(a >= r.L.depart ? Math.round(r.gapMois * 12 * dep) : 0);
    }
    const hasImp = (r.ardoise > 0 || r.impotsSys > 0);
    const impName = r.ardoise > 0 ? "Remboursement de la dette héritée" : "Impôts — dette du système";
    const recuDette = r.futur && coche && r.gapMois > 10;
    const series = [], legend = [];
    // — le VERSÉ : la dette en BASE (hachures ocre), les cotisations empilées dessus —
    if (hasImp) {
      series.push({ name: impName, type: "line", stack: "verse", data: iSer, symbol: "none",
        lineStyle: { color: DETTE_COL, width: 2 }, color: DETTE_COL,
        areaStyle: { color: HATCH_DETTE } });
      series.push({ name: "Cotisations versées", type: "line", stack: "verse", data: cSer, symbol: "none",
        lineStyle: { color: "#8C79C0", width: 3 }, color: "#8C79C0",
        areaStyle: { color: "rgba(140,121,192,.14)" } });
      legend.push(impName, "Cotisations versées");
    } else {
      series.push({ name: "Cumul versé", type: "line", data: vSer, symbol: "none",
        lineStyle: { color: "#8C79C0", width: 3 }, color: "#8C79C0",
        areaStyle: { color: "rgba(140,121,192,.14)" } });
      legend.push("Cumul versé");
    }
    // — le REÇU : part à l'équilibre (cramoisi plein) + part financée par la dette (hachures) —
    if (recuDette) {
      series.push({ name: "Pension financée par les cotisations", type: "line", stack: "recu",
        data: rEqSer, symbol: "none",
        lineStyle: { color: "#8E1B38", width: 3 }, color: "#8E1B38",
        areaStyle: { color: "rgba(142,27,56,.12)" } });
      series.push({ name: "Pension financée par la dette", type: "line", stack: "recu",
        data: rDetteSer, symbol: "none",
        lineStyle: { color: DETTE_COL, width: 2, type: "dashed" }, color: "#D9A441",
        areaStyle: { color: HATCH_DETTE } });
      legend.push("Pension financée par les cotisations", "Pension financée par la dette");
    } else {
      series.push({ name: "Cumul reçu (net)", type: "line", data: rSer, symbol: "none",
        lineStyle: { color: "#8E1B38", width: 3 }, color: "#8E1B38",
        areaStyle: { color: "rgba(142,27,56,.12)" } });
      legend.push("Cumul reçu (net)");
    }
    chart.setOption({
      grid: { left: 64, right: 14, top: 40, bottom: 26 },
      legend: { data: legend, top: 0, textStyle: { fontSize: 10.5 } },
      tooltip: { trigger: "axis", valueFormatter: (v) => fmtK(v) + " €" },
      xAxis: { type: "category", data: ages, name: "âge", nameGap: 4, axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", axisLabel: { fontSize: 10, formatter: (v) => group(String(v / 1000)) + " k€" } },
      series: series,
    }, { replaceMerge: ["series", "legend"] });
    return r;
  }

  /* ---------- ACTE ② : la balance dans le temps ---------- */
  const INV = { annee: 2050, ciblePct: 72, cible: 1470, tauxPct: 28.1, age: 64,
                natal: false, base: "moyen" };
  // âge légal : 65 → 60 (réforme 1982, effective 1983) → montée 60→62
  // (réforme 2010, effective 2017) → montée 62→64 (réforme 2023, effective 2030)
  const ageHisto = (an) => an < 1983 ? 65 : an < 2011 ? 60 : an < 2017 ? 61
    : an < 2023 ? 62 : an < 2030 ? 63 : 64;
  const estPasse = () => INV.annee <= 2025;
  const effTauxPct = () => estPasse() ? interp(P.taux, INV.annee) * 100 : INV.tauxPct;
  const effAge = () => estPasse() ? ageHisto(INV.annee) : INV.age;
  const salBrutRef = () => P.salBase[INV.base];
  const salNetRef = () => Math.round(salBrutRef() * P.NET2BRUT);
  const baseLabel = () => INV.base === "moyen" ? "moyen" : "médian";
  function ratioEff() {
    const base = interp(P.ratio, INV.annee);
    if (estPasse()) return base;
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
    '<div class="cible-block"><span class="titre">🎯 L’OBJECTIF — la pension moyenne à distribuer</span>' +
    '<div class="ctl"><label for="inv-cible">Niveau de pension ' +
    '<output id="out-inv-cible"></output></label>' +
    '<div class="cible-euros" id="cible-euros"></div>' +
    '<input type="range" id="inv-cible" min="30" max="110" step="1">' +
    REP + "Repères : " + rep("data-pct", 50, "50 %") + " · " +
    rep("data-pct", 72, "pension moyenne actuelle 72 %") + " · " +
    rep("data-pct", 100, "égale au salaire 100 %") + "</div>" +
    '<div style="font-size:11px;color:var(--ink-soft);margin-top:6px">ℹ️ 72 % du revenu ne veut pas ' +
    "dire 72 % du niveau de vie. En moyenne, les retraités vivent mieux que les actifs : ils sont " +
    "très majoritairement propriétaires de leur logement, et ont beaucoup moins de dettes et de " +
    "frais que les actifs.</div>" +
    '<div class="ctl" id="ctl-inv-annee" style="margin-top:12px"><label for="inv-annee">Année du départ à la retraite ' +
    '<output id="out-inv-annee"></output></label>' +
    '<input type="range" id="inv-annee" min="1975" max="2070" step="1">' +
    REP + "Repères : " + rep("data-an", 1980, "1980") + " · " + rep("data-an", 2000, "2000") + " · " +
    rep("data-an", 2025, "aujourd’hui") + " · " + rep("data-an", 2050, "2050") + " · " +
    rep("data-an", 2070, "2070") + "</div></div>" +
    '<div class="ctl" id="ctl-inv-taux"><label for="inv-taux">LEVIER 1 — taux de cotisation retraite (en % du salaire brut) ' +
    '<output id="out-inv-taux"></output></label>' +
    '<input type="range" id="inv-taux" min="8" max="60" step="0.1">' +
    REP + "Situation actuelle : " + rep("data-taux", 28.1, "<b>28,1 %</b>") + " · 1980 : ≈ 18,5 %</div></div>" +
    '<div class="ctl" id="ctl-inv-age"><label for="inv-age">LEVIER 2 — âge de départ à la retraite ' +
    '<output id="out-inv-age"></output></label>' +
    '<input type="range" id="inv-age" min="60" max="95" step="1">' +
    REP + "Situation actuelle : " + rep("data-age", 64, "<b>64 ans</b> (âge légal, réforme 2023 — pleinement effective en 2030)") +
    " · départ moyen constaté ≈ 62,8 ans</div></div>" +
    '<div class="sal-fixe" id="sal-fixe"></div>';

  function renderSalFixe() {
    const chip = (b, txt) => INV.base === b ? "<b>" + txt + "</b>"
      : '<span class="repere" data-base="' + b + '" style="cursor:pointer;border-bottom:1px dotted #B9AE97">' + txt + "</span>";
    $("sal-fixe").innerHTML = "💶 Hypothèse : les cotisants gagnent le " +
      chip("moyen", "salaire moyen") + " · " + chip("median", "salaire médian") +
      " — soit " + fmt0(salBrutRef()) + " € bruts (≈ " + fmt0(salNetRef()) + " € nets) par mois. " +
      (INV.base === "moyen"
        ? "Le salaire moyen est calculé pour retrouver les 269 Md€ de cotisations retraite encaissées chaque année."
        : "Le salaire médian (≈ 81 % du moyen) décrit mieux le cotisant type : la moitié des salariés gagne moins.");
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
        ? "Avant 2025, les paramètres sont historiques : placez l’année après 2025 pour utiliser les leviers." : "";
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
  // la balance : à gauche l'objectif (rempli = financé), à droite les cotisants
  // DISPONIBLES (pleins) puis les cotisants MANQUANTS (pointillés), en nombre exact
  function renderBalance(cible, finance) {
    const R = ratioEff(), txt = effTauxPct();
    const nNeed = (cible / P.PNET) / ((txt / 100) * salBrutRef());
    const manque = Math.max(0, nNeed - R);
    const parCot = (finance / P.PNET) / R;
    // slots : pleins (floor R + fraction), puis manquants (floor + fraction), plafonnés
    const slots = [];
    for (let i = 0; i < Math.floor(R + 1e-9); i++) slots.push({ t: "plein" });
    if (R % 1 > 0.01) slots.push({ t: "partiel", f: R % 1 });
    let manqueAffiche = 0, manqueReste = 0;
    for (let i = 0; i < Math.floor(manque + 1e-9); i++) slots.push({ t: "manque" });
    if (manque % 1 > 0.05) slots.push({ t: "manque", f: manque % 1 });
    const MAX = 7;
    if (slots.length > MAX) {
      manqueReste = manque - (MAX - Math.ceil(R));   // ce qui ne tient pas à l'écran
      slots.length = MAX;
    }
    manqueAffiche = manque - Math.max(0, manqueReste);
    const SW = 78;
    const W = 210 + 70 + Math.max(slots.length, 1) * SW + 10, H = 196;
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
    slots.forEach((sl, i) => {
      const x = x0 + i * SW;
      let inner = "", lab = "", lab2 = "";
      if (sl.t === "plein") { inner = silhouette(1, "#8C79C0", null); lab = fmt0(parCot) + " €"; lab2 = "/mois"; }
      else if (sl.t === "partiel") { inner = silhouette(sl.f, "#8C79C0", "solid"); lab = "× " + fmt2(sl.f); }
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
    INV.cible = Math.round(INV.ciblePct / 100 * salNetRef() / 10) * 10;
    const R = ratioEff(), finance = financeOut(), txt = effTauxPct(), age = effAge();
    const gap = INV.cible - finance;
    const atteint = Math.abs(gap) <= INV.cible * 0.01 || finance > INV.cible;

    renderSalFixe();
    $("out-inv-cible").innerHTML = "<b>" + INV.ciblePct + " %</b> du revenu " + baseLabel();
    $("cible-euros").textContent = "≈ " + fmt0(INV.cible) + " € nets par mois";
    $("inv-cible").value = INV.ciblePct;
    $("inv-annee").value = INV.annee;
    $("inv-taux").value = Math.round(txt * 10) / 10;
    $("inv-age").value = age;
    $("inv-taux").disabled = passe; $("inv-age").disabled = passe;
    $("ctl-inv-taux").classList.toggle("locked", passe);
    $("ctl-inv-age").classList.toggle("locked", passe);
    $("out-inv-annee").textContent = INV.annee + (passe ? " (passé)" : "");
    const dT = txt - 28.1;
    $("out-inv-taux").textContent = pct1(txt / 100) + " %" + (passe ? " 🔒"
      : (Math.abs(dT) >= 0.3 ? " (" + (dT > 0 ? "+" : "−") + pct1(Math.abs(dT) / 100) +
         " pt" + (Math.abs(dT) >= 2 ? "s" : "") + ")" : ""));
    const durRet = Math.max(0, evGen(INV.annee - age).mixte - age);
    $("out-inv-age").textContent = age + " ans" + (passe ? " 🔒"
      : (age !== 64 ? " (" + (age > 64 ? "+" : "−") + Math.abs(age - 64) + ")" : "") +
        " · retraite ≈ " + durRet + " an" + (durRet > 1 ? "s" : ""));

    $("inv-verrou").textContent = "🔒 Démographie " + INV.annee + " : " +
      fmt2(interp(P.ratio, INV.annee)) + " cotisant(s) par retraité — " +
      (passe ? "donnée historique" : "projection COR (seuls l’âge de départ et la natalité, 25 ans plus tard, la font évoluer)");

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

    const bal = renderBalance(INV.cible, finance);
    const parCot = (finance / P.PNET) / R;
    $("bal-caption").innerHTML = bal.manque > 0.05
      ? "Cette pension nécessite <b>" + fmt2(bal.nNeed) + " cotisants</b> au salaire " + baseLabel() +
        " ; la démographie n’en fournit que <b>" + fmt2(R) +
        "</b>. En pointillé : les cotisants manquants."
      : "Cette pension repose sur <b>" + fmt2(R) + " cotisant" + (R >= 2 ? "s" : "") +
        "</b>. Chacun y consacre <b>" + fmt0(parCot) + " €/mois</b>, soit " + pct1(txt / 100) +
        " % de son salaire brut.";

    let phr;
    if (passe) {
      phr = "En <b>" + INV.annee + "</b>, chaque retraité était financé par " + fmt2(R) +
        " cotisants : " + pct1(txt / 100) + " % de cotisation (départ à " + age +
        " ans) permettaient de verser <b>≈ " + fmt0(finance) + " € nets</b>." +
        (INV.cible <= finance
          ? " Une pension de " + fmt0(INV.cible) + " € était couverte par les cotisations."
          : " Pour une pension de " + fmt0(INV.cible) + " €, il manquait " +
            fmt0(INV.cible - finance) + " €" +
            (INV.annee >= 2000
              ? " — un manque comblé par les <b>impôts et la dette</b> : " +
                "aujourd’hui <b>136 Md€ par an</b>, <a href=\"../treemap.html#realite\">le bloc " +
                "cramoisi du Mondrian</a>"
              : "") + ".");
    } else if (atteint) {
      phr = "<b>Le coût d’une pension de " + fmt0(INV.cible) + " € en " + INV.annee +
        "</b> : " + fmt2(R) + " cotisant(s) y consacrent " + pct1(txt / 100) +
        " % de leur salaire brut (" + fmt0(parCot) + " €/mois chacun)" +
        (txt > 28.4 ? ", contre 28,1 % aujourd’hui (+" + pct1((txt - 28.1) / 100) + " pt)." : ".");
    } else {
      const tN = tauxNecessaire(), aN = ageNecessaire();
      phr = "Avec ces réglages, il manque <b>" + fmt0(gap) + " €/mois</b>. Pour verser " +
        fmt0(INV.cible) + " € en " + INV.annee + " : taux à <b>" +
        (tN > 60 ? "plus de 60 %" : pct1(Math.min(tN, 60) / 100) + " %") + "</b> <b>OU</b> départ à <b>" +
        (aN > 95 ? "plus de 95 ans" : Math.ceil(aN) + " ans") +
        "</b> — ou réviser l’objectif à la baisse.";
    }
    $("inv-phrase").innerHTML = phr;

    const dR2 = evGen(INV.annee - age).mixte - age;
    $("inv-note").textContent = scenNote ||
      (!passe && dR2 <= 5 ? "⚠ À ce départ, la retraite ne durerait plus que ≈ " + Math.max(0, dR2) +
        " an" + (dR2 > 1 ? "s" : "") + " (espérance de vie de cette génération : ≈ " +
        evGen(INV.annee - age).mixte + " ans)." :
      (INV.natal && INV.annee < 2050 && !passe
        ? "⚠ Natalité : aucun effet avant ~2050 (les enfants nés aujourd’hui cotisent dans 25 ans)."
        : (INV.natal && INV.annee >= 2050 ? "Natalité +0,2 : ratio +0,1 — le levier le plus lent." : "")));
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
})();
