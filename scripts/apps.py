#!/usr/bin/env python3
"""Shared app discovery, Docker build/test and release metadata."""
import argparse
import json
import os
import platform
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
PLATFORMS = {"amd64": "linux/amd64", "aarch64": "linux/arm64"}


def run(*args, capture=False, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None, **kwargs)


def load(path):
    value = yaml.safe_load(path.read_text())
    if not isinstance(value, dict):
        raise ValueError(f"Expected YAML mapping: {path}")
    return value


def discover(root=None):
    root = root or ROOT
    apps, slugs = {}, set()
    for directory in sorted(root.iterdir()):
        if not directory.is_dir() or not (directory / "config.yaml").is_file():
            continue
        config = load(directory / "config.yaml")
        slug = config.get("slug")
        if not re.fullmatch(r"[a-z0-9_]+", slug or "") or slug in slugs:
            raise ValueError(f"Invalid or duplicate slug in {directory.name}")
        if not re.fullmatch(r"[a-z0-9_-]+", directory.name):
            raise ValueError(f"Invalid app directory: {directory.name}")
        if not isinstance(config.get("version"), str):
            raise ValueError(f"Version must be a quoted string in {directory.name}")
        arches = config.get("arch")
        if not isinstance(arches, list) or not arches or any(a not in PLATFORMS for a in arches):
            raise ValueError(f"Unsupported architectures in {directory.name}")
        if len(set(arches)) != len(arches) or not (directory / "Dockerfile").is_file():
            raise ValueError(f"Invalid app build structure: {directory.name}")
        slugs.add(slug)
        apps[directory.name] = config
    return apps


def app(name):
    apps = discover()
    if name not in apps:
        raise ValueError(f"Unknown app: {name}")
    return apps[name]


def select(apps, paths):
    if any(path.startswith(("scripts/", ".github/workflows/", ".github/actions/", "tests/")) for path in paths):
        return list(apps)
    return [name for name in apps if any(path.startswith(name + "/") for path in paths)]


def previous_version(name, ref):
    if not ref or set(ref) == {"0"}:
        return None
    result = subprocess.run(["git", "show", f"{ref}:{name}/config.yaml"], cwd=ROOT,
                            text=True, capture_output=True)
    return yaml.safe_load(result.stdout).get("version") if result.returncode == 0 else None


def selection(args):
    apps = discover()
    before, selected = args.base, list(apps)
    if args.event_file:
        event = json.loads(Path(args.event_file).read_text())
        if "pull_request" in event:
            before = run("git", "merge-base", event["pull_request"]["base"]["sha"], "HEAD", capture=True).stdout.strip()
        else:
            before = event.get("before")
        requested = event.get("inputs", {}).get("addon", "all")
        if requested != "all":
            if requested not in apps:
                raise ValueError(f"Unknown app: {requested}")
            selected = [requested]
    if before and set(before) != {"0"}:
        paths = run("git", "diff", "--name-only", before, "HEAD", capture=True).stdout.splitlines()
        selected = [name for name in selected if name in select(apps, paths)]
        for name in selected:
            runtime = (f"{name}/Dockerfile", f"{name}/build.yaml", f"{name}/config.yaml", f"{name}/apparmor.txt")
            changed = any(path in runtime or path.startswith(f"{name}/rootfs/") for path in paths)
            if changed and previous_version(name, before) == apps[name]["version"]:
                raise ValueError(f"Runtime changes in {name} require an app version bump")
    matrix = [{"addon": name, "arch": arch} for name in selected for arch in apps[name]["arch"]]
    releases = [name for name in selected if before is not None
                and previous_version(name, before) != apps[name]["version"]]
    result = {"matrix": {"include": matrix}, "addons": selected, "releases": releases}
    if args.github_output:
        with open(args.github_output, "a") as output:
            for key, value in result.items():
                output.write(f"{key}={json.dumps(value, separators=(',', ':'))}\n")
    print(json.dumps(result))


def build(args):
    config = app(args.addon)
    arch = args.arch or {"arm64": "aarch64", "aarch64": "aarch64", "x86_64": "amd64"}.get(platform.machine())
    if arch not in config["arch"]:
        raise ValueError(f"Unsupported architecture for {args.addon}: {arch}")
    data = load(ROOT / args.addon / "build.yaml")
    build_args = {**data.get("args", {}), "BUILD_FROM": data["build_from"][arch],
                  "BUILD_ARCH": arch, "BUILD_VERSION": config["version"]}
    command = ["docker", "build", "--platform", PLATFORMS[arch], "-t", args.tag or f"local/{args.addon}:latest"]
    for key, value in build_args.items():
        command.extend(["--build-arg", f"{key}={value}"])
    labels = {**data.get("labels", {}), "io.hass.name": config["name"],
              "io.hass.description": config["description"], "io.hass.version": config["version"],
              "io.hass.arch": arch, "io.hass.type": "addon"}
    for key, value in labels.items():
        command.extend(["--label", f"{key}={value}"])
    run(*command, str(ROOT / args.addon))


HTTP_PROBE = r"""
const req=require('http').get(process.argv[1],res=>{
 let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>{
 console.log(JSON.stringify({status:res.statusCode,headers:res.headers,body:body.slice(0,5000)}));});
});req.on('error',()=>process.exit(1));req.setTimeout(5000,()=>{req.destroy();process.exit(1)});
"""


def smoke(args):
    config = app(args.addon)
    image = args.tag or f"local/{args.addon}:latest"
    name = f"ha-app-test-{args.addon}-{os.getpid()}"
    supervisor, network = name + "-supervisor", name + "-net"
    volume = name + "-data"
    with tempfile.TemporaryDirectory(prefix=f"ha-{args.addon}-") as data:
        (Path(data) / "options.json").write_text(json.dumps(config.get("options", {})))
        command = ["docker", "run", "-d", "--name", name, "-v", f"{volume}:/data",
                   "-p", "127.0.0.1::8080"]
        if args.arch:
            command += ["--platform", PLATFORMS[args.arch]]
        if args.addon == "termix":
            command += ["-e", "TERMIX_LOCAL_TEST=1"]
        if args.addon == "duplicati":
            # Current Bashio obtains options from the Supervisor, not options.json.
            # Exercise that API contract rather than modifying the production runtime.
            body = json.dumps({"result": "ok", "data": {"options": config.get("options", {})}})
            fixture = Path(data) / "supervisor.conf"
            fixture.write_text("events {}\nhttp { server { listen 80; location / { "
                "default_type application/json; return 200 '" + body.replace("'", "\\'") + "'; } } }\n")
            run("docker", "network", "create", network, capture=True)
            run("docker", "run", "-d", "--name", supervisor, "--network", network,
                "--network-alias", "supervisor", "--entrypoint", "nginx",
                "-v", f"{fixture}:/fixture.conf:ro", image, "-c", "/fixture.conf", "-g", "daemon off;", capture=True)
            command += ["--network", network, "-e", "SUPERVISOR_TOKEN=fixture-secret"]
        run(*command, image, capture=True)
        try:
            port = run("docker", "port", name, "8080/tcp", capture=True).stdout.strip().split(":")[-1]
            origin = f"http://127.0.0.1:{port}"

            def status(path):
                try:
                    with urllib.request.urlopen(origin + path, timeout=5) as response:
                        return response.status
                except urllib.error.HTTPError as error:
                    return error.code
                except (OSError, urllib.error.URLError):
                    return 0

            def healthy():
                if args.addon == "termix":
                    return status("/health") == 200
                return status("/") == 200 and (args.addon != "duplicati" or
                    status("/api/v1/serverstate") in {200, 302, 307, 401, 403})

            def wait_ready():
                for attempt in range(90):
                    running = run("docker", "inspect", "--format", "{{.State.Running}}", name, capture=True).stdout.strip()
                    if running != "true":
                        raise RuntimeError(f"{args.addon} exited before becoming healthy")
                    if healthy():
                        return
                    time.sleep(2)
                raise RuntimeError(f"Startup timed out for {args.addon}")

            wait_ready()
            if args.addon == "termix":
                result = run("docker", "exec", name, "node", "-e", HTTP_PROBE,
                             "http://127.0.0.1:8080/", capture=True)
                page = json.loads(result.stdout)
                if page["status"] != 200 or 'name="termix-base-path"' not in page["body"]:
                    raise RuntimeError("Termix frontend unavailable")
                if "frame-ancestors 'self'" not in page["headers"].get("content-security-policy", ""):
                    raise RuntimeError("Termix iframe policy missing")
                run("docker", "exec", name, "sh", "-c", "test -s /data/termix/.env")
                # A second boot exercises repeatable template preparation and key persistence.
                before = run("docker", "exec", name, "sha256sum", "/data/termix/.env", capture=True).stdout
                files_before = run("docker", "exec", name, "node", "-e",
                    "console.log(require('fs').readdirSync('/app/html/assets').length)", capture=True).stdout
                run("docker", "restart", name, capture=True)
                port = run("docker", "port", name, "8080/tcp", capture=True).stdout.strip().split(":")[-1]
                origin = f"http://127.0.0.1:{port}"
                wait_ready()
                after = run("docker", "exec", name, "sha256sum", "/data/termix/.env", capture=True).stdout
                if before != after:
                    raise RuntimeError("Persisted Termix keys changed after restart")
                files_after = run("docker", "exec", name, "node", "-e",
                    "console.log(require('fs').readdirSync('/app/html/assets').length)", capture=True).stdout
                if files_before != files_after:
                    raise RuntimeError("Termix frontend assets accumulate across restarts")
            print(f"{args.addon}: startup and health checks passed ({config['version']})")
        except Exception:
            logs = run("docker", "logs", "--tail", "60", name, capture=True, stderr=subprocess.STDOUT).stdout
            print(re.sub(r"(?<=token=)[A-Za-z0-9._-]+", "[redacted]", logs))
            raise
        finally:
            run("docker", "rm", "-fv", name, capture=True)
            run("docker", "volume", "rm", volume, capture=True)
            if args.addon == "duplicati":
                run("docker", "rm", "-fv", supervisor, capture=True)
                run("docker", "network", "rm", network, capture=True)


def interactive(args):
    config = app(args.addon)
    name = f"{args.addon}-test"
    data = Path(args.data_dir or f"/tmp/{args.addon}-test").resolve()
    (data / "data").mkdir(parents=True, exist_ok=True)
    options = data / "data" / "options.json"
    if not options.exists():
        options.write_text(json.dumps(config.get("options", {})))
    image = args.tag or f"local/{args.addon}:latest"
    data_source = str(data / "data") if args.data_dir else name + "-data"
    command = ["docker", "run", "-d", "--name", name, "-p", f"127.0.0.1:{args.port}:8080",
               "-v", f"{data_source}:/data"]
    if args.addon == "termix":
        command += ["-e", "TERMIX_LOCAL_TEST=1"]
    if args.addon == "duplicati":
        network, supervisor = name + "-net", name + "-supervisor"
        body = json.dumps({"result": "ok", "data": {"options": config.get("options", {})}})
        fixture = data / "supervisor.conf"
        fixture.write_text("events {}\nhttp { server { listen 80; location / { "
            "default_type application/json; return 200 '" + body.replace("'", "\\'") + "'; } } }\n")
        run("docker", "network", "create", network, capture=True)
        run("docker", "run", "-d", "--name", supervisor, "--network", network,
            "--network-alias", "supervisor", "--entrypoint", "nginx",
            "-v", f"{fixture}:/fixture.conf:ro", image, "-c", "/fixture.conf", "-g", "daemon off;", capture=True)
        command += ["--network", network, "-e", "SUPERVISOR_TOKEN=fixture-secret"]
    for mount in config.get("map", []):
        directory = mount.split(":")[0]
        if not re.fullmatch(r"[a-z_]+", directory):
            raise ValueError(f"Unsupported local mount: {mount}")
        (data / directory).mkdir(exist_ok=True)
        command += ["-v", f"{data / directory}:/{directory}:{mount.split(':')[-1]}"]
    run(*command, image)
    print(f"{args.addon}: http://localhost:{args.port} (container {name}, data {data_source})")
    print(f"Stop with docker rm -fv {name}. Persistent data is preserved.")
    if args.addon == "duplicati":
        print(f"Then docker rm -fv {supervisor} and docker network rm {network}.")


def publish(args):
    names = json.loads(args.addons)
    # Upload artifacts contain the exact images which passed startup checks.
    for name in names:
        config = app(name)
        for arch in config["arch"]:
            tar = Path(args.artifacts) / f"image-{name}-{arch}" / "app-image.tar"
            if not tar.is_file():
                raise ValueError(f"Missing tested image: {tar}")
            run("docker", "load", "-i", str(tar))
            target = f"{config['image'].format(arch=arch)}:{config['version']}"
            run("docker", "tag", "app-test:ci", target)
            run("docker", "push", target)


def set_scalar(path, key, value):
    if not isinstance(value, str) or "\n" in value or '"' in value:
        raise ValueError(f"Invalid value for {key}")
    text, count = re.subn(rf'^(\s*{re.escape(key)}:)\s*.*$',
                         lambda match: f'{match[1]} "{value}"', path.read_text(), flags=re.M)
    if count != 1:
        raise ValueError(f"Expected one {key} field in {path}")
    yaml.safe_load(text)
    path.write_text(text)


def bump(args):
    config = app(args.addon)
    if args.duplicati_version or args.duplicati_date:
        if args.addon != "duplicati":
            raise ValueError("Duplicati arguments apply only to duplicati")
    if args.termix_version and args.addon != "termix":
        raise ValueError("Termix arguments apply only to termix")
    if args.version and not re.fullmatch(r"\d+\.\d+\.\d+", args.version):
        raise ValueError("App version must use major.minor.patch")
    directory = ROOT / args.addon
    build_file = directory / "build.yaml"
    if args.termix_version:
        if not re.fullmatch(r"\d+\.\d+\.\d+", args.termix_version) or not re.fullmatch(r"sha256:[a-f0-9]{64}", args.termix_digest or ""):
            raise ValueError("Termix updates require a version and verified multiarch digest")
        for arch in config["arch"]:
            set_scalar(build_file, arch, f"ghcr.io/termix-ssh/termix:{args.termix_version}")
        set_scalar(build_file, "TERMIX_VERSION", args.termix_version)
        set_scalar(build_file, "TERMIX_DIGEST", args.termix_digest)
    for key, value in [("DUPLICATI_VERSION", args.duplicati_version), ("DUPLICATI_DATE", args.duplicati_date)]:
        if value:
            if not re.fullmatch(r"[0-9.-]+", value):
                raise ValueError(f"Invalid {key}")
            set_scalar(build_file, key, value)
    if args.version and args.version != config["version"]:
        changelog = directory / "CHANGELOG.md"
        old = changelog.read_text() if changelog.exists() else ""
        if f"## {args.version}" in old.splitlines():
            raise ValueError(f"Changelog version already exists: {args.version}")
        notes = args.message or (f"Update Termix to v{args.termix_version}." if args.termix_version else
                f"Update Duplicati to v{args.duplicati_version} ({args.duplicati_date or 'existing release date'})."
                if args.duplicati_version else "Update app configuration.")
        index = old.find("## ")
        if index < 0:
            index = 0
        changelog.write_text(old[:index] + f"## {args.version}\n\n- {notes}\n\n" + old[index:])
        set_scalar(directory / "config.yaml", "version", args.version)
    print(f"Updated {args.addon}; review git diff before committing")


def changelog_section(text, version):
    lines = text.splitlines()
    start = next((i + 1 for i, line in enumerate(lines) if line == f"## {version}"), None)
    if start is None:
        raise ValueError(f"Missing changelog section for {version}")
    end = next((i for i in range(start, len(lines)) if lines[i].startswith("## ")), len(lines))
    body = "\n".join(lines[start:end]).strip()
    if not body:
        raise ValueError(f"Empty changelog section for {version}")
    return body


def release(args):
    config = app(args.addon)
    tag = f"{config['slug']}-v{config['version']}"
    body = changelog_section((ROOT / args.addon / "CHANGELOG.md").read_text(), config["version"])
    exists = subprocess.run(["gh", "release", "view", tag], cwd=ROOT, capture_output=True)
    if exists.returncode == 0:
        print(f"Release {tag} already exists")
        return
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md") as notes:
        notes.write(body)
        notes.flush()
        command = ["gh", "release", "create", tag, "--title", f"{config['slug']} v{config['version']}",
                   "--notes-file", notes.name, "--target", args.commit]
        if config.get("stage") == "experimental":
            command.append("--prerelease")
        run(*command)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    sub = commands.add_parser("select")
    sub.add_argument("--base")
    sub.add_argument("--event-file")
    sub.add_argument("--github-output")
    sub.set_defaults(handler=selection)
    for name, handler in [("build", build), ("test", smoke)]:
        sub = commands.add_parser(name)
        sub.add_argument("--addon", default="duplicati")
        sub.add_argument("--arch", choices=PLATFORMS)
        sub.add_argument("--tag")
        sub.set_defaults(handler=handler)
    sub = commands.add_parser("run")
    sub.add_argument("--addon", default="duplicati")
    sub.add_argument("--tag")
    sub.add_argument("--port", type=int, default=8080)
    sub.add_argument("--data-dir")
    sub.set_defaults(handler=interactive)
    sub = commands.add_parser("publish")
    sub.add_argument("--artifacts", required=True)
    sub.add_argument("--addons", required=True)
    sub.set_defaults(handler=publish)
    sub = commands.add_parser("bump")
    sub.add_argument("--addon", default="duplicati")
    sub.add_argument("--version")
    sub.add_argument("--duplicati-version")
    sub.add_argument("--duplicati-date")
    sub.add_argument("--termix-version")
    sub.add_argument("--termix-digest")
    sub.add_argument("--message")
    sub.set_defaults(handler=bump)
    sub = commands.add_parser("release")
    sub.add_argument("--addon", required=True)
    sub.add_argument("--commit", required=True)
    sub.set_defaults(handler=release)
    args = parser.parse_args()
    try:
        args.handler(args)
    except (ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Error: {error}\n")


if __name__ == "__main__":
    main()
