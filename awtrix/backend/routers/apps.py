from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.awtrix_client import AwtrixClient

router = APIRouter()


@router.get("")
async def list_apps(device_host: str):
    client = AwtrixClient(device_host)
    try:
        return await client.list_apps_indexed()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await client.close()


@router.get("/{app_name}/source")
async def get_source(device_host: str, app_name: str):
    client = AwtrixClient(device_host)
    try:
        source = await client.get_script(app_name)
        return {"name": app_name, "source": source}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await client.close()


class ScriptUpload(BaseModel):
    source: str


@router.put("/{app_name}")
async def install_script(device_host: str, app_name: str, body: ScriptUpload):
    client = AwtrixClient(device_host)
    try:
        result = await client.install_script(app_name, body.source)
        if result.get("error") is not None:
            raise HTTPException(status_code=422, detail=result["error"])
        return {"status": "ok", "name": app_name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await client.close()


@router.delete("/{app_name}")
async def delete_app(device_host: str, app_name: str):
    client = AwtrixClient(device_host)
    try:
        await client.delete_app(app_name)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await client.close()


@router.post("/{app_name}/show")
async def show_app(device_host: str, app_name: str):
    client = AwtrixClient(device_host)
    try:
        await client.show_app(app_name)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await client.close()


@router.get("/{app_name}/config")
async def get_config(device_host: str, app_name: str):
    client = AwtrixClient(device_host)
    try:
        return await client.get_app_config(app_name)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await client.close()


class ConfigUpdate(BaseModel):
    config: dict


@router.patch("/{app_name}/config")
async def update_config(device_host: str, app_name: str, body: ConfigUpdate):
    client = AwtrixClient(device_host)
    try:
        result = await client.set_app_config(app_name, body.config)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await client.close()


class AppOrder(BaseModel):
    order: list[str]
    disabled: list[str]


@router.put("/order")
async def set_order(device_host: str, body: AppOrder):
    client = AwtrixClient(device_host)
    try:
        await client.set_app_order(body.order, body.disabled)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await client.close()
