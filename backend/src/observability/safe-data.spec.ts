import { safeDetails, safeText } from "./safe-data";
describe("журналы без секретов", () => {
  it("убирает пароли, токены, коды, контакты и параметры ссылок", () => {
    const result = safeText(
      "password=SensitivePassword code=123456 Bearer private-token +77011112233 user@example.kz https://test.kz/reset?token=secret",
    );
    for (const hidden of [
      "SensitivePassword",
      "123456",
      "private-token",
      "77011112233",
      "user@example.kz",
      "token=secret",
    ])
      expect(result).not.toContain(hidden);
  });
  it("не переносит тела документов и неизвестные поля в аудит", () => {
    expect(
      safeDetails({
        status: "approved",
        password: "secret",
        iin: "123456789012",
        documentBody: "private",
        before: { role: "inspector", phone: "+77011112233" },
      }),
    ).toEqual({ status: "approved", before: { role: "inspector" } });
  });
});
