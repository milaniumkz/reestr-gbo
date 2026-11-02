import {assessPassportText,passportProofMatches,codeHash} from './passport-content';
const vehicle={vin:'XTA210990Y1234567',plateNumber:'777AAA02'};
const russian=`СВИДЕТЕЛЬСТВО О РЕГИСТРАЦИИ ТРАНСПОРТНОГО СРЕДСТВА
VIN ${vehicle.vin} Государственный номер 777 ААА 02 Марка модель LADA Год выпуска 2020 Цвет Белый`;
describe('Passport content and vehicle binding',()=>{
 it('matches Russian headings and Cyrillic plate glyphs',()=>expect(assessPassportText(russian,vehicle,true)).toMatchObject({accepted:true,matchedVin:true,matchedPlate:true}));
 it('normalizes OCR glyphs only in numeric plate positions',()=>{expect(assessPassportText(russian.replace('777 ААА 02','777AAAO2').replace('Y1234567','Ү1234567'),vehicle,true).accepted).toBe(true);expect(assessPassportText(russian.replace('777 ААА 02','777AAA08'),vehicle,true).accepted).toBe(false)});
 it('recognizes Kazakh registration headings',()=>expect(assessPassportText(`Көлік құралын тіркеу туралы куәлік VIN ${vehicle.vin} Мемлекеттік нөмір 777AAA02 Маркасы LADA Шығарылған жылы 2020`,vehicle,true).accepted).toBe(true));
 it('rejects an unrelated document even if it lists the right VIN and plate',()=>expect(assessPassportText(`Счёт на оплату VIN ${vehicle.vin} Регистрационный номер 777AAA02 Марка LADA Год 2020`,vehicle,true).accepted).toBe(false));
 it('rejects a passport of another car',()=>expect(assessPassportText(russian.replace(vehicle.vin,'XTA210990Y7654321'),vehicle,true).accepted).toBe(false));
 it('requires both identifiers in an electronic PDF',()=>expect(assessPassportText(russian.replace(vehicle.vin,''),vehicle,true).accepted).toBe(false));
 it('allows one physical side but rejects a visible conflicting VIN',()=>{
  expect(assessPassportText(russian.replace(vehicle.vin,''),vehicle,false)).toMatchObject({accepted:true,matchedVin:false,matchedPlate:true});
  expect(assessPassportText(russian.replace(vehicle.vin,'XTA210990Y7654321'),vehicle,false).accepted).toBe(false);
 });
 it('requires a matching verified front before accepting an unlabelled back',()=>{
  const back=`VIN ${vehicle.vin} Марка LADA Год выпуска 2020 Категория B Цвет Белый`;
  expect(assessPassportText(back,vehicle,false,true,false).accepted).toBe(false);
  expect(assessPassportText(back,vehicle,false,true,true).accepted).toBe(true);
 });
 it('invalidates verification when the vehicle identifiers change',()=>{
  const proof={kind:'vehicle_registration',status:'content_matched',vinHash:codeHash(vehicle.vin),plateHash:codeHash(vehicle.plateNumber)};
  expect(passportProofMatches(proof,vehicle)).toBe(true);
  expect(passportProofMatches(proof,{...vehicle,plateNumber:'999BBB02'})).toBe(false);
 });
});
