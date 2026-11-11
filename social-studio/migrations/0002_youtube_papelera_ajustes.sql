-- 1) YouTube como quinta red. SQLite no permite cambiar un CHECK: se reconstruye la tabla.
CREATE TABLE post_versions_new (
	id TEXT PRIMARY KEY,
	post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
	network TEXT NOT NULL CHECK (network IN ('instagram','facebook','tiktok','linkedin','youtube')),
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
INSERT INTO post_versions_new
	(id, post_id, network, copy, hashtags, publish_at, status, review_note, published_url, created_at, updated_at)
	SELECT id, post_id, network, copy, hashtags, publish_at, status, review_note, published_url, created_at, updated_at
	FROM post_versions;
DROP TABLE post_versions;
ALTER TABLE post_versions_new RENAME TO post_versions;
CREATE INDEX idx_versions_publish ON post_versions(publish_at);
CREATE INDEX idx_versions_status ON post_versions(status);

-- Las marcas que usaban las 4 redes originales ahora pueden usar también YouTube.
UPDATE brands SET networks = '["instagram","facebook","tiktok","linkedin","youtube"]'
	WHERE networks = '["instagram","facebook","tiktok","linkedin"]';

-- 2) Papelera: borrado reversible.
ALTER TABLE posts ADD COLUMN deleted_at TEXT;
CREATE INDEX idx_posts_deleted ON posts(deleted_at);

-- 3) Ajustes (zona horaria y primer día de la semana).
CREATE TABLE settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES ('timezone', 'America/New_York'), ('week_start', 'sunday');
