import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.config import get_devices
from backend.services.awtrix_client import AwtrixClient
from backend.services import cache

router = APIRouter()


class DeviceStatus(BaseModel):
    host: str
    name: str
    online: bool
    info: dict | None = None


@router.get("", response_model=list[DeviceStatus])
async def list_devices():
    devices = get_devices()
    results = []
    for dev in devices:
        host = dev["host"]
        name = dev.get("name", host)
        client = AwtrixClient(host)
        try:
            info = await client.device_info()
            results.append(DeviceStatus(host=host, name=name, online=True, info=info))
        except Exception:
            results.append(DeviceStatus(host=host, name=name, online=False))
        finally:
            await client.close()
    return results


async def _single_get(host: str, method_name: str):
    """One request per fresh client — ESP32 can't reuse TCP connections."""
    client = AwtrixClient(host)
    try:
        return await getattr(client, method_name)()
    finally:
        await client.close()


@router.get("/{device_host}/all")
async def device_all(device_host: str):
    """Fetch info, apps, settings, screen with one-shot clients and pauses."""
    cached = cache.get(f"all:{device_host}", max_age=15.0)
    if cached is not None:
        return cached
    try:
        info = await _single_get(device_host, "device_info")
        await asyncio.sleep(1.0)
        apps = await _single_get(device_host, "list_apps_indexed")
        await asyncio.sleep(1.0)
        settings = await _single_get(device_host, "get_settings")
        await asyncio.sleep(1.0)
        try:
            screen = await _single_get(device_host, "get_screen")
        except Exception:
            screen = None
        result = {"info": info, "apps": apps, "settings": settings, "screen": screen}
        cache.put(f"all:{device_host}", result)
        cache.put(f"info:{device_host}", info)
        cache.put(f"settings:{device_host}", settings)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=repr(e))


@router.get("/{device_host}/info")
async def device_info(device_host: str):
    cached = cache.get(f"info:{device_host}", max_age=30.0)
    if cached is not None:
        return cached
    client = AwtrixClient(device_host)
    try:
        info = await client.device_info()
        cache.put(f"info:{device_host}", info)
        return info
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await client.close()


@router.get("/{device_host}/screen")
async def device_screen(device_host: str):
    client = AwtrixClient(device_host)
    try:
        return await client.get_screen()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await client.close()


@router.get("/{device_host}/settings")
async def device_settings(device_host: str):
    cached = cache.get(f"settings:{device_host}", max_age=30.0)
    if cached is not None:
        return cached
    client = AwtrixClient(device_host)
    try:
        result = await client.get_settings()
        cache.put(f"settings:{device_host}", result)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await client.close()


class SettingsUpdate(BaseModel):
    settings: dict


@router.patch("/{device_host}/settings")
async def update_settings(device_host: str, body: SettingsUpdate):
    client = AwtrixClient(device_host)
    try:
        await client.set_settings(body.settings)
        cache.invalidate(f"settings:{device_host}")
        cache.invalidate(f"all:{device_host}")
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await client.close()


@router.post("/{device_host}/reboot")
async def reboot_device(device_host: str):
    client = AwtrixClient(device_host)
    try:
        await client.reboot()
        cache.invalidate(device_host)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await client.close()


@router.get("/{device_host}/logs")
async def device_logs(device_host: str, after: int = 0):
    client = AwtrixClient(device_host)
    try:
        data = await client.get_logs(after=after)
        if isinstance(data, dict) and "next" in data:
            return data
        if isinstance(data, list):
            return {"next": len(data), "lines": data}
        return {"next": 0, "lines": []}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await client.close()
