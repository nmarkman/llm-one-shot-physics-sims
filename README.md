# LLM One-Shot Physics Sims

One prompt. Multiple LLMs. No iteration.

Each model or coding tool received the exact same prompt — build an interactive physics simulator with bouncing balls inside a rotating polygon — and got one shot at it. No follow-ups, no refinement, no cherry-picking. What you see is the raw, unedited output.

![Physics Simulator Demo](assets/physics-simulator.gif)

## Live Demo

**[View the comparison site](https://llm-one-shot-physics-sims.vercel.app)**

## Models & Tools Tested

Some entries are foundation models prompted directly. Others are AI-powered coding tools — agents that use foundation models under the hood but add their own scaffolding, prompting, and iteration strategies.

| Name | Type | Provider | Foundation Model |
|------|------|----------|-----------------|
| Claude Fable 5.1 | Model | Anthropic | — |
| Claude Fable 5 | Model | Anthropic | — |
| Claude Opus 5 | Model | Anthropic | — |
| Claude Sonnet 5 | Model | Anthropic | — |
| Claude Opus 4.8 | Model | Anthropic | — |
| Claude Opus 4.7 | Model | Anthropic | — |
| Claude Opus 4.6 | Model | Anthropic | — |
| Claude Sonnet 4.6 | Model | Anthropic | — |
| Claude Opus 4.5 | Model | Anthropic | — |
| Claude Sonnet 4.5 | Model | Anthropic | — |
| Claude Haiku 4.5 | Model | Anthropic | — |
| Claude Opus 4.1 | Model | Anthropic | — |
| Claude Opus 4 | Model | Anthropic | — |
| Claude Sonnet 4 | Model | Anthropic | — |
| Codex (GPT-5.6-Sol) | Tool | OpenAI | GPT-5.6-Sol |
| Codex (GPT-5.6-Terra) | Tool | OpenAI | GPT-5.6-Terra |
| Codex (GPT-5.6-Luna) | Tool | OpenAI | GPT-5.6-Luna |
| Codex (GPT-5.5) | Tool | OpenAI | GPT-5.5 |
| Codex (GPT-5.4) | Tool | OpenAI | GPT-5.4 |
| Codex (GPT-5.4-Mini) | Tool | OpenAI | GPT-5.4-Mini |
| Codex (GPT-5.3-Codex-Spark) | Tool | OpenAI | GPT-5.3-Codex-Spark |
| Amp Code | Tool | Sourcegraph | Claude Sonnet 4.6 |
| Droid | Tool | Factory.ai | Unknown |

### How each batch was generated

- **March 2026** (Opus 4.6, Sonnet 4.6, Haiku 4.5, Amp Code, Droid): the models were prompted directly; the two tools were run as shipped.
- **April 2026** (Opus 4.5, Sonnet 4.5, Opus 4.1, Opus 4, Sonnet 4, Claude 3 Haiku): `generate_sim.py` through the Anthropic API, with one formatting instruction appended to the prompt so the reply contained only the two files. Claude 3 Haiku's reply never yielded a usable `sim.js`, so that entry was removed on September 2, 2026 rather than regenerated.
- **September 1, 2026** (Fable 5.1, Fable 5, Opus 5, Opus 4.8, Opus 4.7, Sonnet 5): the Claude Code CLI in print mode against each exact model ID on a claude.ai subscription, with every tool, MCP server, plugin, hook, and project instruction file disabled (`--safe-mode --tools "" --strict-mcp-config`), a neutral system prompt ("You are a helpful assistant."), effort pinned to `xhigh`, and a single turn. The two code blocks in each response were saved verbatim. Reproduce with `python3 scripts/oneshot.py <model-id>`.
- **September 2, 2026** (the seven Codex entries): Codex CLI 0.152.0 in non-interactive `codex exec` mode on a ChatGPT login, one model per run in a fresh git-initialized empty directory, with a temporary `CODEX_HOME` (empty config, no MCP servers, no user plugins) and a temporary `HOME`, because Codex also discovers skills from `~/.agents/skills` and `~/.codex/skills`; only the five system skills the CLI installs itself were present. Reasoning effort `xhigh`, workspace-write sandbox with network restricted, single turn. Unlike the model entries these are agentic runs: Codex wrote the files itself and could re-read, re-edit, and syntax-check them before finishing. GPT-5.4 and GPT-5.4-Mini carried an August 31, 2026 retirement date in the catalog but still served. Reproduce with `python3 scripts/oneshot_codex.py <model-slug>`; `codex debug models` lists the catalog.

Edits applied to every entry after generation: the page `<title>` is normalized to the entry name, and a small mobile snippet (a controls toggle plus embed mode for the comparison page) is injected after `<body>` in each `index.html`. Three entries also carry a functional fix, each marked with a comment in `sim.js` and otherwise untouched: Claude Haiku 4.5 (an invalid hex-alpha suffix on `hsl()` colors that threw on every frame, and a sign error in `getSignedDistance` that sent every ball to infinity within a second), Claude Opus 4.1 (the same hex-alpha suffix on `hsl()` colors), and Codex GPT-5.4-Mini (an undeclared `body` shorthand property in the ball constructor that threw on load).

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

`generate_sim.py` (Anthropic API), `scripts/oneshot.py` (Anthropic models on a Claude subscription), and `scripts/oneshot_codex.py` (OpenAI models through Codex) each do steps 1 and 2 and print the rows for step 3.

## Running Locally

Just open `index.html` in a browser, or serve it:

```bash
npx serve .
```

## License

MIT
