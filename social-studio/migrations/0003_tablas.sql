-- Tablas personalizadas (estilo Monday/Notion). Los valores de cada fila se guardan como JSON
-- {id_de_columna: valor}, así agregar una columna no requiere cambiar el esquema.
CREATE TABLE custom_tables (
	id TEXT PRIMARY KEY,
	brand_id TEXT REFERENCES brands(id), -- NULL = tabla general (de ninguna marca en particular)
	name TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	deleted_at TEXT
);
CREATE INDEX idx_custom_tables_brand ON custom_tables(brand_id);

CREATE TABLE table_columns (
	id TEXT PRIMARY KEY,
	table_id TEXT NOT NULL REFERENCES custom_tables(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	type TEXT NOT NULL CHECK (type IN ('text','number','select','multiselect','date','checkbox','url')),
	options TEXT NOT NULL DEFAULT '[]',
	position INTEGER NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_table_columns_table ON table_columns(table_id);

CREATE TABLE table_rows (
	id TEXT PRIMARY KEY,
	table_id TEXT NOT NULL REFERENCES custom_tables(id) ON DELETE CASCADE,
	position INTEGER NOT NULL,
	data TEXT NOT NULL DEFAULT '{}',
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_table_rows_table ON table_rows(table_id, position);
