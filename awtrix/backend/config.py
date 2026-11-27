import json
from pathlib import Path

DATA_DIR = Path("/data/awtrix")
BACKUP_DIR = DATA_DIR / "backups"
def load_options() -> dict:
    for path in ("/data/options.json", "/data/awtrix/options.json"):
        p = Path(path)
        if p.is_file():
            return json.loads(p.read_text())
    return {"devices": []}


def get_devices() -> list[dict]:
    opts = load_options()
    return opts.get("devices", [])
