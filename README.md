# ✅ To-do

[![CI](https://github.com/Surhay276/todo-app/actions/workflows/ci.yml/badge.svg)](https://github.com/Surhay276/todo-app/actions/workflows/ci.yml)
![Vanilla JS](https://img.shields.io/badge/JavaScript-ES2022-f7df1e?logo=javascript&logoColor=black)
![Keine Abhängigkeiten](https://img.shields.io/badge/dependencies-0-brightgreen)

Eine To-do-App im Stil von TickTick – ohne Framework, nur HTML, CSS und modernes JavaScript.

**▶ Live-Demo: [surhay276.github.io/todo-app](https://surhay276.github.io/todo-app/)**

## Funktionen

- **Schnelleingabe in natürlicher Sprache**: `Hausarbeit abgeben morgen !hoch #Uni` → Titel, Datum, Priorität und Liste werden erkannt und live als Chips angezeigt. Versteht `heute`, `morgen`, `übermorgen`, Wochentage, `nächste Woche`, `in 3 Tagen`, `in 2 Wochen`, `24.12.`, `15.01.2027`, `!hoch|!mittel|!niedrig` (oder `!3/!2/!1`) und `#Liste`.
- **Intelligente Ansichten**: Heute (inkl. Überfälligem), Nächste 7 Tage, Alle Aufgaben, Erledigt – plus eigene **Listen**
- **Gruppierung nach Fälligkeit**: Überfällig · Heute · Morgen · Diese Woche · Später · Ohne Datum; Überfälliges mit einem Klick **auf heute verschieben**
- **Prioritäten** als farbige Checkbox (wie bei TickTick), Sortierung nach Datum und Priorität
- **Detailansicht** mit Schnellwahl für Datum, Priorität, Liste und Notizen – speichert automatisch
- **Tagesfortschritt**, Suche, **Rückgängig** nach Abhaken/Löschen, Tastenkürzel `n` für neue Aufgabe
- **Mobil optimiert**: Listen als Schublade, schwebender Button, Schnelleingabe und Details als Bottom-Sheet, 44-px-Touch-Ziele
- Speicherung im `localStorage`, **JSON-Export/-Import**, heller Standard-Modus und Dark Mode

## Technische Umsetzung

| Bereich | Umsetzung |
|---|---|
| Architektur | Logik (`js/todo.js`) strikt getrennt von der Darstellung (`js/app.js`) |
| Zustand | Immutable Updates – jede Aktion liefert einen neuen Zustand, danach `save()` + `render()`; Rückgängig = vorheriger Zustand |
| Parser | Regex-basierte Erkennung deutscher Datumsangaben inkl. Jahreswechsel, ungültiger Daten (31.02.) und „nächster Wochentag“ |
| Sicherheit | Ausgabe ausschließlich über `textContent` (kein XSS); Importe werden validiert und bereinigt |
| Tests | 13 Unit-Tests mit `node:test` – Ansichten, Gruppierung, Parser, Import |
| Design | Untitled-UI-Tokens, Aufbau nach TickTick (Recherche über Mobbin), SVG-Icons, Schriften lokal gehostet (DSGVO) |
| Barrierefreiheit | Semantische Buttons, `aria-pressed`/`aria-current`, sichtbarer Fokus, `prefers-reduced-motion` |
| CI/CD | GitHub Actions testet jeden Push, Deployment über GitHub Pages |

```
todo-app/
├── index.html         # Layout, Icons, Detail-Dialog
├── css/style.css      # Tokens, Layout, mobile Sheets
├── js/todo.js         # Logik: Aufgaben, Ansichten, Gruppierung, Parser
├── js/app.js          # Rendering, Events, Persistenz
└── tests/todo.test.js # Unit-Tests
```

## Lokal starten

```bash
git clone https://github.com/Surhay276/todo-app.git
cd todo-app
npm start   # statischer Server
npm test    # Unit-Tests (Node ≥ 20)
```

---

Entwickelt von **Surhay Yilmaz** · Lizenz: MIT
