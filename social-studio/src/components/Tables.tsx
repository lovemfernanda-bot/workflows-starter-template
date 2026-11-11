import { useCallback, useEffect, useState } from "react";
import { api, type Brand, type TableSummary } from "../api";
import TableView from "./TableView";

const read = (k: string) => {
	try {
		return localStorage.getItem(k);
	} catch {
		return null;
	}
};

export default function Tables({ brands, brandId }: { brands: Brand[]; brandId: string }) {
	const [list, setList] = useState<TableSummary[] | null>(null);
	const [selected, setSelected] = useState<string | null>(() => read("studio.table"));
	const [err, setErr] = useState("");
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);

	const reload = useCallback(async () => {
		try {
			setList(await api.tables());
			setErr("");
		} catch (e) {
			setErr((e as Error).message);
		}
	}, []);
	useEffect(() => {
		void reload();
	}, [reload]);

	const pick = (id: string | null) => {
		setSelected(id);
		try {
			if (id) localStorage.setItem("studio.table", id);
		} catch {
			/* sin almacenamiento */
		}
	};

	const brandOf = (id: string | null) => brands.find((b) => b.id === id);
	const visible = (list ?? []).filter((t) => brandId === "all" || t.brand_id === brandId || t.brand_id === null);
	const current = visible.find((t) => t.id === selected) ?? visible[0] ?? null;

	const create = async (e: React.FormEvent) => {
		e.preventDefault();
		setBusy(true);
		try {
			const t = await api.createTable({ name, brand_id: brandId === "all" ? null : brandId });
			await reload();
			pick(t.id);
			setCreating(false);
			setName("");
			setErr("");
		} catch (x) {
			setErr((x as Error).message);
		} finally {
			setBusy(false);
		}
	};

	if (!list) return err ? <p className="error" role="alert">{err}</p> : <p className="muted">Cargando tablas…</p>;

	return (
		<section aria-label="Tablas" className="tables">
			<div className="tables-head">
				<h2 className="page-title">Tablas</h2>
				{!creating && (
					<button className="btn btn-primary" onClick={() => setCreating(true)}>
						+ Nueva tabla
					</button>
				)}
			</div>
			<p className="muted">Crea tus propias tablas y agrega las columnas que necesites: texto, números, estados, fechas, casillas y más.</p>

			{creating && (
				<form className="panel create-table" onSubmit={create}>
					<label className="field">
						<span>
							Nombre de la tabla
							{brandId !== "all" && <> · se creará en {brandOf(brandId)?.name}</>}
						</span>
						<input value={name} maxLength={80} required autoFocus placeholder="Ej. Banco de ideas" onChange={(e) => setName(e.target.value)} />
					</label>
					<div className="dialog-foot">
						<button type="button" className="btn btn-ghost" onClick={() => (setCreating(false), setName(""))}>
							Cancelar
						</button>
						<button className="btn btn-primary" disabled={busy || !name.trim()}>
							{busy ? "Creando…" : "Crear tabla"}
						</button>
					</div>
				</form>
			)}

			{err && (
				<p className="error" role="alert">
					{err}
				</p>
			)}

			{visible.length > 0 && (
				<div className="table-pills" role="tablist" aria-label="Tablas">
					{visible.map((t) => (
						<button key={t.id} role="tab" aria-selected={t.id === current?.id} className={`pill${t.id === current?.id ? " on" : ""}`} onClick={() => pick(t.id)}>
							{t.brand_id && <span className="dot" style={{ background: brandOf(t.brand_id)?.color }} />}
							{t.name}
							<span className="pill-count">{t.row_count}</span>
						</button>
					))}
				</div>
			)}

			{visible.length === 0 && !creating && (
				<p className="empty">Todavía no hay tablas{brandId !== "all" ? " para esta marca" : ""}. Crea la primera con “+ Nueva tabla”.</p>
			)}

			{current && (
				<TableView
					key={current.id}
					tableId={current.id}
					brands={brands}
					onListChanged={() => void reload()}
					onTrashed={() => {
						pick(null);
						void reload();
					}}
				/>
			)}
		</section>
	);
}
