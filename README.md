# LLM One-Shot Physics Sims

One prompt. Multiple LLMs. No iteration.

Each model or coding tool received the exact same prompt — build an interactive physics simulator with bouncing balls inside a rotating polygon — and got one shot at it. No follow-ups, no refinement, no cherry-picking. What you see is the raw, unedited output.

![Physics Simulator Demo](assets/physics-simulator.gif)

## Live Demo

**[View the comparison site](https://nmarkman.github.io/llm-one-shot-physics-sims/)**

## Models & Tools Tested

Some entries are foundation models prompted directly. Others are AI-powered coding tools — agents that use foundation models under the hood but add their own scaffolding, prompting, and iteration strategies.

| Name | Type | Provider | Foundation Model |
|------|------|----------|-----------------|
| Claude Opus 4.6 | Model | Anthropic | — |
| Claude Sonnet 4.6 | Model | Anthropic | — |
| Claude Haiku 4.5 | Model | Anthropic | — |
| Amp Code | Tool | Sourcegraph | Claude Sonnet 4.6 |
| Droid | Tool | Factory.ai | Unknown |

## The Prompt

Every model/tool received this exact prompt:

<details>
<summary>View the full prompt</summary>

```
Create a single-page physics simulation web app (vanilla HTML/CSS/JS, no frameworks) with two files: index.html and sim.js.

The simulation:

A regular polygon frame (default octagon) spins continuously in the center of a dark canvas
40 multicolored balls of varying sizes bounce inside the polygon, affected by gravity
Full 2D physics: gravity, wall collisions that account for the polygon's rotational velocity at the contact point (spinning walls should drag/fling balls), mass-based ball-to-ball collisions with separation and impulse resolution, and velocity damping
Use proper edge-based collision detection: compute the inward normal for each polygon edge, use signed distance to detect penetration, and push balls inward — NOT a simple circular distance-from-center check, which breaks on shapes with few sides like triangles
Run physics in 5 substeps per frame for stability, and re-constrain balls inside the polygon after ball-ball collision resolution to prevent escape
Spawn balls using the polygon's apothem (inscribed radius), not the circumradius, so they start inside any shape

The control panel:
A fixed glassmorphism panel (top-left, dark translucent background, backdrop blur, subtle cyan-tinted borders) with controls organized into 4 collapsible sections, each in its own rounded card with a subtle border that brightens on hover. Section headers are clickable to expand/collapse with a chevron indicator. The panel should scroll if it overflows the viewport.

Sections and controls:

Shape — Sides (range 3–20, shows shape name like "Triangle", "Pentagon", etc. below the slider), Spin Speed (range -3 to 3, negative = reverse)
Balls — Count (range 1–200), Size Variation (range 0–40, controls max random radius added to a base size of 6), Bounciness (range 0–1.2, controls wall restitution), Ball Collisions (toggle switch, when off balls pass through each other)
Physics — Gravity Angle (range 0–360°, display as arrow character like ↓ ← ↑ →), Gravity Strength (range 0–1500, 0 = zero-G), Time Scale (range 0–3×, scales physics dt)
Effects — Motion Trails (toggle, implemented by drawing a semi-transparent black rect over the previous frame instead of clearing), Explode button (applies random 300–800 velocity impulse to every ball)

Tooltips: Each control has a hover tooltip with a short description of what it does. The tooltip MUST be a real DOM element positioned outside the control panel (not a CSS pseudo-element), because the panel has overflow-y: auto which clips pseudo-element tooltips. Position it with JS on mouseenter using getBoundingClientRect, appearing to the right of the hovered control.

Visual style:

Dark background (#0a0a0f), cyan accent color rgba(100, 200, 255)
Balls have a radial gradient glow, a solid fill, and a small white highlight dot
The polygon frame has a glowing stroke with shadowBlur and small dots at each vertex
Subtle radial background glow behind the polygon
Toggle switches and a styled action button for Explode
Sliders with custom thumb styling (cyan circles with box-shadow glow)

Changing count, size variation, or sides should reinitialize all balls. Changing spin speed, bounciness, gravity, time scale, collisions, and trails should take effect immediately without resetting.
```

</details>

## What to Compare

- **Physics accuracy** — Collision detection, energy conservation, wall friction
- **UI/UX quality** — Control panel design, parameter range, visual polish
- **Code sophistication** — Mass-weighted impulses, re-constraining, spinning-wall drag
- **Visual design** — Color systems, rendering effects, motion trails

## Adding a New Model

1. Give the model the same prompt (see above)
2. Save its output to `sims/<model-name>/index.html` and `sims/<model-name>/sim.js`
3. Add an entry to the `MODELS` array in `index.html`
4. Commit and push

## Running Locally

Just open `index.html` in a browser, or serve it:

```bash
npx serve .
```

## License

MIT
