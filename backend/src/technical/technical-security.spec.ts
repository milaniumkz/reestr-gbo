import {
  base32,
  decryptSecret,
  encryptSecret,
  permissions,
  strongPassword,
  totp,
  verifyTotp,
} from "./technical-security";
describe("защита технической панели", () => {
  const secret = base32(Buffer.from("12345678901234567890"));
  it("совпадает с RFC 6238 SHA1 на контрольных временах", () => {
    expect(totp(secret, 1)).toBe("287082");
    expect(totp(secret, Math.floor(1111111109000 / 30000))).toBe("081804");
  });
  it("не принимает повтор кода, неверный формат или старый шаг", () => {
    expect(verifyTotp(secret, "287082", -1, 59000)).toBe(1);
    expect(verifyTotp(secret, "287082", 1, 59000)).toBeNull();
    expect(verifyTotp(secret, "0287082", -1, 59000)).toBeNull();
    expect(verifyTotp(secret, "287082", -1, 150000)).toBeNull();
  });
  it("шифрует секрет с проверкой целостности и случайным IV", () => {
    process.env.TECH_PANEL_ENCRYPTION_KEY = "01".repeat(32);
    const first = encryptSecret(secret),
      second = encryptSecret(secret);
    expect(first).not.toBe(second);
    expect(first).not.toContain(secret);
    expect(decryptSecret(first)).toBe(secret);
    const bytes = Buffer.from(first, "base64");
    bytes[15] ^= 1;
    expect(() => decryptSecret(bytes.toString("base64"))).toThrow();
  });
  it("отделяет обычные роли от технических и ограничивает персональные данные", () => {
    expect(permissions("super_admin")).toEqual([]);
    expect(permissions("support")).not.toContain("files.original");
    expect(permissions("engineer")).not.toContain("people.read");
    expect(permissions("viewer", ["fake.permission"])).not.toContain(
      "fake.permission",
    );
  });
  it("не допускает короткий пароль и усечение bcrypt по байтам", () => {
    expect(() => strongPassword("123456")).toThrow();
    expect(() => strongPassword("я".repeat(40))).toThrow();
    expect(() => strongPassword("LongPassword123!")).not.toThrow();
  });
});
