import { useMemo, useState } from "react";
import type { Brand } from "../api";
import { dayKey, formatDay, ItemCard, pad, type Item } from "../ui";

type Mode = "mes" | "semana";

const read = (k: string) => {
	try {
		return localStorage.getItem(k);
	} catch {
		return null;
	}
};

interface Props {
	items: Item[];
	brands: Map<string, Brand>;
	today: string; // YYYY-MM-DD en la zona horaria elegida
	weekStart: "sunday" | "monday";
	onOpen: (postId: string) => void;
	onNew: (dateTime: string) => void;
}

const WD_SUN = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const parseKey = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
const keyOf = (d: Date) => dayKey(d.getFullYear(), d.getMonth(), d.getDate());
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Calendar({ items, brands, today, weekStart, onOpen, onNew }: Props) {
	const [mode, setModeState] = useState<Mode>(() => (read("studio.calmode") === "semana" ? "semana" : "mes"));
	const [anchor, setAnchor] = useState(() => parseKey(today));
	const ws = weekStart === "monday" ? 1 : 0;
	const weekdays = [...WD_SUN.slice(ws), ...WD_SUN.slice(0, ws)];

	const setMode = (m: Mode) => {
		setModeState(m);
		try {
			localStorage.setItem("studio.calmode", m);
		} catch {
			/* sin almacenamiento */
		}
	};

	const byDay = useMemo(() => {
		const map = new Map<string, Item[]>();
		for (const it of items) {
			if (!it.v.publish_at) continue;
			const k = it.v.publish_at.slice(0, 10);
			map.set(k, [...(map.get(k) ?? []), it]);
		}
		for (const list of map.values()) list.sort((a, b) => (a.v.publish_at! < b.v.publish_at! ? -1 : 1));
		return map;
	}, [items]);

	const undated = items.filter((i) => !i.v.publish_at && i.v.status !== "publicada");

	// ----- rango visible -----
	const y = anchor.getFullYear();
	const m = anchor.getMonth();
	const first = new Date(y, m, 1);
	const offset = (first.getDay() - ws + 7) % 7;
	const daysInMonth = new Date(y, m + 1, 0).getDate();
	const cells = Math.ceil((offset + daysInMonth) / 7) * 7;

	const weekFirst = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - ((anchor.getDay() - ws + 7) % 7));
	const weekDays = Array.from({ length: 7 }, (_, i) => new Date(weekFirst.getFullYear(), weekFirst.getMonth(), weekFirst.getDate() + i));
	const weekKeys = weekDays.map(keyOf);

	const title =
		mode === "mes"
			? cap(first.toLocaleDateString("es", { month: "long", year: "numeric" }))
			: `${weekDays[0].toLocaleDateString("es", { day: "numeric", month: "short" })} – ${weekDays[6].toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}`;

	const shift = (dir: number) =>
		setAnchor(mode === "mes" ? new Date(y, m + dir, 1) : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 7 * dir));

	const monthPrefix = `${y}-${pad(m + 1)}`;
	const agendaDays = [...byDay.keys()]
		.filter((k) => (mode === "mes" ? k.startsWith(monthPrefix) : weekKeys.includes(k)))
		.sort();

	// ----- horas de la vista semanal -----
	const hourOf = (it: Item) => Number(it.v.publish_at!.slice(11, 13));
	const weekItems = weekKeys.flatMap((k) => byDay.get(k) ?? []);
	const startHour = Math.min(6, ...weekItems.map(hourOf));
	const hours = Array.from({ length: 24 - startHour }, (_, i) => startHour + i);

	return (
		<section aria-label="Calendario">
			<div className="cal-head">
				<h2 className="cal-title">{title}</h2>
				<div className="cal-nav">
					<div className="seg" role="group" aria-label="Tipo de vista">
						<button className={`seg-btn${mode === "mes" ? " on" : ""}`} aria-pressed={mode === "mes"} onClick={() => setMode("mes")}>
							Mes
						</button>
						<button className={`seg-btn${mode === "semana" ? " on" : ""}`} aria-pressed={mode === "semana"} onClick={() => setMode("semana")}>
							Semana
						</button>
					</div>
					<button className="btn btn-ghost" onClick={() => shift(-1)} aria-label={mode === "mes" ? "Mes anterior" : "Semana anterior"}>
						‹
					</button>
					<button className="btn btn-ghost" onClick={() => setAnchor(parseKey(today))}>
						Hoy
					</button>
					<button className="btn btn-ghost" onClick={() => shift(1)} aria-label={mode === "mes" ? "Mes siguiente" : "Semana siguiente"}>
						›
					</button>
				</div>
			</div>

			{mode === "mes" && (
				<div className="cal-grid" role="grid">
					{weekdays.map((w) => (
						<div key={w} className="cal-wd" role="columnheader">
							{w}
						</div>
					))}
					{Array.from({ length: cells }, (_, i) => {
						const d = i - offset + 1;
						if (d < 1 || d > daysInMonth) return <div key={i} className="cal-cell cal-out" />;
						const key = dayKey(y, m, d);
						const list = byDay.get(key) ?? [];
						return (
							<div key={i} className={`cal-cell${key === today ? " cal-today" : ""}`} role="gridcell">
								<div className="cal-day">
									<span>{d}</span>
									<button className="cal-add" onClick={() => onNew(`${key}T09:00`)} aria-label={`Nueva publicación el ${d}`}>
										+
									</button>
								</div>
								{list.map((it) => (
									<ItemCard key={it.v.id} item={it} brand={brands.get(it.post.brand_id)} onOpen={() => onOpen(it.post.id)} />
								))}
							</div>
						);
					})}
				</div>
			)}

			{mode === "semana" && (
				<div className="week-wrap">
					<div className="week" role="grid">
						<div className="wk-corner" />
						{weekDays.map((d, i) => {
							const k = weekKeys[i];
							return (
								<div key={k} className={`wk-head${k === today ? " wk-today" : ""}`} role="columnheader">
									{weekdays[i]} <strong>{d.getDate()}</strong>
								</div>
							);
						})}
						{hours.map((h) => (
							<div key={h} className="wk-row">
								<div className="wk-hour">{`${pad(h)}:00`}</div>
								{weekKeys.map((k) => {
									const list = (byDay.get(k) ?? []).filter((it) => hourOf(it) === h);
									return (
										<div key={k} className={`wk-cell${k === today ? " wk-today-col" : ""}`} role="gridcell">
											{list.map((it) => (
												<ItemCard key={it.v.id} item={it} brand={brands.get(it.post.brand_id)} onOpen={() => onOpen(it.post.id)} />
											))}
											<button className="wk-add" onClick={() => onNew(`${k}T${pad(h)}:00`)} aria-label={`Nueva publicación el ${formatDay(k)} a las ${pad(h)}:00`}>
												+
											</button>
										</div>
									);
								})}
							</div>
						))}
					</div>
				</div>
			)}

			<div className="agenda">
				{agendaDays.length === 0 && <p className="empty">No hay publicaciones con fecha en este periodo.</p>}
				{agendaDays.map((k) => (
					<div key={k} className="agenda-day">
						<h3>{formatDay(k)}</h3>
						{byDay.get(k)!.map((it) => (
							<ItemCard key={it.v.id} item={it} brand={brands.get(it.post.brand_id)} onOpen={() => onOpen(it.post.id)} />
						))}
					</div>
				))}
			</div>

			{undated.length > 0 && (
				<div className="undated">
					<h3>Sin fecha ({undated.length})</h3>
					<div className="undated-list">
						{undated.map((it) => (
							<ItemCard key={it.v.id} item={it} brand={brands.get(it.post.brand_id)} onOpen={() => onOpen(it.post.id)} />
						))}
					</div>
				</div>
			)}
		</section>
	);
}
