# Paillasse

Simulateur pédagogique qui fonctionne entièrement dans le navigateur, gratuit et sans installation :

- **circuits électroniques** : résistances, condensateurs, diodes, transistors, ampli op, NE555, régulateurs, relais, moteurs… avec oscilloscope et alertes quand un composant serait en danger ;
- **microcontrôleur programmé en C** (style Arduino) : `digitalWrite`, `analogRead`, PWM, `Serial`, servos, I2C, SPI, UART ;
- **FPGA programmé en VHDL**, vérifié contre GHDL ;
- **bus série** : chaque échange I2C, SPI ou UART affiché octet par octet ;
- **monde 2D** avec physique : robots, capteurs, pièces mobiles, articulations entraînées par les moteurs du schéma ;
- **composants importés** : de nouveaux composants décrits dans un fichier texte (voir `FORMAT_COMPOSANT.md`).

**Utiliser Paillasse : https://catapol.github.io/paillasse/**

La page est un seul fichier, `index.html` : on peut aussi le télécharger et l'ouvrir hors ligne. Les montages restent
dans le navigateur ; rien n'est envoyé à un serveur, aucun cookie, aucune statistique de visite.

## Signaler un problème

Un bug, un résultat qui vous semble faux, une idée : ouvrez un ticket dans l'onglet **Issues** de ce dépôt,
si possible avec le montage exporté (menu Montage ▾, Exporter).

Les limites connues du simulateur sont décrites dans son mode d'emploi (bouton **?**).

## Pour les développeurs

- `index.html` est assemblé à partir des sources par `./build.sh` (Node.js requis).
- Les réglages du site (lien de dons, auteur, dépôt, contact) sont dans `site.js`.
- Organisation du code, fonctionnement du moteur et tests : voir [`LISEZMOI.md`](LISEZMOI.md).
- Les tests se lancent avec Node : `node tests/circuits.js`, `node tests/monde.js`… (les tests VHDL demandent GHDL).

## Licence

Paillasse est distribué sous [licence MIT](LICENSE).

Il intègre :
- l'éditeur de code [CodeMirror 5](https://codemirror.net/5/), © Marijn Haverbeke et contributeurs, licence MIT (`vendor/LICENCE-codemirror.txt`) ;
- les polices [IBM Plex](https://github.com/IBM/plex) Mono et Sans Condensed, © IBM Corp., licence SIL Open Font 1.1 (`vendor/fonts/`).

---

## English

Paillasse is a free educational simulator that runs entirely in the browser: electronic circuits, a microcontroller
programmed in C (Arduino style), an FPGA programmed in VHDL (checked against GHDL), I2C, SPI and UART buses, and robots in
a 2D world with physics.

**Use Paillasse: https://catapol.github.io/paillasse/?lang=en**

The interface is in French or English: it follows the browser's language, and the **FR / EN** button switches it.
Component, terminal and setting names, the keys of the component format and the equation functions keep their French names
in both languages, so that saved circuits open in either; the English help explains them.

The page is a single file, `index.html`, which also works offline. Circuits stay in your browser: nothing is sent to a
server, no cookies, no analytics. Bugs and ideas: open an issue on this repository. Licence: MIT.

