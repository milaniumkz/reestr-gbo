export const DEVICE_MODEL = 'local-yolox-s-coco-v1';
export type DeviceKind = 'screen' | 'laptop' | 'phone' | 'book';
export type DeviceDetection = { kind:DeviceKind; confidence:number; agreement:number; box:[number,number,number,number] };
export type DeviceEvidence = {model:typeof DEVICE_MODEL; detections:DeviceDetection[]; pageLikeBorder:boolean; authenticityGuaranteed:false};
export function validDeviceEvidence(value:unknown):value is DeviceEvidence {
  if(!value||typeof value!=='object')return false;
  const e=value as DeviceEvidence;
  return e.model===DEVICE_MODEL && e.authenticityGuaranteed===false && typeof e.pageLikeBorder==='boolean' && Array.isArray(e.detections) && e.detections.length<=20 && e.detections.every(d=>{
    if(!d||!['screen','laptop','phone','book'].includes(d.kind)||![d.confidence,d.agreement].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1)||!Array.isArray(d.box)||d.box.length!==4||!d.box.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1))return false;
    const [x,y,w,h]=d.box;return w>0&&h>0&&x+w<=1.00001&&y+h<=1.00001;
  });
}
const names:Record<DeviceKind,string>={screen:'монитор или телевизор',laptop:'ноутбук',phone:'телефон',book:'книга или страница'};
export function deviceDecision(e:DeviceEvidence|undefined):{rejectReason?:string;reasons:string[]} {
  if(!e)return {reasons:['Локальная проверка устройств временно недоступна. Контроль качества должен вручную исключить экран и распечатку']};
  const reasons:string[]=[];
  for(const d of e.detections){
    const [x,y,w,h]=d.box;
    // Refuse only a dominant central device recognized in both original and mirrored views.
    if(d.kind!=='book'&&d.confidence>=.85&&d.agreement>=.75&&w*h>=.18&&x<=.5&&x+w>=.5&&y<=.5&&y+h>=.5){
      return {rejectReason:`В центре снимка распознан ${names[d.kind]}. Сфотографируйте оригинальную бирку непосредственно на баллоне, оставив видимой поверхность баллона вокруг неё. Переснимите без экрана другого устройства`,reasons:[]};
    }
    if(d.kind!=='book')reasons.push(`В кадре возможно присутствует ${names[d.kind]}. Контроль качества: проверьте, не переснята ли бирка с экрана`);
    else if(d.confidence>=.5)reasons.push('В кадре объект, похожий на книгу или страницу. Контроль качества: исключите распечатку бирки');
  }
  if(e.pageLikeBorder)reasons.push('Вокруг изображения светлая прямоугольная рамка, похожая на лист бумаги. Это не доказывает подмену: контроль качества должен проверить оригинал бирки');
  return {reasons:[...new Set(reasons)]};
}
