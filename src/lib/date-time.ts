const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
});

export function formatDateTime(value: string): string {
  return dateTimeFormat.format(new Date(value));
}
