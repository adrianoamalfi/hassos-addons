import time
from typing import Any

_store: dict[str, tuple[float, Any]] = {}


def get(key: str, max_age: float = 30.0) -> Any | None:
    entry = _store.get(key)
    if entry is None:
        return None
    ts, value = entry
    if time.monotonic() - ts > max_age:
        _store.pop(key, None)
        return None
    return value


def put(key: str, value: Any) -> None:
    _store[key] = (time.monotonic(), value)


def invalidate(prefix: str = "") -> None:
    if not prefix:
        _store.clear()
        return
    for key in [k for k in _store if k.startswith(prefix)]:
        _store.pop(key, None)
