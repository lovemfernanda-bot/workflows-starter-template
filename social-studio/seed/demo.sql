-- SOLO DESARROLLO: publicaciones de ejemplo. No ejecutar en producción.
INSERT OR IGNORE INTO posts (id, brand_id, title, idea, pillar) VALUES
	('post_demo1', 'brand_brancode', 'Por qué tu marca necesita un sistema, no un logo', 'Explicar la diferencia entre identidad visual y sistema de marca.', 'Educación'),
	('post_demo2', 'brand_brancode', 'Detrás de cámaras: rediseño de una clienta', 'Proceso en 3 pasos con antes y después.', 'Proceso'),
	('post_demo3', 'brand_ana', 'Tres hábitos para empezar la semana con foco', 'Lista corta con ejemplos reales.', 'Bienestar');
INSERT OR IGNORE INTO post_versions (id, post_id, network, copy, hashtags, publish_at, status) VALUES
	('ver_d1_ig', 'post_demo1', 'instagram', 'Un logo no es una marca. Una marca es un sistema que se reconoce en todas partes.', '#branding #identidadvisual', '2026-11-13T09:00', 'en_revision'),
	('ver_d1_li', 'post_demo1', 'linkedin', 'Muchas marcas invierten en un logo y se quedan sin sistema. Esto es lo que cambia cuando lo tienes.', '', '2026-11-14T10:00', 'borrador'),
	('ver_d2_ig', 'post_demo2', 'instagram', 'Así pasamos de una marca improvisada a una consistente.', '#rediseño', '2026-11-18T12:00', 'aprobada'),
	('ver_d2_tt', 'post_demo2', 'tiktok', '', '', NULL, 'idea'),
	('ver_d3_fb', 'post_demo3', 'facebook', 'Tres hábitos simples para ordenar tu semana.', '', '2026-11-12T08:00', 'cambios_solicitados'),
	('ver_d3_ig', 'post_demo3', 'instagram', 'Empieza la semana con foco: 3 hábitos.', '#bienestar', '2026-11-12T08:30', 'programada');
UPDATE post_versions SET review_note = 'Acorta el primer párrafo y agrega una pregunta al final.' WHERE id = 'ver_d3_fb';
