/** Local-timezone date helpers. Dates are ISO `YYYY-MM-DD` strings. */

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const MONTH_SHORT = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

export function toISODate(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseISODate(iso: string): Date {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayISO(): string {
	return toISODate(new Date());
}

export function addDays(iso: string, n: number): string {
	const date = parseISODate(iso);
	date.setDate(date.getDate() + n);
	return toISODate(date);
}

/** Monday (Mon-first weeks) containing the given date. */
export function startOfWeekMonday(iso: string): string {
	const date = parseISODate(iso);
	const mondayOffset = (date.getDay() + 6) % 7;
	date.setDate(date.getDate() - mondayOffset);
	return toISODate(date);
}

/** The 7 dates (Mon–Sun) of the week containing the given date. */
export function weekDates(iso: string): string[] {
	const monday = startOfWeekMonday(iso);
	return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function weekdayLabel(iso: string): string {
	return WEEKDAY_SHORT[(parseISODate(iso).getDay() + 6) % 7] ?? "";
}

export function dayNumber(iso: string): string {
	return String(parseISODate(iso).getDate());
}

export function formatShort(iso: string): string {
	const date = parseISODate(iso);
	return `${MONTH_SHORT[date.getMonth()]} ${date.getDate()}`;
}

export function formatLong(iso: string): string {
	const date = parseISODate(iso);
	return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function weekLabel(dates: string[]): string {
	const first = dates[0];
	const last = dates[dates.length - 1];
	if (!first || !last) return "";
	const firstDate = parseISODate(first);
	const lastDate = parseISODate(last);
	const year = lastDate.getFullYear();
	if (firstDate.getMonth() === lastDate.getMonth()) {
		return `${MONTH_NAMES[firstDate.getMonth()]} ${firstDate.getDate()} – ${lastDate.getDate()}, ${year}`;
	}
	return `${formatShort(first)} – ${formatShort(last)}, ${year}`;
}
