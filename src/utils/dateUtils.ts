export function isDateInRange(appointmentDate: Date, maxMonths: number = 2): boolean {
    const today = new Date();
    const maxDate = new Date(today);
    maxDate.setMonth(maxDate.getMonth() + maxMonths);
    return appointmentDate >= today && appointmentDate <= maxDate;
  }