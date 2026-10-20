/** Labels explain the local check; they never certify that a phone was actually used. */
export function photoRejectionReason(reason: unknown) {
  const text = typeof reason === "string" ? reason : "";
  const kinds: [string, string, RegExp][] = [
    [
      "screen_capture",
      "Признаки пересъёмки экрана другого устройства",
      /признаки экрана|фото экрана|пересъ[её]мк/i,
    ],
    [
      "severe_blur",
      "Сильное размытие документа",
      /резкость|документ.*размыт|размыт.*документ/i,
    ],
    [
      "unreadable",
      "На фотографии почти нет различимых деталей",
      /почти нет различимых деталей|пустое изображение/i,
    ],
    [
      "too_small",
      "Изображение слишком маленькое для проверки",
      /маленькое фото|недостаточным разрешением/i,
    ],
    [
      "file_too_large",
      "Превышен допустимый размер файла",
      /максимальный размер файла/i,
    ],
    [
      "photo_required",
      "Вместо фотографии загружен PDF",
      /фотография объекта, а не PDF/i,
    ],
    [
      "animated_image",
      "Вместо отдельного фото загружена анимация",
      /анимированного/i,
    ],
    ["unsupported_format", "Неподдерживаемый формат файла", /Загрузите JPG/i],
    [
      "invalid_image",
      "Не удалось прочитать файл изображения",
      /Не удалось прочитать фотографию/i,
    ],
  ];
  const found = kinds.find(([, , pattern]) => pattern.test(text));
  return {
    code: found?.[0] ?? "other",
    label: found?.[1] ?? "Фотография не прошла проверку",
    reason: text || "Конкретная причина не была сохранена",
    automated: true,
  };
}
export function legacyPhotoRejectionReason(explanation: string) {
  const match =
    /Причина:\s*([\s\S]*?)(?: · Инспекция:| · Обращение:| · Попытка:|$)/.exec(
      explanation,
    );
  return match?.[1]?.trim() ?? "";
}
