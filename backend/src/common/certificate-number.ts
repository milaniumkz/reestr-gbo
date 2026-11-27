/** Preserve meaningful internal punctuation (e.g. 10957-10957.1), but never
 * reserve a different number because of pasted spaces or an edge dot. */
export function normalizeCertificateNumber(value?: string): string {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/[\s\p{Cf}]/gu, '')
    .replace(/^[.\u00b7\u2022\u3002\uff61]+|[.\u00b7\u2022\u3002\uff61]+$/gu, '')
    .toUpperCase();
}
