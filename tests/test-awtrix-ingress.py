#!/usr/bin/env python3
"""Ingress, device API and backup integration test for AWTRIX."""
import io
import json
import os
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMAGE = "local/awtrix:latest"
PREFIX = "/api/hassio_ingress/fixture_token"


def docker(*args):
    return subprocess.run(["docker", *args], check=True, text=True, capture_output=True).stdout.strip()


def http(origin, path, method="GET", data=None, headers=None):
    request = urllib.request.Request(origin + path, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read()


def json_request(origin, path, method="GET", body=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {} if data is None else {"Content-Type": "application/json"}
    status, _, payload = http(origin, path, method, data, headers)
    try:
        return status, json.loads(payload)
    except ValueError:
        raise AssertionError(f"Expected JSON from {path}, received HTTP {status}")


def wait_for_ingress(origin):
    for _ in range(60):
        try:
            status, _, _ = http(origin, PREFIX + "/api/health")
            if status == 200:
                return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(1)
    raise AssertionError("AWTRIX did not become healthy behind ingress")


def native_archive_with_wifi(data):
    source = zipfile.ZipFile(io.BytesIO(data))
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as target:
        for info in source.infolist():
            target.writestr(info.filename, source.read(info.filename))
        target.writestr("config/wifi.json", json.dumps({"wifiSsid": "FixtureNet", "wifiPass": "fixture"}))
    return output.getvalue()


def run():
    suffix = str(os.getpid())
    network, ingress_fixture, device, app = [f"awtrix-fixture-{kind}-{suffix}" for kind in ("net", "ingress", "device", "app")]
    fixture = ROOT / "tests" / "mock-awtrix-fixtures.cjs"
    with tempfile.TemporaryDirectory(prefix="awtrix-ingress-") as tmp:
        data_dir = Path(tmp)
        (data_dir / "options.json").write_text(json.dumps({
            "devices": [{"host": "awtrix-mock", "name": "Fixture", "tls": False}],
        }))
        docker("network", "create", network)
        try:
            docker("run", "-d", "--name", ingress_fixture, "--network", network,
                   "-p", "127.0.0.1::8088",
                   "-e", "FIXTURE_ROLE=ingress", "-v", f"{fixture}:/fixture.cjs:ro",
                   "node:22-alpine", "node", "/fixture.cjs")
            docker("run", "-d", "--name", device, "--network", network,
                   "--network-alias", "awtrix-mock", "-p", "127.0.0.1::80",
                   "-e", "FIXTURE_ROLE=awtrix", "-v", f"{fixture}:/fixture.cjs:ro",
                   "node:22-alpine", "node", "/fixture.cjs")
            docker("run", "-d", "--name", app, "--network", network,
                   "--network-alias", "awtrix",
                   "-v", f"{data_dir}:/data", IMAGE)

            ingress_port = docker("port", ingress_fixture, "8088/tcp").split(":")[-1]
            device_port = docker("port", device, "80/tcp").split(":")[-1]
            origin = f"http://127.0.0.1:{ingress_port}"
            device_origin = f"http://127.0.0.1:{device_port}"
            wait_for_ingress(origin)

            status, headers, page = http(origin, PREFIX + "/")
            assert status == 200 and f'<base href="{PREFIX}/" />'.encode() in page, "Ingress base path missing"
            assets = re.findall(rb'(?:src|href)="([^"]+\.(?:js|css))"', page)
            assert assets, "Frontend assets were not found"
            for asset in assets:
                asset_path = asset.decode().lstrip("/")
                asset_status, _, _ = http(origin, PREFIX + "/" + asset_path)
                assert asset_status == 200, f"Ingress asset failed: {asset_path} (HTTP {asset_status})"
            assert json_request(origin, PREFIX + "/api/health")[0] == 200
            assert http(origin, "/")[0] == 404, "Frontend must not be exposed outside the ingress route"
            status, devices = json_request(origin, PREFIX + "/api/devices")
            assert status == 200 and len(devices) == 1 and devices[0]["online"], "Configured device was not reachable"
            status, settings = json_request(origin, PREFIX + "/api/devices/awtrix-mock/settings", "PATCH", {"settings": {"brightness": 91}})
            assert status == 200, f"Device settings write failed (HTTP {status}: {settings})"
            status, settings = json_request(origin, PREFIX + "/api/devices/awtrix-mock/settings")
            assert status == 200 and settings["brightness"] == 91, "Device settings did not round-trip"

            status, exported = json_request(origin, PREFIX + "/api/backup/awtrix-mock/export", "POST")
            assert status == 200 and exported.get("filename"), "Backup export failed"
            status, _, archive_bytes = http(origin, PREFIX + f"/api/backup/awtrix-mock/download/{exported['filename']}")
            assert status == 200, "Backup download failed"
            with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
                names = archive.namelist()
                assert names[0] == "manifest.json", "Native manifest must be the first entry"
                manifest = json.loads(archive.read("manifest.json"))
                assert manifest.get("app") == "awtrix-ng" and manifest.get("backupFormat") == 1
                assert "ICONS/sample.png" in names, "File listing response was not backed up"
                assert b"fixture-wifi-secret" not in archive_bytes
                assert b"fixture-mqtt-secret" not in archive_bytes
                assert b"fixture-auth-secret" not in archive_bytes

            uploaded = native_archive_with_wifi(archive_bytes)
            request = urllib.request.Request(
                origin + PREFIX + "/api/backup/awtrix-mock/restore",
                data=None,
                method="POST",
            )
            boundary = "----awtrix-fixture-boundary"
            body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"fixture.zip\"\r\n"
                    "Content-Type: application/zip\r\n\r\n").encode() + uploaded + f"\r\n--{boundary}--\r\n".encode()
            request.data = body
            request.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
            try:
                with urllib.request.urlopen(request, timeout=15) as response:
                    status, restored = response.status, json.loads(response.read())
            except urllib.error.HTTPError as error:
                status, restored = error.code, json.loads(error.read())
            restore_result = restored.get("restored", {})
            assert status == 200 and restore_result.get("requires_reboot") is True
            assert restore_result.get("warnings"), "Partial restore warnings were not surfaced"
            state_status, state = json_request(device_origin, "/__fixture/state")
            assert state_status == 200 and state["restoreCalls"] == 1, "Valid restore did not reach the device"

            bad = io.BytesIO()
            with zipfile.ZipFile(bad, "w", compression=zipfile.ZIP_STORED) as archive:
                archive.writestr("manifest.json", json.dumps({"app": "awtrix-ng", "backupFormat": 1}))
                archive.writestr("../escape", "unsafe")
            boundary = "----awtrix-invalid-boundary"
            body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"invalid.zip\"\r\n"
                    "Content-Type: application/zip\r\n\r\n").encode() + bad.getvalue() + f"\r\n--{boundary}--\r\n".encode()
            request = urllib.request.Request(origin + PREFIX + "/api/backup/awtrix-mock/restore", data=body, method="POST")
            request.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
            try:
                with urllib.request.urlopen(request, timeout=10) as response:
                    invalid_status = response.status
            except urllib.error.HTTPError as error:
                invalid_status = error.code
            assert invalid_status == 422, f"Unsafe archive was not rejected (HTTP {invalid_status})"
            _, state = json_request(device_origin, "/__fixture/state")
            assert state["restoreCalls"] == 1, "Invalid archive reached the device"
            print("AWTRIX ingress, device API, native backup export/restore, and unsafe ZIP rejection passed")
        finally:
            # The container writes backup files as root into the host temp dir.
            # Restore host cleanup permissions before TemporaryDirectory removes it.
            subprocess.run(["docker", "exec", app, "chmod", "-R", "a+rwX", "/data"],
                           check=False, capture_output=True)
            for name in (app, device, ingress_fixture):
                subprocess.run(["docker", "rm", "-f", name], check=False, capture_output=True)
            subprocess.run(["docker", "network", "rm", network], check=False, capture_output=True)


if __name__ == "__main__":
    run()
