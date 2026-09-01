import { describe, it, expect } from "vitest";
import {
  parseProductsCsv,
  productsToCsv,
} from "../../src/modules/products/product.service";

describe("products CSV", () => {
  it("parses semicolon csv", () => {
    const csv = `codigo_interno;nome;unidade;custo;preco_venda;categoria;marca
RP-100;Snack Teste;UN;5,5;12,9;Petiscos Naturais;Raze Pet`;
    const rows = parseProductsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].internalCode).toBe("RP-100");
    expect(rows[0].costPrice).toBe(5.5);
    expect(rows[0].salePrice).toBe(12.9);
    expect(rows[0].unitCode).toBe("UN");
  });

  it("roundtrips export headers", () => {
    const csv = productsToCsv([
      {
        internalCode: "X1",
        barcode: null,
        name: "Produto",
        description: null,
        category: { name: "Cat" },
        brand: { name: "Brand" },
        supplier: { legalName: "Fornecedor SA", tradeName: "Forn" },
        unit: { code: "UN" },
        costPrice: 1,
        salePrice: 2,
        minStock: 3,
        currentStock: 0,
        location: null,
        trackExpiry: true,
        active: true,
      },
    ]);
    expect(csv).toContain("codigo_interno");
    expect(csv).toContain("fornecedor");
    expect(csv).toContain("X1");
    expect(csv).toContain("Forn");
    const parsed = parseProductsCsv(csv);
    expect(parsed[0].name).toBe("Produto");
    expect(parsed[0].supplierName).toBe("Forn");
  });
});
