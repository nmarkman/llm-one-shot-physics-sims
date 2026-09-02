#!/usr/bin/env python3
"""Generate one-shot physics sim entries from Anthropic models via the Claude Code CLI.

Usage:
  python3 scripts/oneshot.py claude-opus-5 claude-sonnet-5 [--effort xhigh] [--dry]

For each model ID this runs `claude -p` in a clean room (no tools, no MCP servers, no
plugins, no hooks, no CLAUDE.md, neutral system prompt, single turn), extracts the
index.html and sim.js code blocks from the response verbatim, writes them to
sims/<slug>/, and normalizes the page <title> to the model's display name. It then
prints the MODELS row to add to index.html and the README table row. Auth is whatever
`claude` is logged in as (check with `claude auth status`).
"""
import argparse, json, os, re, subprocess, sys, tempfile, threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FENCE = re.compile(r"^(`{3,}|~{3,})[ \t]*([\w+-]*)[^\n]*\n(.*?)^\1[ \t]*$", re.S | re.M)
# Inherited from a parent Claude Code session, these would block the nested launch or
# silently change thinking and effort. Strip them so every run is identical.
STRIP_ENV = ["CLAUDECODE", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_EFFORT",
             "CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING", "CLAUDE_CODE_MESSAGING_SOCKET",
             "CLAUDE_CODE_MESSAGING_TOKEN", "CLAUDE_CODE_SESSION_ID", "CLAUDE_PID"]


def read_prompt():
    text = (ROOT / "README.md").read_text()
    m = re.search(r"<summary>View the full prompt</summary>\s*```\n(.*?)\n```", text, re.S)
    if not m:
        sys.exit("could not find the prompt block in README.md")
    return m.group(1)


def display_name(model_id):
    parts = model_id.replace("claude-", "").split("-")
    nums = [p for p in parts[1:] if p.isdigit()]
    return f"Claude {parts[0].capitalize()} {'.'.join(nums[:2])}".rstrip()


def slug(model_id):
    return model_id.replace("claude-", "")


def classify(lang, body):
    l = lang.lower()
    if l in ("html", "htm") or "<!doctype" in body[:300].lower() or "<html" in body[:300].lower():
        return "html"
    if l in ("js", "javascript", "mjs") or re.search(r"\b(function|const|let|class)\b", body):
        return "js"
    return "other"


def run(model, prompt, effort, outdir):
    env = {k: v for k, v in os.environ.items() if k not in STRIP_ENV}
    cmd = ["claude", "-p", "--model", model, "--safe-mode", "--tools", "", "--strict-mcp-config",
           "--effort", effort, "--no-session-persistence", "--output-format", "json",
           "--system-prompt", "You are a helpful assistant.", prompt]
    with open(outdir / f"{model}.json", "w") as out, open(outdir / f"{model}.err", "w") as err:
        subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=out, stderr=err, env=env)


def extract(model, outdir, dry):
    out_path, err_path = outdir / f"{model}.json", outdir / f"{model}.err"
    try:
        d = json.loads(out_path.read_text())
    except (OSError, ValueError) as e:
        err = err_path.read_text().strip() if err_path.exists() else ""
        print(f"\n== {model}: FAILED, no valid JSON from claude ({e}). Raw output: {out_path}" + (f"\n   stderr: {err[:300]}" if err else ""))
        return
    md = d.get("result") or ""
    blocks = [(classify(lang, body), body) for _, lang, body in FENCE.findall(md)]
    html = max((b for k, b in blocks if k == "html"), key=len, default=None)
    js = max((b for k, b in blocks if k == "js"), key=len, default=None)
    # The CLI makes a tiny Haiku call for the session title; it is not part of the sim.
    used = [k for k in (d.get("modelUsage") or {}) if not k.startswith("claude-haiku")]
    name, s = display_name(model), slug(model)
    print(f"\n== {model}: turns={d.get('num_turns')} is_error={d.get('is_error')} model_used={used}")
    if d.get("num_turns") != 1:
        print("   WARNING: more than one turn, so this was not a single-shot response")
    if not (html and js):
        print(f"   FAILED: needed an html block and a js block, found {len(blocks)}. Raw response: {outdir / (model + '.json')}")
        return
    html = re.sub(r"<title>[^<]*</title>", f"<title>{name}</title>", html, count=1)
    print(f"   index.html {len(html.splitlines())} lines, sim.js {len(js.splitlines())} lines")
    if dry:
        return
    dest = ROOT / "sims" / s
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "index.html").write_text(html.rstrip() + "\n")
    (dest / "sim.js").write_text(js.rstrip() + "\n")
    print(f"   wrote sims/{s}/")
    print(f"   MODELS row:  {{ id: '{s}', name: '{name}', provider: 'Anthropic', type: 'model', foundation: null, path: 'sims/{s}/' }},")
    print(f"   README row:  | {name} | Model | Anthropic | {chr(0x2014)} |")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("models", nargs="+", help="exact model IDs, e.g. claude-opus-5")
    ap.add_argument("--effort", default="xhigh")
    ap.add_argument("--dry", action="store_true", help="generate and report, but do not write sims/")
    a = ap.parse_args()
    prompt = read_prompt()
    outdir = Path(tempfile.mkdtemp(prefix="oneshot-"))
    print(f"raw responses: {outdir}")
    threads = [threading.Thread(target=run, args=(m, prompt, a.effort, outdir)) for m in a.models]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    for m in a.models:
        extract(m, outdir, a.dry)


if __name__ == "__main__":
    main()
