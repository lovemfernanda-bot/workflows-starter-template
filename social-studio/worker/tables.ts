// API de tablas personalizadas: tablas, columnas, filas y celdas.
import { COL_TYPES, LIMITS, sanitizeOptions, validateCell, type ColType, type Option } from "../shared/tables";
import { HttpError, json, readBody, route, str, type Env } from "./http";

interface TableRow {
	id: string;
	brand_id: string | null;
	name: string;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}
interface ColRow {
	id: string;
	table_id: string;
	name: string;
	type: ColType;
	options: string;
	position: number;
}
interface DataRow {
	id: string;
	table_id: string;
	position: number;
	data: string;
	created_at: string;
	updated_at: string;
}

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

const colOut = (c: ColRow) => ({
	id: c.id,
	table_id: c.table_id,
	name: c.name,
	type: c.type,
	options: JSON.parse(c.options) as Option[],
	position: c.position,
});
const rowOut = (r: DataRow) => ({
	id: r.id,
	table_id: r.table_id,
	position: r.position,
	data: JSON.parse(r.data) as Record<string, unknown>,
});

async function requireTable(env: Env, id: string, allowTrashed = false): Promise<TableRow> {
	const t = await env.DB.prepare("SELECT * FROM custom_tables WHERE id = ?1").bind(id).first<TableRow>();
	if (!t) throw new HttpError(404, "La tabla no existe.");
	if (t.deleted_at && !allowTrashed) throw new HttpError(409, "La tabla está en la papelera. Restáurala para editarla.");
	return t;
}
async function loadColumns(env: Env, tableId: string): Promise<ColRow[]> {
	return (await env.DB.prepare("SELECT * FROM table_columns WHERE table_id = ?1 ORDER BY position").bind(tableId).all<ColRow>()).results;
}
async function loadRows(env: Env, tableId: string): Promise<DataRow[]> {
	return (
		await env.DB.prepare("SELECT * FROM table_rows WHERE table_id = ?1 ORDER BY position, created_at").bind(tableId).all<DataRow>()
	).results;
}
const touch = (env: Env, tableId: string) =>
	env.DB.prepare("UPDATE custom_tables SET updated_at = datetime('now') WHERE id = ?1").bind(tableId);

async function checkBrand(env: Env, brandId: unknown): Promise<string | null> {
	if (brandId === null || brandId === undefined || brandId === "") return null;
	if (typeof brandId !== "string") throw new HttpError(400, "Marca no válida.");
	const b = await env.DB.prepare("SELECT id FROM brands WHERE id = ?1 AND archived = 0").bind(brandId).first();
	if (!b) throw new HttpError(404, "La marca no existe.");
	return brandId;
}

/** Aplica un parche de celdas a los datos actuales, validando cada valor según el tipo de su columna. */
function applyCells(columns: ColRow[], current: Record<string, unknown>, patch: unknown): Record<string, unknown> {
	if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new HttpError(400, "Solicitud no válida.");
	const byId = new Map(columns.map((c) => [c.id, c]));
	const next = { ...current };
	for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
		const col = byId.get(key);
		if (!col) throw new HttpError(400, "Una de las columnas ya no existe. Recarga la tabla.");
		const r = validateCell({ name: col.name, type: col.type, options: JSON.parse(col.options) }, value);
		if (!r.ok) throw new HttpError(400, r.error);
		if (r.value === null) delete next[key];
		else next[key] = r.value;
	}
	if (JSON.stringify(next).length > LIMITS.rowBytes) throw new HttpError(400, "La fila es demasiado grande.");
	return next;
}

function columnName(v: unknown, existing: ColRow[], selfId?: string): string {
	const name = str(v, "name", 60, true)!;
	if (existing.some((c) => c.id !== selfId && c.name.toLowerCase() === name.toLowerCase())) {
		throw new HttpError(409, "Ya existe una columna con ese nombre.");
	}
	return name;
}

// ---------- Tablas ----------
route("GET", "/api/v1/tables", async ({ env, query }) => {
	const trashed = query.get("deleted") === "1";
	const rows = await env.DB.prepare(
		`SELECT t.*, (SELECT COUNT(*) FROM table_rows r WHERE r.table_id = t.id) AS row_count
		 FROM custom_tables t WHERE t.deleted_at IS ${trashed ? "NOT " : ""}NULL ORDER BY t.updated_at DESC`,
	).all<TableRow & { row_count: number }>();
	return json(rows.results);
});

route("POST", "/api/v1/tables", async ({ env, req }) => {
	const b = await readBody(req);
	const name = str(b.name, "name", 80, true)!;
	const brandId = await checkBrand(env, b.brand_id);
	const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM custom_tables").first<{ n: number }>();
	if ((count?.n ?? 0) >= LIMITS.tables) throw new HttpError(409, `Llegaste al límite de ${LIMITS.tables} tablas.`);

	const id = newId("tbl");
	await env.DB.batch([
		env.DB.prepare("INSERT INTO custom_tables (id, brand_id, name) VALUES (?1, ?2, ?3)").bind(id, brandId, name),
		env.DB.prepare("INSERT INTO table_columns (id, table_id, name, type, position) VALUES (?1, ?2, 'Nombre', 'text', 0)").bind(
			newId("col"),
			id,
		),
	]);
	const t = await requireTable(env, id);
	return json({ ...t, row_count: 0 }, 201);
});

route("GET", "/api/v1/tables/:id", async ({ env, params }) => {
	const table = await requireTable(env, params.id);
	const [columns, rows] = await Promise.all([loadColumns(env, params.id), loadRows(env, params.id)]);
	return json({ table: { ...table, row_count: rows.length }, columns: columns.map(colOut), rows: rows.map(rowOut) });
});

route("PATCH", "/api/v1/tables/:id", async ({ env, req, params }) => {
	await requireTable(env, params.id);
	const b = await readBody(req);
	const name = str(b.name, "name", 80);
	if (name === "") throw new HttpError(400, "El nombre no puede estar vacío.");
	const setBrand = "brand_id" in b;
	const brandId = setBrand ? await checkBrand(env, b.brand_id) : null;
	await env.DB.prepare(
		`UPDATE custom_tables SET name = COALESCE(?2, name),
		 brand_id = CASE WHEN ?3 = 1 THEN ?4 ELSE brand_id END, updated_at = datetime('now') WHERE id = ?1`,
	)
		.bind(params.id, name ?? null, setBrand ? 1 : 0, brandId)
		.run();
	return json(await requireTable(env, params.id));
});

// Sin ?permanent=1 va a la papelera; con ?permanent=1 solo se borra si ya estaba en la papelera.
route("DELETE", "/api/v1/tables/:id", async ({ env, params, query }) => {
	const t = await requireTable(env, params.id, true);
	if (query.get("permanent") !== "1") {
		if (!t.deleted_at) await env.DB.prepare("UPDATE custom_tables SET deleted_at = datetime('now') WHERE id = ?1").bind(t.id).run();
		return json({ ok: true });
	}
	if (!t.deleted_at) throw new HttpError(409, "Primero muévela a la papelera.");
	await env.DB.batch([
		env.DB.prepare("DELETE FROM table_rows WHERE table_id = ?1").bind(t.id),
		env.DB.prepare("DELETE FROM table_columns WHERE table_id = ?1").bind(t.id),
		env.DB.prepare("DELETE FROM custom_tables WHERE id = ?1").bind(t.id),
	]);
	return json({ ok: true });
});

route("POST", "/api/v1/tables/:id/restore", async ({ env, params }) => {
	const res = await env.DB.prepare(
		"UPDATE custom_tables SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?1 AND deleted_at IS NOT NULL",
	)
		.bind(params.id)
		.run();
	if (!res.meta.changes) throw new HttpError(404, "No hay una tabla en la papelera con ese id.");
	return json(await requireTable(env, params.id));
});

// ---------- Columnas ----------
route("POST", "/api/v1/tables/:id/columns", async ({ env, req, params }) => {
	await requireTable(env, params.id);
	const b = await readBody(req);
	const cols = await loadColumns(env, params.id);
	if (cols.length >= LIMITS.columns) throw new HttpError(409, `Máximo ${LIMITS.columns} columnas por tabla.`);
	const name = columnName(b.name, cols);
	if (typeof b.type !== "string" || !(COL_TYPES as readonly string[]).includes(b.type)) throw new HttpError(400, "Tipo de columna no válido.");
	const type = b.type as ColType;
	let options: Option[] = [];
	if (type === "select" || type === "multiselect") {
		const r = sanitizeOptions(b.options);
		if (!r.ok) throw new HttpError(400, r.error);
		options = r.value;
	}
	const id = newId("col");
	const position = cols.reduce((m, c) => Math.max(m, c.position), -1) + 1;
	await env.DB.batch([
		env.DB.prepare("INSERT INTO table_columns (id, table_id, name, type, options, position) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(
			id,
			params.id,
			name,
			type,
			JSON.stringify(options),
			position,
		),
		touch(env, params.id),
	]);
	const created = (await loadColumns(env, params.id)).find((c) => c.id === id)!;
	return json(colOut(created), 201);
});

route("PUT", "/api/v1/tables/:id/columns/order", async ({ env, req, params }) => {
	await requireTable(env, params.id);
	const b = await readBody(req);
	const cols = await loadColumns(env, params.id);
	const ids = b.ids;
	if (!Array.isArray(ids) || ids.length !== cols.length || new Set(ids).size !== ids.length || !ids.every((i) => cols.some((c) => c.id === i))) {
		throw new HttpError(400, "El orden de columnas no es válido.");
	}
	await env.DB.batch([
		...ids.map((id, i) => env.DB.prepare("UPDATE table_columns SET position = ?2 WHERE id = ?1").bind(id, i)),
		touch(env, params.id),
	]);
	return json((await loadColumns(env, params.id)).map(colOut));
});

async function requireColumn(env: Env, id: string): Promise<ColRow> {
	const c = await env.DB.prepare("SELECT * FROM table_columns WHERE id = ?1").bind(id).first<ColRow>();
	if (!c) throw new HttpError(404, "La columna no existe.");
	await requireTable(env, c.table_id);
	return c;
}

route("PATCH", "/api/v1/columns/:id", async ({ env, req, params }) => {
	const col = await requireColumn(env, params.id);
	const b = await readBody(req);
	const cols = await loadColumns(env, col.table_id);
	const name = b.name !== undefined ? columnName(b.name, cols, col.id) : col.name;

	let options = JSON.parse(col.options) as Option[];
	const stmts = [];
	if (b.options !== undefined) {
		if (col.type !== "select" && col.type !== "multiselect") throw new HttpError(400, "Esta columna no tiene opciones.");
		const r = sanitizeOptions(b.options);
		if (!r.ok) throw new HttpError(400, r.error);
		options = r.value;
		// Si se quitó una opción, se limpia de las filas que la usaban.
		const valid = new Set(options.map((o) => o.id));
		for (const row of await loadRows(env, col.table_id)) {
			const data = JSON.parse(row.data) as Record<string, unknown>;
			const v = data[col.id];
			let next: unknown = v;
			if (col.type === "select" && typeof v === "string" && !valid.has(v)) next = null;
			if (col.type === "multiselect" && Array.isArray(v)) {
				const kept = v.filter((x) => valid.has(x));
				next = kept.length ? kept : null;
			}
			if (next !== v) {
				if (next === null) delete data[col.id];
				else data[col.id] = next;
				stmts.push(env.DB.prepare("UPDATE table_rows SET data = ?2 WHERE id = ?1").bind(row.id, JSON.stringify(data)));
			}
		}
	}
	await env.DB.batch([
		env.DB.prepare("UPDATE table_columns SET name = ?2, options = ?3 WHERE id = ?1").bind(col.id, name, JSON.stringify(options)),
		...stmts,
		touch(env, col.table_id),
	]);
	return json(colOut((await loadColumns(env, col.table_id)).find((c) => c.id === col.id)!));
});

route("DELETE", "/api/v1/columns/:id", async ({ env, params }) => {
	const col = await requireColumn(env, params.id);
	const cols = await loadColumns(env, col.table_id);
	if (cols.length <= 1) throw new HttpError(409, "Una tabla necesita al menos una columna.");
	await env.DB.batch([
		env.DB.prepare("DELETE FROM table_columns WHERE id = ?1").bind(col.id),
		env.DB.prepare("UPDATE table_rows SET data = json_remove(data, ?2) WHERE table_id = ?1").bind(col.table_id, `$."${col.id}"`),
		touch(env, col.table_id),
	]);
	return json({ ok: true });
});

// ---------- Filas ----------
route("POST", "/api/v1/tables/:id/rows", async ({ env, req, params }) => {
	await requireTable(env, params.id);
	const b = await readBody(req);
	const stats = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS maxp FROM table_rows WHERE table_id = ?1")
		.bind(params.id)
		.first<{ n: number; maxp: number }>();
	if ((stats?.n ?? 0) >= LIMITS.rows) throw new HttpError(409, `Máximo ${LIMITS.rows} filas por tabla.`);
	const data = b.data === undefined ? {} : applyCells(await loadColumns(env, params.id), {}, b.data);
	const id = newId("row");
	await env.DB.batch([
		env.DB.prepare("INSERT INTO table_rows (id, table_id, position, data) VALUES (?1, ?2, ?3, ?4)").bind(
			id,
			params.id,
			(stats?.maxp ?? -1) + 1,
			JSON.stringify(data),
		),
		touch(env, params.id),
	]);
	const row = await env.DB.prepare("SELECT * FROM table_rows WHERE id = ?1").bind(id).first<DataRow>();
	return json(rowOut(row!), 201);
});

async function requireRow(env: Env, id: string): Promise<DataRow> {
	const r = await env.DB.prepare("SELECT * FROM table_rows WHERE id = ?1").bind(id).first<DataRow>();
	if (!r) throw new HttpError(404, "La fila no existe.");
	await requireTable(env, r.table_id);
	return r;
}

route("PATCH", "/api/v1/rows/:id", async ({ env, req, params }) => {
	const row = await requireRow(env, params.id);
	const b = await readBody(req);
	const data = applyCells(await loadColumns(env, row.table_id), JSON.parse(row.data), b.data);
	await env.DB.batch([
		env.DB.prepare("UPDATE table_rows SET data = ?2, updated_at = datetime('now') WHERE id = ?1").bind(row.id, JSON.stringify(data)),
		touch(env, row.table_id),
	]);
	const updated = await env.DB.prepare("SELECT * FROM table_rows WHERE id = ?1").bind(row.id).first<DataRow>();
	return json(rowOut(updated!));
});

route("DELETE", "/api/v1/rows/:id", async ({ env, params }) => {
	const row = await requireRow(env, params.id);
	await env.DB.batch([env.DB.prepare("DELETE FROM table_rows WHERE id = ?1").bind(row.id), touch(env, row.table_id)]);
	return json({ ok: true });
});
