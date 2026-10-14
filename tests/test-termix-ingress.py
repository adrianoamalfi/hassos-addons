#!/usr/bin/env python3
"""Docker integration test with a mock Supervisor and actual ingress IP filtering.

Run explicitly after building local/termix:latest. Not discovered as a unit test.
"""
import json
import os
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def docker(*args):
    return subprocess.run(["docker", *args], check=True, text=True, capture_output=True).stdout.strip()


def main():
    suffix = str(os.getpid())
    network, supervisor, termix = [f"termix-fixture-{kind}-{suffix}" for kind in ("net", "supervisor", "app")]
    volume, restore_volume = f"termix-fixture-data-{suffix}", f"termix-fixture-restore-{suffix}"
    prefix = "/api/hassio_ingress/fixture_token"
    with tempfile.TemporaryDirectory(prefix="termix-ingress-") as data:
        docker("network", "create", "--subnet", "172.30.32.0/24", network)
        try:
            docker("run", "-d", "--name", supervisor, "--network", network, "--network-alias", "supervisor",
                   "--ip", "172.30.32.2", "-p", "127.0.0.1::8088", "--entrypoint", "node",
                   "-v", f"{ROOT / 'tests/mock-supervisor.cjs'}:/fixture.cjs:ro", "local/termix:latest", "/fixture.cjs")
            docker("run", "-d", "--name", termix, "--network", network, "--network-alias", "termix",
                   "--ip", "172.30.32.3", "-e", "SUPERVISOR_TOKEN=fixture-secret", "-v", f"{volume}:/data",
                   "local/termix:latest")
            port = docker("port", supervisor, "8088/tcp").split(":")[-1]
            origin = f"http://127.0.0.1:{port}"
            def wait_ready():
                for attempt in range(60):
                    try:
                        with urllib.request.urlopen(origin + prefix + "/health", timeout=2) as response:
                            if response.status == 200:
                                return
                    except (OSError, urllib.error.URLError):
                        pass
                    time.sleep(1)
                raise AssertionError("Termix failed behind ingress")
            wait_ready()
            with urllib.request.urlopen(origin + prefix + "/", timeout=5) as response:
                html = response.read().decode()
                assert "frame-ancestors 'self'" in response.headers["Content-Security-Policy"]
                assert response.headers["X-Frame-Options"] == "SAMEORIGIN"
            assert f'name="termix-base-path" content="{prefix}"' in html
            assets = re.findall(r'(?:src|href)="([^\"]+\.(?:js|css))"', html)
            assert assets, "Frontend assets not found"
            assert all('-ha-' in asset for asset in assets if asset.endswith('.js')), "Adapted JS assets need distinct cache keys"
            for asset in assets:
                # Vite uses relative assets; resolve exactly as a browser at ingress root.
                from urllib.parse import urljoin
                with urllib.request.urlopen(urljoin(origin + prefix + "/", asset), timeout=5) as response:
                    assert response.status == 200
            denied = docker("run", "--rm", "--network", network, "--entrypoint", "node", "local/termix:latest",
                            "-e", "fetch('http://termix:8080/',{headers:{'X-Forwarded-For':'172.30.32.2'}})"
                            ".then(r=>console.log(r.status))")
            assert denied == "403", f"Unexpected untrusted ingress access: {denied}"
            backend = docker("run", "--rm", "--network", network, "--entrypoint", "node", "local/termix:latest",
                             "-e", "fetch('http://termix:30001/health',{signal:AbortSignal.timeout(2000)})"
                             ".then(r=>console.log(r.status)).catch(()=>console.log('blocked'))")
            assert backend == "blocked", f"Backend exposed outside ingress: {backend}"
            # Backend runs as node, without the Supervisor credential.
            safe = docker("exec", termix, "node", "-e",
                "const fs=require('fs');let found=false;for(const p of fs.readdirSync('/proc').filter(p=>/^\\d+$/.test(p)))"
                "{try{const cmd=fs.readFileSync('/proc/'+p+'/cmdline','utf8');"
                "if(cmd.split('\\0').includes('dist/backend/backend/starter.js')){found=true;const env=fs.readFileSync('/proc/'+p+'/environ','utf8');"
                "if(env.includes('SUPERVISOR_TOKEN='))process.exit(1)}}catch{}}if(!found)process.exit(2);console.log('safe')")
            assert safe == "safe"
            credentials = {"username": "fixture-admin", "password": "Fixture-only-Password-9274"}
            def post(path):
                request = urllib.request.Request(origin + prefix + path,
                    data=json.dumps(credentials).encode(), headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(request, timeout=5) as response:
                    assert response.status in (200, 201)
            post("/users/create")
            post("/users/login")
            docker("stop", termix)
            snapshot = Path(data) / "snapshot"
            # docker cp assigns the host copy to the caller: the runner need not
            # read files owned by the container's UID 1000 through a bind mount.
            docker("cp", f"{termix}:/data/termix", str(snapshot))
            assert (snapshot / ".env").is_file()
            assert (snapshot / "db.sqlite.encrypted").is_file()
            # Restore a complete stopped snapshot into a fresh container and data path.
            docker("rm", "-fv", termix)
            docker("create", "--name", termix, "--network", network, "--network-alias", "termix",
                   "--ip", "172.30.32.3", "-e", "SUPERVISOR_TOKEN=fixture-secret", "-v", f"{restore_volume}:/data",
                   "local/termix:latest")
            docker("cp", str(snapshot), f"{termix}:/data/termix")
            docker("start", termix)
            wait_ready()
            post("/users/login")
            print("Termix ingress: metadata, iframe, assets, IP restriction, token isolation, account login and restore passed")
        except Exception:
            print(docker("logs", "--tail", "30", termix))
            raise
        finally:
            for container in (termix, supervisor):
                subprocess.run(["docker", "rm", "-fv", container], capture_output=True)
            subprocess.run(["docker", "network", "rm", network], capture_output=True)
            subprocess.run(["docker", "volume", "rm", volume, restore_volume], capture_output=True)


if __name__ == "__main__":
    main()
