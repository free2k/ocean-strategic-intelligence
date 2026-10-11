"""Run on authorized server: python3 deploy-ocean-intelligence.py /tmp/ocean-intel-*.tar.gz.
Only the new module, independent PostgreSQL schema, and one Nginx location change.
"""
import datetime,json,os,pathlib,shutil,subprocess,sys,tarfile,time,urllib.request,urllib.error
P=pathlib.Path
def run(args,env=None):
    r=subprocess.run(args,env=env,text=True,capture_output=True)
    if r.returncode: raise RuntimeError('Command failed: '+args[0]+' (see restricted server logs)')
    return r.stdout
def status(route):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*a,**k):return None
    try:
        r=urllib.request.build_opener(NoRedirect).open(urllib.request.Request('http://127.0.0.1'+route,headers={'Host':'49.233.77.111'}),timeout=15)
        return r.status
    except urllib.error.HTTPError as e:return e.code
archive=P(sys.argv[1]).resolve()
if archive.parent!=P('/tmp') or not archive.name.startswith('ocean-intel-'):raise RuntimeError('Invalid staging archive')
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
root=P('/opt/ocean-intelligence');release=root/'releases'/stamp;release.mkdir(parents=True)
with tarfile.open(archive) as tf:
    for m in tf.getmembers():
        dest=(release/m.name).resolve()
        if not dest.is_relative_to(release.resolve()) or m.issym() or m.islnk():raise RuntimeError('Unsafe archive')
    tf.extractall(release)
os.symlink('/opt/knowledge-base/node_modules',release/'node_modules')
data=root/'data';data.mkdir(exist_ok=True,mode=0o700)
if (data/'snapshot.json').exists():shutil.copy2(data/'snapshot.json',root/('snapshot-before-'+stamp+'.json'))
for f in (release/'seed').iterdir():shutil.copy2(f,data/f.name)
conf=P('/etc/nginx/conf.d/knowledge-base.conf');original=conf.read_text();backup=root/('nginx-before-'+stamp+'.conf');backup.write_text(original)
routes=['/','/api/auth/check','/demo-dashboard/','/live-dashboard/','/haijian-preview/'];before={r:status(r) for r in routes}
env=os.environ.copy();env.update(INTEL_PORT='3101',INTEL_DATA_DIR=str(data),INTEL_BASE_PATH='/ocean-intelligence/',INTEL_ENABLE_AI='false')
current=root/'current';old=os.readlink(current) if current.is_symlink() else None
if current.is_symlink():current.unlink()
os.symlink(release,current)
snippet=P('/etc/nginx/ocean-intelligence/location.conf');snippet.parent.mkdir(exist_ok=True)
snippet.write_text('''location = /ocean-intelligence { return 301 /ocean-intelligence/; }
location /ocean-intelligence/ {
    proxy_pass http://127.0.0.1:3101/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
    client_max_body_size 32k;
}
''')
include='    include /etc/nginx/ocean-intelligence/location.conf;'
try:
    run(['node','--env-file=/opt/knowledge-base/.env',str(current/'intelligence/run.mjs'),'--import'],env)
    if include not in original:
        if original.count('    location / {')!=1:raise RuntimeError('Unexpected Nginx layout')
        conf.write_text(original.replace('    location / {',include+'\n\n    location / {',1))
    run(['nginx','-t'])
    existing=json.loads(run(['pm2','jlist']))
    if any(x['name']=='ocean-intelligence' for x in existing):run(['pm2','restart','ocean-intelligence','--update-env'],env)
    else:run(['pm2','start',str(current/'intelligence/run.mjs'),'--name','ocean-intelligence','--interpreter','node','--node-args=--env-file=/opt/knowledge-base/.env','--cwd',str(current)],env)
    for _ in range(20):
        try:
            h=json.load(urllib.request.urlopen('http://127.0.0.1:3101/api/health',timeout=2))
            if h.get('ok') and h.get('backend')=='postgres':break
        except Exception:time.sleep(.5)
    else:raise RuntimeError('New service failed health check')
    run(['systemctl','reload','nginx']);time.sleep(1)
    after={r:status(r) for r in routes}
    if after!=before:raise RuntimeError('Existing route status changed')
    if status('/ocean-intelligence/')!=200:raise RuntimeError('New route unavailable')
    run(['pm2','save'])
    print(json.dumps({'deployed':True,'url':'http://49.233.77.111/ocean-intelligence/','health':h,'unchanged_routes':after,'backup':str(backup),'release':str(release)}))
except Exception:
    conf.write_text(original);run(['nginx','-t']);run(['systemctl','reload','nginx'])
    if old:
        current.unlink();os.symlink(old,current);run(['pm2','restart','ocean-intelligence'],env)
    else:
        subprocess.run(['pm2','delete','ocean-intelligence'],capture_output=True)
    raise
