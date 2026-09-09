# Manuel imprimable — Le français avec Alban

`Le-francais-avec-Alban.pdf` (A4, 55 pages) reprend l'intégralité des ressources
publiées sur frenchwithalban.com, dans l'ordre des niveaux du site.

## Structure

- `src/` — le livre découpé en fragments HTML (couverture, chapitres, corrigés)
- `manuel.html` — le livre complet, obtenu en concaténant `src/` dans l'ordre
- `build.js` — rend `manuel.html` en PDF via Chrome headless
- `Le-francais-avec-Alban.pdf` — le résultat

Les illustrations sont chargées depuis `../public/img/` : le dossier `textbook/`
doit rester à la racine du projet.

## Régénérer

Après avoir modifié un fragment dans `src/` :

```bash
cd textbook
cat src/*.html > manuel.html
node build.js
```

`build.js` attend le chargement des polices Google (Fraunces, Inter) et des
images avant d'imprimer — une connexion réseau est donc nécessaire. Le PDF est
récupéré en flux (`transferMode: ReturnAsStream`) : en base64 direct, la réponse
est trop volumineuse et le protocole DevTools se bloque.

Le sommaire cliquable du PDF est produit par `generateDocumentOutline`, à partir
des titres `h2`/`h3`/`h4`.
