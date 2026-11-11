import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Brand, type Post, type Settings as SettingsT } from "./api";
import { NETWORKS, NETWORK_LABEL, STATUSES, STATUS_LABEL, type Network, type Status } from "../shared/rules";
import Calendar from "./components/Calendar";
import Board from "./components/Board";
import Brands from "./components/Brands";
import PostEditor from "./components/PostEditor";
import Settings from "./components/Settings";
import { todayIn, type Item } from "./ui";

type View = "calendario" | "contenido" | "marcas" | "ajustes";
const VIEWS: { id: View; label: string }[] = [
	{ id: "calendario", label: "Calendario" },
	{ id: "contenido", label: "Contenido" },
	{ id: "marcas", label: "Marcas" },
	{ id: "ajustes", label: "Ajustes" },
];

const read = (k: string) => {
	try {
		return localStorage.getItem(k);
	} catch {
		return null;
	}
};
const write = (k: string, v: string) => {
	try {
		localStorage.setItem(k, v);
	} catch {
		/* sin almacenamiento: no pasa nada */
	}
};
const viewFromHash = (): View => {
	const h = location.hash.replace("#/", "");
	return VIEWS.some((v) => v.id === h) ? (h as View) : "calendario";
};

export default function App() {
	const [brands, setBrands] = useState<Brand[]>([]);
	const [posts, setPosts] = useState<Post[]>([]);
	const [settings, setSettings] = useState<SettingsT>({ timezone: "America/New_York", week_start: "sunday" });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [brandId, setBrandId] = useState(() => read("studio.brand") ?? "all");
	const [network, setNetwork] = useState<Network | "all">("all");
	const [status, setStatus] = useState<Status | "all">("all");
	const [view, setViewState] = useState<View>(viewFromHash);
	const [editor, setEditor] = useState<{ postId: string | null; dateTime?: string } | null>(null);

	const setView = (v: View) => {
		location.hash = `/${v}`;
		setViewState(v);
	};
	useEffect(() => {
		const onHash = () => setViewState(viewFromHash());
		window.addEventListener("hashchange", onHash);
		return () => window.removeEventListener("hashchange", onHash);
	}, []);

	const load = useCallback(async () => {
		try {
			const [b, p, s] = await Promise.all([api.brands(), api.posts(), api.settings()]);
			setBrands(b);
			setPosts(p);
			setSettings(s);
			setError("");
			setBrandId((cur) => (cur === "all" || b.some((x) => x.id === cur) ? cur : "all"));
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setLoading(false);
		}
	}, []);
	useEffect(() => {
		void load();
	}, [load]);

	const brandMap = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
	const items: Item[] = useMemo(
		() =>
			posts
				.filter((p) => brandId === "all" || p.brand_id === brandId)
				.flatMap((p) => p.versions.map((v) => ({ post: p, v })))
				.filter((i) => (network === "all" || i.v.network === network) && (status === "all" || i.v.status === status)),
		[posts, brandId, network, status],
	);

	const pickBrand = (id: string) => {
		setBrandId(id);
		write("studio.brand", id);
	};
	const active = brandMap.get(brandId);
	const attention = posts
		.filter((p) => brandId === "all" || p.brand_id === brandId)
		.flatMap((p) => p.versions)
		.filter((v) => v.status === "en_revision" || v.status === "cambios_solicitados").length;

	return (
		<div className="app" style={{ ["--brand" as string]: active?.color ?? "#C62828" }}>
			<header className="top">
				<div className="top-row">
					<a className="logo" href="#/calendario" onClick={() => setView("calendario")}>
						BranCode <em>Social Studio</em>
					</a>
					<nav className="nav-desktop" aria-label="Secciones">
						{VIEWS.map((v) => (
							<button key={v.id} className={`nav-btn${view === v.id ? " on" : ""}`} onClick={() => setView(v.id)}>
								{v.label}
								{v.id === "contenido" && attention > 0 && <span className="badge">{attention}</span>}
							</button>
						))}
					</nav>
					<button
						className="btn btn-primary"
						disabled={brands.length === 0}
						onClick={() => setEditor({ postId: null })}
					>
						<span className="hide-sm">+ Nueva publicación</span>
						<span className="show-sm">+ Nueva</span>
					</button>
				</div>
				<div className="brand-bar" role="tablist" aria-label="Marca">
					<button role="tab" aria-selected={brandId === "all"} className={`pill${brandId === "all" ? " on" : ""}`} onClick={() => pickBrand("all")}>
						Todas las marcas
					</button>
					{brands.map((b) => (
						<button
							key={b.id}
							role="tab"
							aria-selected={brandId === b.id}
							className={`pill${brandId === b.id ? " on" : ""}`}
							style={brandId === b.id ? { borderColor: b.color } : undefined}
							onClick={() => pickBrand(b.id)}
						>
							<span className="dot" style={{ background: b.color }} /> {b.name}
						</button>
					))}
				</div>
			</header>

			<main className="main">
				{error && (
					<div className="error banner" role="alert">
						{error} <button className="btn btn-ghost" onClick={() => void load()}>Reintentar</button>
					</div>
				)}
				{loading && <p className="muted">Cargando tu espacio…</p>}

				{!loading && (view === "calendario" || view === "contenido") && (
					<div className="filters" aria-label="Filtros">
						<label>
							<span className="sr-only">Red social</span>
							<select value={network} onChange={(e) => setNetwork(e.target.value as Network | "all")}>
								<option value="all">Todas las redes</option>
								{NETWORKS.map((n) => (
									<option key={n} value={n}>
										{NETWORK_LABEL[n]}
									</option>
								))}
							</select>
						</label>
						<label>
							<span className="sr-only">Estado</span>
							<select value={status} onChange={(e) => setStatus(e.target.value as Status | "all")}>
								<option value="all">Todos los estados</option>
								{STATUSES.map((s) => (
									<option key={s} value={s}>
										{STATUS_LABEL[s]}
									</option>
								))}
							</select>
						</label>
						{(network !== "all" || status !== "all") && (
							<button className="btn btn-ghost" onClick={() => (setNetwork("all"), setStatus("all"))}>
								Limpiar filtros
							</button>
						)}
					</div>
				)}

				{!loading && view === "calendario" && (
					<Calendar
						items={items}
						brands={brandMap}
						onOpen={(id) => setEditor({ postId: id })}
						onNew={(dateTime) => setEditor({ postId: null, dateTime })}
						today={todayIn(settings.timezone)}
						weekStart={settings.week_start}
					/>
				)}
				{!loading && view === "contenido" && <Board items={items} brands={brandMap} onOpen={(id) => setEditor({ postId: id })} />}
				{!loading && view === "marcas" && <Brands brands={brands} onChanged={() => void load()} />}
				{!loading && view === "ajustes" && (
					<Settings settings={settings} brands={brands} onSettings={setSettings} onChanged={() => void load()} />
				)}

				{!loading && !error && posts.length === 0 && (view === "calendario" || view === "contenido") && (
					<p className="empty">Aún no hay publicaciones. Crea tu primera idea con “+ Nueva publicación”.</p>
				)}
			</main>

			<nav className="nav-mobile" aria-label="Secciones">
				{VIEWS.map((v) => (
					<button key={v.id} className={`nav-btn${view === v.id ? " on" : ""}`} onClick={() => setView(v.id)}>
						{v.label}
					</button>
				))}
			</nav>

			{editor && (
				<PostEditor
					key={editor.postId ?? "new"}
					postId={editor.postId}
					defaultBrandId={brandId}
					defaultDateTime={editor.dateTime}
					timezone={settings.timezone}
					brands={brands}
					onClose={() => setEditor(null)}
					onChanged={() => void load()}
					onOpen={(id) => setEditor({ postId: id })}
				/>
			)}
		</div>
	);
}
