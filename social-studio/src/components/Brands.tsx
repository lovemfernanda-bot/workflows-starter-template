import { useState } from "react";
import { api, type Brand } from "../api";
import { NETWORKS, NETWORK_LABEL, type Network } from "../../shared/rules";

function NetworkPicker({ value, onChange }: { value: Network[]; onChange: (v: Network[]) => void }) {
	return (
		<fieldset className="checks">
			<legend>Redes que usa</legend>
			{NETWORKS.map((n) => (
				<label key={n} className="check">
					<input
						type="checkbox"
						checked={value.includes(n)}
						onChange={(e) => onChange(e.target.checked ? [...value, n] : value.filter((x) => x !== n))}
					/>
					{NETWORK_LABEL[n]}
				</label>
			))}
		</fieldset>
	);
}

function BrandForm({
	initial,
	submitLabel,
	onSubmit,
}: {
	initial: { name: string; color: string; networks: Network[] };
	submitLabel: string;
	onSubmit: (v: { name: string; color: string; networks: Network[] }) => Promise<void>;
}) {
	const [v, setV] = useState(initial);
	const [err, setErr] = useState("");
	const [busy, setBusy] = useState(false);
	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setBusy(true);
		setErr("");
		try {
			await onSubmit(v);
			if (!initial.name) setV(initial);
		} catch (x) {
			setErr((x as Error).message);
		} finally {
			setBusy(false);
		}
	};
	return (
		<form className="brand-form" onSubmit={submit}>
			<label className="field">
				<span>Nombre de la marca</span>
				<input value={v.name} maxLength={80} required onChange={(e) => setV({ ...v, name: e.target.value })} />
			</label>
			<label className="field field-color">
				<span>Color</span>
				<input type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} />
			</label>
			<NetworkPicker value={v.networks} onChange={(networks) => setV({ ...v, networks })} />
			{err && (
				<p className="error" role="alert">
					{err}
				</p>
			)}
			<button className="btn btn-primary" disabled={busy || v.networks.length === 0}>
				{busy ? "Guardando…" : submitLabel}
			</button>
		</form>
	);
}

export default function Brands({ brands, onChanged }: { brands: Brand[]; onChanged: () => void }) {
	return (
		<section aria-label="Marcas" className="brands">
			<h2 className="page-title">Marcas</h2>
			<p className="muted">Cada marca tiene su propio espacio: nunca se mezclan sus publicaciones.</p>
			<div className="brand-list">
				{brands.map((b) => (
					<details key={b.id} className="panel">
						<summary>
							<span className="dot dot-lg" style={{ background: b.color }} />
							<strong>{b.name}</strong>
							<span className="muted">{b.networks.map((n) => NETWORK_LABEL[n]).join(" · ")}</span>
						</summary>
						<BrandForm
							initial={{ name: b.name, color: b.color, networks: b.networks }}
							submitLabel="Guardar cambios"
							onSubmit={async (v) => {
								await api.updateBrand(b.id, v);
								onChanged();
							}}
						/>
					</details>
				))}
			</div>
			<div className="panel">
				<h3>Agregar marca</h3>
				<BrandForm
					initial={{ name: "", color: "#C62828", networks: [...NETWORKS] }}
					submitLabel="Crear marca"
					onSubmit={async (v) => {
						await api.createBrand(v);
						onChanged();
					}}
				/>
			</div>
		</section>
	);
}
