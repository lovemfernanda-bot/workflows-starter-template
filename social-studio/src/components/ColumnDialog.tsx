import { useEffect, useState } from "react";
import type { Column, ColumnInput } from "../api";
import { COL_TYPES, COL_TYPE_LABEL, LIMITS, OPTION_COLORS, type ColType, type Option } from "../../shared/tables";

const newOptionId = () => `o${Math.random().toString(36).slice(2, 10)}`;
const hasOptions = (t: ColType) => t === "select" || t === "multiselect";

interface Props {
	column?: Column; // si viene, se edita; si no, se crea
	onSubmit: (c: ColumnInput) => Promise<void>;
	onClose: () => void;
}

export default function ColumnDialog({ column, onSubmit, onClose }: Props) {
	const [name, setName] = useState(column?.name ?? "");
	const [type, setType] = useState<ColType>(column?.type ?? "text");
	const [options, setOptions] = useState<Option[]>(column?.options ?? []);
	const [err, setErr] = useState("");
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const setOpt = (id: string, patch: Partial<Option>) => setOptions(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));
	const addOpt = () =>
		setOptions([...options, { id: newOptionId(), label: "", color: OPTION_COLORS[options.length % OPTION_COLORS.length].value }]);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		const clean = hasOptions(type) ? options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label) : [];
		if (hasOptions(type) && clean.length === 0) {
			setErr("Agrega al menos una opción.");
			return;
		}
		setBusy(true);
		setErr("");
		try {
			await onSubmit({ name: name.trim(), type, options: clean });
		} catch (x) {
			setErr((x as Error).message);
			setBusy(false);
		}
	};

	return (
		<div className="overlay overlay-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
			<form className="dialog" role="dialog" aria-modal="true" aria-label={column ? "Editar columna" : "Nueva columna"} onSubmit={submit}>
				<h2>{column ? "Editar columna" : "Nueva columna"}</h2>
				<label className="field">
					<span>Nombre de la columna</span>
					<input value={name} maxLength={60} required autoFocus onChange={(e) => setName(e.target.value)} />
				</label>
				<label className="field">
					<span>Tipo</span>
					<select value={type} disabled={!!column} onChange={(e) => setType(e.target.value as ColType)}>
						{COL_TYPES.map((t) => (
							<option key={t} value={t}>
								{COL_TYPE_LABEL[t]}
							</option>
						))}
					</select>
					{column && <small className="muted">El tipo no se puede cambiar. Si lo necesitas, crea otra columna.</small>}
				</label>

				{hasOptions(type) && (
					<fieldset className="opts">
						<legend>Opciones</legend>
						{options.map((o) => (
							<div key={o.id} className="opt-row">
								<span className="swatch" style={{ background: o.color }} aria-hidden="true" />
								<input
									aria-label="Nombre de la opción"
									value={o.label}
									maxLength={40}
									placeholder="Nombre de la opción"
									onChange={(e) => setOpt(o.id, { label: e.target.value })}
								/>
								<select aria-label="Color" value={o.color} onChange={(e) => setOpt(o.id, { color: e.target.value })}>
									{OPTION_COLORS.map((c) => (
										<option key={c.value} value={c.value}>
											{c.name}
										</option>
									))}
								</select>
								<button type="button" className="btn btn-ghost" aria-label="Quitar opción" onClick={() => setOptions(options.filter((x) => x.id !== o.id))}>
									✕
								</button>
							</div>
						))}
						{options.length < LIMITS.options && (
							<button type="button" className="btn btn-secondary" onClick={addOpt}>
								+ Agregar opción
							</button>
						)}
						{column && <small className="muted">Si quitas una opción, se borra de las filas que la usaban.</small>}
					</fieldset>
				)}

				{err && (
					<p className="error" role="alert">
						{err}
					</p>
				)}
				<div className="dialog-foot">
					<button type="button" className="btn btn-ghost" onClick={onClose}>
						Cancelar
					</button>
					<button className="btn btn-primary" disabled={busy || !name.trim()}>
						{busy ? "Guardando…" : column ? "Guardar" : "Agregar columna"}
					</button>
				</div>
			</form>
		</div>
	);
}
