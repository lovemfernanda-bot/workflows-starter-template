import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Brand, type Column, type ColumnInput, type DataRow, type TableFull } from "../api";
import { COL_TYPE_LABEL, LIMITS, validateCell, type ColType, type Option } from "../../shared/tables";
import ColumnDialog from "./ColumnDialog";
import Floating from "./Floating";

const ICON: Record<ColType, string> = { text: "Aa", number: "#", select: "▾", multiselect: "☰", date: "◷", checkbox: "☑", url: "↗" };

type Sort = { colId: string; dir: "asc" | "desc" } | null;

/** Texto que representa el valor de una celda (para buscar y ordenar). */
function display(col: Column, v: unknown): string {
	if (v === undefined || v === null) return "";
	if (col.type === "select") return col.options.find((o) => o.id === v)?.label ?? "";
	if (col.type === "multiselect") return Array.isArray(v) ? v.map((id) => col.options.find((o) => o.id === id)?.label ?? "").join(", ") : "";
	if (col.type === "checkbox") return v ? "sí" : "";
	return String(v);
}

interface CellProps {
	col: Column;
	value: unknown;
	rev: number;
	commit: (v: unknown) => void;
}

function TextCell({ col, value, rev, commit }: CellProps) {
	const v = typeof value === "string" ? value : "";
	return (
		<input
			key={`${rev}-${v}`}
			className="cell-input"
			aria-label={col.name}
			defaultValue={v}
			maxLength={LIMITS.text}
			onBlur={(e) => e.target.value !== v && commit(e.target.value)}
			onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
		/>
	);
}

function NumberCell({ col, value, rev, commit }: CellProps) {
	const v = typeof value === "number" ? String(value) : "";
	return (
		<input
			key={`${rev}-${v}`}
			className="cell-input cell-num"
			type="number"
			step="any"
			aria-label={col.name}
			defaultValue={v}
			onBlur={(e) => e.target.value !== v && commit(e.target.value === "" ? null : Number(e.target.value))}
			onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
		/>
	);
}

function UrlCell({ col, value, rev, commit }: CellProps) {
	const v = typeof value === "string" ? value : "";
	return (
		<span className="cell-url">
			<input
				key={`${rev}-${v}`}
				className="cell-input"
				type="url"
				placeholder="https://"
				aria-label={col.name}
				defaultValue={v}
				onBlur={(e) => e.target.value !== v && commit(e.target.value.trim())}
				onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
			/>
			{v && (
				<a href={v} target="_blank" rel="noopener noreferrer" aria-label={`Abrir enlace de ${col.name}`}>
					↗
				</a>
			)}
		</span>
	);
}

function DateCell({ col, value, commit }: CellProps) {
	return (
		<input
			className="cell-input"
			type="date"
			aria-label={col.name}
			value={typeof value === "string" ? value : ""}
			onChange={(e) => commit(e.target.value || null)}
		/>
	);
}

function CheckCell({ col, value, commit }: CellProps) {
	return (
		<span className="cell-check">
			<input type="checkbox" aria-label={col.name} checked={value === true} onChange={(e) => commit(e.target.checked)} />
		</span>
	);
}

function SelectCell({ col, value, commit }: CellProps) {
	const opt = col.options.find((o) => o.id === value);
	return (
		<span className="cell-select">
			<select
				className="sel"
				aria-label={col.name}
				value={opt?.id ?? ""}
				style={opt ? { background: opt.color } : undefined}
				onChange={(e) => commit(e.target.value || null)}
			>
				<option value="">—</option>
				{col.options.map((o) => (
					<option key={o.id} value={o.id}>
						{o.label}
					</option>
				))}
			</select>
		</span>
	);
}

function MultiCell({ col, value, commit }: CellProps) {
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const chosen: Option[] = Array.isArray(value) ? col.options.filter((o) => value.includes(o.id)) : [];

	const toggle = (id: string, on: boolean) => {
		const ids = new Set(chosen.map((o) => o.id));
		if (on) ids.add(id);
		else ids.delete(id);
		commit(ids.size ? col.options.filter((o) => ids.has(o.id)).map((o) => o.id) : null);
	};

	return (
		<div className="cell-multi">
			<button
				type="button"
				className="multi-btn"
				aria-expanded={!!anchor}
				aria-label={`${col.name}: elegir opciones`}
				onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
			>
				{chosen.length === 0 && <span className="muted">—</span>}
				{chosen.map((o) => (
					<span key={o.id} className="tag" style={{ background: o.color }}>
						{o.label}
					</span>
				))}
			</button>
			{anchor && (
				<Floating anchor={anchor} onClose={() => setAnchor(null)} className="pop" role="group" label={col.name}>
					{col.options.map((o) => (
						<label key={o.id} className="pop-row">
							<input type="checkbox" checked={chosen.some((c) => c.id === o.id)} onChange={(e) => toggle(o.id, e.target.checked)} />
							<span className="tag" style={{ background: o.color }}>
								{o.label}
							</span>
						</label>
					))}
				</Floating>
			)}
		</div>
	);
}

const CELLS: Record<ColType, React.ComponentType<CellProps>> = {
	text: TextCell,
	number: NumberCell,
	select: SelectCell,
	multiselect: MultiCell,
	date: DateCell,
	checkbox: CheckCell,
	url: UrlCell,
};

interface Props {
	tableId: string;
	brands: Brand[];
	onListChanged: () => void;
	onTrashed: () => void;
}

export default function TableView({ tableId, brands, onListChanged, onTrashed }: Props) {
	const [full, setFull] = useState<TableFull | null>(null);
	const [err, setErr] = useState("");
	const [saved, setSaved] = useState("");
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState<Sort>(null);
	const [dialog, setDialog] = useState<null | { column?: Column }>(null);
	const [menu, setMenu] = useState<{ col: Column; el: HTMLElement } | null>(null);
	const [rev, setRev] = useState(0); // fuerza a recargar un campo cuyo valor fue rechazado
	const [name, setName] = useState("");

	const load = useCallback(async () => {
		try {
			const f = await api.table(tableId);
			setFull(f);
			setName(f.table.name);
			setErr("");
		} catch (e) {
			setErr((e as Error).message);
		}
	}, [tableId]);
	useEffect(() => {
		void load();
	}, [load]);

	const fail = (e: unknown) => {
		setSaved("");
		setErr((e as Error).message);
	};
	const ok = () => {
		setErr("");
		setSaved("Guardado");
	};

	const columns = full?.columns ?? [];
	const rows = useMemo(() => {
		if (!full) return [];
		let out = full.rows;
		const q = search.trim().toLowerCase();
		if (q) out = out.filter((r) => full.columns.some((c) => display(c, r.data[c.id]).toLowerCase().includes(q)));
		if (sort) {
			const col = full.columns.find((c) => c.id === sort.colId);
			if (col) {
				const sign = sort.dir === "asc" ? 1 : -1;
				out = [...out].sort((a, b) => {
					const va = a.data[col.id];
					const vb = b.data[col.id];
					const ea = col.type !== "checkbox" && (va === undefined || va === null);
					const eb = col.type !== "checkbox" && (vb === undefined || vb === null);
					if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1; // las vacías siempre al final
					if (col.type === "number") return sign * ((va as number) - (vb as number));
					if (col.type === "checkbox") return sign * (Number(va === true) - Number(vb === true));
					return sign * display(col, va).localeCompare(display(col, vb), "es", { numeric: true });
				});
			}
		}
		return out;
	}, [full, search, sort]);

	// ----- celdas -----
	const setCell = async (row: DataRow, col: Column, value: unknown) => {
		const check = validateCell(col, value);
		if (!check.ok) {
			setErr(check.error);
			setRev((r) => r + 1);
			return;
		}
		const next = { ...row.data };
		if (check.value === null) delete next[col.id];
		else next[col.id] = check.value;
		setFull((f) => f && { ...f, rows: f.rows.map((r) => (r.id === row.id ? { ...r, data: next } : r)) });
		try {
			const saved = await api.updateRow(row.id, { [col.id]: check.value });
			setFull((f) => f && { ...f, rows: f.rows.map((r) => (r.id === row.id ? saved : r)) });
			ok();
		} catch (e) {
			fail(e);
			await load();
		}
	};

	const addRow = async () => {
		try {
			const r = await api.addRow(tableId);
			setFull((f) => f && { ...f, rows: [...f.rows, r], table: { ...f.table, row_count: f.table.row_count + 1 } });
			ok();
			onListChanged();
		} catch (e) {
			fail(e);
		}
	};
	const removeRow = async (row: DataRow) => {
		if (Object.keys(row.data).length > 0 && !window.confirm("¿Eliminar esta fila?")) return;
		try {
			await api.deleteRow(row.id);
			setFull((f) => f && { ...f, rows: f.rows.filter((r) => r.id !== row.id), table: { ...f.table, row_count: f.table.row_count - 1 } });
			ok();
			onListChanged();
		} catch (e) {
			fail(e);
		}
	};

	// ----- columnas -----
	const saveColumn = async (c: ColumnInput, existing?: Column) => {
		if (existing) {
			const changedOptions = JSON.stringify(c.options) !== JSON.stringify(existing.options);
			await api.updateColumn(existing.id, { name: c.name, ...(changedOptions ? { options: c.options } : {}) });
		} else {
			await api.addColumn(tableId, c);
		}
		setDialog(null);
		await load();
		ok();
	};
	const moveColumn = async (col: Column, dir: -1 | 1) => {
		const ids = columns.map((c) => c.id);
		const i = ids.indexOf(col.id);
		const j = i + dir;
		if (j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j], ids[i]];
		setFull((f) => f && { ...f, columns: ids.map((id) => f.columns.find((c) => c.id === id)!) });
		try {
			await api.reorderColumns(tableId, ids);
			ok();
		} catch (e) {
			fail(e);
			await load();
		}
	};
	const removeColumn = async (col: Column) => {
		if (!window.confirm(`¿Eliminar la columna "${col.name}" y todos sus datos? No se puede deshacer.`)) return;
		try {
			await api.deleteColumn(col.id);
			if (sort?.colId === col.id) setSort(null);
			await load();
			ok();
		} catch (e) {
			fail(e);
		}
	};
	const toggleSort = (col: Column) =>
		setSort((s) => (s?.colId !== col.id ? { colId: col.id, dir: "asc" } : s.dir === "asc" ? { colId: col.id, dir: "desc" } : null));

	// ----- tabla -----
	const rename = async () => {
		if (!full || name.trim() === full.table.name) return;
		if (!name.trim()) {
			setName(full.table.name);
			return;
		}
		try {
			await api.updateTable(tableId, { name: name.trim() });
			await load();
			onListChanged();
			ok();
		} catch (e) {
			fail(e);
		}
	};
	const changeBrand = async (brandId: string) => {
		try {
			await api.updateTable(tableId, { brand_id: brandId || null });
			await load();
			onListChanged();
			ok();
		} catch (e) {
			fail(e);
		}
	};
	const trash = async () => {
		try {
			await api.deleteTable(tableId);
			onTrashed();
		} catch (e) {
			fail(e);
		}
	};

	if (!full) return err ? <p className="error" role="alert">{err}</p> : <p className="muted">Cargando tabla…</p>;

	const sortOf = (c: Column) => (sort?.colId === c.id ? (sort.dir === "asc" ? "ascending" : "descending") : "none");

	return (
		<section className="tv" aria-label={`Tabla ${full.table.name}`}>
			<div className="tv-bar">
				<input
					className="tv-name"
					aria-label="Nombre de la tabla"
					value={name}
					maxLength={80}
					onChange={(e) => setName(e.target.value)}
					onBlur={() => void rename()}
					onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
				/>
				<label className="tv-brand">
					<span className="sr-only">Marca de la tabla</span>
					<select value={full.table.brand_id ?? ""} onChange={(e) => void changeBrand(e.target.value)}>
						<option value="">General (todas las marcas)</option>
						{brands.map((b) => (
							<option key={b.id} value={b.id}>
								{b.name}
							</option>
						))}
					</select>
				</label>
				<input className="tv-search" type="search" placeholder="Buscar en la tabla…" aria-label="Buscar en la tabla" value={search} onChange={(e) => setSearch(e.target.value)} />
				<button className="btn btn-secondary" onClick={() => setDialog({})}>
					+ Columna
				</button>
				<button className="btn btn-ghost" onClick={() => void trash()}>
					Mover a la papelera
				</button>
			</div>

			<div aria-live="polite" className="tv-status">
				{err && (
					<p className="error" role="alert">
						{err}
					</p>
				)}
				{!err && saved && <span className="muted">✓ {saved}</span>}
			</div>

			<div className="grid-wrap">
				<table className="grid">
					<thead>
						<tr>
							{columns.map((c) => (
								<th key={c.id} aria-sort={sortOf(c)} scope="col">
									<div className="th-in">
										<button className="th-name" onClick={() => toggleSort(c)} title={`${COL_TYPE_LABEL[c.type]} · clic para ordenar`}>
											<span className="th-ico" aria-hidden="true">
												{ICON[c.type]}
											</span>
											{c.name}
											<span aria-hidden="true">{sort?.colId === c.id ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}</span>
										</button>
										<button
											className="th-menu"
											aria-label={`Opciones de ${c.name}`}
											aria-expanded={menu?.col.id === c.id}
											onClick={(e) => setMenu(menu?.col.id === c.id ? null : { col: c, el: e.currentTarget })}
										>
											⋯
										</button>
									</div>
								</th>
							))}
							<th className="th-end" scope="col">
								<span className="sr-only">Acciones de fila</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.id}>
								{columns.map((c) => {
									const Cell = CELLS[c.type];
									return (
										<td key={c.id} className={`td-${c.type}`}>
											<Cell col={c} value={r.data[c.id]} rev={rev} commit={(v) => void setCell(r, c, v)} />
										</td>
									);
								})}
								<td className="td-end">
									<button className="row-del" aria-label="Eliminar fila" onClick={() => void removeRow(r)}>
										✕
									</button>
								</td>
							</tr>
						))}
						{rows.length === 0 && (
							<tr>
								<td colSpan={columns.length + 1} className="grid-empty">
									{full.rows.length === 0 ? "Aún no hay filas. Agrega la primera." : "Ninguna fila coincide con la búsqueda."}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
			<div className="tv-foot">
				<button className="btn btn-secondary" onClick={() => void addRow()}>
					+ Nueva fila
				</button>
				<span className="muted">
					{rows.length === full.rows.length ? `${full.rows.length} filas` : `${rows.length} de ${full.rows.length} filas`} · {columns.length} columnas
				</span>
			</div>

			{menu && (
				<Floating anchor={menu.el} onClose={() => setMenu(null)} className="col-menu" role="menu" label={`Opciones de ${menu.col.name}`}>
					<button role="menuitem" onClick={() => (setMenu(null), setDialog({ column: menu.col }))}>
						Editar columna
					</button>
					<button role="menuitem" onClick={() => (setMenu(null), setSort({ colId: menu.col.id, dir: "asc" }))}>
						Ordenar ascendente
					</button>
					<button role="menuitem" onClick={() => (setMenu(null), setSort({ colId: menu.col.id, dir: "desc" }))}>
						Ordenar descendente
					</button>
					<button role="menuitem" disabled={columns[0].id === menu.col.id} onClick={() => (setMenu(null), void moveColumn(menu.col, -1))}>
						Mover a la izquierda
					</button>
					<button role="menuitem" disabled={columns[columns.length - 1].id === menu.col.id} onClick={() => (setMenu(null), void moveColumn(menu.col, 1))}>
						Mover a la derecha
					</button>
					<button role="menuitem" className="danger" disabled={columns.length <= 1} onClick={() => (setMenu(null), void removeColumn(menu.col))}>
						Eliminar columna
					</button>
				</Floating>
			)}

			{dialog && <ColumnDialog column={dialog.column} onClose={() => setDialog(null)} onSubmit={(c) => saveColumn(c, dialog.column)} />}
		</section>
	);
}
