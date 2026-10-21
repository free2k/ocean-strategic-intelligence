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
import ijson

# A consuming literal prefix lets the regex engine skip long article bodies.
# Only match.start() is used, so boundaries are identical to a lookahead.
BOUNDARY = re.compile(rb',\{"(?:id|sourceId|documentId|name)":')
MAX_BLOCK = 1024 * 1024


class Deferred(Exception):
    """Leave original intact and retry in a later timer run."""


class Budget:
    def __init__(self, seconds=600, rate=8 * 1024**2, min_available=2 * 1024**3):
        self.deadline = time.monotonic() + seconds
        self.rate = rate
        self.min_available = min_available
        self.next_io = time.monotonic()
        self.next_probe = 0

    def check(self, size=0):
        if time.monotonic() >= self.deadline:
            raise Deferred("time budget exhausted")
        memory = Path("/proc/meminfo")
        if memory.exists() and time.monotonic() >= self.next_probe:
            self.next_probe = time.monotonic() + 1
            available = next(int(line.split()[1]) * 1024 for line in
                             memory.read_text().splitlines() if line.startswith("MemAvailable:"))
            if available < self.min_available:
                raise Deferred("less than 2 GiB available memory")
            if os.getloadavg()[0] > max(2, os.cpu_count() or 1):
                raise Deferred("host load above CPU capacity")
            for resource, threshold in (("memory", 5), ("io", 10)):
                pressure = Path("/proc/pressure") / resource
                if pressure.exists():
                    line = pressure.read_text().splitlines()[0]
                    avg10 = float(dict(field.split("=") for field in line.split()[1:])["avg10"])
                    if avg10 >= threshold:
                        raise Deferred(resource + " pressure elevated")
        if size and self.rate:
            now = time.monotonic()
            self.next_io = max(now, self.next_io) + size / self.rate
            time.sleep(max(0, self.next_io - now))


class Reader:
    def __init__(self, stream, guard):
        self.stream, self.guard = stream, guard

    def read(self, size=-1):
        if size < 0:
            raise ValueError("Unbounded reads are forbidden")
        self.guard()
        data = self.stream.read(size)
        self.guard(len(data))
        return data


def stream_blocks(stream):
    """Same split points as blocks(), including delimiters across read boundaries."""
    pending = b""
    while True:
        chunk = stream.read(65536)
        pending += chunk
        while pending:
            match = BOUNDARY.search(pending, 1)
            if match:
                end = min(match.start(), MAX_BLOCK)
            elif len(pending) >= MAX_BLOCK + 64 or not chunk:
                end = min(len(pending), MAX_BLOCK)
            else:
                break
            yield pending[:end]
            pending = pending[end:]
        if not chunk:
            break


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
    def __init__(self, root, guard=None):
        self.root = Path(root)
        self.cache = OrderedDict()
        self.cache_bytes = 0
        self.verified = {}
        self.guard = guard or (lambda size=0: None)

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
        self.guard(stat.st_size)
        with gzip.open(target, "rb") as stream:
            data = stream.read(MAX_BLOCK + 1)
        if len(data) > MAX_BLOCK:
            raise ValueError("Oversized archive block")
        if sha(data) != digest:
            raise ValueError("Archive block checksum mismatch")
        # Small, repeated records dominate file opens. Keep their verified bytes
        # bounded; recheck file identity/timestamps before reuse.
        if len(data) <= 65536:
            while self.cache and self.cache_bytes + len(data) > 8 * 1024**2:
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
        if len(self.verified) > 10000:
            self.verified.clear()
        return size

    def archive(self, source, manifest, baseline=frozenset(), remove=False):
        source, manifest = Path(source), Path(manifest)
        if source.is_symlink() or not source.is_file():
            raise ValueError("Source must be a regular file")
        before = source.stat()
        physical = hashlib.sha256()
        with source.open("rb") as stream:
            reader = Reader(stream, self.guard)
            while chunk := reader.read(65536):
                physical.update(chunk)
        opener = gzip.open if source.suffix == ".gz" else open
        documents, found = 0, False
        # Event parsing never materializes the full snapshot or article collection.
        with opener(source, "rb") as stream:
            for prefix, event, value in ijson.parse(Reader(stream, self.guard)):
                if prefix == "documents" and event == "start_array":
                    if found:
                        raise ValueError("Duplicate documents array")
                    found = True
                if prefix == "documents.item" and event not in ("end_map", "end_array", "map_key"):
                    documents += 1
        if not found:
            raise ValueError("Invalid snapshot schema")
        refs, new_bytes, covered = [], 0, 0
        raw_hash, raw_size = hashlib.sha256(), 0
        with opener(source, "rb") as stream:
            for block in stream_blocks(Reader(stream, self.guard)):
                self.guard()
                raw_hash.update(block)
                raw_size += len(block)
                digest = sha(block)
                target = self.blockpath(digest)
                if not target.exists():
                    packed = gzip.compress(block, compresslevel=1, mtime=0)
                    self.guard(len(packed))
                    atomic(target, packed)
                    new_bytes += len(packed)
                refs.append(digest)
                if digest in baseline:
                    covered += len(block)
        sidecar = Path(str(source) + ".sha256")
        if source.suffix == ".gz" and sidecar.exists() and sidecar.read_text().strip() != raw_hash.hexdigest():
            raise ValueError("Original archive checksum mismatch")
        record = {
            "version": 1, "source": str(source), "sourceBytes": before.st_size,
            "sourcePhysicalSha256": physical.hexdigest(), "rawBytes": raw_size,
            "rawSha256": raw_hash.hexdigest(), "documents": documents,
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
        if size != raw_size:
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
            self.guard()
            source.unlink()
            syncdir(source.parent)
        return {k: v for k, v in record.items() if k != "blocks"}

    def restore(self, manifest, destination):
        record = manifest if isinstance(manifest, dict) else json.loads(Path(manifest).read_bytes())
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

    def artifacts(self, stage, limit):
        """One manifest per inactive job, shared blocks for repeated attachments."""
        stage = Path(stage)
        target = stage / "artifacts.archive.json"
        record = json.loads(target.read_bytes()) if target.exists() else {"version": 1, "files": {}}
        pending, count, freed, added = [], 0, 0, 0

        def flush():
            nonlocal pending
            if not pending:
                return
            atomic(target, json.dumps(record, separators=(",", ":")).encode())
            if json.loads(target.read_bytes()) != record:
                raise ValueError("Artifact manifest persistence mismatch")
            for source, before in pending:
                after = source.stat()
                if (before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns):
                    raise ValueError("Artifact changed during verification")
                source.unlink()
            syncdir(stage)
            pending = []

        for source in stage.iterdir():
            if count >= limit:
                break
            if source.is_symlink() or not source.is_file() or source.suffix not in (".html", ".pdf", ".csv", ".json"):
                continue
            if source.name.startswith("snapshot") or source.name.endswith(".archive.json") or source.name == "task-input.json":
                continue
            self.guard()
            capacity = os.statvfs(stage)
            if capacity.f_bavail * capacity.f_frsize < 5 * 1024**3:
                raise Deferred("less than 5 GiB free disk for artifact archival")
            before, refs, digest, size = source.stat(), [], hashlib.sha256(), 0
            with source.open("rb") as stream:
                reader = Reader(stream, self.guard)
                while block := reader.read(MAX_BLOCK):
                    key = sha(block)
                    dest = self.blockpath(key)
                    if not dest.exists():
                        packed = gzip.compress(block, compresslevel=1, mtime=0)
                        self.guard(len(packed))
                        atomic(dest, packed)
                        added += len(packed)
                    if self.verified_size(key) != len(block):
                        raise ValueError("Artifact block verification failed")
                    refs.append(key)
                    digest.update(block)
                    size += len(block)
            item = {"version": 1, "blocks": refs, "rawBytes": size, "rawSha256": digest.hexdigest()}
            if source.name in record["files"] and record["files"][source.name] != item:
                raise ValueError("Existing artifact archive differs; preserve both for review")
            record["files"][source.name] = item
            pending.append((source, before))
            count += 1
            freed += before.st_size
            if len(pending) >= 20:
                flush()
        flush()
        return {"artifacts": count, "sourceBytes": freed, "newBlockBytes": added, "stage": str(stage)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--baseline")
    parser.add_argument("--jobs")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--keep-latest", type=int, default=3)
    parser.add_argument("--max-seconds", type=int, default=300)
    parser.add_argument("--min-age-hours", type=int, default=24)
    parser.add_argument("--include-verified-gzip", action="store_true")
    parser.add_argument("--restore")
    parser.add_argument("--output")
    parser.add_argument("--artifact-name")
    parser.add_argument("--artifact-limit", type=int, default=20000)
    args = parser.parse_args()
    archive = Archive(args.root, Budget(seconds=args.max_seconds).check)
    if args.restore:
        record = json.loads(Path(args.restore).read_bytes())["files"][args.artifact_name] if args.artifact_name else args.restore
        archive.restore(record, args.output)
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
    files, artifact_stages = [], []
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
        # Only consume attachments after the snapshot itself has a verified,
        # durable restoration manifest. New task-input jobs are never touched.
        if (not (stage / "snapshot.json").exists() and not (stage / "snapshot.json.gz").exists()
                and ((stage / "snapshot.json.archive.json").exists() or (stage / "snapshot.json.gz.archive.json").exists())
                and not (stage / "task-input.json").exists()
                and not any(p.name.endswith(".part") for p in stage.iterdir())):
            artifact_stages.append(stage)
        for name in ("snapshot.json", "snapshot.json.gz"):
            source = stage / name
            if source.is_file() and not source.is_symlink():
                files.append((source.stat().st_mtime, source))
    files.sort(key=lambda x: x[0], reverse=True)
    started, count = time.time(), 0
    remaining = args.artifact_limit
    for stage in artifact_stages:
        if remaining <= 0:
            break
        try:
            result = archive.artifacts(stage, remaining)
        except Deferred as exc:
            print(json.dumps({"status": "deferred", "reason": str(exc), "stage": str(stage)}), flush=True)
            return
        if result["artifacts"]:
            remaining -= result["artifacts"]
            print(json.dumps(result), flush=True)
    # Active/recovering tasks are protected above independently of retention.
    if args.keep_latest < 0:
        raise ValueError("keep-latest must be non-negative")
    for modified, source in reversed(files[args.keep_latest:]):
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
        try:
            result = archive.archive(source, manifest, baseline, remove=True)
        except Deferred as exc:
            print(json.dumps({"status": "deferred", "reason": str(exc),
                              "source": str(source)}), flush=True)
            break
        # The source-side manifest is the durable recovery pointer. Audit output
        # is informational and never used to decide whether a block can be deleted.
        print(json.dumps(result), flush=True)
        count += 1
    print(json.dumps({"completed": count}), flush=True)


if __name__ == "__main__":
    main()
