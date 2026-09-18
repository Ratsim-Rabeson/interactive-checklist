# Interactive Checklist ✈️

A beautiful, touch-friendly **interactive checklist** for iPad, inspired by the integrated
electronic checklists in Garmin avionics (G1000 / GTN / G3000). Tap items to check them off,
watch progress fill, and get a **CHECKLIST COMPLETE** confirmation — plus a built-in editor
to **build your own checklists** or **import/export** them as JSON.

> ⚠️ **Not for real-world flight.** The bundled Cessna 172S content is a generic, educational
> sample. Always use the approved checklist / POH for your actual aircraft.

---

## Features

- **Garmin-style challenge → response items** with dot leaders (`FUEL SELECTOR ···· BOTH`).
- **Tap to check** with satisfying animation, live progress ring, and per-checklist progress badges.
- **Light & dark themes** — tap the ☀️/🌙 in the top bar. Follows your device setting by default and remembers your choice.
- **Color-coded groups**: Normal (cyan), Abnormal (amber), Emergency (red).
- **Advisory rows**: `note`, `caution`, and `warning` lines that aren't checkable.
- **CHECKLIST COMPLETE** banner + one-tap **Next** to flow through a procedure.
- **Scratchpad** (📄 in the top bar) — a slide-in pad for jotting clearances and info while flying:
  - Quick avionics fields: **ATIS · Squawk · Altimeter · Active RWY**.
  - A free-text **Notes** area (great for CRAFT clearances, frequencies, headings).
  - A finger/stylus **Sketch** canvas with four pen colors, an eraser, and clear.
  - Everything auto-saves locally; a dot on the icon shows when it has content.
- **Builder** — create/edit/reorder groups, checklists, and items entirely in the app.
- **Import / Export** checklists as `.json`, and keep multiple **aircraft sets**.
- **Works offline**, installs to the iPad home screen as a full-screen app.
- **No build step, no server required, no accounts.** Everything is saved locally on the device.

---

## Run it on an iPad

**Option A — Serve it (recommended, enables home-screen install & offline):**

On a Mac on the same Wi-Fi, from this folder:

```bash
cd interactive_checklist_app
python3 -m http.server 8000
```

Then on the iPad open Safari → `http://<your-mac-ip>:8000`
(find the IP with `ipconfig getifaddr en0`). Tap **Share → Add to Home Screen** for a
full-screen, app-like experience.

**Option B — Open the file directly:**

Copy the folder to the iPad (AirDrop / Files / iCloud Drive) and open `index.html` in Safari.
Everything works from `file://` except offline caching (which needs Option A).

**On a desktop** (to try it quickly): just double-click `index.html`, or run the server above
and visit `http://localhost:8000`. Arrow keys ← / → move between checklists.

---

## Build your own checklist

Tap the **✎ pencil** in the top bar to open the Builder. You can:

- Rename the set / tail number.
- Add **Groups** and choose a type (Normal / Abnormal / Emergency — sets the color).
- Add **Checklists** to a group.
- Add **Items** of four kinds: **Item** (challenge + response), **Note**, **Caution**, **Warning**.
- Reorder with ↑ / ↓, edit with ✎, remove with ✕. Everything saves automatically.

Use the **⋮ menu** (top right) to create a **New set**, **Duplicate**, **Delete**, or **Import/Export**.

---

## Import / Export format

Export produces a `.json` file you can back up, share, or re-import. The importer is lenient —
it accepts a full export, a bare set, an array of sets, or a single group.

```json
{
  "app": "interactive-checklist",
  "version": 1,
  "set": {
    "name": "Cessna 172S",
    "tail": "N12345",
    "groups": [
      {
        "name": "Normal Procedures",
        "type": "normal",
        "checklists": [
          {
            "name": "Before Takeoff",
            "items": [
              { "type": "item", "challenge": "Fuel Selector", "response": "BOTH" },
              { "type": "note", "text": "Verify freedom of movement." },
              { "type": "caution", "text": "Watch CHT on hot days." },
              { "type": "warning", "text": "Do not exceed flap limit speed." }
            ]
          }
        ]
      }
    ]
  }
}
```

- `group.type` ∈ `normal` | `abnormal` | `emergency`
- `item.type` ∈ `item` | `note` | `caution` | `warning`
  - `item` uses `challenge` + `response`; the others use `text`.

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell / markup |
| `styles.css` | Avionics-inspired theme & layout |
| `app.js` | State, rendering, interactions, builder, import/export |
| `data.js` | Default sample checklist set (loaded as a global for `file://` use) |
| `manifest.webmanifest`, `sw.js`, `icon.svg` | PWA install + offline support |

Data is stored in the browser's `localStorage` on the device — clearing Safari data resets it,
so **Export** anything you want to keep.
