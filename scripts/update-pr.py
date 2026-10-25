#!/usr/bin/env python3
"""Create or recover an updater PR, then dispatch read-only CI for its branch."""
import argparse
import json
import re
import tempfile

import apps


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--addon", required=True)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    apps.app(args.addon)
    if not re.fullmatch(r"\d+(?:\.\d+)+", args.version):
        parser.error("Invalid upstream version")
    branch = f"update-{args.addon}-{args.version}"
    remote = apps.run("git", "ls-remote", "--heads", "origin", branch, capture=True).stdout.strip()
    if not remote:
        apps.run("git", "config", "user.name", "github-actions[bot]")
        apps.run("git", "config", "user.email", "github-actions[bot]@users.noreply.github.com")
        apps.run("git", "switch", "-c", branch)
        apps.run("git", "add", args.addon)
        apps.run("git", "commit", "-m", f"build(deps): update {args.addon} to v{args.version}")
        apps.run("git", "push", "origin", branch)
    prs = json.loads(apps.run("gh", "pr", "list", "--state", "open", "--head", branch,
                             "--json", "number,url", capture=True).stdout)
    if not prs:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md") as body:
            body.write(f"Update {args.addon} to upstream v{args.version}.\n\n"
                       "Validation: app lint, architecture builds, startup and persistence checks.\n")
            body.flush()
            apps.run("gh", "pr", "create", "--title", f"Update {args.addon} to v{args.version}",
                     "--body-file", body.name, "--base", "main", "--head", branch)
        prs = json.loads(apps.run("gh", "pr", "list", "--state", "open", "--head", branch,
                                 "--json", "number,url", capture=True).stdout)
    # GITHUB_TOKEN does not reliably trigger subsequent PR workflows. Dispatch
    # Builder explicitly; workflow_dispatch only builds/tests and cannot publish.
    apps.run("gh", "workflow", "run", "builder.yaml", "--ref", branch, "-f", f"addon={args.addon}")
    current = prs[0]["number"]
    candidates = json.loads(apps.run("gh", "pr", "list", "--state", "open", "--limit", "100",
                                    "--json", "number,headRefName,author", capture=True).stdout)
    for pr in candidates:
        match = re.fullmatch(rf"update-{re.escape(args.addon)}-(\d+(?:\.\d+)+)", pr["headRefName"])
        if (match and pr["number"] != current and pr["author"]["login"] in {"app/github-actions", "github-actions[bot]"}
                and tuple(map(int, match[1].split("."))) < tuple(map(int, args.version.split(".")))):
            apps.run("gh", "pr", "close", str(pr["number"]))
    print(prs[0]["url"])


if __name__ == "__main__":
    main()
