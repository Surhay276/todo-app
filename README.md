# 🗂️ Kanban-Board

[![CI](https://github.com/Surhay276/kanban-board/actions/workflows/ci.yml/badge.svg)](https://github.com/Surhay276/kanban-board/actions/workflows/ci.yml)
![Vanilla JS](https://img.shields.io/badge/JavaScript-ES2022-f7df1e?logo=javascript&logoColor=black)
![Keine Abhängigkeiten](https://img.shields.io/badge/dependencies-0-brightgreen)

Ein schlankes Kanban-Board zur Aufgabenverwaltung – komplett ohne Framework, nur mit HTML, CSS und modernem JavaScript.

**▶ Live-Demo: [surhay276.github.io/kanban-board](https://surhay276.github.io/kanban-board/)**

## Funktionen

- **WIP-Limit** für „In Arbeit“ (max. 3 Aufgaben) mit Segmentanzeige – Warnung beim Erreichen/Überschreiten
- **Mobil optimiert**: Spalten als Tabs, schwebender „Neue Aufgabe“-Button, Dialog als Bottom-Sheet, 44-px-Touch-Ziele
- **Rückgängig** nach Löschen direkt aus der Benachrichtigung
- **Drag & Drop** zwischen und innerhalb der Spalten (native HTML5-API, Einfügeposition anhand der Mausposition)
- **Tastaturbedienung**: Karte fokussieren → `←`/`→` verschiebt, `Enter` bearbeitet, `Entf` löscht
- Aufgaben mit **Priorität**, **Beschreibung** und **Fälligkeitsdatum** – überfällige Aufgaben werden markiert
- **Suche & Filter** nach Text und Priorität
- **Fortschrittsanzeige** und Kennzahlen (gesamt / erledigt / überfällig)
- **Persistenz** im `localStorage`, **JSON-Export und -Import** zum Sichern
- **Dark Mode** (folgt dem System, manuell umschaltbar), responsives Layout

## Technische Umsetzung

| Bereich | Umsetzung |
|---|---|
| Architektur | Trennung von **Logik** (`js/board.js`) und **Darstellung** (`js/app.js`) |
| Zustand | Immutable Updates – jede Aktion liefert einen neuen Zustand, danach `save()` + `render()` |
| Sicherheit | Ausgabe nur über `textContent` (kein `innerHTML` mit Nutzerdaten → kein XSS); Importe werden validiert und bereinigt |
| Tests | 13 Unit-Tests mit dem eingebauten Node-Test-Runner (`node:test`), keine Abhängigkeiten |
| CI/CD | GitHub Actions führt die Tests bei jedem Push aus; Deployment über GitHub Pages |
| Design | Tokens angelehnt an **Untitled UI** (Graustufen, Shadows, Fokusring), SVG-Icons statt Emojis, Schriften **lokal gehostet** (DSGVO – kein Google-Fonts-Abruf) |
| Responsive | Mobile-first-Breakpoints (≤ 767 px / ≤ 1100 px), `safe-area-insets`, `pointer: coarse`-Anpassungen |
| Barrierefreiheit | Semantisches HTML, `<dialog>`, ARIA-Labels, sichtbarer Fokus, `prefers-reduced-motion` |

```
kanban-board/
├── index.html          # Markup & Dialog
├── css/style.css       # Theme-Variablen, Layout, Dark Mode
├── js/board.js         # reine Geschäftslogik (testbar ohne DOM)
├── js/app.js           # Rendering, Events, Drag & Drop, Persistenz
└── tests/board.test.js # Unit-Tests
```

## Lokal starten

```bash
git clone https://github.com/Surhay276/kanban-board.git
cd kanban-board
npm start      # startet einen statischen Server (oder index.html über einen beliebigen Webserver öffnen)
npm test       # Unit-Tests ausführen (Node ≥ 20)
```

## Mögliche Erweiterungen

- Mehrere Boards und frei definierbare Spalten
- Synchronisation über ein Backend (z. B. REST-API mit Spring Boot oder Supabase)
- Undo/Redo über eine Historie der Zustände

---

Entwickelt von **Surhay Yilmaz** · Lizenz: MIT
