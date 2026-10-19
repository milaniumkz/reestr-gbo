import {
  cityComparison,
  explicitCity,
  inspectionCity,
  ownerCityFromAddresses,
  residenceCity,
} from "./city-risk";
describe("география инспекции: проверяемые факты", () => {
  const base = {
    inspectionAddress: "г. Астана, улица Карталы 5",
    lat: null,
    lng: null,
    inspectorResidence: "Алматы",
    ownerAddress: "г. Караганда, ул. Ленина 1",
  };
  it("сравнивает инспектора и владельца независимо", () => {
    const result = cityComparison(base);
    expect(result.inspectorMismatch).toBe(true);
    expect(result.ownerMismatch).toBe(true);
    expect(result.place.approximate).toBe(false);
  });
  it("не объявляет отсутствующий город несовпадением", () => {
    const result = cityComparison({
      ...base,
      inspectorResidence: null,
      ownerAddress: null,
    });
    expect(result.inspectorMismatch).toBe(false);
    expect(result.ownerMismatch).toBe(false);
    expect(result.missingInspector).toBe(true);
    expect(result.missingOwner).toBe(true);
  });
  it("учитывает переименование и казахские названия", () => {
    expect(
      cityComparison({
        ...base,
        inspectionAddress: "г. Нур-Султан, дом 1",
        inspectorResidence: "Астана",
        ownerAddress: "Астана, дом 2",
      }).inspectorMismatch,
    ).toBe(false);
    expect(explicitCity("г. Қарағанды, дом 1")).toBe("Караганда");
  });
  it("не принимает название улицы за город", () => {
    expect(explicitCity("улица Алматы 12")).toBeNull();
    expect(explicitCity("Астана, улица Алматы")).toBe("Астана");
  });
  it("поддерживает явно названные малые города без GPS догадок", () => {
    expect(residenceCity("Экибастуз")).toBe("Экибастуз");
    expect(explicitCity("г. Экибастуз, дом 5")).toBe("Экибастуз");
    expect(residenceCity("https://example.com")).toBeNull();
  });
  it("помечает координатный вывод приблизительным и не угадывает за пределами покрытия", () => {
    expect(inspectionCity(null, 51.17, 71.43)).toMatchObject({
      city: "Астана",
      approximate: true,
    });
    expect(inspectionCity(null, 0, 0).city).toBeNull();
  });
  it.each([
    [100, 71],
    [51, 181],
    ["", 71],
    [NaN, 71],
    [null, 71],
  ])("отклоняет недостоверные координаты %p %p", (lat, lng) => {
    expect(inspectionCity(null, lat, lng)).toMatchObject({
      city: null,
      source: "no_data",
    });
  });
  it("не выбирает произвольного владельца при разных городах", () => {
    expect(
      ownerCityFromAddresses([
        { address: "Алматы, дом 1" },
        { address: "Астана, дом 2" },
      ]),
    ).toEqual({ address: null, ambiguous: true });
  });
});
