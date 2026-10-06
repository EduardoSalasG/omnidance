import { describe, expect, it } from "vitest";
import { parseCsv, csvRowsToObjects } from "./csv";

describe("parseCsv", () => {
  it("filas simples separadas por coma", () => {
    expect(parseCsv("a,b,c\n1,2,3\n4,5,6")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("tolera \\r\\n y BOM", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("campos entre comillas con coma interna", () => {
    expect(parseCsv('nombre,nota\n"Pérez, Juan","10,5"')).toEqual([
      ["nombre", "nota"],
      ["Pérez, Juan", "10,5"],
    ]);
  });

  it("escape de comilla doble dentro de campo citado", () => {
    expect(parseCsv('a\n"dijo ""hola"" y siguió"')).toEqual([
      ["a"],
      ['dijo "hola" y siguió'],
    ]);
  });

  it("campo citado con salto de línea interno", () => {
    expect(parseCsv('a,b\n"línea1\nlínea2",x')).toEqual([
      ["a", "b"],
      ["línea1\nlínea2", "x"],
    ]);
  });

  it("ignora líneas vacías y trailing newline", () => {
    expect(parseCsv("a\n\n1\n\n")).toEqual([["a"], ["1"]]);
  });

  it("última fila sin newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("celdas vacías preservan columnas", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });
});

describe("csvRowsToObjects", () => {
  it("mapea por header (case-insensitive) y exige requeridas", () => {
    const rows = parseCsv("Email,Nombre\njuan@x.cl,Juan\n");
    const mapped = csvRowsToObjects(rows, ["email", "nombre"]);
    expect(mapped?.objects).toEqual([
      { email: "juan@x.cl", nombre: "Juan" },
    ]);
    expect(csvRowsToObjects(rows, ["email", "plan"])).toBeNull();
  });

  it("recorta espacios y tolera filas cortas", () => {
    const rows = parseCsv("a,b\n  x  \n");
    const mapped = csvRowsToObjects(rows, ["a", "b"]);
    expect(mapped?.objects[0]).toEqual({ a: "x", b: "" });
  });
});
