import { describe, expect, it } from "vitest";
import { derivePostStatus, validateTransition } from "./rules";

const ctx = { publishAt: "2026-11-20T09:00", note: "", copy: "Hola" };

describe("validateTransition", () => {
	it("permite el camino normal", () => {
		expect(validateTransition("idea", "borrador", ctx)).toBeNull();
		expect(validateTransition("borrador", "en_revision", ctx)).toBeNull();
		expect(validateTransition("en_revision", "aprobada", ctx)).toBeNull();
		expect(validateTransition("aprobada", "programada", ctx)).toBeNull();
		expect(validateTransition("programada", "publicada", ctx)).toBeNull();
	});
	it("no permite saltarse la aprobación", () => {
		expect(validateTransition("borrador", "aprobada", ctx)).not.toBeNull();
		expect(validateTransition("borrador", "programada", ctx)).not.toBeNull();
		expect(validateTransition("en_revision", "programada", ctx)).not.toBeNull();
	});
	it("publicada es final", () => {
		expect(validateTransition("publicada", "borrador", ctx)).not.toBeNull();
	});
	it("pedir cambios exige nota", () => {
		expect(validateTransition("en_revision", "cambios_solicitados", ctx)).not.toBeNull();
		expect(
			validateTransition("en_revision", "cambios_solicitados", { ...ctx, note: "Acorta" }),
		).toBeNull();
	});
	it("programar exige fecha", () => {
		expect(validateTransition("aprobada", "programada", { ...ctx, publishAt: null })).not.toBeNull();
	});
	it("no envía a revisión un texto vacío", () => {
		expect(validateTransition("borrador", "en_revision", { ...ctx, copy: "  " })).not.toBeNull();
	});
});

describe("derivePostStatus", () => {
	it("prioriza cambios solicitados y revisión", () => {
		expect(derivePostStatus(["aprobada", "cambios_solicitados"])).toBe("cambios_solicitados");
		expect(derivePostStatus(["aprobada", "en_revision"])).toBe("en_revision");
	});
	it("usa la etapa menos avanzada", () => {
		expect(derivePostStatus(["publicada", "borrador", "aprobada"])).toBe("borrador");
	});
	it("vacío → null", () => {
		expect(derivePostStatus([])).toBeNull();
	});
});
