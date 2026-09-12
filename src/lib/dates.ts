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

const WEEKDAY_FULL = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

function ordinal(n: number): string {
	const mod100 = n % 100;
	if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
	switch (n % 10) {
		case 1:
			return `${n}st`;
		case 2:
			return `${n}nd`;
		case 3:
			return `${n}rd`;
		default:
			return `${n}th`;
	}
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
	return WEEKDAY_FULL[(parseISODate(iso).getDay() + 6) % 7] ?? "";
}

export function formatShort(iso: string): string {
	const date = parseISODate(iso);
	return `${MONTH_SHORT[date.getMonth()]} ${ordinal(date.getDate())}`;
}

export function formatMonthDay(iso: string): string {
	const date = parseISODate(iso);
	return `${MONTH_NAMES[date.getMonth()]} ${ordinal(date.getDate())}`;
}

export function weekLabel(dates: string[]): string {
	const first = dates[0];
	const last = dates[dates.length - 1];
	if (!first || !last) return "";
	const firstDate = parseISODate(first);
	const lastDate = parseISODate(last);
	if (firstDate.getMonth() === lastDate.getMonth()) {
		return `${MONTH_NAMES[firstDate.getMonth()]} ${ordinal(firstDate.getDate())} – ${ordinal(lastDate.getDate())}`;
	}
	return `${MONTH_NAMES[firstDate.getMonth()]} ${ordinal(firstDate.getDate())} – ${MONTH_NAMES[lastDate.getMonth()]} ${ordinal(lastDate.getDate())}`;
}

/** Abbreviated-month variant for narrow mobile heroes (single line). */
export function weekLabelShort(dates: string[]): string {
	const first = dates[0];
	const last = dates[dates.length - 1];
	if (!first || !last) return "";
	const firstDate = parseISODate(first);
	const lastDate = parseISODate(last);
	if (firstDate.getMonth() === lastDate.getMonth()) {
		return `${MONTH_SHORT[firstDate.getMonth()]} ${ordinal(firstDate.getDate())} – ${ordinal(lastDate.getDate())}`;
	}
	return `${formatShort(first)} – ${formatShort(last)}`;
}
