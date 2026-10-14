# Paillasse : sources

Simulateur de montages électriques et mécatroniques dans le navigateur. Tout tient dans `index.html`,
assemblé par `build.sh` à partir des fichiers ci-dessous. `index.html` s'ouvre d'un double-clic, sans serveur ni connexion.

| Fichier | Rôle |
|---|---|
| `head.html` | Styles (thème Atelier). |
| `body.html` | Structure de la page. |
| `cc1.js` | Compilateur C : lexer, préprocesseur, types. |
| `cc2.js` | Compilateur C : analyse syntaxique et typage, signatures de la bibliothèque. |
| `cc3.js` | Compilateur C : génération de JavaScript (une fonction C = un générateur). |
| `cc4.js` | Exécution : RAM simulée, ordonnancement (`delay`, budget d'instructions), bibliothèque. |
| `vh1.js` | VHDL : analyse lexicale et syntaxique (le texte devient un arbre). |
| `vh2.js` | VHDL : valeurs (`std_logic` sur 6 codes, vecteurs), bibliothèque d'exécution `VR` (numeric_std) et noyau de simulation `VhSim` (pilotes, résolution, cycles delta). |
| `vh3.js` | VHDL : types, vérification et traduction de chaque process en une fonction JavaScript (`VhCtx`). |
| `vh4.js` | VHDL : élaboration (`VhElab`) : generics, signaux, instances, generate. Point d'entrée `VHDL.build(texte, options)`. |
| `engine.js` | Moteur : solveur de circuit (classe `Mna`), boucle de simulation, sondes, vérification du câblage, broches du microcontrôleur. |
| `bus.js` | Liaisons série : chronogrammes (`Wave`), échanges I2C, SPI et UART entre composants (`Bus`), journal de l'onglet Bus. |
| `eq.js` | Langage d'équations des blocs sur mesure : analyse et traduction en JavaScript. |
| `parts.js` | Bibliothèque de composants (`DEFS`). |
| `physique.js` | Moteur physique 2D : corps rigides (`Corps`, boîtes et disques), chocs avec frottement et rebond, articulations (`Pivot`, `Glissiere`) avec moteur et butées, frottement au sol. |
| `monde.js` | Monde 2D : terrain (`Monde`), pièces mobiles et articulations, moteurs et servos du schéma posés sur une articulation, composant `robot` et sa dynamique (`robotDyn`), capteurs montés, copie d'un robot (`dupliqueRobot`), terrains tout prêts. |
| `mondeui.js` | Page Monde : dessin du terrain, outils (pièces, articulations), panneaux de réglage, placement des robots et des capteurs, animation. |
| `composant.js` | Composants importés : lecture et vérification d'une description « paillasse-composant » (`composantLit`), traduction en entrée de `DEFS` (`composantDef`), installation (`composantInstalle`). Format décrit dans `FORMAT_COMPOSANT.md`, exemples dans `composants/`. |
| `sample.js` | Montages d'exemple (`EXEMPLES`). |
| `views.js` | Dessin de chaque composant sur la feuille (`VIEWS`). |
| `ui.js` | Interface : pages Schéma et Programme, feuille, câblage, inspecteur, éditeur, oscilloscope. |
| `tools/md2html.js` | Petit convertisseur Markdown → HTML : `FORMAT_COMPOSANT.md` devient la constante `FORMAT_HTML`, affichée par le bouton « Format des composants » de la fenêtre Importer. |
| `i18n.js` | Langue (`LANG`, `EN`) et fonction `LL(fr, en)` : chaque texte affiché est écrit dans les deux langues, côte à côte. Noms anglais des bornes (`PIN_EN`) pour l'affichage seulement. |
| `aide_en.js` | Versions anglaises des aides longues (`HELP_EN`, `HELP_VHDL_EN`, `AIDE_EN`) : à tenir à jour avec celles de `ui.js`. |
| `site.js` | Réglages du site : lien de dons, auteur, dépôt, contact (vides : déduits de l'adresse github.io, ou cachés). |
| `tools/polices.js` | Intègre les polices de `vendor/fonts/` en base64 : la page ne charge rien depuis un autre serveur. |
| `LICENSE` | Licence MIT de Paillasse ; son texte et ceux des composants tiers sont affichés dans « À propos ». |
| `vendor/` | Éditeur de code CodeMirror 5 (licence MIT) et polices IBM Plex (`vendor/fonts/`, licence SIL OFL 1.1), intégrés à la page pour fonctionner hors ligne. |

## Deux langues

- L'interface existe en français et en anglais. La langue vient de `?lang=en` ou `?lang=fr` dans l'adresse, sinon du dernier
  choix fait avec le bouton FR/EN (gardé dans le navigateur), sinon de la langue du navigateur (français s'il est français,
  anglais sinon). Changer de langue recharge la page ; le montage en cours est gardé.
- Tout texte affiché s'écrit `LL("texte français", "English text")`, les gabarits aussi : `LL(\`${n} fils\`, \`${n} wires\`)`.
  Les textes fixes de `body.html` portent leur traduction dans `data-en`, `data-en-title`, `data-en-aria` ou `data-en-html`.
- Ce qui reste en français dans les deux langues, pour que les fichiers s'ouvrent partout : les noms des composants (`type`),
  des réglages, des bornes (`R1.sortie`), les clés du format « paillasse-composant » et les fonctions des équations (`si`,
  `filtre`, `retard`...). L'aide anglaise le dit et `FORMAT_COMPOSANT.en.md` en donne la traduction.
- Les exemples ont leurs programmes dans les deux langues ; en anglais, `exempleEn` (dans `sample.js`) renomme leurs composants
  et leurs pièces. `tests/langue.js` vérifie que chaque exemple se comporte exactement de la même façon dans les deux langues
  et que les messages d'erreur anglais ne contiennent plus de français.
- Les tests se lancent en français (`PAILLASSE_LANG=en` pour l'anglais : les tests qui lisent les messages échouent alors,
  c'est attendu).

## Comment le moteur calcule

- Chaque borne électrique est un nœud. À chaque pas, les tensions de tous les nœuds sont la solution de `A · v = z`
  (analyse nodale : `A` contient les conductances, `z` les courants injectés). Le nœud de masse vaut 0 V.
- Les composants linéaires écrivent dans `A` (`stampG`) et dans `z` (`stampI`). `A` n'est reconstruite que si un composant
  lève `sim.dirty` (interrupteur, sortie de microcontrôleur...).
- Les composants non linéaires (`stampNL`) sont remplacés par leur tangente et le système est résolu en boucle (Newton),
  avec limitation du saut de tension des jonctions. Si Newton ne converge pas en 25 itérations et que ses écarts ne
  diminuent plus (80 au plus), le pas est repris avec une capacité fictive sur chaque nœud non linéaire (bascule d'un multivibrateur).
- Une bobine dont le courant tombe de plus de 90 % en un pas, alors qu'une de ses bornes sort des rails de plus de 2 V,
  déclenche l'alerte « diode de roue libre » (`coupe` dans `parts.js`).
- Condensateurs et bobines : formule BDF2, avec un pas d'Euler implicite juste après un événement.
- Les liaisons mécaniques sont orientées : la valeur d'une sortie (`it.out`) est recopiée dans les entrées reliées (`it.in`).
- Pas de calcul : `fast` (en µs) sur un composant demande un pas plus fin ; le montage prend le plus petit.

## Liaisons série (I2C, SPI, UART)

- Les échanges sont traités au niveau de l'octet, pas du bit. Quand le programme appelle `Wire`, `SPI`, `Serial` ou `shiftOut`,
  `Bus` cherche les composants concernés et leur remet les octets, à condition que les broches soient reliées dans le circuit
  (`bus.coupled` : une résolution du circuit avec un courant injecté, liaison retenue au-delà de 0,5), que le composant soit
  alimenté, et que l'adresse, le CS ou le débit conviennent.
- Chaque broche reçoit ensuite le chronogramme exact de l'échange (`Wave`), rejoué pas à pas sur le circuit. Si un bit dure moins
  d'un pas, le niveau est tiré au sort en respectant la proportion de temps à l'état haut.
- Le niveau d'une sortie numérique du microcontrôleur est annoncé tout de suite aux composants qui la surveillent (`bus.drive`) :
  le CS d'un esclave SPI ou le verrou d'un 74HC595 suivent ainsi l'ordre exact du programme.
- Donner une liaison série à un composant : `...ifaceParams({...})` dans ses `params`, `ifacePins(...)` dans `pins`,
  `mkLink(it, sim, { sensor, vcc, gnd, on, get, set })` dans `init`, puis `link.step(t, dt)` dans `step` et `link.stamp(m)` dans `stampG`.
  `capteur_temperature` (capteur) et `servo` (actionneur) servent de modèles.

## FPGA et VHDL

- `VHDL.build(texte, { top, init0 })` rend `{ sim, ports, signals, warns, entities, top }`. Les erreurs sont des `VErr` (message en français, numéro de ligne).
  `init0` fait partir de '0' les signaux sans valeur initiale, comme sur la carte ; sinon ils valent 'U', comme dans GHDL.
- Le composant `fpga` (`parts.js`) compile le programme (`fpgaAnalyse`, résultat gardé en mémoire), tire ses bornes des ports de l'entité,
  puis à chaque pas de calcul : lit les tensions d'entrée (`fpgaInputs`), déroule les fronts de l'oscillateur interne tombant dans le pas
  (`K.put` + `K.settle()`), et note pour chaque sortie la part du pas passée à l'état haut. Cette part est appliquée au circuit par `stampPushPull`.
- Une horloge que seuls des `rising_edge` regardent ne relance aucun process sur son front descendant (`VhSim.fall`).
- Ajouter une fonction VHDL : sa signature et sa traduction dans `VH_FUNCS` (`vh3.js`), son calcul dans `VR` (`vh2.js`), puis un fichier
  dans `tests/vhdl/` : il sera comparé à GHDL.

## Monde 2D

- Le terrain est dans `model.monde` (`{ largeur, hauteur, reflet_sol, vue, objets, liaisons }`, en mètres ; `vue` vaut `dessus` ou `face`).
  `mondeNorm` le relit en corrigeant ce qui manque. Chaque pièce a un `nom` unique ; `mv` vaut `fixe`, `libre` ou `trajet`.
  Une liaison : `{ t: "pivot" | "glissiere", a (stator : "sol" ou un nom), b (rotor), x, y, axe, moteur (nom d'un composant), pas_mm, butee, min, max }`.
- `physique.js` est un moteur à impulsions séquentielles (même principe que Box2D) : détection des contacts (disque-disque,
  boîte-disque, boîtes par axes séparateurs et découpage) après un tri le long de x (« sort and sweep ») ; contacts anticipés
  jusqu'à 2 mm d'écart (pas de traversée entre deux sous-pas), 8 itérations sur les vitesses avec reprise complète des impulsions
  du pas précédent, deux points de contact d'une même paire résolus ensemble (bloc 2×2), puis correction des positions.
  Les rangées de moteur, de frottement et de butée d'un pivot utilisent l'inertie effective vue par la contrainte.
  Limites mesurées par `tests/monde.js` : piles de 20 boîtes et rapport de masses 30 tenus, rapport 100 non tenu. Un moteur d'articulation est une contrainte « souple » : couple = c·(ω_visée − ω), résolu implicitement.
- `Monde.step` règle à chaque pas les moteurs des articulations depuis le schéma : pour un `moteur_dc`, c = (K·n)²/R + n²·f et
  ω_visée = U/(K·n) (corrigée du frottement visqueux), U étant la tension à ses bornes ; la vitesse obtenue revient au moteur
  (force contre-électromotrice). L'inertie du rotor ramenée à l'articulation s'ajoute à la masse de la pièce, pas à son poids (`mPoids`).
  Puis la physique avance par sous-pas de 0,5 ms au plus (0,1 ms dès qu'il y a une articulation), le temps restant étant reporté au pas suivant.
- Le robot est un corps de la physique dont `robotDyn` impose la vitesse (Euler implicite sur l'avance, la rotation et les deux roues,
  avec l'adhérence de chaque pneu) ; les chocs le corrigent ensuite.
- Un capteur « monté sur » (`porteur`) un robot, une pièce ou le sol lit la pose de son support et interroge le monde
  (`ray`, `sol`, `touche`), au plus tous les 0,25 ms de temps simulé.

## Ajouter un composant

1. Une entrée dans `DEFS` (`parts.js`). Le plus simple est de partir d'un composant voisin :
   `resistance` (linéaire), `diode` (non linéaire), `bouton` (à état), `moteur_dc` (électrique + mécanique),
   `comparateur` (logique interne).
2. Un dessin dans `VIEWS` (`views.js`) : `draw` trace le symbole, `update` rafraîchit ce qui bouge.
3. Une vérification dans `tests/circuits.js` contre la formule attendue.

## Ajouter une fonction au langage C

1. Sa signature dans `cc2.js` : `bi("nom", "type de retour", "types des paramètres")`.
2. Son implémentation dans l'objet `b` de `cc4.js` (et dans `makeHost` de `engine.js` si elle touche aux broches).

## Ajouter une fonction aux équations

Dans `eq.js` : une ligne dans `PURE` (sans mémoire) ou dans `STATE` et `F` (avec mémoire), et sa description dans `DOC`.

## Tests (Node.js)

```
node tests/circuits.js        # solveur et composants contre les formules du cours (diviseur, RC, diode, 555, moteur...)
node tests/bus.js             # I2C, SPI, UART, shiftOut : octets échangés, durées, pannes de câblage
node tests/sources.js         # signal lu dans un fichier, convertisseur numérique-analogique
node tests/monde.js           # monde 2D contre les formules : robot, chocs, capteurs, moteur et servo sur pivot, glissière, pendule, rebonds ; exemples
node tests/composants.js       # composants importés : exemples de composants/, éléments contre les formules, I2C, monde 2D, refus expliqués, fichiers abîmés au hasard
node tests/fpga.js            # FPGA dans un montage : horloge interne, niveaux, sorties moyennées, erreurs
node tests/vhdl_ghdl.js       # tests/vhdl/*.vhd : mêmes stimuli dans Paillasse et dans GHDL, sorties comparées cycle par cycle
node tests/vhdl_fuzz.js       # expressions VHDL tirées au hasard, comparées à GHDL
node tests/vhdl_erreurs.js    # erreurs classiques, fichiers de tests/vhdl_refus et programmes abîmés au hasard : même verdict que GHDL
node tests/vhdl_exemples.js   # les programmes VHDL des exemples, comparés à GHDL
node tests/hasard.js          # montages câblés au hasard, dont des montages série : ni plantage ni tension infinie
node tests/compare_gcc.js     # compare la sortie de tests/c/*.c avec gcc (mode 32 bits)
node tests/arduino.js         # entiers 16 bits, temps, Serial, messages d'erreur
node tests/langue.js          # français et anglais : mêmes résultats, messages anglais sans français
node tests/robustesse.js      # code cassé au hasard : le compilateur ne doit jamais planter
```

Les tests `vhdl_*` demandent GHDL (`apt install ghdl-mcode`). Un fichier de `tests/vhdl/` = un montage : l'entité principale est la dernière,
son entrée `clk` reçoit l'horloge, `rst` ou `reset` la remise à zéro, les autres entrées des valeurs au hasard.
