#!/usr/bin/env python3
"""Publish an authorized, evidence-bound case through the existing study APIs.

Run on the deployment host with a prepared JSON containing spec and task requests.
No model call, article edit, migration, or direct research-record fabrication.
"""
import copy
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

payload = json.loads(Path(sys.argv[1]).read_text())
spec, tasks = payload['spec'], payload['tasks']
data_dir = Path(sys.argv[2])
lock_path = data_dir / 'strategy-case-publication.lock'
lock_path.parent.mkdir(parents=True, exist_ok=True)
lock = lock_path.open('a')
fcntl.flock(lock, fcntl.LOCK_EX)
base = 'http://127.0.0.1:3101'
auth = "const c=require('node:crypto');const e=String(Date.now()+600000);process.stdout.write(e+'.'+c.createHmac('sha256',process.env.SITE_PASSWORD).update(e).digest('hex'))"
token = subprocess.check_output(['node', '--env-file=/opt/knowledge-base/.env', '-e', auth], text=True).strip()


def api(route, body=None):
    headers = {'Cookie': 'ocean_auth=' + token, 'Origin': base}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(base + '/api/' + route, data=None if body is None else json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        detail = json.load(error)
        raise RuntimeError(str(error.code) + ': ' + detail.get('message', detail.get('error', 'Request failed'))) from None


published = copy.deepcopy(spec)
published['verifiedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
for source in published['sources']:
    doc = api('document/' + source['documentId'])
    if doc.get('url') != source['url'] or not str(doc.get('publishedAt', '')).startswith(source['publishedAt']):
        raise RuntimeError('Source identity/date differs: ' + source['documentId'])
    content = doc.get('content') or ''
    if not all(fragment in content for fragment in source['requiredFragments']):
        raise RuntimeError('Required source evidence missing: ' + source['documentId'])
    source['contentHash'] = hashlib.sha256(content.encode()).hexdigest()

existing = {}
page = 1
while True:
    listing = api('strategy/studies?page=' + str(page) + '&pageSize=100')
    existing.update({r.get('requestId'): r for r in listing['items']})
    if page * listing['pageSize'] >= listing['total']:
        break
    page += 1

case_dir = data_dir / 'strategy-cases'
case_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
target = case_dir / (spec['id'] + '.json')
previous_case = json.loads(target.read_text()) if target.exists() else None
if previous_case and previous_case.get('revision') != spec.get('revision') and '--upgrade' not in sys.argv:
    raise RuntimeError('Case revision changed; pass --upgrade to preserve and replace the reference card')
previous_tasks = {t['key']: t for t in (previous_case or {}).get('tasks', [])}
records = {}
for task in tasks:
    request = copy.deepcopy(task['request'])
    if task.get('parentKey'):
        parent = records[task['parentKey']]
        request['parentId'], request['studyId'] = parent['id'], parent['studyId']
    elif previous_case and previous_case.get('revision') != spec.get('revision') and task['key'] in previous_tasks:
        parent = api('strategy/studies/' + previous_tasks[task['key']]['versionId'])
        request['parentId'], request['studyId'] = parent['id'], parent['studyId']
    old = existing.get(request['requestId'])
    if old:
        record = api('strategy/studies/' + old['id'])
        for key in ['input', 'scope', 'configuration', 'templateId', 'title']:
            if record.get(key) != request.get(key):
                raise RuntimeError('Existing request differs; publish a new explicit case revision: ' + task['key'])
        if record['method']['id'] != request['method'] or (record.get('parentId') != request.get('parentId') and (previous_case or {}).get('revision') != spec.get('revision')):
            raise RuntimeError('Existing method/lineage differs')
    else:
        confirmation = api('strategy/advice/confirm', {**request, 'confirmation': {'mode': 'manual'}})
        request['methodSelection'] = confirmation['methodSelection']
        readiness = api('strategy/validate', request)
        if not readiness.get('canExecute'):
            raise RuntimeError('Study not executable: ' + task['key'])
        record = api('strategy/studies', request)
        if not record.get('persistence', {}).get('saved'):
            raise RuntimeError('Study not durably saved')
    records[task['key']] = record
    destination = next(t for t in published['tasks'] if t['key'] == task['key'])
    destination['versionId'], destination['studyId'] = record['id'], record['studyId']

# A reference card is only made visible after all real computed versions exist.
case_dir = data_dir / 'strategy-cases'
case_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
target = case_dir / (spec['id'] + '.json')
if target.exists():
    old = json.loads(target.read_text())
    if [t['versionId'] for t in old['tasks']] != [t['versionId'] for t in published['tasks']]:
        if '--upgrade' not in sys.argv:raise RuntimeError('Existing case versions differ; retain the old case for review')
        history=case_dir/'history';history.mkdir(exist_ok=True)
        archived=history/(spec['id']+'-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
        archived.write_bytes(target.read_bytes());archived.chmod(0o600)
temporary = target.with_suffix('.tmp')
temporary.write_text(json.dumps(published, ensure_ascii=False, indent=2))
temporary.chmod(0o600)
os.replace(temporary, target)
qa=api('strategy/cases/' + spec['id']+'/qa-publish',{})['records']
published['qaRecordIds']=[r['id'] for r in qa]
temporary.write_text(json.dumps(published,ensure_ascii=False,indent=2));temporary.chmod(0o600);os.replace(temporary,target)
check = api('strategy/cases/' + spec['id'])
if check['evidenceStatus'] != 'matched' or len(check['tasks']) != len(tasks):
    raise RuntimeError('Published case verification failed')
print(json.dumps({'published': True, 'caseId': spec['id'], 'tasks': [{'key': key, 'versionId': r['id'], 'method': r['method']['id']} for key, r in records.items()], 'evidenceStatus': check['evidenceStatus'], 'qaRecords':len(check['qaRecords'])}, ensure_ascii=False))
