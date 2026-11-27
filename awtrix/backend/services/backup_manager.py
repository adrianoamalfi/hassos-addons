import asyncio
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from urllib.parse import quote

import httpx

from backend.config import BACKUP_DIR, get_devices
from backend.services.awtrix_client import AwtrixClient, UnknownDeviceError

_PAUSE = 1.0
MAX_BACKUP_BYTES = 60 * 1024 * 1024
MAX_EXPANDED_BYTES = 128 * 1024 * 1024
MAX_BACKUP_ENTRIES = 2048
MAX_MANIFEST_BYTES = 4 * 1024
MAX_METADATA_BYTES = 64 * 1024
MAX_ICON_ORIGINS_BYTES = 16 * 1024
_COMPONENT = re.compile(r"[A-Za-z0-9_.-]{1,128}\Z")
_APP_NAME = re.compile(r"[A-Za-z0-9_-]{1,32}\Z")
_SECRET_KEYS = {"wifissid", "wifipass", "mqttpass", "authpass", "mqtlspin", "mqtttlspin"}


class BackupValidationError(ValueError):
    """The uploaded archive is invalid or unsafe to restore."""


async def _fresh_call(host: str, method_name: str, *args, **kwargs):
    client = AwtrixClient(host)
    try:
        return await getattr(client, method_name)(*args, **kwargs)
    finally:
        await client.close()


async def _fresh_request(host: str, method: str, path: str, **kwargs):
    client = AwtrixClient(host)
    try:
        return await client.request(method, path, **kwargs)
    finally:
        await client.close()


def _valid_component(value: str) -> bool:
    return bool(value and value not in (".", "..") and _COMPONENT.fullmatch(value))


def _clean_system(system: dict) -> dict:
    return {key: value for key, value in system.items() if key.lower() not in _SECRET_KEYS}


async def _optional_request(host: str, method: str, path: str, label: str, warnings: list[str], **kwargs):
    try:
        response = await _fresh_request(host, method, path, **kwargs)
        return response
    except httpx.HTTPStatusError as error:
        if error.response.status_code != 404:
            warnings.append(f"{label}: device returned HTTP {error.response.status_code}")
    except (httpx.HTTPError, OSError, ValueError) as error:
        warnings.append(f"{label}: {type(error).__name__}")
    return None


async def _collect_directory(host: str, directory: str, warnings: list[str]) -> list[tuple[str, bytes]]:
    response = await _optional_request(
        host, "GET", f"/api/v1/files?dir={quote(directory, safe='')}", directory, warnings,
    )
    if response is None:
        return []

    try:
        payload = response.json()
    except ValueError:
        warnings.append(f"{directory}: invalid file listing")
        return []
    files = payload.get("files", []) if isinstance(payload, dict) else payload
    if not isinstance(files, list):
        warnings.append(f"{directory}: invalid file listing")
        return []

    collected: list[tuple[str, bytes]] = []
    for entry in files:
        raw_name = entry if isinstance(entry, str) else entry.get("name", "") if isinstance(entry, dict) else ""
        name = str(raw_name).replace("\\", "/").rsplit("/", 1)[-1]
        if not _valid_component(name):
            warnings.append(f"{directory}: skipped invalid filename")
            continue
        asset = await _optional_request(
            host, "GET", f"{directory}/{quote(name, safe='')}", f"{directory}/{name}", warnings,
        )
        if asset is not None:
            collected.append((f"{directory.lstrip('/')}/{name}", asset.content))
        await asyncio.sleep(_PAUSE)
    return collected


async def save_backup(device_host: str) -> dict:
    device = next((item for item in get_devices() if item.get("host") == device_host), None)
    if device is None:
        raise UnknownDeviceError("AWTRIX device is not configured")

    warnings: list[str] = []
    # Settings and system configuration define a useful backup; fail clearly if either is absent.
    settings = await _fresh_call(device_host, "get_settings")
    await asyncio.sleep(_PAUSE)
    system_response = await _fresh_request(device_host, "GET", "/api/v1/system")
    system = system_response.json()
    if not isinstance(settings, dict) or not isinstance(system, dict):
        raise ValueError("AWTRIX returned invalid settings for the backup")
    safe_system = _clean_system(system)
    await asyncio.sleep(_PAUSE)

    apps = await _fresh_call(device_host, "list_apps")
    app_list = list(apps.values()) if isinstance(apps, dict) else apps
    if not isinstance(app_list, list):
        app_list = []
        warnings.append("Apps: device returned an unsupported list format")
    await asyncio.sleep(_PAUSE)

    entries: list[tuple[str, bytes]] = []

    def add_json(name: str, value):
        entries.append((name, json.dumps(value, indent=2, ensure_ascii=False).encode("utf-8")))

    add_json("config/settings.json", settings)
    add_json("config/system.json", safe_system)

    order = await _optional_request(device_host, "GET", "/apploop.json", "App order", warnings)
    if order is not None:
        try:
            entries.append(("apploop.json", order.content))
        except Exception:
            warnings.append("App order: unable to read response")
    await asyncio.sleep(_PAUSE)

    for app in app_list:
        if not isinstance(app, dict):
            continue
        name = str(app.get("name", ""))
        if not _APP_NAME.fullmatch(name):
            continue

        if app.get("origin") == "script":
            try:
                source = await _fresh_call(device_host, "get_script", name)
                entries.append((f"SCRIPTS/{name}.ax", source.encode("utf-8")))
            except (httpx.HTTPError, OSError) as error:
                warnings.append(f"Script {name}: {type(error).__name__}")
            await asyncio.sleep(_PAUSE)

        for kind in ("config", "data"):
            response = await _optional_request(
                device_host, "GET", f"/api/v1/apps/{quote(name, safe='')}/{kind}",
                f"App {name} {kind}", warnings,
            )
            if response is None:
                continue
            try:
                value = response.json()
            except ValueError:
                warnings.append(f"App {name} {kind}: invalid JSON")
                continue
            add_json(f"addon/apps_{kind}/{name}.json", value)
            await asyncio.sleep(_PAUSE)

    for directory in ("/ICONS", "/MELODIES", "/PALETTES", "/MP3"):
        entries.extend(await _collect_directory(device_host, directory, warnings))

    radio = await _optional_request(device_host, "GET", "/api/v1/audio/stations", "Radio stations", warnings)
    if radio is not None:
        try:
            radio_data = radio.json()
            add_json("radio.json", radio_data if isinstance(radio_data, dict) else {"stations": radio_data})
        except ValueError:
            warnings.append("Radio stations: invalid JSON")

    origins = await _optional_request(device_host, "GET", "/api/v1/icons/origins", "Icon origins", warnings)
    if origins is not None:
        try:
            add_json("config/icon-origins.json", origins.json())
        except ValueError:
            warnings.append("Icon origins: invalid JSON")

    melody_response = await _optional_request(
        device_host, "GET", "/api/v1/audio/melodies", "Melodies", warnings,
    )
    if melody_response is not None:
        try:
            payload = melody_response.json()
            melodies = payload.get("melodies", []) if isinstance(payload, dict) else payload
            if isinstance(melodies, list):
                for melody in melodies:
                    if not isinstance(melody, dict):
                        continue
                    name = str(melody.get("name", ""))
                    tune = melody.get("rtttl")
                    if _valid_component(name) and isinstance(tune, str):
                        entries.append((f"MELODIES/{name}.txt", tune.encode("utf-8")))
        except ValueError:
            warnings.append("Melodies: invalid JSON")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    safe_host = re.sub(r"[^A-Za-z0-9_-]+", "-", device_host).strip("-") or "device"
    filename = f"{safe_host}-{stamp}.zip"
    categories = sorted({
        "wifi" if name == "config/wifi.json" else
        "settings" if name.startswith("config/") else
        "apporder" if name == "apploop.json" else
        "radio" if name == "radio.json" else
        "icons" if name.startswith("ICONS/") else
        "melodies" if name.startswith("MELODIES/") else
        "palettes" if name.startswith("PALETTES/") else
        "mp3" if name.startswith("MP3/") else
        "scripts" if name.startswith("SCRIPTS/") else "apps"
        for name, _ in entries
    })
    manifest = {
        "app": "awtrix-ng",
        "backupFormat": 1,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "device": {"hostname": device.get("name", device_host)},
        "categories": categories,
    }

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, indent=2).encode("utf-8"))
        for name, content in entries:
            archive.writestr(name, content)
        if warnings:
            archive.writestr("addon/export-warnings.json", json.dumps(warnings, indent=2).encode("utf-8"))

    data = buffer.getvalue()
    if len(data) > MAX_BACKUP_BYTES:
        raise ValueError("Generated backup exceeds the 60 MiB limit")
    (BACKUP_DIR / filename).write_bytes(data)
    return {"filename": filename, "warnings": warnings}


def _safe_member(name: str) -> bool:
    if not name or "\\" in name or "\x00" in name or len(name) > 240:
        return False
    return not name.startswith("/") and all(part not in ("", ".", "..") for part in name.split("/"))


def _native_member(name: str) -> bool:
    if name in {
        "manifest.json", "config/wifi.json", "config/system.json", "config/settings.json",
        "config/icon-origins.json", "apploop.json", "radio.json",
    }:
        return True
    for directory in ("ICONS", "MELODIES", "PALETTES", "MP3"):
        if name.startswith(f"{directory}/") and _valid_component(name[len(directory) + 1:]):
            return True
    if name.startswith("SCRIPTS/"):
        parts = name.split("/")
        return ((len(parts) == 2 and _valid_component(parts[1])) or
                (len(parts) == 3 and _valid_component(parts[1]) and _valid_component(parts[2])
                 and parts[2].lower().endswith(".mp3")))
    if name == "addon/export-warnings.json":
        return True
    for kind in ("config", "data"):
        prefix = f"addon/apps_{kind}/"
        if name.startswith(prefix) and name.endswith(".json"):
            return bool(_APP_NAME.fullmatch(name[len(prefix):-5]))
    return False


def _legacy_member(name: str) -> bool:
    if name in {"manifest.json", "settings.json", "system.json", "apps.json", "apploop.json", "melodies.json"}:
        return True
    for prefix in ("scripts/", "icons/", "apps_config/", "apps_data/"):
        if name.startswith(prefix):
            rest = name[len(prefix):]
            if prefix in ("apps_config/", "apps_data/"):
                return bool(rest.endswith(".json") and _APP_NAME.fullmatch(rest[:-5]))
            return len(rest.split("/")) == 1 and _valid_component(rest)
    return False


def _read_archive(data: bytes) -> tuple[str, dict, list[tuple[str, bytes]], list[str]]:
    if not data or len(data) > MAX_BACKUP_BYTES:
        raise BackupValidationError("Backup must be non-empty and no larger than 60 MiB")
    try:
        with zipfile.ZipFile(io.BytesIO(data), "r") as archive:
            infos = archive.infolist()
            if not infos or len(infos) > MAX_BACKUP_ENTRIES:
                raise BackupValidationError("Backup archive has no files or too many entries")
            if infos[0].filename != "manifest.json":
                raise BackupValidationError("manifest.json must be the first archive entry")
            if len({info.filename for info in infos}) != len(infos):
                raise BackupValidationError("Backup contains duplicate entry names")

            total = 0
            entries: list[tuple[str, bytes]] = []
            for info in infos:
                if info.is_dir() or not _safe_member(info.filename):
                    raise BackupValidationError("Backup contains an unsafe entry name")
                if info.external_attr >> 16 & 0o170000 == 0o120000:
                    raise BackupValidationError("Backup cannot contain symbolic links")
                if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                    raise BackupValidationError("Backup uses an unsupported compression method")
                if info.flag_bits & 1:
                    raise BackupValidationError("Encrypted backups are not supported")
                total += info.file_size
                if total > MAX_EXPANDED_BYTES:
                    raise BackupValidationError("Expanded backup exceeds 128 MiB")
                if info.file_size and info.compress_size == 0:
                    raise BackupValidationError("Backup contains an invalid compressed entry")
                if info.compress_size and info.file_size / info.compress_size > 200:
                    raise BackupValidationError("Backup entry compression ratio is too high")
                if info.filename == "manifest.json" and info.file_size > MAX_MANIFEST_BYTES:
                    raise BackupValidationError("Backup manifest exceeds 4 KiB")
                content = archive.read(info)
                entries.append((info.filename, content))
    except BackupValidationError:
        raise
    except (OSError, zipfile.BadZipFile, RuntimeError, EOFError) as error:
        raise BackupValidationError("Backup is not a valid ZIP archive") from error

    try:
        manifest = json.loads(entries[0][1])
    except (ValueError, UnicodeDecodeError) as error:
        raise BackupValidationError("Backup manifest is invalid JSON") from error
    if not isinstance(manifest, dict):
        raise BackupValidationError("Backup manifest must be a JSON object")

    if manifest.get("app") == "awtrix-ng" and manifest.get("backupFormat") == 1:
        kind = "native"
        allowed = _native_member
    elif manifest.get("version") == 1:
        kind = "legacy"
        allowed = _legacy_member
    else:
        raise BackupValidationError("Backup format is not supported")

    warnings: list[str] = []
    validated: list[tuple[str, bytes]] = []
    for name, content in entries:
        if name != "manifest.json" and not allowed(name):
            warnings.append(f"{name}: unsupported backup item skipped")
            continue
        if name.endswith(".json"):
            limit = MAX_MANIFEST_BYTES if name == "manifest.json" else (
                MAX_ICON_ORIGINS_BYTES if name == "config/icon-origins.json" else MAX_METADATA_BYTES
            )
            if len(content) > limit:
                raise BackupValidationError(f"{name} exceeds its JSON size limit")
            try:
                json.loads(content)
            except (ValueError, UnicodeDecodeError) as error:
                raise BackupValidationError(f"{name} is invalid JSON") from error
        validated.append((name, content))
    return kind, manifest, validated, warnings


async def _restore_native(device_host: str, manifest: dict, entries: list[tuple[str, bytes]], warnings: list[str]) -> dict:
    supported = [(name, content) for name, content in entries if _native_member(name)]
    addon_entries = [(name, content) for name, content in supported if name.startswith("addon/")]
    device_entries = [(name, content) for name, content in supported if not name.startswith("addon/")]

    forwarded = io.BytesIO()
    with zipfile.ZipFile(forwarded, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, content in device_entries:
            archive.writestr(name, content)
    response = await _fresh_request(
        device_host, "POST", "/api/v1/restore",
        files={"file": ("awtrix-backup.zip", forwarded.getvalue(), "application/zip")},
        timeout=httpx.Timeout(90.0, connect=5.0),
    )
    try:
        result = response.json()
    except ValueError as error:
        raise ValueError("AWTRIX returned an invalid restore response") from error
    if not isinstance(result, dict) or result.get("ok") is False:
        raise ValueError("AWTRIX refused the backup archive")

    applied = result.get("applied", {})
    if not isinstance(applied, dict):
        warnings.append("AWTRIX restore response omitted the applied-items map")
        applied = {}
    response_warnings = result.get("warnings", [])
    if isinstance(response_warnings, list):
        warnings.extend(str(item) for item in response_warnings if item)
    elif response_warnings:
        warnings.append("AWTRIX returned invalid restore warnings")
    client = AwtrixClient(device_host)
    try:
        for name, content in addon_entries:
            if name == "addon/export-warnings.json":
                try:
                    previous = json.loads(content)
                    warnings.extend(f"Previous export: {item}" for item in previous if isinstance(item, str))
                except (ValueError, TypeError):
                    warnings.append("Export warnings metadata was invalid")
                continue
            prefix = "addon/apps_config/" if name.startswith("addon/apps_config/") else "addon/apps_data/"
            kind = "config" if "apps_config" in prefix else "data"
            app_name = name[len(prefix):-5]
            try:
                await client.request(
                    "PATCH", f"/api/v1/apps/{quote(app_name, safe='')}/{kind}",
                    json=json.loads(content),
                )
            except (httpx.HTTPError, OSError, ValueError) as error:
                warnings.append(f"App {app_name} {kind}: {type(error).__name__}")
            else:
                applied[f"app_{kind}:{app_name}"] = True
            await asyncio.sleep(_PAUSE)
    finally:
        await client.close()

    wifi_applied = bool(applied.get("wifi")) and not any("wifi" in warning.lower() for warning in warnings)
    return {
        "format": "awtrix-ng",
        "applied": applied,
        "warnings": warnings,
        "requires_reboot": wifi_applied,
    }


async def _restore_legacy(device_host: str, entries: list[tuple[str, bytes]], warnings: list[str]) -> dict:
    files = dict(entries)
    result: dict = {"settings": False, "system": False, "scripts": [], "icons": [],
                    "app_configs": [], "app_data": [], "app_order": False, "melodies": False}
    client = AwtrixClient(device_host)

    async def attempt(label: str, operation):
        try:
            await operation()
            return True
        except (httpx.HTTPError, OSError, ValueError) as error:
            warnings.append(f"{label}: {type(error).__name__}")
            return False

    try:
        for filename, method, path in (("settings.json", "PATCH", "/api/v1/settings"),
                                        ("system.json", "PUT", "/api/v1/system"),
                                        ("apploop.json", "PUT", "/api/v1/apps/order")):
            if filename not in files:
                continue
            payload = json.loads(files[filename])
            label = filename
            try:
                await client.request(method, path, json=payload)
                result[{"settings.json": "settings", "system.json": "system", "apploop.json": "app_order"}[filename]] = True
            except (httpx.HTTPError, OSError) as error:
                warnings.append(f"{label}: {type(error).__name__}")
            await asyncio.sleep(_PAUSE)

        for name, content in entries:
            if name.startswith("scripts/") and name.endswith(".be"):
                app_name = name[len("scripts/"):-3]
                if await attempt(f"Script {app_name}", lambda: client.install_script(app_name, content.decode("utf-8"))):
                    result["scripts"].append(app_name)
            elif name.startswith("icons/"):
                filename = name[len("icons/"):]
                try:
                    await client.upload_file("/ICONS", filename, content)
                except (httpx.HTTPError, OSError) as error:
                    warnings.append(f"Icon {filename}: {type(error).__name__}")
                else:
                    result["icons"].append(filename)
            elif name.startswith("apps_config/") or name.startswith("apps_data/"):
                is_config = name.startswith("apps_config/")
                prefix = "apps_config/" if is_config else "apps_data/"
                app_name = name[len(prefix):-5]
                field = "config" if is_config else "data"
                if await attempt(f"App {app_name} {field}", lambda: client.request(
                    "PATCH", f"/api/v1/apps/{quote(app_name, safe='')}/{field}", json=json.loads(content))):
                    result["app_configs" if is_config else "app_data"].append(app_name)
            elif name == "melodies.json":
                melodies = json.loads(content)
                items = melodies.items() if isinstance(melodies, dict) else []
                for melody_name, melody in items:
                    if await attempt(f"Melody {melody_name}", lambda: client.request(
                        "PUT", f"/api/v1/audio/melodies/{quote(melody_name, safe='')}", json=melody)):
                        result["melodies"] = True
            await asyncio.sleep(_PAUSE)
    finally:
        await client.close()

    result.update(format="awtrix-manager-v1", warnings=warnings, requires_reboot=False)
    return result


async def restore_device(device_host: str, data: bytes) -> dict:
    if not any(item.get("host") == device_host for item in get_devices()):
        raise UnknownDeviceError("AWTRIX device is not configured")
    kind, manifest, entries, warnings = _read_archive(data)
    if kind == "native":
        return await _restore_native(device_host, manifest, entries, warnings)
    return await _restore_legacy(device_host, entries, warnings)
