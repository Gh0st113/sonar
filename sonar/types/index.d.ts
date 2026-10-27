export type SonarQuota = { kind: string; percentUsed: number; resetsAt?: string }

export type SonarMesure = {
  /** remplissage du contexte, 0 à 100 ; absent avant la 1re réponse */
  contexte?: number
  quotas: SonarQuota[]
  /** coût estimé de la session en USD (prix catalogue) */
  cout?: number
}

/** dernière réponse du fil principal : heure, jetons lus / écrits / neufs du cache, modèle */
export type SonarReponse = { a: number; lu: number; ecrit: number; neuf: number; modele?: string }

export type SonarDepot = { nom: string; branche?: string; detachee?: boolean; modifies: number }

export type SonarEmplacement = 'pied' | 'indice' | 'ligne' | 'bandeau'

declare module 'claude-code' {
  interface PluginState {
    sonar: {
      mesure: SonarMesure | null
      cache: SonarReponse | null
      depot: SonarDepot | null
      /** modèle en cours d'après le dernier changement de modèle */
      modele: string | null
      /** durée de vie du cache, déduite ou forcée */
      ttl: '5m' | '1h' | null
      emplacement: SonarEmplacement | null
      masque: boolean
      /** compteur de redessin (minuterie) */
      tic: number
    }
  }
}
