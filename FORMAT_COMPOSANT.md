# Format « paillasse-composant », version 1

Ce document décrit le fichier JSON qui ajoute un composant à Paillasse. Il est collé ou chargé dans la fenêtre
**Importer** ; le composant apparaît alors dans la palette (catégorie **Importés**), avec ses bornes, ses réglages
dans l'inspecteur et, s'il décrit une mesure, sa place dans le monde 2D.

Un fichier contient une description, ou une liste `[ ... ]` de descriptions. Un montage exporté emporte les
descriptions des composants importés qu'il utilise (champ `composants_importes`).

Le fichier ne contient pas de code : le comportement s'écrit avec des **éléments de circuit** (résistance, source,
diode...) reliés aux broches, et des **équations** dans le langage du bloc sur mesure. Paillasse vérifie tout à
l'import et refuse une description incomplète avec un message qui dit où est l'erreur (`elements[2].valeur : ...`).

Les exemples complets sont proposés dans la fenêtre Importer du menu Montage (« Exemple de description… ») et rangés dans le dossier
`composants/` : `lm35.json` (capteur analogique), `tmp102.json` (capteur I2C), `led_rouge.json` (diode), `lm358.json`
(ampli op avec nœuds internes), `gp2y0a21.json` (capteur de distance du monde 2D), `moteur_cc_exemple.json`
(actionneur décrit par équations).

## Champs de premier niveau

| Champ | Obligatoire | Contenu |
|---|---|---|
| `format` | oui | `"paillasse-composant"` |
| `version` | oui | `1` |
| `id` | oui | identifiant : lettres sans accent, chiffres et `_`, 31 caractères au plus (`"lm35"`). Réimporter le même `id` remplace la description et met à jour les composants déjà posés. |
| `nom` | non | nom dans la palette (`"LM35"`) |
| `description` | non | une phrase, affichée sous le nom |
| `categorie` | non | texte libre (`"Capteurs"`), affiché dans l'inspecteur et trouvé par la recherche de la palette ; la palette range tous les composants importés sous **Importés** |
| `repere` | non | préfixe des noms sur la feuille, 1 à 6 lettres : en majuscules il est numéroté (`"U"` donne U1, U2...), sinon le premier n'a pas de numéro (`"ir"` donne ir, ir2...) |
| `sources` | non | liste de textes (ou d'objets) : d'où vient chaque valeur. Affichée dans l'inspecteur. |
| `broches` | oui | les bornes électriques |
| `noeuds` | non | nœuds internes, invisibles sur la feuille |
| `parametres` | non | réglages de l'inspecteur |
| `entrees` | non | grandeurs reçues par une liaison mécanique (température, couple...) |
| `sorties` | non | grandeurs fournies par une liaison mécanique (vitesse, angle...) |
| `alimentation` | non | broches et plage d'alimentation |
| `equations` | non | texte, ou liste de lignes |
| `elements` | non | éléments de circuit entre les broches et les nœuds |
| `alertes` | non | conditions qui affichent une alerte (valeurs maximales de la datasheet) |
| `serie` | non | liaison I2C, SPI ou UART |
| `monde` | non | mesure dans le monde 2D (distance, reflet du sol, contact) |
| `affichage` | non | jusqu'à trois variables affichées sur le symbole |
| `taille` | non | `{ "largeur": 170 }`, de 120 à 400 |

Les noms (broches, nœuds, paramètres, entrées, sorties, éléments, variables) suivent la même règle que `id`.
Sont réservés : les mots et fonctions des équations (`t`, `dt`, `pi`, `vrai`, `faux`, `et`, `ou`, `non`, `const`,
`initial`, `si`, `min`, `max`, `exp`, `racine`, `integ`, `retard`...), les noms qui commencent par `__`, ceux qu'un objet
JavaScript porte déjà (`constructor`, `toString`...), et `masse`, qui désigne la masse du montage. Un paramètre ne peut
pas non plus porter le nom d'un réglage que Paillasse crée lui-même : `entree_...`, `porteur`, `pos_avant_cm`,
`pos_gauche_cm`, `orientation_deg`, `ouverture_deg`, `diametre_tache_mm`, `levier_mm`, `interface`, `adresse_i2c`,
`registre`, `octets`, `resolution`, `debit_bauds`, `periode_envoi_ms`.

Limites : 40 broches, 100 nœuds internes, 100 paramètres, 20 entrées, 20 sorties, 200 éléments, 50 alertes,
20 `retard()`, 20 000 caractères d'équations. Les textes affichés (`nom`, `libelle`...) sont coupés à leur longueur
maximale (12 caractères pour une étiquette de broche) et les caractères `< > & "` y sont remplacés (`&` devient « et »).

## Broches et nœuds

```json
"broches": [
  { "nom": "vs", "libelle": "+Vs", "cote": "gauche" },
  { "nom": "vout", "libelle": "VOUT", "cote": "droite", "optionnelle": true }
],
"noeuds": ["n1"]
```

`cote` vaut `gauche` (par défaut) ou `droite`. `libelle` est le texte écrit à côté de la borne (12 caractères au
plus). Une broche `optionnelle` peut rester libre sans avertissement. Les broches d'une liaison série (`sda`,
`scl`...) sont ajoutées d'elles-mêmes : ne les déclarez pas.

## Paramètres

```json
{ "nom": "gain", "libelle": "Sensibilité", "unite": "V/°C", "defaut": 0.01, "min": 0, "max": 1, "pas": 0.001, "source": "p. 3" }
```

`reglage` choisit la forme du réglage :

- `"champ"` (par défaut) : un nombre ; avec une unité électrique (Ω, F, H, A, V, Hz, s, W), on peut taper 4.7k ou 100n ;
- `"curseur"` : réglable pendant la simulation ; `min` et `max` obligatoires ;
- `"case"` : 0 ou 1, réglable pendant la simulation ;
- `"choix"` : une liste `"choix": [{ "valeur": 1, "libelle": "x1" }, ...]`.

Dans les équations, un paramètre est une variable du même nom. Sa `source` est affichée dans l'inspecteur.

## Entrées et sorties mécaniques

```json
"entrees": [{ "nom": "temperature", "libelle": "Température", "unite": "°C", "defaut": 25, "min": -55, "max": 150 }],
"sorties": [{ "nom": "vitesse", "libelle": "Vitesse", "unite": "tr/min" }]
```

Une entrée est une borne mécanique à gauche. Non reliée, elle prend la valeur réglée dans l'inspecteur (un curseur
si `min` et `max` sont donnés). Une sortie est une borne mécanique à droite ; les équations doivent la calculer.

## Alimentation

```json
"alimentation": { "plus": "vs", "moins": "gnd", "min": 4, "max": 30 }
```

Donne deux variables : `v_alim` (tension entre `plus` et `moins`) et `alim_ok` (1 si `v_alim` ≥ `min`).
Au-delà de `max`, Paillasse affiche une alerte. Le courant consommé, lui, se décrit par un élément (souvent `I`).

## Équations

Le langage du bloc sur mesure : une ligne = `nom = expression`, exécutée à chaque pas de calcul, dans l'ordre.
Une variable garde sa valeur d'un pas au suivant. `const nom = expression` est calculé une fois au départ.
`#` commence un commentaire. Le séparateur décimal est le point ; les suffixes `p n u µ m k M G` sont acceptés
(`4.7k`, `100n`).

Fonctions : `si(c, a, b)`, `min`, `max`, `sat(x, bas, haut)`, `abs`, `exp`, `ln`, `log`, `racine`, `sin`, `cos`,
`tan`, `atan2`, `arrondi`, `plancher`, `plafond`, `mod`, `rad`, `deg` ; à mémoire : `integ(x)`, `deriv(x)`,
`filtre(x, tau)`, `retard(x, T)`, `echantillon(x, T)`, `hyst(x, bas, haut)`, `front(x)`, `bascule(s, r)`,
`alea()`, `bruit(sigma)`. Constantes : `t` (temps, s), `dt` (pas, s), `pi`.

Variables fournies par Paillasse, en plus des paramètres et des entrées :

| Variable | Valeur |
|---|---|
| `v_<broche>`, `v_<noeud>` | tension par rapport à la masse du montage, en V, au pas précédent |
| `i_<élément>` | courant de l'élément nommé, en A, au pas précédent (voir le sens plus bas) |
| `v_alim`, `alim_ok` | si `alimentation` est décrite |
| `distance`, `reflet` ou `contact` | si `monde` est décrit |
| la consigne d'un actionneur série | si `serie.role` vaut `actionneur` (nom donné par `serie.valeur`) |

Les équations voient les tensions et les courants du pas précédent : avec un pas de 50 µs, c'est sans
conséquence pour un capteur ou un moteur. Une boucle rapide (un ampli op rebouclé) ne doit pas passer par les
équations : décrivez-la avec des éléments, qui sont résolus avec le circuit (voir `lm358.json`).

## Éléments de circuit

Chaque élément relie deux nœuds : `"entre": ["a", "b"]`, où `a` et `b` sont des broches, des nœuds internes ou
`masse`. Un `nom` est facultatif ; il donne la variable `i_<nom>`. Chaque valeur est un nombre ou une expression
des équations, recalculée à chaque pas.

| `type` | Champs | Comportement | Courant `i_` |
|---|---|---|---|
| `R` | `valeur` (Ω, > 0) | résistance | de a vers b |
| `C` | `valeur` (F, > 0), `tension_initiale` | condensateur | de a vers b |
| `L` | `valeur` (H, > 0), `r` (Ω, défaut 0,001) | bobine avec sa résistance | de a vers b |
| `V` | `valeur` (V), `r` (Ω, défaut 0,01) | source : v(a) − v(b) = valeur, derrière r | sortant par a |
| `I` | `valeur` (A) | source de courant de a vers b, à l'intérieur de l'élément | de a vers b |
| `D` | `vf`, `if`, `n`, `vz`, `imax` | diode d'anode a, de cathode b : `vf` volts sous `if` ampères (défauts 0,7 V, 10 mA), coefficient `n` (défaut 2), tension Zener `vz` si > 0, alerte au-delà de `imax` si > 0 | de a vers b |
| `S` | `ferme` (expression : vrai si ≠ 0), `ron` (défaut 0,1 Ω), `roff` (défaut 1 GΩ) | interrupteur | de a vers b |
| `G` | `commande: ["c", "d"]`, `gain` (S) | courant gain · (v(c) − v(d)), de a vers b, résolu avec le circuit | de a vers b |
| `B` | `courant` : expression de `v` = v(a) − v(b) | courant non linéaire, résolu par Newton avec le circuit ; pas de fonction à mémoire | de a vers b |

« De a vers b » : le courant entre dans l'élément par a et en sort par b. Une source `I` de a vers b tire donc
son courant de a et le pousse dans b. Les noms des champs `R`, `C`... s'écrivent aussi en toutes lettres :
`resistance`, `condensateur`, `bobine`, `source_tension`, `source_courant`, `diode`, `interrupteur`,
`transconductance`, `courant`.

Pour une sortie analogique, le plus simple est une source `V` entre la broche de sortie et la masse du composant,
avec sa résistance de sortie (`r`) et une valeur calculée par les équations. Le courant que cette source fournit à la
charge n'est alors pas pris sur la broche d'alimentation (seuls les éléments reliés à cette broche le sont) : c'est
sans importance pour un capteur, mais la consommation affichée de l'alimentation ne comprend pas ce courant.

Une valeur écrite en clair est contrôlée dès l'import (une résistance, une capacité, une inductance, la résistance
d'une source ou d'un interrupteur, `vf`, `if` et `n` d'une diode doivent être positifs). Une valeur donnée par une
expression l'est pendant la simulation, qui s'arrête avec un message si elle sort des limites.

## Alertes

```json
"alertes": [{ "si": "abs(i_sortie) > 0.02", "message": "plus de 20 mA en sortie", "duree": 0.001 }]
```

L'alerte s'affiche quand la condition a été vraie `duree` secondes de plus qu'elle n'a été fausse (défaut 1 ms) : un
compteur monte quand elle est vraie et redescend quand elle est fausse. Une condition vraie par intermittence finit
donc par déclencher l'alerte si elle est vraie plus souvent que fausse.

## Liaison série

```json
"serie": {
  "role": "capteur", "interfaces": ["i2c"], "valeur": "temperature_lue", "unite": "°C",
  "resolution": 0.00390625, "octets": 2, "adresse_i2c": "0x48", "registre": 0, "vcc": "vcc", "gnd": "gnd"
}
```

- `role` : `capteur` (le composant envoie la variable `valeur` des équations) ou `actionneur` (il reçoit une
  consigne, rangée dans la variable `valeur`).
- `interfaces` : parmi `i2c`, `spi`, `uart`, `aucune` ; la première est le choix par défaut, l'inspecteur propose les
  autres. Les broches SDA/SCL, CS/SCK/MISO (ou MOSI), TX (ou RX) sont ajoutées à droite.
- Le format est celui des capteurs série de Paillasse : la valeur divisée par `resolution`, en entier signé sur
  `octets` octets, poids fort d'abord. I2C : lue au registre `registre` de l'adresse `adresse_i2c` (écrite au même
  registre pour un actionneur). SPI : présentée sur MISO dès que CS descend. UART : envoyée en texte, une ligne par
  mesure (`debit_bauds`, défaut 9600).
- `vcc` et `gnd` : broches d'alimentation de la liaison (par défaut celles de `alimentation`). Ce doivent être des
  broches : si `alimentation.moins` vaut `masse` (sa valeur par défaut), donnez `gnd` ici. `tension_min` : tension sous
  laquelle la liaison se tait (par défaut `alimentation.min`).
- Bornes : `octets` de 1 à 4, `adresse_i2c` de 8 à 119 (`"0x48"` accepté), `registre` de 0 à 255, `debit_bauds` de 300
  à 1 000 000. Une valeur trop grande pour `octets` est bornée à la plus grande valeur codable, sans alerte. En UART, un
  capteur envoie une mesure toutes les 100 ms (réglable dans l'inspecteur), la première 20 ms après la mise sous
  tension. La consigne d'un actionneur vaut 0 tant que rien n'est reçu.

Ce format ne reproduit pas la carte de registres d'une vraie puce. Il coïncide avec elle quand la puce rend une
seule valeur sur un registre, comme le TMP102 : avec une résolution de 1/256 °C et une mesure arrondie à
0,0625 °C, les octets lus sont ceux de la puce réelle.

## Monde 2D

```json
"monde": { "mesure": "distance", "portee_m": 1.5, "ouverture_deg": 5, "defaut": 0.3 }
```

`mesure` vaut `distance` (en m, jusqu'au premier obstacle, `portee_m` au plus : de 0,01 à 50 m, 4 m par défaut),
`reflet` (0 noir à 1 blanc, vu sur une tache de `tache_mm` de diamètre, 6 mm par défaut) ou `contact` (1 quand le bout
d'un levier de `levier_mm` touche, 8 mm par défaut). `defaut` vaut par défaut 4 (distance), 1 (reflet) ou 0 (contact).
L'inspecteur propose alors « Monté sur » (un robot, une pièce ou le sol) ; la page Monde place le capteur à la
souris. Non monté, le composant a une borne mécanique du nom de la mesure, qui vaut `defaut` si elle est libre.

## Affichage

`"affichage": ["temperature", "vsortie"]` : ces variables s'écrivent sur le symbole pendant la simulation.
L'inspecteur montre en plus toutes les variables des équations.

## Ce que le format ne fait pas

- pas de code : une puce dont le comportement est un programme (microcontrôleur, carte de registres complète) ne se
  décrit pas ici ;
- pas de bornes en haut ou en bas, pas de dessin de symbole : un boîtier à deux rangées de bornes ;
- pas d'actionneur dans le monde 2D : un moteur importé ne s'attache pas à une articulation (utilisez le moteur ou le
  servo du simulateur, réglés d'après la datasheet) ;
- les valeurs sont celles du fichier : vérifiez-les sur la datasheet, surtout celles lues sur une courbe.
