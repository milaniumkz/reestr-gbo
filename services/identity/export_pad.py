"""Offline Apache-2.0 MiniFASNet weight export. Torch is not needed at runtime."""
import sys,json,hashlib,urllib.request
from pathlib import Path
import torch
ROOT=Path(__file__).parent
for item in json.loads((ROOT/'vendor'/'manifest.json').read_text()):
 path=ROOT/item['file']
 if not path.exists():path.write_bytes(urllib.request.urlopen(item['url'],timeout=90).read())
 if hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Invalid upstream weight/source checksum')
sys.path.insert(0,str(ROOT/'vendor'))
from MiniFASNet import MiniFASNetV2,MiniFASNetV1SE
items=[]
for name,build in [('2.7_80x80_MiniFASNetV2',MiniFASNetV2),('4_0_0_80x80_MiniFASNetV1SE',MiniFASNetV1SE)]:
 state=torch.load(ROOT/'vendor'/(name+'.pth'),map_location='cpu',weights_only=True)
 state={key.removeprefix('module.'):value for key,value in state.items()}
 model=build(conv6_kernel=(5,5));model.load_state_dict(state);model.eval()
 path=ROOT/'models'/(name+'.onnx')
 torch.onnx.export(model,torch.zeros(1,3,80,80),str(path),opset_version=11,input_names=['input'],output_names=['logits'],do_constant_folding=True,dynamo=False)
 items.append({'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'source':name+'.pth'})
(ROOT/'models'/'pad-manifest.json').write_text(json.dumps(items,indent=2))
print(json.dumps(items))
