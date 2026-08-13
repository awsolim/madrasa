export function formatPrice(cents: number | null) {
  if (!cents) {
    return "Free";
  }

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatCurrencyAmount(cents: number | null) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format((cents ?? 0) / 100);
}

export function formatShortDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatFullDate(value: string | null | undefined) {
  if (!value) {
    return "Not synced";
  }
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateOnly(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  // Parse as local midnight rather than UTC midnight so bare YYYY-MM-DD values
  // do not shift back a day in negative-UTC-offset timezones.
  const parsed = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatAgeRange(ageRange: string | null) {
  if (!ageRange) {
    return "All ages";
  }

  const trimmed = ageRange.trim();
  return trimmed.toLowerCase() === "all" ? "All ages" : trimmed;
}

export function formatGender(gender: string | null) {
  if (!gender) {
    return "Brothers & Sisters";
  }

  const trimmed = gender.trim();
  const normalized = trimmed.toLowerCase().replace(/[_-]+/g, " ");
  if (normalized === "all" || normalized === "all genders" || normalized === "all students" || normalized === "mixed") {
    return "Brothers & Sisters";
  }
  if (normalized === "male" || normalized === "boys" || normalized === "brothers" || normalized === "brothers only") {
    return "Brothers Only";
  }
  if (normalized === "female" || normalized === "girls" || normalized === "sisters" || normalized === "sisters only") {
    return "Sisters Only";
  }

  return trimmed;
}

export function formatStudentDetailGender(gender: string | null) {
  if (!gender) {
    return "Not provided";
  }

  const trimmed = gender.trim();
  const normalized = trimmed.toLowerCase().replace(/[_-]+/g, " ");
  if (normalized === "male" || normalized === "boys" || normalized === "brothers" || normalized === "brothers only") {
    return "Brother";
  }
  if (normalized === "female" || normalized === "girls" || normalized === "sisters" || normalized === "sisters only") {
    return "Sister";
  }

  return trimmed;
}
