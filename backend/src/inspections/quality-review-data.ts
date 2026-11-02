import { SecondCylinderInput } from './cylinder-pair';
export type QualityReviewData = {
 secondCylinder?:SecondCylinderInput|null;
 usesTwoCylinders?:boolean; secondCylinderSerial?:string|null;
 certificateNumber: string; inspectionDate: string;
 owner: {fullName:string;phone?:string;iin?:string;address:string};
 vehicle: {vin:string;plateNumber:string;make:string;model:string;year?:number|null};
 cylinder: {shape?:string;serialNumber:string;manufacturer:string;volumeLiters:number;fuelType:string;reducerName:string;controlUnitName:string;producedAt?:string};
};
