/* ---------------------------------------------------------------------------
   Langue : français ou anglais. Chaque texte affiché est écrit dans les deux langues, côte à côte : LL("Lancer", "Run").
   Choix : ?lang=en ou ?lang=fr dans l'adresse, sinon le dernier choix fait avec le bouton FR/EN, sinon la langue du
   navigateur (français si elle est française, anglais sinon). Dans Node (tests) : français, ou PAILLASSE_LANG=en.
   --------------------------------------------------------------------------- */
const LANG = (() => {
  const ok = v => (v === "fr" || v === "en" ? v : null);
  try { if (typeof process !== "undefined" && process.versions && process.versions.node) return ok(process.env.PAILLASSE_LANG) || "fr"; } catch (e) {}
  try { const q = ok(new URLSearchParams(location.search).get("lang")); if (q) return q; } catch (e) {}
  try { const s = ok(localStorage.getItem("paillasse-langue")); if (s) return s; } catch (e) {}
  try { return /^fr\b/i.test(navigator.language || "") ? "fr" : "en"; } catch (e) { return "fr"; }
})();
const EN = LANG === "en";
const DEC = EN ? "." : ",";                     // séparateur décimal affiché
function LL(fr, en) { return EN && en !== undefined ? en : fr; }
// Noms des bornes : la clé reste française (fichiers, fils « R1.a »), seul l'affichage change en anglais
const PIN_EN = {
  sortie: "out", entree: "in", curseur: "wiper", vitesse: "speed", charge: "load", cible: "target", axe: "shaft",
  commun: "COM", travail: "NO", repos: "NC", arbre: "shaft", cap: "heading", rotation: "rotation", roue_g: "wheel_L",
  roue_d: "wheel_R", inclinaison_deg: "tilt_deg", position_bille: "ball_pos", lumiere: "light", mesure: "measure",
  moins: "minus", plus: "plus", reflet: "reflect", appui: "pressed", bobine1: "coil1", bobine2: "coil2",
  temperature: "temperature", decharge: "discharge", seuil: "threshold",
};
function pinLab(pd, k) { return pd && pd.lab != null ? pd.lab : (EN && PIN_EN[k]) || k; }
// En anglais, les guillemets français d'un message (« x ») deviennent des guillemets anglais (“x”)
function guil(s) { return EN && typeof s === "string" ? s.replace(/«\s?/g, "“").replace(/\s?»/g, "”").replace(/ ([:;!?])(?=\s|$)/g, "$1") : s; }
// Noms donnés d'office aux pièces et articulations du monde 2D (boite1, mur2...) : en anglais, box1, wall2...
const NOM_EN = { boite: "box", rond: "round", mur: "wall", balle: "ball", bras: "arm", ligne: "line", pivot: "pivot", glissiere: "slider" };
const nomBase = b => (EN && NOM_EN[b]) || b;
