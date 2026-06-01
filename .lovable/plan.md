
# Refonte complète du Drive

Objectif : un drive **rapide, intuitif, logique**, au niveau de Google Drive / Dropbox / Notion / Arc, sans leurs lourdeurs. Ce document liste **tout** ce qui existe sur le marché + propositions UX, pour qu'on coche ensemble ce qu'on garde.

---

## 1. Refonte de l'interface (proposition)

### Header global (1ère ligne, fixe en haut)
```
[Logo] ─────── [🔍 Barre de recherche centrée, large] ─────── [⚙️] [🔔] [Avatar]
```
- **Barre de recherche centrale**, large (max-w-2xl), toujours visible.
- Raccourci `⌘K` / `Ctrl+K` pour focus.
- Suggestions live (debounce 150ms) : fichiers récents, dossiers, contenu OCR/texte.
- **Filtres inline** dans la search : type (`type:pdf`), date (`modified:>7d`), propriétaire (`owner:me`), taille (`size:>10mb`), tag, partagé avec.
- Chips visuelles pour filtres actifs sous la barre.
- Historique de recherche + recherches sauvegardées.

### 2ème ligne (toolbar contextuelle)
- Breadcrumb cliquable à gauche.
- Actions contextuelles à droite (Upload, Nouveau, Vue, Trier).
- Quand sélection multiple : remplacée par barre d'actions batch (Déplacer, Partager, Télécharger zip, Supprimer).

### Sidebar gauche (collapsible)
- Sections : Récents, Favoris ⭐, Mes fichiers, Partagés avec moi, Partagés par moi, Corbeille.
- Arbre de dossiers favoris épinglés.
- Indicateur de stockage utilisé en bas.

### Zone centrale
- 3 modes de vue : **Grille (cards avec preview)**, **Liste (densité confort/compacte)**, **Colonnes (Finder-style)**.
- Toggle persisté par dossier.
- **IMPORTANT — Mode Colonnes** : dans chaque colonne, fichiers et dossiers doivent s'afficher **en liste verticale compacte** (une ligne = icône + nom + chevron pour les dossiers), **jamais en cards carrées**. C'est le pattern Finder macOS : navigation rapide en cascade horizontale, chaque colonne = une liste fine. Largeur de colonne resizable + persistée. Preview du fichier sélectionné dans la dernière colonne à droite.


### Panneau droit (preview)
- N'apparaît **que sur clic simple** d'un fichier (déjà OK).
- Double-clic / Espace = Quick Look fullscreen (déjà OK).

---

## 2. Catalogue complet des fonctionnalités (à arbitrer)

Légende : **[Déjà fait]** · **[À faire]** · **[Discutable]**

### A. Fichiers & dossiers — basiques
- [Déjà fait] Upload simple, créer dossier, renommer, déplacer, supprimer, étoiler.
- [Déjà fait] Multi-sélection (clic, shift, cmd), lasso.
- [À faire] **Drag & drop upload** (depuis bureau vers la zone).
- [À faire] **Drag & drop déplacement** intra-drive (fichier → dossier dans sidebar/grid).
- [À faire] **Upload de dossier entier** (avec sous-arborescence).
- [À faire] **Upload multiple en parallèle** + barre de progression flottante (pause/reprendre/annuler par fichier).
- [À faire] **Copier / Dupliquer** un fichier ou dossier.
- [À faire] **Corbeille** (soft-delete, restore, vider, auto-purge 30j).
- [À faire] **Versionning** : historique des versions d'un fichier, restaurer.
- [À faire] **Tags / labels colorés** (transversaux aux dossiers).
- [À faire] **Couleurs / emoji custom sur dossiers**.
- [À faire] **Épingler des dossiers** à la sidebar.
- [Discutable] **Raccourcis / alias** (un fichier dans plusieurs dossiers sans copie).

### B. Recherche (priorité user)
- [À faire] **Barre centrale dans le header** (top priorité).
- [À faire] Suggestions live avec catégories (Fichiers, Dossiers, Personnes, Actions).
- [À faire] Filtres : type, date modif, date création, taille, propriétaire, partagé avec, tag, étoilé, dans dossier X.
- [À faire] **Recherche full-text** dans PDF / docs / txt (côté serveur — index pg_trgm ou Algolia/Meilisearch).
- [Discutable] **OCR sur images** (Tesseract côté serveur ou Google Vision).
- [À faire] **Recherches récentes** + **sauvegardées** (= dossiers smart).
- [À faire] **Recherche globale `⌘K`** (déjà command palette — à étendre).

### C. Preview / Quick Look
- [Déjà fait] Thumbnails images, PDF (canvas), XLSX mini-table, texte.
- [Déjà fait] Quick Look modal (Espace, double-clic, icône œil).
- [À faire] **Preview vidéo** avec player (timeline, vitesse).
- [À faire] **Preview audio** avec waveform.
- [À faire] **Preview PDF multi-pages** avec navigation (pas juste page 1).
- [À faire] **Preview DOCX / PPTX** (rendu HTML via mammoth.js / serveur).
- [À faire] **Preview code** avec syntax highlighting.
- [À faire] **Preview Markdown** rendu.
- [À faire] **Slideshow** pour dossiers d'images (← →).
- [Discutable] **Annotations sur PDF** (surligner, commenter).

### D. Partage & collaboration
- [Déjà fait] Partage par email (view/edit).
- [À faire] **Liens publics** (avec/sans mot de passe, expiration, restriction domaine).
- [À faire] **Permissions granulaires** : viewer / commenter / editor / owner.
- [À faire] **Demandes d'accès** (request access flow).
- [À faire] **Commentaires** sur fichiers (thread, mentions @).
- [À faire] **Notifications** (activité, partage reçu, commentaire).
- [À faire] **Activité / Audit log** par fichier ("qui a fait quoi").
- [Discutable] **Édition collaborative live** (Y.js — gros chantier).
- [Discutable] **Transfert de propriété**.

### E. Organisation avancée
- [À faire] **Dossiers intelligents / Smart folders** (sauvegarder une recherche comme dossier dynamique).
- [À faire] **Tri** : nom, date modif, date créa, taille, type, propriétaire, **manuel** (drag & drop ordering).
- [À faire] **Filtres rapides** au-dessus de la grille (Images / Docs / Vidéos / Récents).
- [Discutable] **Vue Timeline** (groupé par date).
- [Discutable] **Workspaces / Espaces multiples** (perso / équipe).

### F. Productivité
- [À faire] **Raccourcis clavier complets** (`n` nouveau dossier, `u` upload, `/` recherche, `?` cheatsheet, `r` rename, `del` corbeille, `space` quicklook, `enter` ouvrir, `cmd+d` dupliquer, `cmd+c/v` copier-coller).
- [À faire] **Click-droit context menu** complet partout.
- [À faire] **Mode focus / sans distraction**.
- [À faire] **Glisser depuis le drive vers le bureau** (download via drag).

### G. Sécurité
- [À faire] **2FA** sur compte.
- [À faire] **Chiffrement at-rest** (déjà via Supabase storage, à exposer).
- [Discutable] **Coffre-fort / dossier privé** (PIN supplémentaire).
- [Discutable] **Signed URLs courtes** + watermark sur preview.

### H. Stockage & quotas
- [À faire] **Indicateur de stockage** utilisé/disponible.
- [À faire] **Détection de doublons** (hash sha256).
- [À faire] **Gros fichiers** : suggestion de cleanup.
- [Discutable] **Compression auto images > Xmb**.

### I. Mobile & responsive
- [À faire] **Layout mobile** complet (sidebar drawer, grille adaptée).
- [À faire] **PWA installable**.
- [Discutable] **Upload depuis caméra**.

### J. Import / Export / Intégrations
- [À faire] **Export ZIP** d'un dossier ou multi-sélection.
- [Discutable] **Import depuis Google Drive / Dropbox / OneDrive**.
- [Discutable] **Webhooks** (Zapier-like).
- [Discutable] **API publique**.

### K. IA (différenciateur)
- [Discutable] **Recherche sémantique** ("le contrat de Mathieu de l'an dernier").
- [Discutable] **Auto-tagging** des fichiers à l'upload.
- [Discutable] **Résumé automatique** d'un PDF / doc.
- [Discutable] **Renommage suggéré** basé sur le contenu.
- [Discutable] **Classement automatique** dans dossiers.
- [Discutable] **Chat avec un document / un dossier**.

### L. Petites attentions UX
- [À faire] **Toasts d'undo** après suppression/déplacement (5s).
- [À faire] **Skeleton loaders** partout.
- [À faire] **Empty states** illustrés et actionnables.
- [À faire] **Animations** fluides (Motion) sur sélection, hover, drag.
- [À faire] **Dark mode** complet (vérifier cohérence).
- [À faire] **Préférences utilisateur** persistées (vue par défaut, tri, densité).

---

## 3. Détails techniques (section dev)

- **Recherche full-text** : `tsvector` Postgres + index GIN sur `files.name` et un futur `files.content_text` rempli côté serverFn à l'upload (PDF → pdfjs `getTextContent`, DOCX → mammoth, txt direct).
- **Versionning** : table `file_versions(id, file_id, storage_path, size, created_at, created_by)`, garder N=20 versions.
- **Corbeille** : colonne `deleted_at` sur `files` + `folders`, RLS exclut par défaut, cron purge > 30j.
- **Tags** : tables `tags` + `file_tags` (many-to-many).
- **Liens publics** : table `public_links(id, target_type, target_id, token, password_hash, expires_at, allow_download)`, route `/api/public/share/:token`.
- **Commentaires** : table `comments(id, file_id, author_id, body, parent_id, created_at)`.
- **Activité** : table `activity_log(id, actor_id, target_type, target_id, action, metadata, created_at)`.
- **Drag & drop** : `react-dnd` ou natif HTML5 drag.
- **Upload manager** : store Zustand global + queue, retries exponentiels, abort controllers.
- **Preview vidéo/audio** : `<video>`/`<audio>` natif + `wavesurfer.js` pour waveform.
- **DOCX preview** : `mammoth.js` (DOCX → HTML).
- **Search index** : démarrer Postgres `pg_trgm` + `tsvector`, migrer vers Meilisearch si besoin.

---

## 4. Ma recommandation de phases (à valider)

**Phase 1 — Quick wins UX (1-2 itérations)**
Barre de recherche header centrée · Drag & drop upload · Upload de dossier · Corbeille · Toasts undo · Raccourcis clavier · Indicateur stockage.

**Phase 2 — Recherche puissante**
Suggestions live · Filtres avancés (type/date/taille/owner) · Full-text PDF/docs · Recherches sauvegardées.

**Phase 3 — Collaboration**
Liens publics · Permissions granulaires · Commentaires · Activité.

**Phase 4 — Organisation & preview pro**
Tags · Smart folders · Versionning · Preview vidéo/audio/DOCX/PPTX · Slideshow images.

**Phase 5 — IA & différenciation**
Recherche sémantique · Auto-tagging · Résumés · Chat avec doc.

---

## 5. À toi de décider

Dis-moi :
1. **Quelles fonctionnalités on garde / on jette** (passe en revue les sections A→L).
2. **L'ordre des phases** te convient ou tu veux réorganiser ?
3. **Sur la Phase 1**, on commence par quoi exactement (barre de recherche + drag&drop + corbeille = bon premier sprint) ?
