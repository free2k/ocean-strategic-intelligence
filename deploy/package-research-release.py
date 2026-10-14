"""Package code and a pinned, immutable derived archive. Credentials are excluded."""
import argparse, hashlib, io, json, pathlib, tarfile, subprocess, datetime

parser = argparse.ArgumentParser()
parser.add_argument('--archive', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
archive = pathlib.Path(args.archive).resolve()
output = pathlib.Path(args.output).resolve()
head = (archive / 'head.json').read_bytes()
assert json.loads(head).get('releaseId'), 'Missing published archive head'
with tarfile.open(output, 'w:gz') as tf:
    for p in (root / 'intelligence').rglob('*'):
        if p.is_file() and not any(x in p.parts for x in ['node_modules', 'tests', '__pycache__']) and p.suffix in ['.mjs', '.js', '.css', '.html', '.json', '.png', '.sql']:
            tf.add(p, arcname=str(p.relative_to(root)))
    for p in archive.glob('*.json'):
        if p.name.startswith(('snapshot_', 'batch_', 'release_', 'product_', 'registry_')):
            tf.add(p, arcname='research-seed/' + p.name)
    info = tarfile.TarInfo('research-seed/head.json')
    info.size = len(head)
    tf.addfile(info, io.BytesIO(head))
    manifest = json.dumps({'sourceRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(), 'researchReleaseId': json.loads(head)['releaseId'], 'packagedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}).encode()
    info = tarfile.TarInfo('release-manifest.json')
    info.size = len(manifest)
    tf.addfile(info, io.BytesIO(manifest))
print(json.dumps({'archive': str(output), 'head': json.loads(head), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}))
