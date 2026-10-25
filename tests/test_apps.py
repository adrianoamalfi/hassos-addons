import argparse
import contextlib
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import apps
import upstream


class AppToolTests(unittest.TestCase):
    def test_changed_app_and_common_files(self):
        catalog = {"duplicati": {}, "termix": {}}
        self.assertEqual(apps.select(catalog, ["termix/Dockerfile"]), ["termix"])
        self.assertEqual(apps.select(catalog, ["scripts/apps.py"]), list(catalog))
        self.assertEqual(apps.select(catalog, [".github/actions/setup-apps/action.yaml"]), list(catalog))
        self.assertEqual(apps.select(catalog, ["README.md"]), [])
        self.assertEqual(apps.select(catalog, ["termix/config.yaml", "duplicati/build.yaml"]), list(catalog))

    def test_discovery_architectures_and_duplicate_slug(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, arch in [("one", "amd64"), ("two", "aarch64")]:
                folder = root / name
                folder.mkdir()
                (folder / "config.yaml").write_text(f'slug: {name}\nversion: "1.0.0"\narch: [{arch}]\n')
                (folder / "Dockerfile").write_text("FROM scratch\n")
            self.assertEqual(apps.discover(root)["two"]["arch"], ["aarch64"])
            (root / "two" / "config.yaml").write_text('slug: one\nversion: "1.0.0"\narch: [aarch64]\n')
            with self.assertRaisesRegex(ValueError, "duplicate slug"):
                apps.discover(root)

    def test_changelog_final_section_and_exact_version(self):
        text = "## 1.1.0\n\n- Current\n\n## 1.0.0\n\n- First release\n"
        self.assertEqual(apps.changelog_section(text, "1.0.0"), "- First release")
        self.assertEqual(apps.changelog_section(text, "1.1.0"), "- Current")
        with self.assertRaises(ValueError):
            apps.changelog_section(text, "1.0")

    def test_push_range_includes_first_app_release(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.run(["git", *args], cwd=root, check=True, text=True,
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip()
            git("init")
            git("config", "user.name", "Tests")
            git("config", "user.email", "tests@example.invalid")
            folder = root / "one"
            folder.mkdir()
            (folder / "config.yaml").write_text('slug: one\nversion: "1.0.0"\narch: [amd64]\n')
            (folder / "Dockerfile").write_text("FROM scratch\n")
            git("add", ".")
            git("commit", "-m", "initial")
            before = git("rev-parse", "HEAD")
            (folder / "config.yaml").write_text('slug: one\nversion: "1.0.1"\narch: [amd64]\n')
            git("add", ".")
            git("commit", "-m", "bump")
            second = root / "two"
            second.mkdir()
            (second / "config.yaml").write_text('slug: two\nversion: "0.1.0"\narch: [aarch64]\n')
            (second / "Dockerfile").write_text("FROM scratch\n")
            git("add", ".")
            git("commit", "-m", "second app")
            output = io.StringIO()
            with patch.object(apps, "ROOT", root), contextlib.redirect_stdout(output):
                apps.selection(argparse.Namespace(base=before, event_file=None, github_output=None))
            result = json.loads(output.getvalue())
            self.assertEqual(result["releases"], ["one", "two"])
            self.assertEqual(result["matrix"]["include"], [
                {"addon": "one", "arch": "amd64"}, {"addon": "two", "arch": "aarch64"}])
            latest = git("rev-parse", "HEAD")
            (folder / "Dockerfile").write_text("FROM scratch\nLABEL changed=yes\n")
            git("add", ".")
            git("commit", "-m", "forgot version")
            with patch.object(apps, "ROOT", root), self.assertRaisesRegex(ValueError, "version bump"):
                apps.selection(argparse.Namespace(base=latest, event_file=None, github_output=None))

    def test_duplicati_release_selects_newest_without_other_channels(self):
        releases = [
            {"tag_name": "v2.4.0.103_canary_2026-10-02"},
            {"tag_name": "v2.4.0.104_canary_2026-10-11"},
            {"tag_name": "v9.0.0.0_stable_2026-10-12"},
            {"tag_name": "v2.4.0.105_canary_2026-10-13", "draft": True},
        ]
        self.assertEqual(upstream.duplicati_release(releases, "canary")["version"], "2.4.0.104")
        self.assertIsNone(upstream.duplicati_release(releases, "beta"))

    def test_scalar_edit_preserves_comments(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "config.yaml"
            file.write_text('# comment\nversion: "1.0.0"\nslug: one\n')
            apps.set_scalar(file, "version", "1.0.1")
            self.assertEqual(file.read_text(), '# comment\nversion: "1.0.1"\nslug: one\n')
            with self.assertRaises(ValueError):
                apps.set_scalar(file, "absent", "1")

    def test_existing_repository_discovers_required_apps(self):
        self.assertTrue({"duplicati", "termix"}.issubset(apps.discover()))


if __name__ == "__main__":
    unittest.main()
