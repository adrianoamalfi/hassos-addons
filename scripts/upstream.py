#!/usr/bin/env python3
"""Upstream drivers; preparation changes only the selected app."""
import argparse
import json
import os
import re
import sys
import urllib.request

import apps


def github(path):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "hassos-addons-updater"}
    if os.environ.get("GH_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["GH_TOKEN"]
    request = urllib.request.Request("https://api.github.com/" + path, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def version_tuple(value):
    return tuple(int(part) for part in value.split("."))


def duplicati_release(releases, channel):
    matches = []
    for release in releases:
        match = re.fullmatch(rf"v(\d+(?:\.\d+)+)_{re.escape(channel)}_(\d{{4}}-\d{{2}}-\d{{2}})", release.get("tag_name", ""))
        if match and not release.get("draft"):
            matches.append({"version": match[1], "date": match[2], "channel": channel})
    return max(matches, key=lambda item: (version_tuple(item["version"]), item["date"]), default=None)


def image_digest(version, arches):
    image = f"ghcr.io/termix-ssh/termix:{version}"
    manifest = json.loads(apps.run("docker", "buildx", "imagetools", "inspect", "--raw", image, capture=True).stdout)
    platforms = {(entry.get("platform", {}).get("os"), entry.get("platform", {}).get("architecture"))
                 for entry in manifest.get("manifests", [])}
    required = {("linux", "arm64" if arch == "aarch64" else arch) for arch in arches}
    if not required.issubset(platforms):
        raise ValueError(f"Termix image lacks required architectures: {required - platforms}")
    details = apps.run("docker", "buildx", "imagetools", "inspect", image, capture=True).stdout
    match = re.search(r"^Digest:\s+(sha256:[a-f0-9]{64})$", details, re.M)
    if not match:
        raise ValueError("Cannot determine Termix image digest")
    return match[1]


def check(name):
    config = apps.app(name)
    args = apps.load(apps.ROOT / name / "build.yaml").get("args", {})
    if name == "duplicati":
        latest = duplicati_release(github("repos/duplicati/duplicati/releases?per_page=100"), args["DUPLICATI_CHANNEL"])
        available = latest is not None and (version_tuple(latest["version"]), latest["date"]) > (
            version_tuple(args["DUPLICATI_VERSION"]), args["DUPLICATI_DATE"])
    elif name == "termix":
        release = github("repos/Termix-SSH/Termix/releases/latest")
        match = re.fullmatch(r"v(\d+\.\d+\.\d+)", release.get("tag_name", ""))
        if not match or release.get("draft") or release.get("prerelease"):
            raise ValueError("Unexpected Termix stable release")
        latest = {"version": match[1]}
        available = version_tuple(latest["version"]) > version_tuple(args["TERMIX_VERSION"])
        if available:
            latest["digest"] = image_digest(latest["version"], config["arch"])
    else:
        raise ValueError(f"No upstream driver for {name}")
    return {"addon": name, "available": available, "latest": latest}


def prepare(result):
    if not result["available"]:
        return
    name, latest = result["addon"], result["latest"]
    major, minor, patch = version_tuple(apps.app(name)["version"])
    args = argparse.Namespace(addon=name, version=f"{major}.{minor}.{patch + 1}", message=None,
        duplicati_version=latest["version"] if name == "duplicati" else None,
        duplicati_date=latest.get("date"), termix_version=latest["version"] if name == "termix" else None,
        termix_digest=latest.get("digest"))
    apps.bump(args)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--addon", choices=["duplicati", "termix"], default="duplicati")
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--github-output")
    args = parser.parse_args()
    try:
        result = check(args.addon)
        if args.prepare:
            prepare(result)
        if args.github_output:
            with open(args.github_output, "a") as output:
                output.write(f"available={str(result['available']).lower()}\n")
                if result["available"]:
                    output.write(f"version={result['latest']['version']}\n")
        print(json.dumps(result))
        return 0 if args.prepare or args.github_output else int(result["available"])
    except Exception as error:
        print(f"Update check failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
