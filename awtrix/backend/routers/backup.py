from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import Response

from backend.config import BACKUP_DIR
from backend.services import backup_manager
from backend.services.backup_manager import BackupValidationError, MAX_BACKUP_BYTES

router = APIRouter()


@router.post("/{device_host}/export")
async def export_backup(device_host: str):
    try:
        result = await backup_manager.save_backup(device_host)
        return {"status": "ok", **result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{device_host}/download/{filename}")
async def download_backup(device_host: str, filename: str):
    path = BACKUP_DIR / filename
    if not path.is_file() or not path.name == filename:
        raise HTTPException(status_code=404, detail="Backup not found")
    return Response(
        content=path.read_bytes(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{device_host}/restore")
async def restore_backup(device_host: str, file: UploadFile):
    try:
        data = await file.read(MAX_BACKUP_BYTES + 1)
        if len(data) > MAX_BACKUP_BYTES:
            raise HTTPException(status_code=413, detail="Backup exceeds the 60 MiB limit")
        result = await backup_manager.restore_device(device_host, data)
        return {"status": "ok", "restored": result}
    except HTTPException:
        raise
    except BackupValidationError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await file.close()


@router.get("/list")
async def list_backups():
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(BACKUP_DIR.glob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
    return [{"filename": f.name, "size": f.stat().st_size, "path": str(f)} for f in files]


@router.get("/storage-path")
async def storage_path():
    return {"path": str(BACKUP_DIR)}
