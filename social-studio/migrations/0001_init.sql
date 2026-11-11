-- BranCode Social Studio — esquema inicial
-- Fechas de publicación: texto local 'YYYY-MM-DDTHH:mm' (sin zona horaria).
-- Fechas de sistema (created_at, updated_at, at): UTC 'YYYY-MM-DD HH:MM:SS'.

CREATE TABLE brands (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	color TEXT NOT NULL DEFAULT '#C62828',
	networks TEXT NOT NULL DEFAULT '["instagram","facebook","tiktok","linkedin"]',
	external_ref TEXT, -- reservado: id en BranCode OS
	archived INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE posts (
	id TEXT PRIMARY KEY,
	brand_id TEXT NOT NULL REFERENCES brands(id),
	title TEXT NOT NULL,
	idea TEXT NOT NULL DEFAULT '',
	pillar TEXT NOT NULL DEFAULT '',
	external_ref TEXT, -- reservado: id en BranCode OS
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_posts_brand ON posts(brand_id);

-- Una versión por red: cada una con su texto, fecha y estado propios.
CREATE TABLE post_versions (
	id TEXT PRIMARY KEY,
	post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
	network TEXT NOT NULL CHECK (network IN ('instagram','facebook','tiktok','linkedin')),
	copy TEXT NOT NULL DEFAULT '',
	hashtags TEXT NOT NULL DEFAULT '',
	publish_at TEXT,
	status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN
		('idea','borrador','en_revision','cambios_solicitados','aprobada','programada','publicada')),
	review_note TEXT,
	published_url TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE (post_id, network)
);
CREATE INDEX idx_versions_publish ON post_versions(publish_at);
CREATE INDEX idx_versions_status ON post_versions(status);

CREATE TABLE status_history (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	version_id TEXT NOT NULL,
	from_status TEXT,
	to_status TEXT NOT NULL,
	note TEXT,
	actor TEXT,
	at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_history_version ON status_history(version_id);

-- Bandeja de eventos para la futura integración con BranCode OS (aún no se envía a nadie).
CREATE TABLE events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	type TEXT NOT NULL,
	entity_id TEXT,
	payload TEXT NOT NULL,
	at TEXT NOT NULL DEFAULT (datetime('now')),
	delivered_at TEXT
);
