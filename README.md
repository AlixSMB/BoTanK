# BoTanK
Projet tank intelligent

## Interface de contrôle
- Chrome app

- Reception flux vidéo en provenance de tank (UDP)
- Emission flux de données commande mouvement vers tank (UDP)
- Communication requête <-> réponse avec tank (TCP) 

## Tank
- Scripts python

- Emission flux video vers interface de contrôle (UDP)
- Emission flux de données mouvement vers interface de contrôle (UDP)
- Communication requête <-> réponse avec interface de contrôle (TCP) 

## Contrôle manuel
- Utilisation de Gamepad connecté à l'ordi (manette Xbox360) 

## Déplacement autonome
- Utilisation de marqueurs Aruco
  - Grille de positionnement prédéfinie ou construite à partir du tank

- Déplacement vers cible
- Suivi de trajectoire

- Evitement d'obstacles
  - Virtuels, définis via l'interface
  - Codés avec marqueurs 
