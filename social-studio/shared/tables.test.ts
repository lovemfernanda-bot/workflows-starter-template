import { describe, expect, it } from "vitest";
import { sanitizeOptions, validateCell, type ColumnShape } from "./tables";

const opts = [
	{ id: "a1", label: "Pendiente", color: "#FFF0B1" },
	{ id: "b2", label: "Listo", color: "#DCEBDD" },
];
const col = (type: ColumnShape["type"], options = opts): ColumnShape => ({ name: "Col", type, options });
const val = (c: ColumnShape, v: unknown) => {
	const r = validateCell(c, v);
	return r.ok ? r.value : "ERROR";
};

describe("validateCell", () => {
	it("vacío limpia la celda", () => {
		for (const t of ["text", "number", "select", "multiselect", "date", "url"] as const) {
			expect(val(col(t), null)).toBeNull();
			expect(val(col(t), "")).toBeNull();
		}
	});
	it("texto", () => {
		expect(val(col("text"), "Hola")).toBe("Hola");
		expect(val(col("text"), "   ")).toBeNull();
		expect(val(col("text"), 5)).toBe("ERROR");
		expect(val(col("text"), "x".repeat(2001))).toBe("ERROR");
	});
	it("número", () => {
		expect(val(col("number"), 12.5)).toBe(12.5);
		expect(val(col("number"), 0)).toBe(0);
		expect(val(col("number"), "12")).toBe("ERROR");
		expect(val(col("number"), Infinity)).toBe("ERROR");
		expect(val(col("number"), NaN)).toBe("ERROR");
	});
	it("selección solo acepta opciones existentes", () => {
		expect(val(col("select"), "a1")).toBe("a1");
		expect(val(col("select"), "zzz")).toBe("ERROR");
		expect(val(col("multiselect"), ["a1", "b2", "a1"])).toEqual(["a1", "b2"]);
		expect(val(col("multiselect"), ["a1", "nope"])).toBe("ERROR");
		expect(val(col("multiselect"), [])).toBeNull();
		expect(val(col("multiselect"), "a1")).toBe("ERROR");
	});
	it("fecha", () => {
		expect(val(col("date"), "2026-11-25")).toBe("2026-11-25");
		expect(val(col("date"), "2026-02-30")).toBe("ERROR");
		expect(val(col("date"), "25/11/2026")).toBe("ERROR");
	});
	it("casilla", () => {
		expect(val(col("checkbox"), true)).toBe(true);
		expect(val(col("checkbox"), false)).toBeNull();
		expect(val(col("checkbox"), "si")).toBe("ERROR");
	});
	it("enlace exige http(s)", () => {
		expect(val(col("url"), "https://brancode.io")).toBe("https://brancode.io");
		expect(val(col("url"), "javascript:alert(1)")).toBe("ERROR");
		expect(val(col("url"), "brancode.io")).toBe("ERROR");
	});
});

describe("sanitizeOptions", () => {
	it("acepta opciones válidas y normaliza el color", () => {
		const r = sanitizeOptions([{ id: "x1", label: " Uno ", color: "no-es-color" }]);
		expect(r.ok && r.value[0]).toEqual({ id: "x1", label: "Uno", color: "#E4DED2" });
	});
	it("rechaza vacías, repetidas y mal formadas", () => {
		expect(sanitizeOptions([{ id: "x1", label: " ", color: "#FFF0B1" }]).ok).toBe(false);
		expect(sanitizeOptions([{ id: "x1", label: "A" }, { id: "x1", label: "B" }]).ok).toBe(false);
		expect(sanitizeOptions([{ id: "x 1", label: "A" }]).ok).toBe(false);
		expect(sanitizeOptions("hola").ok).toBe(false);
	});
	it("limita la cantidad", () => {
		const many = Array.from({ length: 31 }, (_, i) => ({ id: `o${i}`, label: `O${i}` }));
		expect(sanitizeOptions(many).ok).toBe(false);
	});
});
