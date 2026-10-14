"use strict";
/* ==========================================================================
   Composants importés
   Un fichier JSON au format « paillasse-composant » décrit un composant : ses broches, ses paramètres,
   ses équations, les éléments de circuit qui relient ses broches (résistances, sources, diodes...),
   et au besoin une liaison série et une mesure dans le monde 2D. Le format est décrit dans FORMAT_COMPOSANT.md.
   composantLit(json) vérifie la description et la traduit en une entrée de DEFS. Aucun code venu du fichier
   n'est exécuté tel quel : toutes les expressions passent par le langage des équations (eq.js).
   ========================================================================== */
const COMP_FORMAT = "paillasse-composant", COMP_VERSION = 1, COMP_PREFIX = "imp_";
class CompErr extends Error { constructor(msg, path) { super(guil(path ? `${path}${LL(" : ", ": ")}${msg}` : msg)); this.path = path || ""; this.comp = true; } }
const COMP_NOM = /^[A-Za-z_][A-Za-z0-9_]{0,30}$/;
const COMP_ELEMENTS = {
  R: "R", resistance: "R", C: "C", condensateur: "C", L: "L", bobine: "L", V: "V", source_tension: "V", I: "I", source_courant: "I",
  D: "D", diode: "D", S: "S", interrupteur: "S", G: "G", transconductance: "G", B: "B", courant: "B",
};
// champs de chaque élément : [nom, obligatoire, valeur par défaut]
const COMP_CHAMPS = {
  R: [["valeur", true]], C: [["valeur", true], ["tension_initiale", false, "0"]], L: [["valeur", true], ["r", false, "0.001"]],
  V: [["valeur", true], ["r", false, "0.01"]], I: [["valeur", true]],
  D: [["vf", false, "0.7"], ["if", false, "0.01"], ["n", false, "2"], ["vz", false, "0"], ["imax", false, "0"]],
  S: [["ferme", true], ["ron", false, "0.1"], ["roff", false, "1e9"]], G: [["gain", true]], B: [["courant", true]],
};
// champs qui changent la matrice du circuit (il faut la refactoriser quand ils changent)
const COMP_G = { R: ["valeur"], C: ["valeur"], L: ["valeur", "r"], V: ["r"], I: [], D: [], S: ["ron", "roff"], G: ["gain"], B: [] };
const COMP_SERIE_PINS = { i2c: ["sda", "scl"], spi: ["cs", "sck", "miso", "mosi"], uart: ["tx", "rx"] };
const COMP_MESURES = { distance: { u: "m", d: 4 }, reflet: { u: LL("0 à 1", "0 to 1"), d: 1 }, contact: { u: LL("0 ou 1", "0 or 1"), d: 0 } };
const COMP_SI = new Set(["Ω", "ohm", "F", "H", "A", "V", "Hz", "s", "W"]);
// mots des équations (fonctions, constantes), noms qu'un objet JavaScript porte déjà, réglages créés d'office
const COMP_RESERVES = new Set([...EQ.RESERVES, ...Object.getOwnPropertyNames(Object.prototype), "prototype", "masse"]);
const COMP_REGLAGES = new Set(["porteur", "pos_avant_cm", "pos_gauche_cm", "orientation_deg", "ouverture_deg", "diametre_tache_mm", "levier_mm",
  "interface", "adresse_i2c", "registre", "octets", "resolution", "debit_bauds", "periode_envoi_ms"]);

function compTexte(v, path, oblig) {               // une valeur : nombre ou expression des équations, sur une ligne
  if (v == null || v === "") { if (oblig) throw new CompErr(LL("valeur manquante", "missing value"), path); return null; }
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new CompErr(LL("nombre invalide", "invalid number"), path); return String(v); }
  if (typeof v !== "string") throw new CompErr(LL("il faut un nombre ou une expression entre guillemets", "a number or an expression in quotes is needed"), path);
  if (/[\n\r]/.test(v)) throw new CompErr(LL("une expression tient sur une ligne", "an expression fits on one line"), path);
  if (v.length > 2000) throw new CompErr(LL("expression trop longue", "expression too long"), path);
  return v.trim();
}
const compNum = (v, path, def, lo, hi) => {
  if (v == null || v === "") return def;
  const x = typeof v === "string" && /^0x[0-9a-f]+$/i.test(v.trim()) ? parseInt(v, 16) : +v;
  if (!Number.isFinite(x) || typeof v === "boolean") throw new CompErr(LL("il faut un nombre", "a number is needed"), path);
  if ((lo != null && x < lo) || (hi != null && x > hi)) throw new CompErr(LL(`doit être entre ${lo} et ${hi}`, `must be between ${lo} and ${hi}`), path);
  return x;
};
// un texte affiché tel quel dans l'interface : les caractères qui ont un sens en HTML sont remplacés
const compStr = (v, path, max, def) => {
  if (v == null) return def;
  if (typeof v !== "string") throw new CompErr(LL("il faut un texte", "a text is needed"), path);
  return v.slice(0, max || 200).replace(/</g, "‹").replace(/>/g, "›").replace(/&/g, "et").replace(/"/g, "”").replace(/[\u0000-\u001f]/g, " ");
};
function compNomOk(n, path, pris, quoi, libre) {
  if (typeof n !== "string" || !COMP_NOM.test(n)) throw new CompErr(LL(`nom « ${n} » invalide : lettres sans accent, chiffres et _, 31 caractères au plus, sans commencer par un chiffre`, `invalid name “${n}”: letters without accents, digits and _, 31 characters at most, not starting with a digit`), path);
  if (n.startsWith("__")) throw new CompErr(LL(`les noms qui commencent par « __ » sont réservés au simulateur`, `names starting with “__” are reserved for the simulator`), path);
  if (COMP_RESERVES.has(n) && (!libre || Object.prototype.hasOwnProperty.call(Object.prototype, n))) throw new CompErr(LL(`« ${n} » est un mot réservé (fonction ou constante des équations, ou nom interne)`, `“${n}” is a reserved word (function or constant of the equations, or internal name)`), path);
  if (pris) { if (pris.has(n)) throw new CompErr(LL(`le nom « ${n} » est déjà pris par ${pris.get(n)}`, `the name “${n}” is already taken by ${pris.get(n)}`), path); pris.set(n, quoi); }
  return n;
}

/* ---- lecture et vérification d'une description ---- */
function composantLit(src) {
  let d = src;
  if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { throw new CompErr(LL("ce n'est pas du JSON valide (", "this is not valid JSON (") + e.message + ")"); } }
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new CompErr(LL("la description doit être un objet JSON", "the description must be a JSON object"));
  if (d.format !== COMP_FORMAT) throw new CompErr(LL(`le champ « format » doit valoir « ${COMP_FORMAT} »`, `the “format” field must be “${COMP_FORMAT}”`));
  if (+d.version !== COMP_VERSION) throw new CompErr(LL(`version ${d.version} inconnue : ce simulateur lit la version ${COMP_VERSION}`, `unknown version ${d.version}: this simulator reads version ${COMP_VERSION}`));
  const warns = [];
  const s = {
    id: compNomOk(d.id, "id", null, null, true), nom: compStr(d.nom, "nom", 60) || d.id, description: compStr(d.description, "description", 400, ""),
    repere: compStr(d.repere, "repere", 8, "U"), categorie: compStr(d.categorie, "categorie", 40, ""),
  };
  if (!/^[A-Za-z]{1,6}$/.test(s.repere)) throw new CompErr(LL("1 à 6 lettres", "1 to 6 letters"), "repere");
  const vars = new Map();                         // tous les noms visibles dans les équations, avec ce qu'ils désignent
  // broches et nœuds
  const arr = (v, path) => { if (v == null) return []; if (!Array.isArray(v)) throw new CompErr(LL("il faut une liste [ ... ]", "a list [ ... ] is needed"), path); return v; };
  const pinNames = new Map();
  s.broches = arr(d.broches, "broches").map((b, i) => {
    const path = `broches[${i}]`;
    if (!b || typeof b !== "object") throw new CompErr(LL("il faut un objet { \"nom\": ... }", "an object { \"nom\": ... } is needed"), path);
    const nom = compNomOk(b.nom, path + ".nom", pinNames, LL("une broche", "a pin"));
    const cote = b.cote == null ? "gauche" : b.cote;
    if (cote !== "gauche" && cote !== "droite") throw new CompErr(LL("« gauche » ou « droite »", "“gauche” (left) or “droite” (right)"), path + ".cote");
    return { nom, libelle: compStr(b.libelle, path + ".libelle", 12, null), cote, optionnelle: !!b.optionnelle };
  });
  if (!s.broches.length) throw new CompErr(LL("il faut au moins une broche", "at least one pin is needed"), "broches");
  if (s.broches.length > 40) throw new CompErr(LL("40 broches au plus", "40 pins at most"), "broches");
  s.noeuds = arr(d.noeuds, "noeuds").map((n, i) => compNomOk(n, `noeuds[${i}]`, pinNames, LL("un nœud interne", "an internal node")));
  for (const [k, max] of [["noeuds", 100], ["parametres", 100], ["entrees", 20], ["sorties", 20], ["alertes", 50]]) if (Array.isArray(d[k]) && d[k].length > max) throw new CompErr(LL(`${max} au plus`, `at most ${max}`), k);
  if (pinNames.has("masse")) throw new CompErr(LL("« masse » désigne la masse du montage : choisissez un autre nom", "“masse” means the circuit's ground: choose another name"), "broches");
  for (const n of pinNames.keys()) { vars.set("v_" + n, LL(`la tension de ${n}`, `the voltage of ${n}`)); }
  // paramètres, entrées, sorties
  s.parametres = arr(d.parametres, "parametres").map((q, i) => {
    const path = `parametres[${i}]`;
    if (!q || typeof q !== "object") throw new CompErr(LL("il faut un objet", "an object is needed"), path);
    const nom = compNomOk(q.nom, path + ".nom", vars, LL("un paramètre", "a parameter"));
    if (COMP_REGLAGES.has(nom) || nom.startsWith("entree_")) throw new CompErr(LL(`« ${nom} » est le nom d'un réglage que le simulateur crée lui-même (liaison série, montage dans le monde, entrée non reliée) : choisissez un autre nom`, `“${nom}” is the name of a setting the simulator creates itself (serial link, mounting in the world, unconnected input): choose another name`), path + ".nom");
    const reglage = q.reglage == null ? "champ" : q.reglage;
    if (!["champ", "curseur", "case", "choix"].includes(reglage)) throw new CompErr(LL("« champ », « curseur », « case » ou « choix »", "“champ”, “curseur”, “case” or “choix”"), path + ".reglage");
    const o = { nom, libelle: compStr(q.libelle, path + ".libelle", 60, nom), unite: compStr(q.unite, path + ".unite", 12, ""), reglage,
      min: compNum(q.min, path + ".min", null), max: compNum(q.max, path + ".max", null), pas: compNum(q.pas, path + ".pas", null, 0), source: compStr(q.source, path + ".source", 200, "") };
    if (reglage === "case") o.defaut = compNum(q.defaut, path + ".defaut", 0) ? 1 : 0;
    else if (reglage === "choix") {
      o.choix = arr(q.choix, path + ".choix").map((c, j) => ({ valeur: compNum(c && c.valeur, `${path}.choix[${j}].valeur`, null), libelle: compStr(c && c.libelle, `${path}.choix[${j}].libelle`, 80, "") }));
      if (!o.choix.length || o.choix.some(c => c.valeur == null)) throw new CompErr(LL("une liste de { \"valeur\": nombre, \"libelle\": texte }", "a list of { \"valeur\": number, \"libelle\": text }"), path + ".choix");
      o.defaut = compNum(q.defaut, path + ".defaut", o.choix[0].valeur);
      if (!o.choix.some(c => c.valeur === o.defaut)) throw new CompErr(LL("la valeur par défaut doit être l'un des choix", "the default value must be one of the choices"), path + ".defaut");
    } else {
      o.defaut = compNum(q.defaut, path + ".defaut", null);
      if (o.defaut == null) throw new CompErr(LL("valeur par défaut manquante", "default value missing"), path + ".defaut");
      if (reglage === "curseur" && (o.min == null || o.max == null)) throw new CompErr(LL("un curseur a besoin de « min » et « max »", "a slider needs “min” and “max”"), path);
    }
    if (o.min != null && o.max != null && o.min > o.max) throw new CompErr(LL("min est plus grand que max", "min is greater than max"), path);
    if (reglage !== "case" && reglage !== "choix" && ((o.min != null && o.defaut < o.min) || (o.max != null && o.defaut > o.max))) throw new CompErr(LL("la valeur par défaut sort de [min, max]", "the default value is outside [min, max]"), path + ".defaut");
    return o;
  });
  s.entrees = arr(d.entrees, "entrees").map((q, i) => {
    const path = `entrees[${i}]`;
    if (!q || typeof q !== "object") throw new CompErr(LL("il faut un objet", "an object is needed"), path);
    const nom = compNomOk(q.nom, path + ".nom", vars, LL("une entrée", "an input"));
    if (pinNames.has(nom)) throw new CompErr(LL(`« ${nom} » est déjà une broche`, `“${nom}” is already a pin`), path + ".nom");
    pinNames.set(nom, LL("une entrée", "an input"));
    const o = { nom, libelle: compStr(q.libelle, path + ".libelle", 40, nom), unite: compStr(q.unite, path + ".unite", 12, ""),
      defaut: compNum(q.defaut, path + ".defaut", 0), min: compNum(q.min, path + ".min", null), max: compNum(q.max, path + ".max", null) };
    if (o.min != null && o.max != null && o.min > o.max) throw new CompErr(LL("min est plus grand que max", "min is greater than max"), path);
    return o;
  });
  s.sorties = arr(d.sorties, "sorties").map((q, i) => {
    const path = `sorties[${i}]`;
    if (!q || typeof q !== "object") throw new CompErr(LL("il faut un objet", "an object is needed"), path);
    const nom = compNomOk(q.nom, path + ".nom", null);
    if (pinNames.has(nom)) throw new CompErr(LL(`« ${nom} » est déjà une broche ou une entrée`, `“${nom}” is already a pin or an input`), path + ".nom");
    if (vars.has(nom)) throw new CompErr(LL(`« ${nom} » est déjà ${vars.get(nom)}`, `“${nom}” is already ${vars.get(nom)}`), path + ".nom");
    pinNames.set(nom, LL("une sortie", "an output"));
    return { nom, libelle: compStr(q.libelle, path + ".libelle", 40, nom), unite: compStr(q.unite, path + ".unite", 12, "") };
  });
  const noeud = (n, path) => {
    if (n === "masse") return n;
    if (typeof n !== "string" || !(s.broches.some(b => b.nom === n) || s.noeuds.includes(n))) throw new CompErr(LL(`« ${n} » n'est ni une broche, ni un nœud interne, ni « masse »`, `“${n}” is neither a pin, nor an internal node, nor “masse”`), path);
    return n;
  };
  // alimentation
  if (d.alimentation != null) {
    const a = d.alimentation, path = "alimentation";
    if (typeof a !== "object") throw new CompErr(LL("il faut un objet", "an object is needed"), path);
    s.alimentation = { plus: noeud(a.plus, path + ".plus"), moins: noeud(a.moins == null ? "masse" : a.moins, path + ".moins"),
      min: compNum(a.min, path + ".min", 0), max: compNum(a.max, path + ".max", null) };
    vars.set("v_alim", LL("la tension d'alimentation", "the supply voltage")); vars.set("alim_ok", LL("l'indicateur d'alimentation", "the supply indicator"));
  }
  // mesure dans le monde 2D
  if (d.monde != null) {
    const w = d.monde, path = "monde";
    if (typeof w !== "object") throw new CompErr(LL("il faut un objet", "an object is needed"), path);
    if (!COMP_MESURES[w.mesure]) throw new CompErr(LL("« mesure » vaut « distance », « reflet » ou « contact »", "“mesure” is “distance”, “reflet” or “contact”"), path + ".mesure");
    if (vars.has(w.mesure) || pinNames.has(w.mesure)) throw new CompErr(LL(`le nom « ${w.mesure} » est déjà pris`, `the name “${w.mesure}” is already taken`), path + ".mesure");
    s.monde = { mesure: w.mesure, portee_m: compNum(w.portee_m, path + ".portee_m", 4, 0.01, 50), ouverture_deg: compNum(w.ouverture_deg, path + ".ouverture_deg", 0, 0, 60),
      tache_mm: compNum(w.tache_mm, path + ".tache_mm", 6, 0.5, 40), levier_mm: compNum(w.levier_mm, path + ".levier_mm", 8, 0, 100),
      defaut: compNum(w.defaut, path + ".defaut", COMP_MESURES[w.mesure].d) };
    vars.set(w.mesure, LL("la mesure dans le monde 2D", "the measurement in the 2D world"));
  }
  // liaison série
  if (d.serie != null) {
    const q = d.serie, path = "serie";
    if (typeof q !== "object") throw new CompErr(LL("il faut un objet", "an object is needed"), path);
    if (q.role !== "capteur" && q.role !== "actionneur") throw new CompErr(LL("« role » vaut « capteur » ou « actionneur »", "“role” is “capteur” (sensor) or “actionneur” (actuator)"), path + ".role");
    const its = arr(q.interfaces, path + ".interfaces");
    if (!its.length || its.some(x => !["aucune", "i2c", "spi", "uart"].includes(x))) throw new CompErr(LL("une liste parmi « i2c », « spi », « uart » et « aucune »", "a list among “i2c”, “spi”, “uart” and “aucune”"), path + ".interfaces");
    const o = { role: q.role, interfaces: [...new Set(its)], valeur: compNomOk(q.valeur, path + ".valeur", null), unite: compStr(q.unite, path + ".unite", 12, ""),
      resolution: compNum(q.resolution, path + ".resolution", 1, 1e-12), octets: compNum(q.octets, path + ".octets", 2, 1, 4),
      adresse_i2c: compNum(q.adresse_i2c, path + ".adresse_i2c", 0x40, 8, 119), registre: compNum(q.registre, path + ".registre", 0, 0, 255),
      debit_bauds: compNum(q.debit_bauds, path + ".debit_bauds", 9600, 300, 1e6), tension_min: compNum(q.tension_min, path + ".tension_min", null, 0),
      vcc: q.vcc == null ? (s.alimentation ? s.alimentation.plus : null) : noeud(q.vcc, path + ".vcc"),
      gnd: q.gnd == null ? (s.alimentation ? s.alimentation.moins : "masse") : noeud(q.gnd, path + ".gnd") };
    for (const k of ["vcc", "gnd"]) if (!o[k] || !s.broches.some(b => b.nom === o[k])) throw new CompErr(LL(`la liaison série a besoin d'une broche d'alimentation « ${k} » : indiquez-la ici ou dans « alimentation »`, `the serial link needs a supply pin “${k}”: give it here or in “alimentation”`), path + "." + k);
    for (const x of o.interfaces) for (const pn of COMP_SERIE_PINS[x] || []) if (pinNames.has(pn)) throw new CompErr(LL(`la liaison ${x.toUpperCase()} ajoute la broche « ${pn} » d'elle-même : retirez-la de « broches »`, `the ${x.toUpperCase()} link adds the pin “${pn}” by itself: remove it from “broches”`), "broches");
    if (o.role === "actionneur") { if (vars.has(o.valeur)) throw new CompErr(LL(`le nom « ${o.valeur} » est déjà pris`, `the name “${o.valeur}” is already taken`), path + ".valeur"); vars.set(o.valeur, LL("la consigne reçue par la liaison série", "the set point received by the serial link")); }
    s.serie = o;
  }
  // éléments de circuit
  const elNoms = new Set();
  s.elements = arr(d.elements, "elements").map((e, i) => {
    const path = `elements[${i}]`;
    if (!e || typeof e !== "object") throw new CompErr(LL("il faut un objet", "an object is needed"), path);
    const type = COMP_ELEMENTS[e.type];
    if (!type) throw new CompErr(LL(`type « ${e.type} » inconnu (R, C, L, V, I, D, S, G ou B)`, `unknown type “${e.type}” (R, C, L, V, I, D, S, G or B)`), path + ".type");
    const ent = arr(e.entre, path + ".entre");
    if (ent.length !== 2) throw new CompErr(LL("il faut deux nœuds : [\"a\", \"b\"]", "two nodes are needed: [\"a\", \"b\"]"), path + ".entre");
    const o = { type, entre: [noeud(ent[0], path + ".entre[0]"), noeud(ent[1], path + ".entre[1]")], nom: e.nom == null ? null : compNomOk(e.nom, path + ".nom", null) };
    if (o.entre[0] === o.entre[1]) throw new CompErr(LL("les deux nœuds sont les mêmes", "the two nodes are the same"), path + ".entre");
    if (o.nom) {
      if (elNoms.has(o.nom)) throw new CompErr(LL(`un autre élément s'appelle déjà « ${o.nom} »`, `another element is already called “${o.nom}”`), path + ".nom");
      elNoms.add(o.nom);
      if (vars.has("i_" + o.nom)) throw new CompErr(LL(`« i_${o.nom} » est déjà pris`, `“i_${o.nom}” is already taken`), path + ".nom");
      vars.set("i_" + o.nom, LL(`le courant de l'élément ${o.nom}`, `the current of element ${o.nom}`));
    }
    for (const [k, oblig, def] of COMP_CHAMPS[type]) o[k] = compTexte(e[k], `${path}.${k}`, oblig) ?? def;
    // une valeur écrite en clair est contrôlée tout de suite ; une expression l'est pendant la simulation
    const POS = { R: ["valeur"], C: ["valeur"], L: ["valeur"], V: ["r"], S: ["ron", "roff"], D: ["vf", "if", "n"] }[type] || [];
    for (const k of POS) { const v = Number(o[k]); if (/^[-+]?[\d.]+(e[-+]?\d+)?$/i.test(o[k]) && !(v > 0)) throw new CompErr(LL(`il faut une valeur positive (lu : ${o[k]})`, `a positive value is needed (read: ${o[k]})`), `${path}.${k}`); }
    if (type === "L" && /^[-+]?[\d.]+(e[-+]?\d+)?$/i.test(o.r) && Number(o.r) < 0) throw new CompErr(LL("une résistance ne peut pas être négative", "a resistance cannot be negative"), `${path}.r`);
    if (type === "G") {
      const c = arr(e.commande, path + ".commande");
      if (c.length !== 2) throw new CompErr(LL("il faut deux nœuds : [\"plus\", \"moins\"]", "two nodes are needed: [\"plus\", \"moins\"]"), path + ".commande");
      o.commande = [noeud(c[0], path + ".commande[0]"), noeud(c[1], path + ".commande[1]")];
    }
    return o;
  });
  if (s.elements.length > 200) throw new CompErr(LL("200 éléments au plus", "200 elements at most"), "elements");
  s.alertes = arr(d.alertes, "alertes").map((a, i) => {
    const path = `alertes[${i}]`;
    if (!a || typeof a !== "object") throw new CompErr(LL("il faut un objet", "an object is needed"), path);
    return { si: compTexte(a.si, path + ".si", true), message: compStr(a.message, path + ".message", 300, "") || LL("condition d'alerte atteinte", "warning condition reached"), duree: compNum(a.duree, path + ".duree", 0.001, 0) };
  });
  const eq = d.equations == null ? "" : Array.isArray(d.equations) ? d.equations.map(x => String(x)).join("\n") : d.equations;
  if (typeof eq !== "string") throw new CompErr(LL("un texte, ou une liste de lignes", "a text, or a list of lines"), "equations");
  if (eq.length > 20000) throw new CompErr(LL("équations trop longues", "equations too long"), "equations");
  if ((eq.match(/\bretard\s*\(/g) || []).length > 20) throw new CompErr(LL("20 retard() au plus (chacun garde en mémoire tout ce qui se passe pendant sa durée)", "20 retard() at most (each one keeps in memory everything that happens during its duration)"), "equations");
  s.equations = eq;
  s.affichage = arr(d.affichage, "affichage").slice(0, 3).map((x, i) => compNomOk(x, `affichage[${i}]`, null));
  s.largeur = compNum(d.taille && d.taille.largeur, "taille.largeur", 170, 120, 400);
  s.sources = arr(d.sources, "sources").slice(0, 100).map(x => (typeof x === "string" ? x.slice(0, 300) : x && typeof x === "object" ? JSON.parse(JSON.stringify(x)) : null)).filter(Boolean);
  if (!s.elements.length && !s.sorties.length && !s.serie) warns.push(LL("ce composant n'a ni élément de circuit, ni sortie, ni liaison série : il ne fera rien", "this component has no circuit element, no output and no serial link: it will do nothing"));
  for (const b of s.broches) if (!s.elements.some(e => e.entre.includes(b.nom) || (e.commande || []).includes(b.nom)) && !(s.serie && (s.serie.vcc === b.nom || s.serie.gnd === b.nom)) && !(s.alimentation && (s.alimentation.plus === b.nom || s.alimentation.moins === b.nom)))
    warns.push(LL(`la broche « ${b.nom} » n'est reliée à aucun élément : elle ne consomme ni ne fournit de courant`, `the pin “${b.nom}” is connected to no element: it neither draws nor supplies current`));
  s.prog = compProgramme(s, vars);
  return { spec: s, warns, src: JSON.parse(JSON.stringify(d)) };
}

// les équations, suivies d'une ligne par valeur d'élément et par alerte : un seul programme, exécuté à chaque pas
function compProgramme(s, vars) {
  const ins = [...vars.keys()], outs = s.sorties.map(o => o.nom), extra = [], where = [];
  const user = s.equations.split("\n").length;
  s.elements.forEach((e, i) => {
    for (const [k] of COMP_CHAMPS[e.type]) { if (e.type === "B" && k === "courant") continue; extra.push(`__e${i}_${k} = ${e[k]}`); outs.push(`__e${i}_${k}`); where.push(`elements[${i}].${k}`); }
  });
  s.alertes.forEach((a, i) => { extra.push(`__a${i} = ${a.si}`); outs.push(`__a${i}`); where.push(`alertes[${i}].si`); });
  if (s.serie && s.serie.role === "capteur") { extra.push(`__serie = ${s.serie.valeur}`); outs.push("__serie"); where.push("serie.valeur"); }
  for (const n of s.affichage) { extra.push(`__aff_${n} = ${n}`); outs.push(`__aff_${n}`); where.push("affichage"); }
  let P;
  try { P = EQ.compile(s.equations + "\n" + extra.join("\n"), ins, outs); }
  catch (e) {
    if (!e.eq) throw e;
    const l = e.line;
    if (l && l > user) throw new CompErr(e.message.replace(/__e\d+_|__a\d+|__serie|__aff_/g, ""), where[l - user - 1]);
    throw new CompErr(e.message, l ? LL(`equations, ligne ${l}`, `equations, line ${l}`) : "equations");
  }
  for (const n of s.affichage) if (!(n in P.index)) throw new CompErr(LL(`« ${n} » n'existe pas dans les équations`, `“${n}” does not exist in the equations`), "affichage");
  // courants non linéaires : une expression de v (la tension de l'élément), recalculée à chaque itération de Newton
  s.elements.forEach((e, i) => {
    if (e.type !== "B") return;
    if (P.index.v !== undefined) throw new CompErr(LL("les équations utilisent déjà le nom « v », réservé à la tension d'un élément B", "the equations already use the name “v”, reserved for the voltage of a B element"), `elements[${i}].courant`);
    let B;
    try { B = EQ.compile(`__i = ${e.courant}`, ["v", ...P.vars], ["__i"]); }
    catch (er) { if (!er.eq) throw er; throw new CompErr(er.message, `elements[${i}].courant`); }
    if (B.nState) throw new CompErr(LL("pas de fonction à mémoire (integ, filtre, retard...) dans un courant non linéaire", "no function with memory (integ, filtre, retard...) in a non-linear current"), `elements[${i}].courant`);
    e.B = B; e.map = Int32Array.from(P.vars.map(n => B.index[n]));
  });
  return P;
}

/* ---- traduction en composant du simulateur ---- */
const compSideE = c => (c === "droite" ? "right" : "left");
function composantDef(lu) {
  const s = lu.spec, P = s.prog, type = COMP_PREFIX + s.id;
  const idx = n => P.index[n];
  const params = [];
  for (const q of s.parametres) {
    if (q.reglage === "case") params.push({ k: q.nom, l: q.libelle, type: "toggle", d: !!q.defaut, live: true });
    else if (q.reglage === "choix") params.push({ k: q.nom, l: q.libelle, type: "select", d: String(q.defaut), options: q.choix.map(c => ({ v: String(c.valeur), l: c.libelle || String(c.valeur) + (q.unite ? " " + q.unite : "") })) });
    else if (q.reglage === "curseur") params.push({ k: q.nom, l: q.libelle, u: q.unite, type: "range", d: q.defaut, min: q.min, max: q.max, step: q.pas || (q.max - q.min) / 200, live: true });
    else params.push(Object.assign({ k: q.nom, l: q.libelle, u: q.unite, d: q.defaut, step: q.pas || "any" }, q.min != null ? { min: q.min } : {}, q.max != null ? { max: q.max } : {}, COMP_SI.has(q.unite) ? { si: true } : {}));
  }
  for (const q of s.entrees) {
    const l = LL(`${q.libelle} (si l'entrée n'est pas reliée)`, `${q.libelle} (if the input is not connected)`);
    params.push(q.min != null && q.max != null ? { k: "entree_" + q.nom, l, u: q.unite, type: "range", d: clamp(q.defaut, q.min, q.max), min: q.min, max: q.max, step: (q.max - q.min) / 200, live: true }
      : { k: "entree_" + q.nom, l, u: q.unite, d: q.defaut, step: "any" });
  }
  const W = s.monde;
  if (W) {
    params.unshift(...MONTAGE_PARAMS(LL(`la mesure arrive par la liaison « ${W.mesure} »`, `the measurement arrives through the “${W.mesure}” link`), 6, 0, W.mesure === "reflet" ? null : 0));
    if (W.mesure === "distance") params.push({ k: "ouverture_deg", l: LL("Ouverture du faisceau", "Beam opening"), u: "°", d: W.ouverture_deg, step: 1, min: 0, max: 60, when: p => !!p.porteur });
    if (W.mesure === "reflet") params.push({ k: "diametre_tache_mm", l: LL("Diamètre de la tache vue", "Diameter of the spot seen"), u: "mm", d: W.tache_mm, step: 1, min: 0.5, max: 40, when: p => !!p.porteur });
    if (W.mesure === "contact") params.push({ k: "levier_mm", l: LL("Longueur du levier", "Lever length"), u: "mm", d: W.levier_mm, step: 1, min: 0, max: 100, when: p => !!p.porteur });
  }
  const R = s.serie;
  if (R) {
    const ip = ifaceParams({ label: LL("Liaison", "Link"), base: R.interfaces[0], baseLabel: "", addr: R.adresse_i2c, bytes: R.octets, res: R.resolution, unit: R.unite, sensor: R.role === "capteur" });
    const lab = { aucune: LL("aucune (sorties directes)", "none (direct outputs)"), i2c: "bus I2C", spi: "bus SPI", uart: LL("liaison série UART", "UART serial link") };
    ip[0] = Object.assign({}, ip[0], { options: R.interfaces.map(v => ({ v, l: lab[v] })) });
    for (const q of ip) { if (q.k === "registre") q.d = R.registre; if (q.k === "debit_bauds") q.d = R.debit_bauds; }
    params.push(...ip);
  }
  const optional = [...s.broches.filter(b => b.optionnelle).map(b => b.nom), ...s.entrees.map(e => e.nom)];
  if (W) optional.push(W.mesure);
  const def = {
    label: s.nom, short: s.repere, cat: LL("Importés", "Imported"), hint: (s.description || LL("Composant importé", "Imported component")).replace(/[.\s]+$/, ""), importe: true, spec: s,
    w: s.largeur, h: compHauteur(s), nodes: s.noeuds, optional,
    fast: s.elements.some(e => e.type === "C" || e.type === "L" || e.type === "D" || e.type === "B") ? 50 : undefined,
    params,
    pins(p) {
      const o = {};
      for (const b of s.broches) o[b.nom] = E(compSideE(b.cote), b.libelle == null ? b.nom : b.libelle);
      for (const q of s.entrees) o[q.nom] = MI("left", q.unite, undefined, q.libelle);
      if (W && !p.porteur) o[W.mesure] = MI("left", COMP_MESURES[W.mesure].u, undefined, W.mesure);
      for (const q of s.sorties) o[q.nom] = MO("right", q.unite, undefined, q.libelle);
      if (R && R.interfaces.includes(p.interface) && p.interface !== "aucune") ifacePins(p, o, "right", R.role === "capteur");
      return o;
    },
    check(c, model) { return W ? checkPorteur(c, model) : null; },
    init(it, sim) {
      const st = it.st, p = it.p;
      Object.assign(st, { k: P, V: new Float64Array(P.vars.length), S: [], c: { t: 0, dt: sim.dt, rnd: rng(13) }, first: true, tq: -1, consigne: 0, m: W ? W.defaut : 0 });
      const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
      const nd = n => (n === "masse" ? -1 : own(it.n, n) ? it.n[n] : it.n["~" + n]);
      st.el = s.elements.map((e, i) => {
        const x = { e, k: i, a: nd(e.entre[0]), b: nd(e.entre[1]), val: {}, cur: 0, v: 0, v1: 0, i: 0, i1: 0, on: null, first: true, cc: st.c };
        if (e.commande) { x.c = nd(e.commande[0]); x.d = nd(e.commande[1]); }
        if (e.type === "B") { x.V2 = new Float64Array(e.B.vars.length); x.vl = 0; }
        return x;
      });
      st.pinIdx = [...s.broches.map(b => b.nom), ...s.noeuds].map(n => [idx("v_" + n), nd(n)]);
      st.vp = s.alimentation ? [nd(s.alimentation.plus), nd(s.alimentation.moins)] : null;
      st.link = null;
      if (R && R.interfaces.includes(p.interface) && p.interface !== "aucune") {
        const vmin = R.tension_min != null ? R.tension_min : s.alimentation ? s.alimentation.min : 0;
        st.link = mkLink(it, sim, { sensor: R.role === "capteur", vcc: R.vcc, gnd: R.gnd, on: () => it.v(R.vcc) - it.v(R.gnd) >= vmin,
          get: () => st.V[idx("__serie")], set: v => { st.consigne = v; } });
      }
      for (const q of s.sorties) it.out[q.nom] = 0;
    },
    step(it, t, dt, sim) {
      const st = it.st, p = it.p, V = st.V, c = st.c;
      for (const q of s.parametres) V[idx(q.nom)] = q.reglage === "case" ? (p[q.nom] ? 1 : 0) : +p[q.nom];
      for (const q of s.entrees) { const x = it.in[q.nom]; V[idx(q.nom)] = x == null ? +p["entree_" + q.nom] : x; }
      const X = sim.m.x;
      for (const [k, n] of st.pinIdx) V[k] = n < 0 ? 0 : X[n];
      for (const x of st.el) if (x.e.nom) V[idx("i_" + x.e.nom)] = x.cur;
      if (st.vp) { const u = (st.vp[0] < 0 ? 0 : sim.m.x[st.vp[0]]) - (st.vp[1] < 0 ? 0 : sim.m.x[st.vp[1]]); V[idx("v_alim")] = u; V[idx("alim_ok")] = u >= s.alimentation.min ? 1 : 0; }
      if (W) {
        if (p.porteur) {
          if (st.tq < 0 || t - st.tq >= 0.00025) {
            st.tq = t;
            const q = monteSur(it, sim);
            if (q && sim.monde) {
              st.pos = q;
              if (W.mesure === "distance") {
                const n = p.ouverture_deg > 0 ? 5 : 1, a0 = Math.atan2(q.dy, q.dx);
                let dd = W.portee_m;
                for (let k = 0; k < n; k++) { const a = a0 + (n > 1 ? (k / (n - 1) - 0.5) * p.ouverture_deg * DEG : 0); dd = Math.min(dd, sim.monde.ray(q.x, q.y, Math.cos(a), Math.sin(a), W.portee_m, q.R)); }
                st.m = st.wd = dd;
              } else if (W.mesure === "reflet") st.m = st.R = sim.monde.sol(q.x, q.y, p.diametre_tache_mm / 2000);
              else { const L = p.levier_mm / 1000; st.press = !!sim.monde.touche(q.x + q.dx * L, q.y + q.dy * L, 0.002, q.R); st.m = st.press ? 1 : 0; }
            }
          }
        } else { const x = it.in[W.mesure]; st.m = x == null ? W.defaut : x; }
        V[idx(W.mesure)] = st.m;
      }
      if (R && R.role === "actionneur") V[idx(R.valeur)] = st.consigne;
      c.t = t; c.dt = dt;
      if (st.first) { st.first = false; P.init(V, st.S, c); }
      P.run(V, st.S, c);
      if (st.S.court) sim.alert(it.name + ":retard", LL(`${it.name} : un retard() de sa description demande plus de mémoire que permis : il a été raccourci.`, `${it.name}: a retard() of its description needs more memory than allowed: it was shortened.`));
      for (const q of s.sorties) {
        const v = V[idx(q.nom)];
        if (!Number.isFinite(v)) throw new SimError(LL(`${it.name} : la sortie « ${q.nom} » n'est plus un nombre à t = ${fmtNum(t)} s.`, `${it.name}: output “${q.nom}” is no longer a number at t = ${fmtNum(t)} s.`), null, it.name);
        it.out[q.nom] = v;
      }
      let dirty = false;
      for (const x of st.el) {
        const e = x.e, val = x.val, G = COMP_G[e.type];
        for (const [k] of COMP_CHAMPS[e.type]) {
          if (e.type === "B" && k === "courant") continue;
          const v = V[idx(`__e${x.k}_${k}`)];
          if (!Number.isFinite(v)) throw new SimError(LL(`${it.name} : la valeur « ${k} » de l'élément ${e.nom || "n° " + (x.k + 1)} n'est plus un nombre à t = ${fmtNum(t)} s.`, `${it.name}: value “${k}” of element ${e.nom || "n° " + (x.k + 1)} is no longer a number at t = ${fmtNum(t)} s.`), null, it.name);
          if (val[k] !== v) { if (G.includes(k)) dirty = true; val[k] = v; }
        }
        if ((e.type === "R" || e.type === "C" || e.type === "L") && !(val.valeur > 0))
          throw new SimError(LL(`${it.name} : l'élément ${e.nom || "n° " + (x.k + 1)} (${e.type}) vaut ${fmtNum(val.valeur)} ; il lui faut une valeur positive.`, `${it.name}: element ${e.nom || "n° " + (x.k + 1)} (${e.type}) is ${fmtNum(val.valeur)}; it needs a positive value.`), null, it.name);
        if (e.type === "S") { const on = val.ferme !== 0; if (on !== x.on) { x.on = on; dirty = true; } }
        if (e.type === "C" && x.first) { x.v = x.v1 = val.tension_initiale || 0; }
        if (e.type === "D") {
          const key = `${val.vf}|${val.if}|${val.n}|${val.vz}`;
          if (x.Jk !== key) {
            x.Jk = key;
            const vf = val.vf > 0 ? val.vf : 0.7, i0 = val.if > 0 ? val.if : 0.01, nvt = (val.n > 0 ? val.n : 2) * VT, old = x.J;
            x.J = mkJf(vf, i0, nvt); if (val.vz > 0) x.J.vz = val.vz;
            if (old) { x.J.v = old.v; x.J.id = old.id; x.J.gd = old.gd; }
          }
        }
        if (e.type === "B") { const M = e.map, V2 = x.V2; for (let j = 0; j < M.length; j++) V2[M[j]] = V[j]; }
        x.first = false;
      }
      if (dirty) sim.dirty = true;
      s.alertes.forEach((a, k) => watch(sim, it, "a" + k, V[idx("__a" + k)] !== 0, dt, a.duree, () => `${it.name} : ${a.message}`));
      if (st.vp && s.alimentation.max != null) watch(sim, it, "alim", V[idx("v_alim")] > s.alimentation.max, dt, 0.001, () => LL(`${it.name} : alimenté sous ${fmtNum(V[idx("v_alim")], 3)} V, au-delà des ${fmtNum(s.alimentation.max)} V permis par la datasheet.`, `${it.name}: powered at ${fmtNum(V[idx("v_alim")], 3)} V, beyond the ${fmtNum(s.alimentation.max)} V allowed by the datasheet.`));
      for (const x of st.el) if (x.e.type === "D" && x.val.imax > 0) watch(sim, it, "d" + x.k, Math.abs(x.cur) > x.val.imax, dt, 0.01, () => LL(`${it.name} : ${fA(x.cur)} dans la diode ${x.e.nom || "n° " + (x.k + 1)}, plus que son maximum (${fA(x.val.imax)}).`, `${it.name}: ${fA(x.cur)} in diode ${x.e.nom || "n° " + (x.k + 1)}, more than its maximum (${fA(x.val.imax)}).`));
      if (st.link) st.link.step(t, dt);
    },
    stampG(it, m, dt, sim) {
      for (const x of it.st.el) {
        const v = x.val;
        switch (x.e.type) {
          case "R": m.g(x.a, x.b, 1 / v.valeur); break;
          case "C": m.g(x.a, x.b, (sim.bdf ? 1.5 : 1) * v.valeur / dt); break;
          case "L": m.g(x.a, x.b, 1 / ((sim.bdf ? 1.5 : 1) * v.valeur / dt + Math.max(v.r, 1e-6))); break;
          case "V": m.g(x.a, x.b, 1 / Math.max(v.r, 1e-6)); break;
          case "S": m.g(x.a, x.b, 1 / Math.max(x.on ? v.ron : v.roff, 1e-6)); break;
          case "G": m.vccs(x.a, x.b, x.c, x.d, v.gain); break;
        }
      }
      if (it.st.link) it.st.link.stamp(m);
    },
    stampI(it, m, t, dt, sim) {
      for (const x of it.st.el) {
        const v = x.val;
        switch (x.e.type) {
          case "C": m.i(x.a, x.b, -dHist(sim, x.v, x.v1) * v.valeur / dt); break;
          case "L": m.i(x.a, x.b, coilI(sim, x, 0, v.valeur / dt, Math.max(v.r, 1e-6))); break;
          case "V": m.i(x.b, x.a, v.valeur / Math.max(v.r, 1e-6)); break;
          case "I": m.i(x.a, x.b, v.valeur); break;
        }
      }
    },
    post(it, t, dt, sim) {
      const X = sim.m.x, vn = k => (k < 0 ? 0 : X[k]);
      for (const x of it.st.el) {
        const v = x.val, u = vn(x.a) - vn(x.b);
        switch (x.e.type) {
          case "R": x.cur = u / v.valeur; break;
          case "C": { const c = v.valeur / dt; x.cur = c * ((sim.bdf ? 1.5 : 1) * u - dHist(sim, x.v, x.v1)); kink(sim, u, x.v, x.v1); x.v1 = x.v; x.v = u; break; }
          case "L": { const i = coilI(sim, x, u, v.valeur / dt, Math.max(v.r, 1e-6)); kink(sim, i, x.i, x.i1); x.i1 = x.i; x.i = i; x.cur = i; break; }
          case "V": x.cur = (v.valeur - u) / Math.max(v.r, 1e-6); break;
          case "I": x.cur = v.valeur; break;
          case "D": x.cur = jI(x.J, u); break;
          case "S": x.cur = u / Math.max(x.on ? v.ron : v.roff, 1e-6); break;
          case "G": x.cur = v.gain * (vn(x.c) - vn(x.d)); break;
          case "B": x.cur = compB(x, u); break;
        }
      }
    },
  };
  if (s.elements.some(e => e.type === "D" || e.type === "B")) {
    def.stampNL = (it, m, sim) => {
      for (const x of it.st.el) {
        if (x.e.type === "D") stampJ(m, sim, x.a, x.b, x.J);
        else if (x.e.type === "B") {
          let u = (x.a < 0 ? 0 : m.x[x.a]) - (x.b < 0 ? 0 : m.x[x.b]);
          if (Math.abs(u - x.vl) > 0.5) { u = x.vl + Math.sign(u - x.vl) * 0.5; sim.limited = true; }      // pas de plus d'un demi-volt par itération
          const h = 1e-6 * Math.max(1, Math.abs(u)), i = compB(x, u), g = (compB(x, u + h) - compB(x, u - h)) / (2 * h);
          if (!Number.isFinite(i) || !Number.isFinite(g)) throw new SimError(LL(`${it.name} : le courant de l'élément ${x.e.nom || "n° " + (x.k + 1)} n'est plus un nombre pour v = ${fmtNum(u, 4)} V.`, `${it.name}: the current of element ${x.e.nom || "n° " + (x.k + 1)} is no longer a number for v = ${fmtNum(u, 4)} V.`), null, it.name);
          x.vl = u;
          const gg = g + GMIN;
          m.g(x.a, x.b, gg); m.i(x.a, x.b, i - gg * u);
        }
      }
    };
  }
  return { type, def };
}
// hauteur du boîtier : la plus longue rangée de bornes (liaison série et mesure du monde comprises), puis les lignes affichées
function compHauteur(s) {
  const g = s.broches.filter(b => b.cote === "gauche").length + s.entrees.length + (s.monde ? 1 : 0);
  const d = s.broches.filter(b => b.cote === "droite").length + s.sorties.length + (s.serie ? Math.max(...s.serie.interfaces.map(x => (x === "spi" ? 3 : x === "i2c" ? 2 : x === "uart" ? 1 : 0))) : 0);
  return 42 + Math.max(0, Math.max(g, d, 1) - 1) * 20 + 30 + 14 * s.affichage.length;
}
// courant d'un élément B sous la tension u
function compB(x, u) {
  const B = x.e.B, V2 = x.V2;
  V2[B.index.v] = u;
  B.run(V2, [], x.cc);
  return V2[B.index.__i];
}

/* ---- installation dans la bibliothèque du simulateur ---- */
// renvoie { type, spec, warns } ; une description déjà installée sous le même identifiant est remplacée
function composantInstalle(src) {
  const lu = composantLit(src), { type, def } = composantDef(lu);
  if (DEFS[type] && !DEFS[type].importe) throw new CompErr(LL(`l'identifiant « ${lu.spec.id} » est déjà utilisé par un composant du simulateur`, `the identifier “${lu.spec.id}” is already used by a component of the simulator`), "id");
  DEFS[type] = def;
  def.src = lu.src;
  return { type, spec: lu.spec, warns: lu.warns, src: lu.src };
}
// les descriptions d'un montage (champ composants_importes) : installées avant de lire ses composants
function composantsDuMontage(d) {
  const list = d.composants_importes || d.definitions || [];
  if (!Array.isArray(list)) throw new CompErr(LL("« composants_importes » doit être une liste", "“composants_importes” must be a list"));
  return list.map((x, i) => {
    try { return composantInstalle(x).src; }
    catch (e) { if (e.comp) throw new CompErr(e.message, LL(`composant importé n° ${i + 1}${x && x.id ? ` (${x.id})` : ""}`, `imported component no. ${i + 1}${x && x.id ? ` (${x.id})` : ""}`)); throw e; }
  });
}

if (typeof module !== "undefined") module.exports = { composantLit, composantInstalle, composantsDuMontage, CompErr, COMP_FORMAT };
