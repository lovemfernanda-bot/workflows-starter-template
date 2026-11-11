import { useCallback, useEffect, useState } from "react";
import { api, type Brand, type Post, type Settings as SettingsT } from "../api";
import { formatStamp } from "../ui";

const ZONES = [
	"America/New_York",
	"America/Chicago",
	"America/Denver",
	"America/Los_Angeles",
	"America/Phoenix",
	"America/Anchorage",
	"Pacific/Honolulu",
	"America/Mexico_City",
	"America/Bogota",
	"America/Lima",
	"America/Santiago",
	"America/Argentina/Buenos_Aires",
	"America/Sao_Paulo",
	"America/Puerto_Rico",
	"Europe/Madrid",
	"Europe/London",
	"UTC",
];

interface Props {
	settings: SettingsT;
	brands: Brand[];
	onSettings: (s: SettingsT) => void;
	onChanged: () => void;
}

export default function Settings({ settings, brands, onSettings, onChanged }: Props) {
	const [trash, setTrash] = useState<Post[] | null>(null);
	const [err, setErr] = useState("");
	const [saved, setSaved] = useState("");
	const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "";
	const zones = ZONES.includes(settings.timezone) ? ZONES : [settings.timezone, ...ZONES];

	const loadTrash = useCallback(async () => {
		try {
			setTrash(await api.trashedPosts());
		} catch (e) {
			setErr((e as Error).message);
		}
	}, []);
	useEffect(() => {
		void loadTrash();
	}, [loadTrash]);

	const save = async (patch: Partial<SettingsT>) => {
		const previous = settings;
		setErr("");
		setSaved("");
		onSettings({ ...settings, ...patch }); // se ve al instante
		try {
			onSettings(await api.saveSettings(patch));
			setSaved("Guardado.");
		} catch (e) {
			onSettings(previous); // si falla, vuelve a como estaba
			setErr((e as Error).message);
		}
	};
	const act = async (fn: () => Promise<unknown>) => {
		setErr("");
		try {
			await fn();
			await loadTrash();
			onChanged();
		} catch (e) {
			setErr((e as Error).message);
		}
	};

	return (
		<section aria-label="Ajustes" className="settings">
			<h2 className="page-title">Ajustes</h2>

			<div className="panel">
				<h3>Fecha y hora</h3>
				<label className="field">
					<span>Zona horaria</span>
					<select value={settings.timezone} onChange={(e) => void save({ timezone: e.target.value })}>
						{zones.map((z) => (
							<option key={z} value={z}>
								{z.replace(/_/g, " ")}
							</option>
						))}
					</select>
				</label>
				<fieldset className="checks">
					<legend>La semana empieza en</legend>
					{(["sunday", "monday"] as const).map((d) => (
						<label key={d} className="check">
							<input type="radio" name="ws" checked={settings.week_start === d} onChange={() => void save({ week_start: d })} />
							{d === "sunday" ? "Domingo" : "Lunes"}
						</label>
					))}
				</fieldset>
				<p className="muted">
					Las horas de las publicaciones se guardan tal como las escribes, en la hora de esta zona. Si cambias la zona horaria, las
					publicaciones existentes no se convierten: conservan la hora que ya tenían.
				</p>
				<div aria-live="polite">{saved && <p className="ok">{saved}</p>}</div>
			</div>

			<div className="panel">
				<h3>Papelera{trash ? ` (${trash.length})` : ""}</h3>
				<p className="muted">Las publicaciones que mueves aquí se pueden restaurar. Al eliminarlas desde aquí se borran para siempre.</p>
				{trash && trash.length === 0 && <p className="empty">La papelera está vacía.</p>}
				{trash?.map((p) => (
					<div key={p.id} className="trash-row">
						<div>
							<strong>{p.title}</strong>
							<div className="muted">
								{brandName(p.brand_id)} · {p.versions.length} {p.versions.length === 1 ? "red" : "redes"}
								{p.deleted_at ? ` · en la papelera desde ${formatStamp(p.deleted_at)}` : ""}
							</div>
						</div>
						<div className="trash-actions">
							<button className="btn btn-secondary" onClick={() => void act(() => api.restorePost(p.id))}>
								Restaurar
							</button>
							<button
								className="btn btn-danger"
								onClick={() => {
									if (window.confirm(`¿Eliminar "${p.title}" para siempre? No se puede deshacer.`)) void act(() => api.deletePostForever(p.id));
								}}
							>
								Eliminar para siempre
							</button>
						</div>
					</div>
				))}
				{err && (
					<p className="error" role="alert">
						{err}
					</p>
				)}
			</div>

			<div className="panel">
				<h3>Respaldo</h3>
				<p className="muted">Descarga una copia de todas tus marcas, publicaciones e historial.</p>
				<a className="btn btn-secondary" href="/api/v1/export" download>
					Descargar respaldo (JSON)
				</a>
			</div>
		</section>
	);
}
