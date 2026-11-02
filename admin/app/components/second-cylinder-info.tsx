import type { SecondCylinderFields } from '@/lib/api';
import { Info } from './ui-primitives';
export function SecondCylinderInfo({value}:{value:SecondCylinderFields & {secondCylinderSerial?:string|null}}) {
 const date=(v?:string|null)=>v?new Date(v).toLocaleDateString('ru-RU',{timeZone:'UTC'}):'Не указано';
 return <>
  <Info label="Номер второго баллона" value={value.secondCylinderSerial ?? '-'} />
  <Info label="Производитель второго баллона" value={value.secondCylinderManufacturer ?? '-'} />
  <Info label="Объем второго баллона" value={value.secondCylinderVolumeLiters ? `${value.secondCylinderVolumeLiters} л` : '-'} />
  <Info label="Тип второго баллона" value={value.secondCylinderShape ?? '-'} />
  <Info label="Дата выпуска второго баллона" value={date(value.secondCylinderProducedAt)} />
  <Info label="Дата инспекции второго баллона" value={date(value.secondCylinderInspectedAt)} />
  <Info label="Срок второго баллона" value={date(value.secondCylinderValidUntil)} />
 </>;
}
