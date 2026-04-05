#!/usr/bin/env python3
"""Generate a physics simulation from a given Claude model using the Anthropic API."""

import sys
import os
import re
import anthropic

PROMPT = """Create a single-page physics simulation web app (vanilla HTML/CSS/JS, no frameworks) with two files: index.html and sim.js.

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

IMPORTANT: Output ONLY the two files. First output index.html wrapped in ```html fences, then output sim.js wrapped in ```javascript fences. No other commentary."""

def extract_files(text):
    """Extract index.html and sim.js from the model response."""
    # Try to find HTML block
    html_match = re.search(r'```html\s*\n(.*?)```', text, re.DOTALL)
    # Try to find JS block
    js_match = re.search(r'```(?:javascript|js)\s*\n(.*?)```', text, re.DOTALL)

    html_content = html_match.group(1).strip() if html_match else None
    js_content = js_match.group(1).strip() if js_match else None

    return html_content, js_content

def generate(model_id, output_dir):
    client = anthropic.Anthropic()

    print(f"[{model_id}] Sending prompt...")

    if "claude-3-haiku" in model_id:
        max_tokens = 4096
    elif "claude-3-opus" in model_id or "claude-3-sonnet" in model_id:
        max_tokens = 8192
    else:
        max_tokens = 16384

    try:
        # Use streaming to avoid timeout on slow models
        response_text = ""
        with client.messages.stream(
            model=model_id,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": PROMPT}],
        ) as stream:
            for text in stream.text_stream:
                response_text += text
        message = stream.get_final_message()
    except Exception as e:
        print(f"[{model_id}] ERROR: {e}")
        return False

    stop_reason = message.stop_reason
    print(f"[{model_id}] Response received. Stop reason: {stop_reason}, Usage: {message.usage}")

    if stop_reason == "end_turn":
        html_content, js_content = extract_files(response_text)

        if not html_content:
            print(f"[{model_id}] WARNING: Could not extract index.html")
            # Save raw response for debugging
            raw_path = os.path.join(output_dir, "raw_response.txt")
            os.makedirs(output_dir, exist_ok=True)
            with open(raw_path, "w") as f:
                f.write(response_text)
            print(f"[{model_id}] Raw response saved to {raw_path}")
            return False

        os.makedirs(output_dir, exist_ok=True)

        with open(os.path.join(output_dir, "index.html"), "w") as f:
            f.write(html_content)
        print(f"[{model_id}] Wrote index.html")

        if js_content:
            with open(os.path.join(output_dir, "sim.js"), "w") as f:
                f.write(js_content)
            print(f"[{model_id}] Wrote sim.js")
        else:
            print(f"[{model_id}] WARNING: No sim.js found (may be inline)")

        return True
    else:
        print(f"[{model_id}] WARNING: Response was truncated (stop_reason={stop_reason})")
        # Save what we have
        os.makedirs(output_dir, exist_ok=True)
        raw_path = os.path.join(output_dir, "raw_response.txt")
        with open(raw_path, "w") as f:
            f.write(response_text)
        print(f"[{model_id}] Partial response saved to {raw_path}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <model-id> <output-dir>")
        sys.exit(1)

    model_id = sys.argv[1]
    output_dir = sys.argv[2]

    success = generate(model_id, output_dir)
    sys.exit(0 if success else 1)
