from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from backend.routers import apps, backup, devices, management
from backend.services.awtrix_client import UnknownDeviceError

app = FastAPI(title="AWTRIX Manager", version="0.1.0")

@app.exception_handler(UnknownDeviceError)
async def unknown_device(request: Request, error: UnknownDeviceError):
    return JSONResponse(status_code=404, content={"detail": str(error)})

app.include_router(devices.router, prefix="/devices", tags=["devices"])
app.include_router(apps.router, prefix="/devices/{device_host}/apps", tags=["apps"])
app.include_router(backup.router, prefix="/backup", tags=["backup"])
app.include_router(management.router, prefix="/management", tags=["management"])


@app.get("/health")
async def health():
    return {"status": "ok"}
