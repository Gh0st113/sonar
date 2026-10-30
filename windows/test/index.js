// Point d'entrée de `node --test windows/test/` : Node 22 ne parcourt pas un dossier donné en argument,
// il le charge comme un module (ce fichier). On importe ici chaque fichier *.test.mjs du dossier.
const { readdirSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');

for (const name of readdirSync(__dirname).filter((n) => n.endsWith('.test.mjs')).sort()) {
  import(pathToFileURL(join(__dirname, name)).href);
}
