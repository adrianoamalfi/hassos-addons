# Third-party notices

AWTRIX Manager's original code is licensed under Apache-2.0; see the repository
root [LICENSE](../LICENSE). The components below remain under their own
licenses. Links lead to the upstream projects and license sources.

## AWTRIX NG compatibility

This add-on communicates with AWTRIX NG using its device API. It does not
include AWTRIX NG firmware or intentionally reuse its source code or artwork.
AWTRIX NG is a separate project by Stephan Mühl (Blueforcer), licensed under
the [PolyForm Noncommercial License 1.0.0](https://github.com/Blueforcer/awtrix-ng/blob/main/LICENSE.md).
See the [AWTRIX NG repository](https://github.com/Blueforcer/awtrix-ng) and its
[third-party notices](https://github.com/Blueforcer/awtrix-ng/blob/main/THIRD-PARTY-NOTICES.md)
for firmware terms and component notices. This reference does not imply
affiliation or endorsement.

## Frontend production dependencies

Versions below are the direct production dependencies pinned by
`frontend/package-lock.json`. Transitive production dependencies are recorded
in that lockfile; their declared SPDX licenses are retained in the package
metadata and remain applicable.

| Component | Version | License |
| --- | --- | --- |
| `@monaco-editor/react` | 4.7.0 | MIT |
| `@radix-ui/react-dialog` | 1.3.1 | MIT |
| `@radix-ui/react-dropdown-menu` | 2.2.1 | MIT |
| `@radix-ui/react-label` | 2.1.17 | MIT |
| `@radix-ui/react-select` | 2.4.1 | MIT |
| `@radix-ui/react-slider` | 1.6.1 | MIT |
| `@radix-ui/react-slot` | 1.5.0 | MIT |
| `@radix-ui/react-switch` | 1.4.1 | MIT |
| `@radix-ui/react-tabs` | 1.2.1 | MIT |
| `@radix-ui/react-toast` | 1.3.1 | MIT |
| `class-variance-authority` | 0.7.1 | Apache-2.0 |
| `clsx` | 2.1.1 | MIT |
| `lucide-react` | 0.469.0 | ISC |
| `react` | 19.3.1 | MIT |
| `react-dom` | 19.3.1 | MIT |
| `react-router-dom` | 7.18.7 | MIT |
| `tailwind-merge` | 2.6.2 | MIT |

The frontend lockfile currently records 70 production packages: 66 MIT, one
Apache-2.0, one dual-licensed `(MPL-2.0 OR Apache-2.0)`, one ISC, and one
0BSD. The dual-licensed package may be used under its Apache-2.0 option.

This source-level inventory is not a complete bundle of the license texts and
copyright notices required by every dependency license. Before publishing a
built add-on image, generate and include a complete notice bundle from the
resolved production dependency tree (including the Python and OS packages).

## Python runtime dependencies

`backend/requirements.txt` declares these direct dependencies. It uses minimum
version constraints rather than a complete lock, so the exact transitive set
can vary between image builds. The table is an initial inventory, not a
complete inventory of the resolved Python dependency tree.

| Component | Declared license | Project |
| --- | --- | --- |
| FastAPI | MIT | [PyPI](https://pypi.org/project/fastapi/) |
| Uvicorn | BSD-3-Clause | [PyPI](https://pypi.org/project/uvicorn/) |
| HTTPX | BSD-3-Clause | [PyPI](https://pypi.org/project/httpx/) |
| Pydantic | MIT | [PyPI](https://pypi.org/project/pydantic/) |
| python-multipart | Apache-2.0 | [PyPI](https://pypi.org/project/python-multipart/) |

The base Home Assistant image and Debian packages (including Python, nginx and
`jq`) have separate notices supplied by their respective projects and
distributions.
