import { describe, expect, it } from "vitest";
import { pageParams } from "./list-filters";

describe("pageParams (spec academy-console-v3)", () => {
  it("sin params → default page=1 pageSize=25 skip=0 take=25", () => {
    expect(pageParams(undefined, undefined)).toEqual({
      page: 1,
      pageSize: 25,
      skip: 0,
      take: 25,
    });
  });

  it("page/pageSize válidos → skip/take derivados", () => {
    expect(pageParams("3", "20")).toEqual({
      page: 3,
      pageSize: 20,
      skip: 40,
      take: 20,
    });
  });

  it("page < 1 o no numérico → normaliza a 1", () => {
    expect(pageParams("0", "10").page).toBe(1);
    expect(pageParams("-4", "10").page).toBe(1);
    expect(pageParams("abc", "10").page).toBe(1);
    expect(pageParams("", "10").page).toBe(1);
  });

  it("pageSize < 1 o no numérico → default 25; decimales se truncan", () => {
    expect(pageParams("1", "0").pageSize).toBe(25);
    expect(pageParams("1", "-9").pageSize).toBe(25);
    expect(pageParams("1", "x").pageSize).toBe(25);
    expect(pageParams("1", "7.9").pageSize).toBe(7);
  });

  it("pageSize capado a max (default 100, claims 200)", () => {
    expect(pageParams("1", "500").pageSize).toBe(100);
    expect(pageParams("1", "500", 200).pageSize).toBe(200);
    expect(pageParams("1", "50", 30).pageSize).toBe(30);
  });

  it("página más allá del total → skip grande, items vacíos (lo decide el repo)", () => {
    const pg = pageParams("999", "25");
    expect(pg.skip).toBe(24_950);
    expect(pg.take).toBe(25);
  });
});
