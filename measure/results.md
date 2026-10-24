# Pomiar dokładności — 2026-10-24

Sześć tras testowych (geometria z OSRM, łącznie 8 745 km), korytarz 3 km, dane z 13 krajów
(PL, DE, NL, SK, HU, RO, RS, BG, FR, AT, CH, IT, ES). Liczone są tylko obiekty z OSM —
obiekty dodane z list oficjalnych nie wchodzą do wyniku, bo porównanie byłoby z samym sobą.
Skrypt: `measure/measure.mjs`, surowe liczby: `measure/results.json`.

## Porównanie z listami oficjalnymi

| Lista oficjalna (w korytarzu tras) | Jest w OSM | Odległość OSM ↔ lista | Po dołączeniu listy |
|---|---|---|---|
| Autobahn GmbH — MOP-y z miejscami dla ciężarówek (DE), 513 | **485 (94,5 %)** | mediana 0 m (punkt w obrysie), 95 % ≤ 2,5 m | **100 %** (brakujące dodane z listy) |
| Lista UE SSTPA — parkingi certyfikowane, 6 | 2 (33 %) | — | **100 %** (dodane z listy) |
| Wszystkie stacje paliw FR (prix-carburants.gouv.fr), 502 | **418 (83,3 %)** | mediana 34 m | 83,3 % |
| Wszystkie stacje paliw ES (geoportal Ministerstwa), 253 | **237 (93,7 %)** | mediana 4 m | 93,7 % |

W drugą stronę (czy stacja z OSM jest na państwowej liście aktywnych stacji):
FR 73,3 %, ES 91,2 %. Część różnicy we Francji to stacje tylko na karty (np. AS24), których
lista dla klientów indywidualnych nie obejmuje, oraz współrzędne listy francuskiej podawane
z dokładnością adresu (mediana 34 m), przez co część par przekracza próg 150 m.

## Potwierdzenie „dla ciężarówek” na stacjach

Stacje, które OSM wprost oznacza jako dostępne dla TIR (tag `hgv`, dystrybutor dla ciężarówek
albo położenie na MOP-ie autostradowym), wśród stacji z list państwowych: **FR 17,5 %, ES 7,6 %**.
Według krajów (stacje w korytarzu): PL 34 %, DE 31 %, HU 23 %, SK 22 %, NL 21 %, FR 18 %,
RS 17 %, AT 12 %, BG 8 %, CH 6 %, ES 6 %, IT 3 %, RO 3 %.
→ W trybie TIR przy zasadzie „tylko potwierdzone” większość prawdziwych stacji jest ukryta.

## Wyposażenie parkingów i MOP-ów (w korytarzu)

| Kraj | Parkingi + MOP | Prysznic znany | WC znane | Liczba miejsc TIR | Z nazwą | Z obrysem* |
|---|---|---|---|---|---|---|
| DE | 813 | 18 % | 73 % | 65 % | 81 % | 56 % |
| FR | 325 | 10 % | 68 % | 78 % | 58 % | 51 % |
| PL | 316 | 12 % | 55 % | 1 % | 58 % | 54 % |
| HU | 107 | 2 % | 78 % | 0 % | 87 % | 65 % |
| RS | 82 | 1 % | 60 % | 0 % | 32 % | 45 % |
| RO | 75 | 1 % | 39 % | 0 % | 19 % | 54 % |
| NL | 70 | 4 % | 34 % | 0 % | 43 % | 17 % |
| ES | 42 | 10 % | 62 % | 2 % | 62 % | 48 % |
| BG | 34 | 0 % | 41 % | 0 % | 15 % | 49 % |
| SK | 28 | 7 % | 50 % | 0 % | 100 % | 51 % |
| CH | 26 | 12 % | 77 % | 8 % | 69 % | 34 % |
| IT | 12 | 17 % | 58 % | 0 % | 58 % | 25 % |
| AT | 7 | 0 % | 86 % | 0 % | 86 % | 63 % |

\* obrys liczony dla wszystkich miejsc w korytarzu danego kraju, nie tylko parkingów.
„Znany” = źródło mówi tak albo nie; w pozostałych przypadkach karta pokazuje „brak danych”.

## Liczba miejsc na trasach (korytarz 3 km)

| Trasa | km | Stacje | MOP | Parkingi TIR | Hotele | Razem TIR | Razem VAN |
|---|---|---|---|---|---|---|---|
| Poznań → Lyon | 1468 | 800 | 311 | 98 | 582 | 684 | 1791 |
| Warszawa → Mediolan | 1575 | 1069 | 286 | 54 | 640 | 602 | 2049 |
| Kraków → Sofia | 1281 | 537 | 195 | 13 | 399 | 302 | 1144 |
| Gdańsk → Rotterdam | 1233 | 811 | 234 | 55 | 379 | 551 | 1479 |
| Wrocław → Barcelona | 2001 | 1266 | 417 | 134 | 925 | 917 | 2742 |
| Katowice → Bukareszt | 1187 | 490 | 122 | 18 | 296 | 190 | 926 |
