import type { Brand, Post, Version } from "./api";
import { NETWORK_LABEL, STATUS_LABEL, type Network, type Status } from "../shared/rules";

export interface Item {
	post: Post;
	v: Version;
}

const SHORT: Record<Network, string> = { instagram: "IG", facebook: "FB", tiktok: "TT", linkedin: "in", youtube: "YT" };

export function StatusChip({ status }: { status: Status | null }) {
	if (!status) return null;
	return <span className={`chip chip-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function NetworkBadge({ network, long }: { network: Network; long?: boolean }) {
	return (
		<span className="net" title={NETWORK_LABEL[network]}>
			{long ? NETWORK_LABEL[network] : SHORT[network]}
		</span>
	);
}

export function BrandDot({ brand }: { brand?: Brand }) {
	return <span className="dot" style={{ background: brand?.color ?? "#999" }} aria-hidden="true" />;
}

export function ItemCard({
	item,
	brand,
	onOpen,
	showStatus = true,
}: {
	item: Item;
	brand?: Brand;
	onOpen: () => void;
	showStatus?: boolean;
}) {
	const { post, v } = item;
	return (
		<button
			className="card"
			style={{ borderLeftColor: brand?.color }}
			onClick={onOpen}
			aria-label={`${post.title}, ${NETWORK_LABEL[v.network]}, ${STATUS_LABEL[v.status]}`}
		>
			<span className="card-top">
				<NetworkBadge network={v.network} />
				{v.publish_at && <span className="card-time">{v.publish_at.slice(11, 16)}</span>}
			</span>
			<span className="card-title">{post.title}</span>
			<span className="card-meta">
				{brand && (
					<span className="card-brand">
						<BrandDot brand={brand} /> {brand.name}
					</span>
				)}
				{showStatus && <StatusChip status={v.status} />}
			</span>
		</button>
	);
}

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria elegida. */
export function todayIn(timeZone: string): string {
	try {
		return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
	} catch {
		return new Date().toISOString().slice(0, 10);
	}
}

export const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function formatDateTime(s: string | null): string {
	if (!s) return "Sin fecha";
	const d = new Date(`${s.slice(0, 10)}T${s.slice(11, 16) || "00:00"}`);
	return d.toLocaleString("es", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function formatDay(key: string): string {
	const d = new Date(`${key}T00:00`);
	const t = d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
	return t.charAt(0).toUpperCase() + t.slice(1);
}
export function formatStamp(utc: string): string {
	const d = new Date(utc.replace(" ", "T") + "Z");
	return d.toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
