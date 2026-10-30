# Jeux d'essai « cercle »

Fragments HTML relevés le 2026-10-30 dans **Claude Desktop pour Windows** (paquet MSIX, onglet Code, thème sombre,
langue `fr-FR`) par une extension jetable chargée avec `REACT_PROFILE=1`. Ils servent à tester, sans l'appli,
l'extension qui range sonar dans le cercle d'usage et sous « Personnalisation ».

Nettoyés avant d'être suivis par git : identifiants de session remis à zéro, chemins remplacés, nom du dépôt réel
remplacé par `mon-depot`, identifiants React (`_r_…`) retirés, sessions épinglées et récentes coupées.

| Fichier | Contenu |
|---|---|
| `cercle-bouton.fr.html` | Le bouton du cercle, fermé : `button[aria-haspopup="dialog"]`, `aria-label` commençant par « Utilisation » (« Usage » en anglais) |
| `cercle-popover.fr.html` | Le popover ouvert (`role="dialog"`) : limite de 5 heures, hebdomadaire, crédits de session cloud. **Pas de bloc contexte** dans l'onglet Code |
| `barre-laterale.fr.html` | Le `<aside aria-label="Barre latérale">` jusqu'à « Personnalisation » ; la liste « Épinglés » (`data-testid="sidebar-pinned"`) est coupée |
| `bandeau-sonar-hote.fr.html` | L'hôte du bandeau d'un mod : `div[data-plugin-drawn="AbovePrompt"]`, avec un **shadowRoot ouvert** |
| `bandeau-sonar-shadow.fr.html` | Le contenu de ce shadowRoot (sonar 0.3.0, emplacement « bandeau ») : `5 h`, `semaine`, `cache chaud (99 % relu, jusqu'à 21:03)`, `branche master (mon-depot)`, `coût 4,00 $` |
| `bandeau-sonar-ancetres.txt.html` | La chaîne des ancêtres de l'hôte (balises + attributs `data-*`, `role`, `aria-label`), jusqu'à `div[data-engine-site="AbovePrompt"]` |

Faits mesurés en même temps :
- l'appli utilise **Base UI** (`data-base-ui-*`, `data-open`), pas Radix ;
- le texte d'un mod **n'est pas** dans le DOM de la page : seulement dans le shadowRoot de son hôte ;
- le bandeau disparaît pendant que Claude travaille et revient à la fin du tour ;
- le dossier chargé est `%LOCALAPPDATA%\Claude-Data\claude_<id>\extensions\fmkadmapgofadopljbjfkapdkoienihi`
  (celui de `%APPDATA%\Claude\` est ignoré).
