"""Byte-exact, content-addressed archive of inactive job snapshots.

Manifests retain ordered references; immutable gzip blocks are shared by the
database baseline and historical snapshots. No block GC is performed here.
"""
import argparse
from collections import OrderedDict
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time

# A consuming literal prefix lets the regex engine skip long article bodies.
# Only match.start() is used, so boundaries are identical to a lookahead.
BOUNDARY = re.compile(rb',\{"(?:id|sourceId|documentId|name)":')
MAX_BLOCK = 1024 * 1024


def sha(data):
    return hashlib.sha256(data).hexdigest()


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix=".pending-")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
        syncdir(path.parent)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def syncdir(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def blocks(data):
    start = 0
    for match in BOUNDARY.finditer(data):
        end = match.start()
        while start < end:
            stop = min(start + MAX_BLOCK, end)
            yield data[start:stop]
            start = stop
    while start < len(data):
        stop = min(start + MAX_BLOCK, len(data))
        yield data[start:stop]
        start = stop


class Archive:
    def __init__(self, root):
        self.root = Path(root)
        self.cache = OrderedDict()
        self.cache_bytes = 0
        self.verified = {}

    def blockpath(self, digest):
        if not re.fullmatch("[0-9a-f]{64}", digest):
            raise ValueError("Invalid block hash")
        return self.root / "blocks" / digest[:2] / (digest + ".gz")

    def load(self, digest):
        target = self.blockpath(digest)
        stat = target.stat()
        stamp = (stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)
        cached = self.cache.get(digest)
        if cached and cached[0] == stamp:
            self.cache.move_to_end(digest)
            return cached[1]
        if cached:
            self.cache_bytes -= len(self.cache.pop(digest)[1])
        data = gzip.decompress(target.read_bytes())
        if sha(data) != digest:
            raise ValueError("Archive block checksum mismatch")
        # Small, repeated records dominate file opens. Keep their verified bytes
        # bounded; recheck file identity/timestamps before reuse.
        if len(data) <= 65536:
            while self.cache and self.cache_bytes + len(data) > 64 * 1024**2:
                _, old = self.cache.popitem(last=False)
                self.cache_bytes -= len(old[1])
            self.cache[digest] = (stamp, data)
            self.cache_bytes += len(data)
        return data

    def verified_size(self, digest):
        target = self.blockpath(digest)
        stat = target.stat()
        stamp = (stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)
        previous = self.verified.get(digest)
        if previous and previous[0] == stamp:
            return previous[1]
        size = len(self.load(digest))  # verifies decompressed SHA-256
        self.verified[digest] = (stamp, size)
        return size

    def archive(self, source, manifest, baseline=frozenset(), remove=False):
        source, manifest = Path(source), Path(manifest)
        if source.is_symlink() or not source.is_file():
            raise ValueError("Source must be a regular file")
        before = source.stat()
        raw = source.read_bytes()
        physical_hash = sha(raw)
        if source.suffix == ".gz":
            raw = gzip.decompress(raw)
            sidecar = Path(str(source) + ".sha256")
            if sidecar.exists() and sidecar.read_text().strip() != sha(raw):
                raise ValueError("Original archive checksum mismatch")
        # Parsing validates this really is a JSON snapshot before changing files.
        # Do not retain the parsed object: restoration preserves original bytes.
        parsed = json.loads(raw)
        if not isinstance(parsed, dict) or not isinstance(parsed.get("documents"), list):
            raise ValueError("Invalid snapshot schema")
        documents = len(parsed["documents"])
        del parsed
        refs, new_bytes, covered = [], 0, 0
        for block in blocks(raw):
            digest = sha(block)
            target = self.blockpath(digest)
            if not target.exists():
                packed = gzip.compress(block, compresslevel=1, mtime=0)
                atomic(target, packed)
                new_bytes += len(packed)
            refs.append(digest)
            if digest in baseline:
                covered += len(block)
        record = {
            "version": 1, "source": str(source), "sourceBytes": before.st_size,
            "sourcePhysicalSha256": physical_hash, "rawBytes": len(raw),
            "rawSha256": sha(raw), "documents": documents,
            "blocks": refs, "baselineCoveredBytes": covered,
            "newBlockBytes": new_bytes, "archivedAt": time.time(),
        }
        # Each ref was hashed from an exact, ordered partition of raw. Verifying
        # every durable block against that hash proves the concatenation matches
        # raw without decompressing unchanged blocks again for every snapshot.
        # Cache only verified file identities; inode/size/mtime/ctime changes
        # force a new decompression+hash check. restore() always hashes the full
        # reconstructed stream, independently of this migration-time proof.
        size = sum(self.verified_size(ref) for ref in refs)
        if size != len(raw):
            raise ValueError("Full reconstruction mismatch")
        atomic(manifest, json.dumps(record, separators=(",", ":")).encode())
        # Verify the persisted manifest too before discarding the source.
        if json.loads(manifest.read_bytes()) != record:
            raise ValueError("Manifest persistence mismatch")
        after = source.stat()
        if (after.st_ino, after.st_size, after.st_mtime_ns) != (
            before.st_ino, before.st_size, before.st_mtime_ns
        ):
            raise ValueError("Snapshot changed during verification")
        if remove:
            source.unlink()
            syncdir(source.parent)
        return {k: v for k, v in record.items() if k != "blocks"}

    def restore(self, manifest, destination):
        record = json.loads(Path(manifest).read_bytes())
        if record["version"] != 1:
            raise ValueError("Unsupported archive version")
        destination = Path(destination)
        # Never overwrite a live snapshot or another recovery result.
        digest, size = hashlib.sha256(), 0
        try:
            with destination.open("xb") as out:
                for ref in record["blocks"]:
                    data = self.load(ref)
                    digest.update(data)
                    size += len(data)
                    out.write(data)
                out.flush()
                os.fsync(out.fileno())
                if size != record["rawBytes"] or digest.hexdigest() != record["rawSha256"]:
                    raise ValueError("Restoration checksum mismatch")
        except FileExistsError:
            raise
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        syncdir(destination.parent)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--baseline")
    parser.add_argument("--jobs")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--max-seconds", type=int, default=300)
    parser.add_argument("--min-age-hours", type=int, default=24)
    parser.add_argument("--include-verified-gzip", action="store_true")
    parser.add_argument("--restore")
    parser.add_argument("--output")
    args = parser.parse_args()
    archive = Archive(args.root)
    if args.restore:
        archive.restore(args.restore, args.output)
        return
    baseline_file = archive.root / "baseline.json"
    if args.baseline:
        if baseline_file.exists():
            raise ValueError("Baseline is immutable; use the existing one")
        print(json.dumps(archive.archive(args.baseline, baseline_file)), flush=True)
        return
    baseline = set(json.loads(baseline_file.read_bytes())["blocks"])
    jobs = Path(args.jobs).resolve(strict=True)
    protected = set()
    status_file = jobs.parent / "collection-status.json"
    if status_file.exists():
        status = json.loads(status_file.read_bytes())
        if status.get("taskId"):
            protected.add(status["taskId"])
    # Legacy tasks have no journal ID. Their workers identify the stage through
    # INTEL_DATA_DIR; protect those too, even if an operator resumes an old job.
    for environment in Path("/proc").glob("[0-9]*/environ"):
        try:
            entries = environment.read_bytes().split(b"\0")
        except (FileNotFoundError, PermissionError, ProcessLookupError):
            continue
        for entry in entries:
            if entry.startswith(b"INTEL_DATA_DIR="):
                stage = Path(os.fsdecode(entry.split(b"=", 1)[1])).resolve()
                if stage.parent == jobs:
                    protected.add(stage.name)
    files = []
    for stage in jobs.iterdir():
        if not stage.is_dir() or stage.is_symlink() or stage.name in protected:
            continue
        journal = jobs.parent / "research-tasks" / (stage.name + ".json")
        if journal.exists():
            task = json.loads(journal.read_bytes())
            if task.get("status") not in ("published", "partial", "failed"):
                continue
            if task.get("checkpointHash") and task.get("status") == "failed":
                continue
        for name in ("snapshot.json", "snapshot.json.gz"):
            source = stage / name
            if source.is_file() and not source.is_symlink():
                files.append((source.stat().st_mtime, source))
    files.sort(key=lambda x: x[0], reverse=True)
    started, count = time.time(), 0
    # Always protect latest 20; caller can choose a conservative inactivity age.
    for modified, source in reversed(files[20:]):
        if count >= args.limit or time.time() - started >= args.max_seconds:
            break
        verified_gzip = (args.include_verified_gzip and source.suffix == ".gz"
                         and Path(str(source) + ".sha256").is_file())
        if not verified_gzip and time.time() - modified < max(6, args.min_age_hours) * 3600:
            continue
        if any(p.name.endswith(".part") for p in source.parent.iterdir()):
            continue
        stat = os.statvfs(jobs)
        if stat.f_bavail * stat.f_frsize < 5 * 1024**3 + source.stat().st_size * 2:
            break
        manifest = source.parent / (source.name + ".archive.json")
        result = archive.archive(source, manifest, baseline, remove=True)
        # The source-side manifest is the durable recovery pointer. Audit output
        # is informational and never used to decide whether a block can be deleted.
        print(json.dumps(result), flush=True)
        count += 1
    print(json.dumps({"completed": count}), flush=True)


if __name__ == "__main__":
    main()
