# Où va l'argent public ?

Infographie interactive (Sankey) des finances publiques françaises — exercice 2025.
D'où vient l'argent public et comment il est dépensé, diagramme comptablement
équilibré (recettes + dette = dépenses), sourcé dans l'open data officielle
(État : LOLF · Sécu : LFSS · COR/PLFSS pour les retraites).

**Site en ligne** : https://michoc.github.io/ou-va-largent/

Site statique (HTML + [ECharts](https://echarts.apache.org/)). Les données
(`data/unified_finances.json`) sont générées par un pipeline open data maintenu
dans un dépôt séparé.

Design inspiré du poster « Où va l'argent public ? » (*Le 1 hebdo* n°569,
C. Alet & C. Martha, avec F. Ecalle/Fipeco). Données : data.economie.gouv.fr,
data.gouv.fr, PLFSS (open data Assemblée nationale) — Licence Ouverte 2.0.
Code : MIT.
