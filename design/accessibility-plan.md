# Accessibility plan

Maps to WCAG 2.1 AA (HTML overlay), the game-accessibility guidelines and Xbox
Accessibility Guidelines (standards §5). Verified by automated axe tests
(`tests/a11y.spec.js`) and the text-mode parity check.

| Feature | Implementation | Guideline |
|---|---|---|
| HTML overlay UI | All menus, HUD, dialogs, field guide, data sheet, reveal, simulator controls are semantic HTML above the canvas; nothing interactive is drawn inside WebGL | WCAG 4.1.2; GAG core |
| Text mode with parity | `#/` text mode: the meadow as a 20×20 grid data table with a moisture-zone column; sampling a cell reveals structured plant descriptions (field marks in words); the learner identifies and counts; SAME data sheet, reveal, simulator, items and record. Covers LO1–LO5. Documented parity gap: none — every objective and assessment decision exists in text mode | Standards 5.2 |
| Keyboard play | Every control focusable and operable; map placement has arrow-key cursor + Enter; counting steppers; Skip via Esc; no drag-only interactions | WCAG 2.1.1; XAG |
| Pointer alternatives | Map click OR keyboard cursor; on-screen rotate/zoom buttons for the orbit camera; steppers for counts | WCAG 2.5.1 |
| Announcements | aria-live region: design chosen, quadrat placed, quadrat complete, feedback, reveal numbers, simulator progress ("400 of 1000 samples") | WCAG 4.1.3 |
| Reduced motion | `prefers-reduced-motion` respected + in-game toggle: cinematics become still frames + captions (no camera flights), walking becomes cuts, quadrat rain removed, wind paused entirely in text of quadrat view | WCAG 2.3.3; standards 5.6 |
| No flashing | No strobe effects; reveal highlights are steady tints | WCAG 2.3.1 |
| Pause / no time pressure | Field-time meter is a budget that ends placement, never a countdown that punishes; no timeouts anywhere; pause via menu | WCAG 2.2.2; standards 5.8 |
| Captions / audio | Cinematics captioned + text description; optional ambience with separate volume + mute in Settings | WCAG 1.2.x |
| Colour independence | Field marks state shape + size first, colour last; map zones use pattern + label + colour; chart bars labelled with values; species differentiated by silhouette + label, never colour alone | WCAG 1.4.1; standards 5.10 |
| Contrast | Overlay meets AA in dark and light themes; high-contrast setting available | WCAG 1.4.3 |
| Text size | Normal / Large / Extra-large settings (root font-size scaling) | WCAG 1.4.4 |
| Focus | Skip link; visible focus rings; dialog focus traps with restore (template `a11y/focus.js`) | WCAG 2.4.3, 2.4.7 |
| Points of interest | Quadrat jump list ("Go to quadrat 4") in the fieldwork HUD; species list in the guide as POIs | Standards 5.3 |
| FOV comfort | Field-of-view slider (40–90°); camera glides use eased, short paths; cuts available via reduced motion | Motion-sickness care, standards 5.12 |
| Charts | Every chart ships with a data table and a text summary | Standards 5.2 |
| Learning record | Local-only; "My progress" page; download JSON; "Clear my data" clears only `field-ecologist:*` keys | Privacy; standards 7 |
| Known gaps (honest) | The 3D scene itself is not available to screen readers by definition; full information is duplicated in text mode and the HTML overlay. Headless testing covers the overlay; physical screen-reader passes are future work (evaluation/METHODS.md) | — |
