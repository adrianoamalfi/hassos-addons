import hashlib
import re
from typing import Annotated, Any, Literal
from urllib.parse import quote, urlsplit

import httpx
from fastapi import APIRouter, Body, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, ConfigDict, Field, StrictBool

from backend.services.awtrix_client import AwtrixClient, UnknownDeviceError

router = APIRouter()
ASSET_DIRS = Literal["/ICONS", "/MELODIES", "/PALETTES", "/MP3"]
ASSET_LIMIT = 8 * 1024 * 1024
RELEASE_URL = "https://api.github.com/repos/Blueforcer/awtrix-ng/releases/latest"
FIRMWARE_TARGETS = {
    "tc002": {"awtrix-ng-tc002.awup"},
    "esp32": {"firmware-awtrix-ng.bin"},
    "esp32s3": {"firmware-awtrix-ng-s3-octal.bin", "firmware-awtrix-ng-s3-quad.bin"},
}


def upstream_error(error: httpx.HTTPStatusError) -> HTTPException:
    response = error.response
    try:
        data = response.json()
    except ValueError:
        data = None
    error_body = data.get("error") if isinstance(data, dict) else None
    if isinstance(error_body, dict):
        detail = {key: value for key, value in error_body.items()
                  if key in ("code", "message", "field") and isinstance(value, str)}
    else:
        detail = "AWTRIX rejected the request"
    status = response.status_code if 400 <= response.status_code < 500 else 502
    return HTTPException(status, detail)


async def call(host: str, method: str, path: str, **kwargs) -> httpx.Response:
    try:
        client = AwtrixClient(host)
    except UnknownDeviceError as error:
        raise HTTPException(404, "Unknown AWTRIX device") from error
    try:
        return await client.request(method, path, **kwargs)
    except httpx.HTTPStatusError as error:
        raise upstream_error(error) from error
    except httpx.TimeoutException as error:
        raise HTTPException(504, "AWTRIX did not answer in time") from error
    except (httpx.RequestError, OSError) as error:
        raise HTTPException(502, "AWTRIX could not be reached") from error
    finally:
        await client.close()


async def api(host: str, method: str, path: str, **kwargs):
    response = await call(host, method, f"/api/v1{path}", **kwargs)
    if not response.content:
        return Response(status_code=response.status_code)
    try:
        return response.json()
    except ValueError as error:
        raise HTTPException(502, "AWTRIX returned an invalid JSON response") from error


def entry_name(name: str) -> str:
    if (not name or len(name) > 128 or name in (".", "..") or ".." in name
            or any(char in name for char in ("/", "\\", "\x00", "\r", "\n"))):
        raise HTTPException(422, "Invalid AWTRIX name")
    return quote(name, safe="")


def asset_name(name: str) -> str:
    entry_name(name)
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", name):
        raise HTTPException(422, "Invalid AWTRIX filename")
    return name


async def asset_upload(file: UploadFile) -> tuple[str, bytes]:
    try:
        name = asset_name(file.filename or "")
        data = await file.read(ASSET_LIMIT + 1)
        if not data:
            raise HTTPException(422, "Choose a non-empty file")
        if len(data) > ASSET_LIMIT:
            raise HTTPException(413, "File exceeds 8 MiB")
        return name, data
    finally:
        await file.close()


class SystemPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    ntpServer: str | None = None
    tz: str | None = None
    tzName: str | None = None
    tempOffset: float | None = None
    humOffset: float | None = None
    minBrightness: Annotated[int, Field(ge=0, le=255)] | None = None
    maxBrightness: Annotated[int, Field(ge=0, le=255)] | None = None
    brightnessSmoothing: int | None = None
    lowBatteryThreshold: int | None = None
    rotate: bool | None = None
    swapButtons: bool | None = None
    statsInterval: int | None = None
    tempDecimals: int | None = None
    debugMode: bool | None = None
    scriptingEnabled: bool | None = None
    haDiscovery: bool | None = None


def system_public(data: dict) -> dict:
    hidden = {"wifipass", "mqttpass", "authpass", "mqtlspin", "mqtttlspin"}
    return {key: value for key, value in data.items() if key.lower() not in hidden}


@router.get("/{host}/system")
async def get_system(host: str):
    return system_public(await api(host, "GET", "/system"))


@router.patch("/{host}/system")
async def update_system(host: str, settings: SystemPatch):
    patch = settings.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(422, "Provide at least one system setting")
    current = await api(host, "GET", "/system")
    unsupported = patch.keys() - current.keys()
    if unsupported:
        raise HTTPException(422, {"message": "Unsupported system setting", "field": sorted(unsupported)[0]})
    return system_public(await api(host, "PUT", "/system", json=patch))


@router.get("/{host}/system/wifi-scan")
async def wifi_scan(host: str):
    return await api(host, "GET", "/system/wifi-scan")


@router.get("/{host}/display")
async def get_display(host: str):
    return await api(host, "GET", "/display")


@router.patch("/{host}/display")
async def update_display(host: str, settings: dict):
    return await api(host, "PATCH", "/display", json=settings)


@router.put("/{host}/display/moodlight")
async def set_moodlight(host: str, settings: dict):
    return await api(host, "PUT", "/display/moodlight", json=settings)


@router.delete("/{host}/display/moodlight")
async def clear_moodlight(host: str):
    return await api(host, "DELETE", "/display/moodlight")


class AppOrder(BaseModel):
    order: list[str] | None = None
    disabled: list[str]


@router.get("/{host}/apps/order")
async def app_order(host: str):
    try:
        response = await call(host, "GET", "/apploop.json")
        return response.json()
    except HTTPException as error:
        if error.status_code != 404:
            raise
    except ValueError as error:
        raise HTTPException(502, "AWTRIX returned an invalid app order") from error
    return {"order": [], "disabled": []}


@router.put("/{host}/apps/order")
async def update_app_order(host: str, body: AppOrder):
    for name in [*(body.order or []), *body.disabled]:
        entry_name(name)
    return await api(host, "PUT", "/apps/order", json=body.model_dump(exclude_none=True))


class AppEnabled(BaseModel):
    enabled: StrictBool


@router.put("/{host}/apps/{name}/enabled")
async def enable_app(host: str, name: str, body: AppEnabled):
    return await api(host, "PUT", f"/apps/{entry_name(name)}/enabled", json=body.enabled)


@router.post("/{host}/apps/{direction}")
async def navigate_apps(host: str, direction: Literal["next", "previous"]):
    return await api(host, "POST", f"/apps/{direction}")


@router.get("/{host}/apps/{name}/{kind}")
async def read_app_fields(host: str, name: str, kind: Literal["config", "data"]):
    return await api(host, "GET", f"/apps/{entry_name(name)}/{kind}")


@router.patch("/{host}/apps/{name}/{kind}")
async def update_app_fields(host: str, name: str, kind: Literal["config", "data"], body: dict):
    return await api(host, "PATCH", f"/apps/{entry_name(name)}/{kind}", json=body)


@router.get("/{host}/apps/builtin/{name}/config")
async def read_builtin(host: str, name: str):
    return await api(host, "GET", f"/apps/builtin/{entry_name(name)}/config")


@router.patch("/{host}/apps/builtin/{name}/config")
async def update_builtin(host: str, name: str, body: dict):
    return await api(host, "PATCH", f"/apps/builtin/{entry_name(name)}/config", json=body)


@router.put("/{host}/apps/pushed/{name}")
async def push_app(host: str, name: str, body: dict):
    return await api(host, "PUT", f"/apps/pushed/{entry_name(name)}", json=body)


@router.post("/{host}/notifications")
async def notify(host: str, body: dict):
    return await api(host, "POST", "/notifications", json=body)


@router.delete("/{host}/notifications/{name}")
async def dismiss_notification(host: str, name: str):
    return await api(host, "DELETE", f"/notifications/{entry_name(name)}")


@router.put("/{host}/indicators/{number}")
async def set_indicator(host: str, number: Literal["1", "2", "3"], body: dict):
    return await api(host, "PUT", f"/indicators/{number}", json=body)


@router.delete("/{host}/indicators/{number}")
async def clear_indicator(host: str, number: Literal["1", "2", "3"]):
    return await api(host, "DELETE", f"/indicators/{number}")


@router.get("/{host}/audio")
async def audio_status(host: str):
    return await api(host, "GET", "/audio")


@router.post("/{host}/audio/play")
async def play_sound(host: str, body: Annotated[dict | list | str, Body()]):
    return await api(host, "POST", "/audio/play", json=body)


@router.post("/{host}/audio/stop")
async def stop_sound(host: str, body: dict | None = None):
    return await api(host, "POST", "/audio/stop", json=body or {})


@router.get("/{host}/audio/{collection}")
async def get_audio_collection(host: str, collection: Literal["melodies", "stations", "mp3"]):
    return await api(host, "GET", f"/audio/{collection}")


@router.put("/{host}/audio/melodies/{name}")
async def save_melody(host: str, name: str, body: dict):
    return await api(host, "PUT", f"/audio/melodies/{entry_name(name)}", json=body)


@router.delete("/{host}/audio/{collection}/{name}")
async def remove_audio(host: str, collection: Literal["melodies", "mp3"], name: str):
    return await api(host, "DELETE", f"/audio/{collection}/{entry_name(name)}")


@router.put("/{host}/audio/stations")
async def save_stations(host: str, body: Annotated[dict | list, Body()]):
    return await api(host, "PUT", "/audio/stations", json=body)


@router.post("/{host}/audio/mp3")
async def upload_mp3(host: str, file: Annotated[UploadFile, File()]):
    name, data = await asset_upload(file)
    return await api(host, "POST", "/audio/mp3", files={"file": (name, data, "audio/mpeg")})


@router.post("/{host}/audio/mp3/rename")
async def rename_mp3(host: str, body: dict):
    return await api(host, "POST", "/audio/mp3/rename", json=body)


@router.get("/{host}/files")
async def list_files(host: str, directory: ASSET_DIRS = "/ICONS"):
    return await api(host, "GET", "/files", params={"dir": directory})


@router.get("/{host}/files/content")
async def download_file(host: str, name: str, directory: ASSET_DIRS = "/ICONS"):
    name = asset_name(name)
    response = await call(host, "GET", f"{directory}/{quote(name, safe='')}")
    if len(response.content) > ASSET_LIMIT:
        raise HTTPException(413, "File exceeds 8 MiB")
    extension = name.rsplit(".", 1)[-1].lower()
    media = {"gif": "image/gif", "jpg": "image/jpeg", "jpeg": "image/jpeg", "mp3": "audio/mpeg"}
    content_type = media.get(extension, "application/octet-stream")
    headers = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=30"}
    if content_type == "application/octet-stream":
        headers["Content-Disposition"] = f'attachment; filename="{name}"'
    return Response(response.content, media_type=content_type, headers=headers)


@router.post("/{host}/files")
async def upload_file(host: str, file: Annotated[UploadFile, File()], directory: ASSET_DIRS = "/ICONS"):
    name, data = await asset_upload(file)
    return await api(host, "POST", "/files", params={"dir": directory}, files={"file": (name, data)})


@router.delete("/{host}/files")
async def remove_file(host: str, name: str, directory: ASSET_DIRS = "/ICONS"):
    return await api(host, "DELETE", "/files", params={"path": f"{directory}/{asset_name(name)}"})


@router.post("/{host}/icons/rename")
async def rename_icon(host: str, body: dict[str, str]):
    if set(body) != {"from", "to"}:
        raise HTTPException(422, "Provide both icon names")
    return await api(host, "POST", "/icons/rename", json={key: asset_name(value) for key, value in body.items()})


@router.get("/{host}/icons/origins")
async def icon_origins(host: str):
    return await api(host, "GET", "/icons/origins")


@router.put("/{host}/icons/origins")
async def save_icon_origin(host: str, body: dict):
    return await api(host, "PUT", "/icons/origins", json=body)


@router.delete("/{host}/icons/origins")
async def remove_icon_origin(host: str, name: str):
    return await api(host, "DELETE", "/icons/origins", params={"name": asset_name(name)})


def release_version(value: str) -> tuple[int, int, int] | None:
    match = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)", value)
    return tuple(map(int, match.groups())) if match else None


async def firmware_details(host: str):
    device = await api(host, "GET", "/device")
    current = str(device.get("version", ""))
    image = device.get("updateImage", "")
    target = device.get("boardType") if device.get("boardType") == "tc002" else device.get("soc")
    supported = image in FIRMWARE_TARGETS.get(target, ())
    status = {"supported": supported, "current": current, "latest": None, "image": image,
              "available": False, "release_url": None, "status": device.get("update")}
    if not supported:
        return status, None

    try:
        async with httpx.AsyncClient(timeout=12, trust_env=False) as client:
            response = await client.get(RELEASE_URL, headers={"Accept": "application/vnd.github+json"})
            response.raise_for_status()
            release = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(502, "Official AWTRIX release metadata is unavailable") from error
    tag = str(release.get("tag_name", ""))
    old, new = release_version(current), release_version(tag)
    asset = next((item for item in release.get("assets", []) if item.get("name") == image), None)
    status.update(latest=tag, release_url=f"https://github.com/Blueforcer/awtrix-ng/releases/tag/{tag}" if new else None,
                  available=bool(asset and old and new and new > old and not release.get("prerelease")))
    return status, asset


@router.get("/{host}/firmware")
async def check_firmware(host: str):
    status, _ = await firmware_details(host)
    return status


class FirmwareInstall(BaseModel):
    confirm: Literal[True]
    version: str
    image: str


@router.post("/{host}/firmware/upload")
async def upload_firmware(host: str, firmware: Annotated[UploadFile, File()]):
    name = firmware.filename or "firmware.bin"
    if not name.endswith((".awup", ".bin")):
        raise HTTPException(422, "Firmware file must be .awup or .bin")
    data = await firmware.read(ASSET_LIMIT + 1)
    if len(data) > ASSET_LIMIT:
        raise HTTPException(413, "Firmware file exceeds 8 MiB")
    await firmware.close()
    result = await call(host, "POST", "/update", files={"firmware": (name, data)}, timeout=60)
    return result.json()


@router.post("/{host}/firmware")
async def install_firmware(host: str, body: FirmwareInstall):
    status, asset = await firmware_details(host)
    if not status["supported"]:
        raise HTTPException(422, "Firmware updates are unavailable for this board")
    if not status["available"] or body.version != status["latest"] or body.image != status["image"]:
        raise HTTPException(409, "Refresh the official update details before installing")
    asset_url = f"https://github.com/Blueforcer/awtrix-ng/releases/download/{body.version}/{body.image}"
    digest = str(asset.get("digest", ""))
    expected_size = asset.get("size")
    if (asset.get("browser_download_url") != asset_url or not isinstance(expected_size, int)
            or not 0 < expected_size <= ASSET_LIMIT or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest)):
        raise HTTPException(502, "Official firmware does not have a verifiable size and SHA-256")
    try:
        async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
            response = await client.send(client.build_request("GET", asset_url), stream=True)
            async with response:
                if response.is_redirect:
                    target = urlsplit(response.headers.get("location", ""))
                    if (target.scheme != "https" or target.hostname != "release-assets.githubusercontent.com"
                            or target.username is not None or target.port not in (None, 443)):
                        raise HTTPException(502, "Unexpected official firmware download redirect")
                    await response.aclose()
                    response = await client.send(client.build_request("GET", target.geturl()), stream=True)
                try:
                    response.raise_for_status()
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > expected_size:
                            raise HTTPException(502, "Official firmware exceeds its declared size")
                finally:
                    await response.aclose()
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(502, "Official firmware download failed") from error
    if len(data) != expected_size or "sha256:" + hashlib.sha256(data).hexdigest() != digest:
        raise HTTPException(502, "Official firmware checksum verification failed")
    result = await call(host, "POST", "/update", files={"firmware": (body.image, bytes(data))}, timeout=60)
    return result.json()
