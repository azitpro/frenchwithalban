import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Accueil from './_accueil/Accueil';

/**
 * Nombre de ressources en ligne, lu dans public/ressources.html au moment de la compilation.
 * Une ressource publiée est un lien <a class="resource-card"> ; une ressource à venir est un
 * <div class="resource-card resource-soon">, qui n'est donc pas comptée.
 */
async function compterRessources(): Promise<number | null> {
  try {
    const html = await readFile(path.join(process.cwd(), 'public', 'ressources.html'), 'utf8');
    const total = (html.match(/<a\b[^>]*class="resource-card"/g) ?? []).length;
    return total > 0 ? total : null;
  } catch {
    return null; // le chiffre est simplement masqué
  }
}

export default async function Page() {
  return <Accueil nombreRessources={await compterRessources()} />;
}
