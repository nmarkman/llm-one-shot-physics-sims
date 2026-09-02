#!/usr/bin/env python3
"""Generate one-shot physics sim entries through the Codex CLI, one per OpenAI model.

Usage:
  python3 scripts/oneshot_codex.py gpt-5.5 gpt-5.6-terra [--effort xhigh] [--reuse DIR] [--dry]

Each model gets a fresh git-initialized workspace and one `codex exec` run in a clean room:
a temporary CODEX_HOME (auth symlinked from ~/.codex, empty config, no MCP servers, no
user plugins) and a temporary HOME, because Codex also discovers skills from
~/.agents/skills and ~/.codex/skills regardless of CODEX_HOME. Only the handful of
system skills the CLI installs itself remain. Reasoning effort pinned, workspace-write
sandbox, network restricted. Codex writes the
two files itself; they are copied verbatim into sims/codex-<slug>/ with only the page
<title> normalized. `--reuse DIR` skips generation and extracts from DIR/<model>/.
List available models with `codex debug models`.
"""
import argparse, json, os, re, subprocess, sys, tempfile, threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read_prompt():
    text = (ROOT / "README.md").read_text()
    m = re.search(r"<summary>View the full prompt</summary>\s*```\n(.*?)\n```", text, re.S)
    if not m:
        sys.exit("could not find the prompt block in README.md")
    return m.group(1)


def display_name(model):
    try:
        cat = json.loads(subprocess.run(["codex", "debug", "models"], capture_output=True, text=True).stdout)
        models = cat if isinstance(cat, list) else (cat.get("models") or cat.get("data"))
        for m in models:
            if m.get("slug") == model:
                return m.get("display_name") or model
    except Exception:
        pass
    return model


def slug(model):
    return "codex-" + re.sub(r"[^a-z0-9]+", "-", model.lower()).strip("-")


def make_home(tmp):
    home, fake_home = tmp / "codex-home", tmp / "home"
    home.mkdir()
    fake_home.mkdir()
    (home / "auth.json").symlink_to(Path.home() / ".codex" / "auth.json")
    (home / "config.toml").write_text("")
    return home, fake_home


def run(model, prompt, effort, home, fake_home, workroot, logdir):
    d = workroot / model
    d.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "-C", str(d), "init", "-q"])
    env = dict(os.environ, CODEX_HOME=str(home), HOME=str(fake_home))
    cmd = ["codex", "exec", "-C", str(d), "-m", model, "-c", f"model_reasoning_effort={effort}",
           "-s", "workspace-write", "--skip-git-repo-check", "--ephemeral", "--json",
           "-o", str(logdir / f"{model}.last.md"), prompt]
    with open(logdir / f"{model}.events.jsonl", "w") as out, open(logdir / f"{model}.err", "w") as err:
        subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=out, stderr=err, env=env)


def extract(model, workroot, dry):
    d = workroot / model
    name = f"Codex ({display_name(model)})"
    s = slug(model)
    html_p, js_p = d / "index.html", d / "sim.js"
    extra = sorted(p.name for p in d.iterdir() if p.is_file() and p.name not in ("index.html", "sim.js") and not p.name.startswith("."))
    print(f"\n== {model} -> sims/{s}/  ({name})")
    if not (html_p.exists() and js_p.exists()):
        print(f"   FAILED: workspace {d} is missing index.html or sim.js; files present: {extra}")
        return
    html = re.sub(r"<title>[^<]*</title>", f"<title>{name}</title>", html_p.read_text(), count=1)
    js = js_p.read_text()
    print(f"   index.html {len(html.splitlines())} lines, sim.js {len(js.splitlines())} lines" + (f", extra files ignored: {extra}" if extra else ""))
    if dry:
        return
    dest = ROOT / "sims" / s
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "index.html").write_text(html.rstrip() + "\n")
    (dest / "sim.js").write_text(js.rstrip() + "\n")
    fd = display_name(model)
    print(f"   wrote sims/{s}/")
    print(f"   MODELS row:  {{ id: '{s}', name: '{name}', provider: 'OpenAI', type: 'tool', foundation: '{fd}', path: 'sims/{s}/' }},")
    print(f"   README row:  | {name} | Tool | OpenAI | {fd} |")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("models", nargs="+", help="Codex model slugs, e.g. gpt-5.5")
    ap.add_argument("--effort", default="xhigh")
    ap.add_argument("--reuse", help="directory holding existing <model>/ workspaces; skips generation")
    ap.add_argument("--dry", action="store_true", help="report but do not write sims/")
    a = ap.parse_args()
    if a.reuse:
        workroot = Path(a.reuse)
    else:
        tmp = Path(tempfile.mkdtemp(prefix="oneshot-codex-"))
        (home, fake_home), workroot, logdir = make_home(tmp), tmp / "runs", tmp / "logs"
        logdir.mkdir()
        print(f"workspaces and logs: {tmp}")
        prompt = read_prompt()
        threads = [threading.Thread(target=run, args=(m, prompt, a.effort, home, fake_home, workroot, logdir)) for m in a.models]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
    for m in a.models:
        extract(m, workroot, a.dry)


if __name__ == "__main__":
    main()
