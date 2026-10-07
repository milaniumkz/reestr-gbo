import type { Organization } from "@/lib/api";

export function accreditationPeriod(organization?: Pick<Organization, "accreditationValidFrom" | "accreditationValidUntil">) {
  if (!organization?.accreditationValidFrom && !organization?.accreditationValidUntil) return "Аттестат аккредитации: срок не указан";
  const date = (value?: string | null) => value ? value.slice(0, 10).split("-").reverse().join(".") : "не указан";
  return `Аттестат аккредитации от ${date(organization?.accreditationValidFrom)} до ${date(organization?.accreditationValidUntil)}`;
}
