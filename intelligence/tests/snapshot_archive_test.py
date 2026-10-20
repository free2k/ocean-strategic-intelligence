import gzip
import io
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import unittest

spec = importlib.util.spec_from_file_location("archive", Path(__file__).parents[1] / "snapshot_archive.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ArchiveTests(unittest.TestCase):
    def test_expired_budget_defers_before_read(self):
        budget = module.Budget(seconds=-1)
        with self.assertRaises(module.Deferred):
            module.Reader(io.BytesIO(b"not read"), budget.check).read(1)

    def test_stream_boundaries_and_large_unicode(self):
        for padding in (65520, 65530, 65535, 65536, 1048570, 1048580):
            raw = b'{"documents":[{"id":"a","body":"' + b"x" * padding + (
                '海洋🙂'.encode() * 300000) + b'"},{"id":"b"}]}'
            self.assertEqual(list(module.stream_blocks(io.BytesIO(raw))), list(module.blocks(raw)))

    def test_defer_preserves_source_and_resume(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "snapshot.json"
            source.write_bytes(b'{"documents":[{"id":"a"}]}')
            calls = 0
            def guard(size=0):
                nonlocal calls
                calls += 1
                if calls == 8:
                    raise module.Deferred("pressure")
            archive = module.Archive(root / "archive", guard)
            with self.assertRaises(module.Deferred):
                archive.archive(source, root / "manifest", remove=True)
            self.assertTrue(source.exists())
            archive.guard = lambda size=0: None
            archive.archive(source, root / "manifest", remove=True)
            archive.restore(root / "manifest", root / "restored")
            self.assertEqual((root / "restored").read_bytes(), b'{"documents":[{"id":"a"}]}')

    def test_splitpoints_remain_compatible(self):
        raw = json.dumps({"documents": [{"id": str(i), "content": 'x' * 10000 + ',{"id":'}
                                        for i in range(20)]},
                         separators=(",", ":")).encode()
        old = re.compile(rb'(?=,\{"(?:id|sourceId|documentId|name)":)')
        self.assertEqual([m.start() for m in old.finditer(raw)],
                         [m.start() for m in module.BOUNDARY.finditer(raw)])
        self.assertEqual(b"".join(module.blocks(raw)), raw)

    def test_exact_restore_and_shared_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = module.Archive(root / "archive")
            raw = '{"documents":[{"id":"a","content":"中文🙂"},{"id":"b","content":"old"}],"n":1.00}\n'.encode()
            source, manifest = root / "snapshot.json", root / "manifest.json"
            source.write_bytes(raw)
            archive.archive(source, manifest, remove=True)
            self.assertFalse(source.exists())
            archive.restore(manifest, source)
            self.assertEqual(source.read_bytes(), raw)
            second = root / "second.json"
            second.write_bytes(raw)
            result = archive.archive(second, root / "second-manifest.json")
            self.assertEqual(result["newBlockBytes"], 0)
            with self.assertRaises(FileExistsError):
                archive.restore(manifest, source)
            record = json.loads(manifest.read_bytes())
            record["blocks"].reverse()
            manifest.write_text(json.dumps(record))
            with self.assertRaises(ValueError):
                archive.restore(manifest, root / "tampered")
            self.assertFalse((root / "tampered").exists())

    def test_corrupt_archive_preserves_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = module.Archive(root / "archive")
            source = root / "snapshot.json"
            source.write_bytes(b'{"documents":[{"id":"a"}]}')
            archive.archive(source, root / "manifest")
            block = next((root / "archive").rglob("*.gz"))
            block.write_bytes(gzip.compress(b"corrupt"))
            with self.assertRaises(ValueError):
                archive.archive(source, root / "manifest", remove=True)
            self.assertTrue(source.exists())

    def test_gzip_restore_and_invalid_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = module.Archive(root / "archive")
            source = root / "snapshot.json.gz"
            raw = b'{"documents":[],"other":"preserved"}'
            source.write_bytes(gzip.compress(raw))
            archive.archive(source, root / "manifest", remove=True)
            archive.restore(root / "manifest", root / "restored.json")
            self.assertEqual((root / "restored.json").read_bytes(), raw)
            source.write_bytes(b"not-json")
            with self.assertRaises(Exception):
                archive.archive(source, root / "invalid", remove=True)
            self.assertTrue(source.exists())

    def test_cli_protects_active_and_recent_twenty(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = module.Archive(root / "archive")
            baseline = root / "baseline-source.json"
            baseline.write_bytes(b'{"documents":[]}')
            archive.archive(baseline, root / "archive" / "baseline.json")
            jobs = root / "jobs"
            for index in range(23):
                stage = jobs / str(index)
                stage.mkdir(parents=True)
                source = stage / "snapshot.json"
                source.write_bytes(b'{"documents":[],"historical":"keep me"}')
                stamp = time.time() - 3 * 86400 + index
                os.utime(source, (stamp, stamp))
            (root / "collection-status.json").write_text(json.dumps({"taskId": "0"}))
            worker = subprocess.Popen(
                [sys.executable, "-c", "import time; time.sleep(30)"],
                env={**os.environ, "INTEL_DATA_DIR": str(jobs / "1")})
            try:
                subprocess.run([
                    sys.executable, str(Path(__file__).parents[1] / "snapshot_archive.py"),
                    "--root", str(root / "archive"), "--jobs", str(jobs),
                ], check=True, stdout=subprocess.DEVNULL)
            finally:
                worker.terminate()
                worker.wait()
            self.assertTrue((jobs / "0" / "snapshot.json").exists())
            self.assertTrue((jobs / "1" / "snapshot.json").exists())
            # Protection is conservative: active jobs are excluded before the
            # latest-20 set is selected. Only the oldest eligible job is archived.
            self.assertFalse((jobs / "2" / "snapshot.json").exists())
            self.assertTrue((jobs / "3" / "snapshot.json").exists())
            archive.restore(jobs / "2" / "snapshot.json.archive.json", root / "restored")
            self.assertEqual((root / "restored").read_bytes(),
                             b'{"documents":[],"historical":"keep me"}')


if __name__ == "__main__":
    unittest.main()
