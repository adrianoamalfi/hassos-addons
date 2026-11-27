import asyncio
from urllib.parse import quote, urlsplit

import httpx

from backend.config import get_devices

TIMEOUT = httpx.Timeout(15.0, connect=5.0)
_MAX_RETRIES = 2
_RETRY_DELAY = 1.0


class UnknownDeviceError(ValueError):
    pass


def path_segment(name: str) -> str:
    if not name or name in (".", "..") or any(char in name for char in ("/", "\\", "\x00")):
        raise ValueError("Invalid AWTRIX resource name")
    return quote(name, safe="")


class AwtrixClient:
    def __init__(self, host: str):
        device = next((device for device in get_devices() if device.get("host") == host), None)
        if device is None:
            raise UnknownDeviceError("AWTRIX device is not configured")
        scheme = "https" if device.get("tls") else "http"
        try:
            url = urlsplit(f"{scheme}://{host}")
            if (not url.hostname or url.username is not None or url.path or url.query or url.fragment
                    or url.port == 0 or host != url.netloc or any(c.isspace() for c in host)):
                raise ValueError
        except ValueError:
            raise UnknownDeviceError("Invalid address for the configured AWTRIX device") from None
        self.base = f"{scheme}://{host}"
        username = device.get("username")
        auth = (username, device.get("password") or "") if username else None
        self._client = httpx.AsyncClient(
            base_url=self.base,
            timeout=TIMEOUT,
            limits=httpx.Limits(max_connections=1, max_keepalive_connections=0),
            headers={"Connection": "close"},
            auth=auth,
            follow_redirects=False,
            trust_env=False,
        )

    async def request(self, method: str, path: str, **kwargs) -> httpx.Response:
        if not path.startswith("/") or path.startswith("//") or "\\" in path:
            raise ValueError("AWTRIX requests require an origin-relative route")
        response = await self._client.request(method, path, **kwargs)
        response.raise_for_status()
        return response

    async def _get(self, path: str, **kwargs) -> httpx.Response:
        for attempt in range(_MAX_RETRIES + 1):
            try:
                return await self.request("GET", f"/api/v1{path}", **kwargs)
            except (httpx.TransportError, OSError):
                if attempt == _MAX_RETRIES:
                    raise
                await asyncio.sleep(_RETRY_DELAY * (attempt + 1))

    async def close(self):
        await self._client.aclose()

    async def device_info(self) -> dict:
        r = await self._get("/device")
        return r.json()

    async def get_capabilities(self) -> dict:
        r = await self._get("/capabilities")
        return r.json()

    async def list_apps(self) -> dict | list:
        r = await self._get("/apps")
        return r.json()

    async def list_apps_indexed(self) -> dict:
        apps = await self.list_apps()
        if isinstance(apps, dict):
            return apps

        indexed = {}
        for index, app in enumerate(apps):
            slot = app.get("slot")
            name = app.get("name")
            key = f"name:{name}" if name else f"index:{index}"
            if slot is not None:
                key = str(slot)
            if key in indexed:
                key = f"index:{index}"
            indexed[key] = app
        return indexed

    async def get_script(self, name: str) -> str:
        r = await self._get(f"/apps/script/{path_segment(name)}")
        return r.text

    async def install_script(self, name: str, source: str) -> dict:
        r = await self.request(
            "PUT", f"/api/v1/apps/script/{path_segment(name)}",
            content=source,
            headers={"Content-Type": "text/plain"},
        )
        return r.json()

    async def delete_app(self, name: str) -> None:
        await self.request("DELETE", f"/api/v1/apps/{path_segment(name)}")

    async def set_app_order(self, order: list[str], disabled: list[str]) -> None:
        await self.request("PUT", "/api/v1/apps/order", json={"order": order, "disabled": disabled})

    async def show_app(self, name: str) -> None:
        await self.request("PUT", "/api/v1/apps/active", json={"name": name, "fast": True})

    async def get_screen(self) -> dict:
        r = await self._get("/display/screen")
        return r.json()

    async def get_settings(self) -> dict:
        r = await self._get("/settings")
        return r.json()

    async def set_settings(self, settings: dict) -> dict:
        r = await self.request("PATCH", "/api/v1/settings", json=settings)
        return r.json()

    async def reboot(self) -> None:
        await self.request("POST", "/api/v1/reboot")

    async def get_logs(self, after: int | None = None) -> dict:
        r = await self._get("/logs", params={"after": after} if after is not None else None)
        return r.json()

    async def list_files(self, directory: str = "/ICONS") -> dict:
        r = await self._get("/files", params={"dir": directory})
        return r.json()

    async def upload_file(self, directory: str, filename: str, data: bytes) -> None:
        await self.request(
            "POST", "/api/v1/files",
            params={"dir": directory},
            files={"file": (filename, data)},
        )

    async def get_app_config(self, name: str) -> dict:
        r = await self._get(f"/apps/{path_segment(name)}/config")
        return r.json()

    async def set_app_config(self, name: str, config: dict) -> dict:
        r = await self.request(
            "PATCH", f"/api/v1/apps/{path_segment(name)}/config",
            json=config,
        )
        return r.json()

    async def ping(self) -> bool:
        try:
            await self.device_info()
            return True
        except (httpx.HTTPError, OSError):
            return False
