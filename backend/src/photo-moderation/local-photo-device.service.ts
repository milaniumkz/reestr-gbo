import {Injectable} from '@nestjs/common';
import {DEVICE_MODEL,DeviceEvidence,validDeviceEvidence} from './local-device-evidence';
@Injectable()
export class LocalPhotoDeviceService {
  readonly model=DEVICE_MODEL;
  async analyze(image:Buffer):Promise<DeviceEvidence|undefined> {
    // Fixed loopback only: photographs can never be routed to an external provider.
    try {
      const r=await fetch('http://127.0.0.1:8093/analyze',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:new Uint8Array(image),signal:AbortSignal.timeout(5000)});
      if(!r.ok)return undefined;
      const data:unknown=await r.json();
      return validDeviceEvidence(data)?data:undefined;
    } catch {return undefined;}
  }
}
