import { createHash } from 'node:crypto';

export type PassportVehicle = {vin:string;plateNumber:string};
export type PassportAssessment = {accepted:boolean;reason:string;matchedVin:boolean;matchedPlate:boolean};
const aliases:Record<string,string>={А:'A',В:'B',Е:'E',К:'K',М:'M',Н:'H',О:'O',Р:'P',С:'C',Т:'T',У:'Y',Х:'X',І:'I',Ү:'Y'};
export const vehicleCode=(text:string)=>text.toUpperCase().replace(/[АВЕКМНОРСТУХІҮ]/g,c=>aliases[c]).replace(/[^A-Z0-9]/g,'');
export const codeHash=(text:string)=>createHash('sha256').update(vehicleCode(text)).digest('hex');
export function assessPassportText(text:string,vehicle:PassportVehicle,pdf:boolean,back=false,primaryVerified=false):PassportAssessment {
 const normal=text.toLowerCase().replace(/[ә]/g,'а').replace(/[ө]/g,'о').replace(/[қ]/g,'к').replace(/[ғ]/g,'г').replace(/[ұү]/g,'у').replace(/[і]/g,'и').replace(/\s+/g,' ');
 const code=vehicleCode(text),vin=vehicleCode(vehicle.vin),plate=vehicleCode(vehicle.plateNumber);
 const matchedVin=vin.length>=5 && (code.includes(vin) || code.replace(/[OQ]/g,'0').replace(/I/g,'1').includes(vin));
 const correctDigits:Record<string,string>={O:'0',Q:'0',I:'1',L:'1',Z:'2',S:'5',B:'8'};
 const numericPlate=/^\d{3}[A-Z]{2,3}\d{2}$/.test(plate);
 const matchedPlate=plate.length>=5 && (code.includes(plate) || (numericPlate && Array.from({length:Math.max(0,code.length-plate.length+1)},(_,offset)=>code.slice(offset,offset+plate.length)).some(candidate=>[...plate].every((character,index)=>character===candidate[index] || (/\d/.test(character)&&correctDigits[candidate[index]]===character)))));
 const reject=(reason:string):PassportAssessment=>({accepted:false,reason:'Техпаспорт: '+reason,matchedVin,matchedPlate});
 const identifierText=text.toUpperCase().replace(/[АВЕКМНОРСТУХІҮ]/g,c=>aliases[c]);
 const visibleVins=[...identifierText.matchAll(/(?:^|[^A-Z0-9])([A-HJ-NPR-Z0-9]{17})(?=$|[^A-Z0-9])/g)].map(m=>m[1]);
 const visiblePlates=[...identifierText.matchAll(/(?:^|[^A-Z0-9])(\d{3}\s*[A-Z]{2,3}\s*\d{2})(?=$|[^A-Z0-9])/g)].map(m=>vehicleCode(m[1]));
 const title=/свидетельств.{0,120}регистрац.{0,120}транспорт|колик.{0,100}тиркеу.{0,100}куал|registration\s+certificate|vehicle\s+registration|\bсртс\b/.test(normal);
 const fieldGroups=[/\bvin\b|идентификацион|сайкестендиру|шанак|кузов|chassis/,/гос.{0,15}номер|регистрационн.{0,15}номер|тиркеу.{0,15}номир|мемлекеттик.{0,15}номир|registration\s+(?:number|no)/,/марка|модель|маркасы|модели|\bmake\b|\bmodel\b/,/год.{0,12}выпуска|шыгарылган.{0,12}жыл|year/,/цвет|туси|colour|color/,/категори|санат|category/].filter(pattern=>pattern.test(normal)).length;
 if(!vin || !plate) return reject('Сначала заполните VIN и государственный номер автомобиля');
 if(!title && !(back && primaryVerified && fieldGroups>=3)) return reject('Файл не распознан как техпаспорт. Загрузите техпаспорт автомобиля, а не другой документ');
 if(fieldGroups<2) return reject('Не удалось прочитать поля техпаспорта. Загрузите оригинальный PDF или более чёткое фото');
 if(!matchedVin && visibleVins.length) return reject('VIN в документе не совпадает с инспекцией');
 if(!matchedPlate && visiblePlates.length) return reject('Государственный номер в документе не совпадает с инспекцией');
 if(pdf && (!matchedVin || !matchedPlate)) return reject(!matchedVin ? 'VIN в PDF не распознан или не совпадает с инспекцией' : 'Государственный номер в PDF не распознан или не совпадает с инспекцией');
 if(!pdf && !matchedVin && !matchedPlate) return reject('VIN и государственный номер на фото не распознаны или не совпадают с инспекцией');
 // A photo may show one side of a physical card. A complete electronic PDF
 // must match both identifiers; a back photo additionally needs the first side.
 return {accepted:true,reason:pdf?'Содержимое PDF распознано как техпаспорт; VIN и государственный номер совпадают':`Содержимое фото распознано как техпаспорт; ${matchedVin?'VIN совпадает':'VIN на этой стороне не распознан'}; ${matchedPlate?'государственный номер совпадает':'государственный номер на этой стороне не распознан'}`,matchedVin,matchedPlate};
}
export function passportProofMatches(proof:unknown,vehicle:PassportVehicle) {
 const p=proof as Record<string,unknown>|null;
 return !!p && p.kind==='vehicle_registration' && p.status==='content_matched' && p.vinHash===codeHash(vehicle.vin) && p.plateHash===codeHash(vehicle.plateNumber);
}
