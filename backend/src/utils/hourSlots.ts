/** Returns droppable ids for the 6am–11pm time axis: ["06:00", "07:00", ... "23:00"] */
export function hourSlots(): string[] {
  // ponytail: 18 slots (6..23), pad to HH:00
  return Array.from({ length: 18 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`)
}
