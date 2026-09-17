'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Chargement et enregistrement automatique d'un document d'administration à révision
 * (to-do list, fiches élèves). Chaque modification est appliquée tout de suite à l'écran,
 * puis la dernière version est envoyée avec la révision chargée, une requête à la fois.
 * En cas de conflit (document modifié ailleurs), la version du serveur est affichée.
 *
 * L'API répond { [champ]: document, revision } en lecture et en écriture, 409 en cas de conflit.
 */
export function useDocumentEnregistre<T>(url: string, champ: string, vide: T, messageConflit: string) {
  const [donnees, setDonnees] = useState<T>(vide);
  const [chargement, setChargement] = useState(true);
  const [fatal, setFatal] = useState('');
  const [erreur, setErreur] = useState('');
  const [avert, setAvert] = useState('');
  const [enCours, setEnCours] = useState(false);

  const donneesRef = useRef<T>(vide);
  const revisionRef = useRef(0);
  const modifieRef = useRef(false);
  const fileRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.[champ] || !Number.isInteger(data.revision)) throw new Error(data?.error || 'Chargement impossible.');
        donneesRef.current = data[champ];
        revisionRef.current = data.revision;
        setDonnees(data[champ]);
      })
      .catch((e) => setFatal(e instanceof Error ? e.message : 'Chargement impossible.'))
      .finally(() => setChargement(false));
    const avantDepart = (e: BeforeUnloadEvent) => { if (modifieRef.current) e.preventDefault(); };
    window.addEventListener('beforeunload', avantDepart);
    return () => window.removeEventListener('beforeunload', avantDepart);
  }, [url, champ]);

  async function enregistrer() {
    if (!modifieRef.current) return;
    modifieRef.current = false;
    const envoye = donneesRef.current;
    setEnCours(true);
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [champ]: envoye, revision: revisionRef.current }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.[champ]) {
        revisionRef.current = data.revision;
        setErreur('');
        if (!modifieRef.current) { donneesRef.current = data[champ]; setDonnees(data[champ]); }
      } else if (res.status === 409 && data?.[champ]) {
        revisionRef.current = data.revision;
        modifieRef.current = false;
        donneesRef.current = data[champ];
        setDonnees(data[champ]);
        setAvert(messageConflit);
      } else {
        modifieRef.current = true;
        setErreur(res.status === 401 ? 'Session expirée : rechargez la page.' : data?.error || 'Enregistrement impossible.');
      }
    } catch {
      modifieRef.current = true;
      setErreur('Enregistrement impossible : vérifiez la connexion.');
    }
    setEnCours(false);
  }

  function appliquer(changer: (d: T) => T) {
    const suivant = changer(donneesRef.current);
    if (suivant === donneesRef.current) return;
    donneesRef.current = suivant;
    setDonnees(suivant);
    setAvert('');
    modifieRef.current = true;
    fileRef.current = fileRef.current.then(enregistrer);
  }

  const reessayer = () => { fileRef.current = fileRef.current.then(enregistrer); };
  const etat = enCours ? 'Enregistrement…' : erreur ? 'Non enregistré' : 'Enregistré';

  return { donnees, chargement, fatal, erreur, avert, etat, appliquer, reessayer };
}
