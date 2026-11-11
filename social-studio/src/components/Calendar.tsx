import { useMemo, useState } from "react";
import type { Brand } from "../api";
import { dayKey, formatDay, ItemCard, type Item } from "../ui";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

interface Props {
	items: Item[];
	brands: Map<string, Brand>;
	onOpen: (postId: string) => void;
	onNew: (date: string) => void;
}

export default function Calendar({ items, brands, onOpen, onNew }: Props) {
	const today = new Date();
	const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
	const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate());

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

	const first = new Date(cursor.y, cursor.m, 1);
	const offset = (first.getDay() + 6) % 7;
	const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
	const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
	const rawLabel = first.toLocaleDateString("es", { month: "long", year: "numeric" });
	const monthLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

	const shift = (d: number) => {
		const n = new Date(cursor.y, cursor.m + d, 1);
		setCursor({ y: n.getFullYear(), m: n.getMonth() });
	};

	const monthPrefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}`;
	const agendaDays = [...byDay.keys()].filter((k) => k.startsWith(monthPrefix)).sort();

	return (
		<section aria-label="Calendario">
			<div className="cal-head">
				<h2 className="cal-title">{monthLabel}</h2>
				<div className="cal-nav">
					<button className="btn btn-ghost" onClick={() => shift(-1)} aria-label="Mes anterior">
						‹
					</button>
					<button className="btn btn-ghost" onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}>
						Hoy
					</button>
					<button className="btn btn-ghost" onClick={() => shift(1)} aria-label="Mes siguiente">
						›
					</button>
				</div>
			</div>

			<div className="cal-grid" role="grid">
				{WEEKDAYS.map((w) => (
					<div key={w} className="cal-wd" role="columnheader">
						{w}
					</div>
				))}
				{Array.from({ length: cells }, (_, i) => {
					const d = i - offset + 1;
					if (d < 1 || d > daysInMonth) return <div key={i} className="cal-cell cal-out" />;
					const key = dayKey(cursor.y, cursor.m, d);
					const list = byDay.get(key) ?? [];
					return (
						<div key={i} className={`cal-cell${key === todayKey ? " cal-today" : ""}`} role="gridcell">
							<div className="cal-day">
								<span>{d}</span>
								<button className="cal-add" onClick={() => onNew(key)} aria-label={`Nueva publicación el ${d}`}>
									+
								</button>
							</div>
							{list.map((it) => (
								<ItemCard
									key={it.v.id}
									item={it}
									brand={brands.get(it.post.brand_id)}
									onOpen={() => onOpen(it.post.id)}
								/>
							))}
						</div>
					);
				})}
			</div>

			<div className="agenda">
				{agendaDays.length === 0 && <p className="empty">No hay publicaciones con fecha en este mes.</p>}
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
