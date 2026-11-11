import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Brand, type Post, type Version } from "../api";
import {
	NETWORKS,
	NETWORK_LABEL,
	STATUSES,
	STATUS_LABEL,
	TRANSITIONS,
	type Network,
	type Status,
} from "../../shared/rules";
import { BrandDot, formatStamp, NetworkBadge, StatusChip } from "../ui";

// Página de creación de publicaciones de cada red. A confirmar: algunas redes
// no permiten abrir el editor con el texto ya cargado, por eso se copia el texto antes.
const NETWORK_URL: Record<Network, string> = {
	instagram: "https://business.facebook.com/latest/composer",
	facebook: "https://business.facebook.com/latest/composer",
	tiktok: "https://www.tiktok.com/tiktokstudio/upload",
	linkedin: "https://www.linkedin.com/feed/",
};

function transitionLabel(from: Status, to: Status): string {
	if (to === "borrador") return from === "idea" ? "Pasar a borrador" : "Volver a borrador";
	if (to === "idea") return "Volver a idea";
	if (to === "en_revision") return from === "cambios_solicitados" ? "Reenviar a revisión" : "Enviar a revisión";
	if (to === "aprobada") return from === "programada" ? "Quitar de programadas" : "Aprobar";
	if (to === "cambios_solicitados") return "Pedir cambios";
	if (to === "programada") return "Ya la programé en la red";
	return "Marcar como publicada";
}
const isForward = (from: Status, to: Status) =>
	to !== "cambios_solicitados" && STATUSES.indexOf(to) > STATUSES.indexOf(from);

interface Props {
	postId: string | null;
	defaultBrandId: string;
	defaultDate?: string;
	brands: Brand[];
	onClose: () => void;
	onChanged: () => void;
	onOpen: (postId: string) => void;
}

export default function PostEditor(props: Props) {
	return (
		<div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
			<div className="sheet" role="dialog" aria-modal="true" aria-label={props.postId ? "Editar publicación" : "Nueva publicación"}>
				{props.postId ? <EditPost {...props} postId={props.postId} /> : <CreatePost {...props} />}
			</div>
		</div>
	);
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
	const ref = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);
	return (
		<div className="sheet-head">
			<h2>{title}</h2>
			<button ref={ref} className="btn btn-ghost" onClick={onClose} aria-label="Cerrar">
				✕
			</button>
		</div>
	);
}

function CreatePost({ defaultBrandId, defaultDate, brands, onClose, onChanged, onOpen }: Props) {
	const firstBrand = brands.find((b) => b.id === defaultBrandId) ?? brands[0];
	const [brandId, setBrandId] = useState(firstBrand?.id ?? "");
	const brand = brands.find((b) => b.id === brandId);
	const [title, setTitle] = useState("");
	const [idea, setIdea] = useState("");
	const [pillar, setPillar] = useState("");
	const [networks, setNetworks] = useState<Network[]>(firstBrand?.networks ?? []);
	const [date, setDate] = useState(defaultDate ? `${defaultDate}T09:00` : "");
	const [err, setErr] = useState("");
	const [busy, setBusy] = useState(false);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setBusy(true);
		setErr("");
		try {
			const p = await api.createPost({ brand_id: brandId, title, idea, pillar, networks, publish_at: date || null });
			onChanged();
			onOpen(p.id);
		} catch (x) {
			setErr((x as Error).message);
			setBusy(false);
		}
	};

	return (
		<form onSubmit={submit}>
			<Header title="Nueva publicación" onClose={onClose} />
			<div className="sheet-body">
				<label className="field">
					<span>Marca</span>
					<select
						value={brandId}
						onChange={(e) => {
							setBrandId(e.target.value);
							setNetworks(brands.find((b) => b.id === e.target.value)?.networks ?? []);
						}}
					>
						{brands.map((b) => (
							<option key={b.id} value={b.id}>
								{b.name}
							</option>
						))}
					</select>
				</label>
				<label className="field">
					<span>Título de la idea</span>
					<input value={title} maxLength={200} required autoFocus onChange={(e) => setTitle(e.target.value)} />
				</label>
				<label className="field">
					<span>Notas de la idea (opcional)</span>
					<textarea rows={3} value={idea} onChange={(e) => setIdea(e.target.value)} />
				</label>
				<label className="field">
					<span>Pilar de contenido (opcional)</span>
					<input value={pillar} maxLength={80} onChange={(e) => setPillar(e.target.value)} placeholder="Ej. Educación" />
				</label>
				<fieldset className="checks">
					<legend>Redes</legend>
					{NETWORKS.map((n) => (
						<label key={n} className="check">
							<input
								type="checkbox"
								checked={networks.includes(n)}
								onChange={(e) => setNetworks(e.target.checked ? [...networks, n] : networks.filter((x) => x !== n))}
							/>
							{NETWORK_LABEL[n]}
						</label>
					))}
				</fieldset>
				<label className="field">
					<span>Fecha y hora tentativa (opcional)</span>
					<input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
				</label>
				{brand && (
					<p className="muted">
						<BrandDot brand={brand} /> Se creará en el espacio de <strong>{brand.name}</strong>.
					</p>
				)}
				{err && (
					<p className="error" role="alert">
						{err}
					</p>
				)}
			</div>
			<div className="sheet-foot">
				<button type="button" className="btn btn-ghost" onClick={onClose}>
					Cancelar
				</button>
				<button className="btn btn-primary" disabled={busy || !title.trim() || networks.length === 0}>
					{busy ? "Creando…" : "Crear idea"}
				</button>
			</div>
		</form>
	);
}

interface Draft {
	copy: string;
	hashtags: string;
	publish_at: string;
}
const draftOf = (v: Version): Draft => ({ copy: v.copy, hashtags: v.hashtags, publish_at: v.publish_at ?? "" });

function EditPost({ postId, brands, onClose, onChanged }: Props & { postId: string }) {
	const [post, setPost] = useState<Post | null>(null);
	const [info, setInfo] = useState({ title: "", idea: "", pillar: "" });
	const [drafts, setDrafts] = useState<Record<string, Draft>>({});
	const [active, setActive] = useState<Network | null>(null);
	const [err, setErr] = useState("");
	const [msg, setMsg] = useState("");
	const [busy, setBusy] = useState(false);
	const [pending, setPending] = useState<Status | null>(null);
	const [note, setNote] = useState("");
	const [url, setUrl] = useState("");

	const apply = useCallback((p: Post) => {
		setPost(p);
		setInfo({ title: p.title, idea: p.idea, pillar: p.pillar });
		setDrafts(Object.fromEntries(p.versions.map((v) => [v.id, draftOf(v)])));
		setActive((a) => (a && p.versions.some((v) => v.network === a) ? a : (p.versions[0]?.network ?? null)));
	}, []);

	useEffect(() => {
		let live = true;
		api
			.post(postId)
			.then((p) => live && apply(p))
			.catch((e: Error) => live && setErr(e.message));
		return () => {
			live = false;
		};
	}, [postId, apply]);

	if (!post) {
		return (
			<>
				<Header title="Publicación" onClose={onClose} />
				<div className="sheet-body">{err ? <p className="error">{err}</p> : <p className="muted">Cargando…</p>}</div>
			</>
		);
	}

	const brand = brands.find((b) => b.id === post.brand_id);
	const v = post.versions.find((x) => x.network === active) ?? null;
	const d = v ? drafts[v.id] : undefined;
	const infoDirty = info.title !== post.title || info.idea !== post.idea || info.pillar !== post.pillar;
	const dirty = !!v && !!d && (d.copy !== v.copy || d.hashtags !== v.hashtags || d.publish_at !== (v.publish_at ?? ""));
	const missing = NETWORKS.filter((n) => !post.versions.some((x) => x.network === n));

	const run = async (fn: () => Promise<void>, ok?: string) => {
		setBusy(true);
		setErr("");
		setMsg("");
		try {
			await fn();
			if (ok) setMsg(ok);
		} catch (x) {
			setErr((x as Error).message);
		} finally {
			setBusy(false);
		}
	};
	const refresh = async () => {
		apply(await api.post(postId));
		onChanged();
	};
	const saveVersion = async () => {
		if (!v || !d || !dirty) return;
		await api.updateVersion(v.id, { copy: d.copy, hashtags: d.hashtags, publish_at: d.publish_at || null });
	};

	const savePost = () =>
		run(async () => {
			await api.updatePost(post.id, info);
			await refresh();
		}, "Idea guardada.");
	const save = () =>
		run(async () => {
			await saveVersion();
			await refresh();
		}, "Cambios guardados.");
	const go = (to: Status) =>
		run(async () => {
			if (!v) return;
			await saveVersion();
			await api.transition(v.id, to, note || undefined, url || undefined);
			setPending(null);
			setNote("");
			setUrl("");
			await refresh();
		});
	const choose = (to: Status) => {
		if (to === "cambios_solicitados" || to === "publicada") setPending(to);
		else void go(to);
	};
	const copyAndOpen = async () => {
		if (!v || !d) return;
		try {
			await navigator.clipboard.writeText([d.copy, d.hashtags].filter(Boolean).join("\n\n"));
			setMsg("Texto copiado. Pégalo en la red para programarla.");
		} catch {
			setMsg("No pude copiar el texto automáticamente; cópialo a mano.");
		}
		window.open(NETWORK_URL[v.network], "_blank", "noopener");
	};
	const remove = () => {
		if (!window.confirm(`¿Eliminar "${post.title}" y todas sus versiones? No se puede deshacer.`)) return;
		void run(async () => {
			await api.deletePost(post.id);
			onChanged();
			onClose();
		});
	};

	return (
		<>
			<Header title="Publicación" onClose={onClose} />
			<div className="sheet-body">
				<div className="sheet-sub">
					{brand && (
						<span>
							<BrandDot brand={brand} /> <strong>{brand.name}</strong>
						</span>
					)}
					<StatusChip status={post.status} />
				</div>

				<label className="field">
					<span>Título de la idea</span>
					<input value={info.title} maxLength={200} onChange={(e) => setInfo({ ...info, title: e.target.value })} />
				</label>
				<label className="field">
					<span>Notas de la idea</span>
					<textarea rows={2} value={info.idea} onChange={(e) => setInfo({ ...info, idea: e.target.value })} />
				</label>
				<label className="field">
					<span>Pilar de contenido</span>
					<input value={info.pillar} maxLength={80} onChange={(e) => setInfo({ ...info, pillar: e.target.value })} />
				</label>
				{infoDirty && (
					<button className="btn btn-secondary" onClick={savePost} disabled={busy || !info.title.trim()}>
						Guardar idea
					</button>
				)}

				<div className="tabs" role="tablist" aria-label="Redes">
					{post.versions.map((x) => (
						<button
							key={x.id}
							role="tab"
							aria-selected={x.network === active}
							className={`tab${x.network === active ? " tab-on" : ""}`}
							onClick={() => {
								setActive(x.network);
								setPending(null);
							}}
						>
							{NETWORK_LABEL[x.network]}
							<span className={`pip pip-${x.status}`} aria-label={STATUS_LABEL[x.status]} />
						</button>
					))}
					{missing.length > 0 && (
						<select
							className="tab-add"
							value=""
							aria-label="Añadir red"
							onChange={(e) => {
								const n = e.target.value as Network;
								if (n) void run(async () => { await api.addNetwork(post.id, n); await refresh(); setActive(n); });
							}}
						>
							<option value="">+ Añadir red</option>
							{missing.map((n) => (
								<option key={n} value={n}>
									{NETWORK_LABEL[n]}
								</option>
							))}
						</select>
					)}
				</div>

				{v && d && (
					<div className="version" role="tabpanel">
						<div className="version-head">
							<NetworkBadge network={v.network} long />
							<StatusChip status={v.status} />
						</div>

						{v.status === "cambios_solicitados" && v.review_note && (
							<div className="note-box" role="note">
								<strong>Cambios solicitados:</strong> {v.review_note}
							</div>
						)}

						<label className="field">
							<span>Texto para {NETWORK_LABEL[v.network]}</span>
							<textarea
								rows={7}
								value={d.copy}
								onChange={(e) => setDrafts({ ...drafts, [v.id]: { ...d, copy: e.target.value } })}
							/>
							<small className="muted">{d.copy.length} caracteres</small>
						</label>
						<label className="field">
							<span>Hashtags</span>
							<input
								value={d.hashtags}
								maxLength={500}
								onChange={(e) => setDrafts({ ...drafts, [v.id]: { ...d, hashtags: e.target.value } })}
							/>
						</label>
						<label className="field">
							<span>Fecha y hora</span>
							<input
								type="datetime-local"
								value={d.publish_at}
								onChange={(e) => setDrafts({ ...drafts, [v.id]: { ...d, publish_at: e.target.value } })}
							/>
						</label>
						{v.status === "aprobada" && (
							<p className="muted">Si cambias el texto de una versión aprobada, vuelve a borrador para revisarla otra vez.</p>
						)}
						{v.published_url && (
							<p>
								<a href={v.published_url} target="_blank" rel="noopener noreferrer">
									Ver publicación en {NETWORK_LABEL[v.network]}
								</a>
							</p>
						)}

						<div className="actions">
							{dirty && (
								<button className="btn btn-secondary" onClick={save} disabled={busy}>
									Guardar cambios
								</button>
							)}
							{TRANSITIONS[v.status].map((to) => (
								<button
									key={to}
									className={`btn ${isForward(v.status, to) ? "btn-primary" : "btn-secondary"}`}
									disabled={busy}
									onClick={() => choose(to)}
								>
									{transitionLabel(v.status, to)}
								</button>
							))}
						</div>

						{pending === "cambios_solicitados" && (
							<div className="inline-prompt">
								<label className="field">
									<span>¿Qué hay que cambiar?</span>
									<textarea rows={3} value={note} autoFocus onChange={(e) => setNote(e.target.value)} />
								</label>
								<button className="btn btn-primary" disabled={busy || !note.trim()} onClick={() => go("cambios_solicitados")}>
									Enviar cambios solicitados
								</button>
								<button className="btn btn-ghost" onClick={() => setPending(null)}>
									Cancelar
								</button>
							</div>
						)}
						{pending === "publicada" && (
							<div className="inline-prompt">
								<label className="field">
									<span>Enlace de la publicación (opcional)</span>
									<input type="url" value={url} placeholder="https://" autoFocus onChange={(e) => setUrl(e.target.value)} />
								</label>
								<button className="btn btn-primary" disabled={busy} onClick={() => go("publicada")}>
									Confirmar publicada
								</button>
								<button className="btn btn-ghost" onClick={() => setPending(null)}>
									Cancelar
								</button>
							</div>
						)}

						<div className="network-tools">
							<button className="btn btn-secondary" onClick={copyAndOpen} disabled={!d.copy.trim()}>
								Copiar texto y abrir {NETWORK_LABEL[v.network]}
							</button>
							<small className="muted">
								La publicación se programa desde la propia red. Aquí solo marcas el avance.
							</small>
						</div>

						{v.history && v.history.length > 0 && (
							<details className="history">
								<summary>Historial ({v.history.length})</summary>
								<ul>
									{v.history.map((h) => (
										<li key={h.id}>
											<span className="muted">{formatStamp(h.at)}</span>{" "}
											{h.from_status ? `${STATUS_LABEL[h.from_status]} → ` : "Creada como "}
											<strong>{STATUS_LABEL[h.to_status]}</strong>
											{h.note ? ` — ${h.note}` : ""}
										</li>
									))}
								</ul>
							</details>
						)}
					</div>
				)}

				<div aria-live="polite">
					{err && (
						<p className="error" role="alert">
							{err}
						</p>
					)}
					{msg && !err && <p className="ok">{msg}</p>}
				</div>
			</div>
			<div className="sheet-foot">
				<button className="btn btn-danger" onClick={remove} disabled={busy}>
					Eliminar
				</button>
				<button className="btn btn-ghost" onClick={onClose}>
					Cerrar
				</button>
			</div>
		</>
	);
}
