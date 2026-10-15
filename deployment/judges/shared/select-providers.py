#!/usr/bin/env python3
"""Generate a role-specific Compose document; never start the other judge."""
import copy,json,os,pathlib,subprocess,yaml
root=pathlib.Path('/opt/codeskill-judges')
config=root/'config'
role_file=config/'providers'
raw=os.environ.get('CODESKILL_JUDGE_PROVIDERS') or (role_file.read_text() if role_file.exists() else 'judge0,piston')
roles=sorted(set(raw.strip().split(',')))
assert roles and set(roles)<= {'judge0','piston'}
role_file.write_text(','.join(roles)+'\n')
role_file.chmod(0o600)
ip=subprocess.check_output(['hostname','-I'],text=True).split()[0]
doc=copy.deepcopy(yaml.safe_load((root/'compose.yaml').read_text()))
services={'gateway'}
if 'judge0' in roles:services.update(['judge0-api','judge0-worker','judge0-db','judge0-redis'])
if 'piston' in roles:services.add('piston')
doc['services']={name:value for name,value in doc['services'].items() if name in services}
doc['networks']={name:value for name,value in doc['networks'].items() if name in roles or name=='ingress'}
doc['services']['gateway']['networks']=roles+['ingress']
ports={'judge0':2358,'piston':2001}
doc['services']['gateway']['ports']=[f'{ip}:{ports[role]}:{ports[role]}' for role in roles]
if 'judge0' not in roles:doc.pop('volumes',None)
(root/'compose.runtime.json').write_text(json.dumps(doc,indent=2))
(root/'compose.runtime.json').chmod(0o600)
(root/'.env').write_text(f'JUDGE_BIND_IP={ip}\nCOMPOSE_FILE=compose.runtime.json\n')
# Split this known static gateway template into its two provider server blocks.
nginx=(config/'nginx.conf').read_text()
first=nginx.index('  server {')
second=nginx.index('  server {',first+1)
blocks={'judge0':nginx[first:second],'piston':nginx[second:nginx.rfind('}') ]}
(config/'nginx.conf').write_text(nginx[:first]+''.join(blocks[role] for role in roles)+'}\n')
