# LLM One-Shot Physics Sims

One prompt. Multiple LLMs. No iteration.

Each model received the exact same prompt — build an interactive physics simulator with bouncing balls inside a rotating polygon — and got one shot at it. No follow-ups, no refinement, no cherry-picking. What you see is the raw, unedited output.

![Physics Simulator Demo](assets/physics-simulator.gif)

## Live Demo

**[View the comparison site](https://nmarkman.github.io/llm-one-shot-physics-sims/)**

## Models Tested

| Model | Provider | Folder |
|-------|----------|--------|
| Claude Opus 4.6 | Anthropic | `sims/opus-4-6/` |
| Claude Sonnet 4.6 | Anthropic | `sims/sonnet-4-6/` |
| Claude Haiku 4.5 | Anthropic | `sims/haiku-4-5/` |
| Amp Code | Sourcegraph | `sims/ampcode/` |
| Droid | Factory.ai | `sims/droid/` |

## What to Compare

- **Physics accuracy** — Collision detection, energy conservation, wall friction
- **UI/UX quality** — Control panel design, parameter range, visual polish
- **Code sophistication** — Mass-weighted impulses, re-constraining, spinning-wall drag
- **Visual design** — Color systems, rendering effects, motion trails

## Adding a New Model

1. Give the model the same prompt
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
