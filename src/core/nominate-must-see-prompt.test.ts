import { describe, expect, it } from "vitest";
import {
  buildNominateMustSeeUserMessage,
  parseNominatePlaceNames,
} from "./itinerary-planner";
import { placesOntologyPrompt } from "./places-ontology";

describe("buildNominateMustSeeUserMessage (L3)", () => {
  it("should_use_pinable_cn_line_without_schema_or_theme_park_lecture", () => {
    const msg = buildNominateMustSeeUserMessage("上海", 8, 3, {
      trip_type: "family_kids",
      pace: "medium",
      budget: "comfort",
      transit_preference: "drive_walk",
      party_size: 3,
      locale: "CN",
    });
    expect(msg).toMatch(/JSON/);
    expect(msg).toMatch(/短地名/);
    expect(msg).toMatch(/不要括号/);
    expect(msg).toMatch(/专名/);
    expect(msg).toMatch(/不需要安排行程|不要安排行程/);
    expect(msg).toMatch(/不要编造坐标/);
    expect(msg).toMatch(/近郊/);
    expect(msg).toMatch(/应至少列入一个/);
    expect(msg).toMatch(/一日游/);
    expect(msg).toMatch(/同一片区域/);
    expect(msg).toMatch(/线路/);
    expect(msg).toMatch(/上海/);
    expect(msg).toMatch(/3天/);
    expect(msg).toMatch(/3人/);
    expect(msg).toMatch(/亲子玩乐/);
    expect(msg).toMatch(/舒适/);
    expect(msg).toMatch(/适中节奏/);
    expect(msg).toMatch(/打车优先/);
    expect(msg).not.toMatch(/豪华/);
    expect(msg).not.toMatch(/最多\d+个|native_id|duration_min|sources|legs/);
    expect(msg).not.toMatch(/Disney|迪士尼|Universal|theme-park/i);
  });

  it("should_use_plain_english_line_when_locale_en", () => {
    const msg = buildNominateMustSeeUserMessage("Shanghai", 8, 3, {
      trip_type: "family_kids",
      budget: "comfort",
      pace: "medium",
      transit_preference: "drive_walk",
      locale: "EN",
      party_size: 3,
    });
    expect(msg.toLowerCase()).toMatch(/json/);
    expect(msg.toLowerCase()).toMatch(/short place names|map search/);
    expect(msg.toLowerCase()).toMatch(/no parentheses|no brackets/);
    expect(msg.toLowerCase()).toMatch(/do not build an itinerary/);
    expect(msg.toLowerCase()).toMatch(/include at least one/);
    expect(msg.toLowerCase()).toMatch(/day or half-day trip/);
    expect(msg.toLowerCase()).toMatch(/cluster all in one neighborhood/);
    expect(msg.toLowerCase()).toMatch(/no routes, events/);
    expect(msg.toLowerCase()).toMatch(/do not invent coordinates/);
    expect(msg).toMatch(/Kids fun/);
    expect(msg).toMatch(/Comfort/);
    expect(msg).not.toMatch(/native_id|duration_min|sources|legs/);
  });

  it("should_render_hk_and_tw_shells", () => {
    const hk = buildNominateMustSeeUserMessage("上海", 0, 3, {
      trip_type: "family_kids",
      budget: "comfort",
      pace: "medium",
      transit_preference: "drive_walk",
      locale: "HK",
      party_size: 3,
    });
    expect(hk).toMatch(/短地名|JSON/);
    expect(hk).toMatch(/親子玩樂/);
    expect(hk).toMatch(/打車優先/);
    const tw = buildNominateMustSeeUserMessage("上海", 0, 3, {
      trip_type: "family_kids",
      locale: "TW",
      party_size: 3,
    });
    expect(tw).toMatch(/短地名|JSON/);
  });

  it("should_omit_nearby_clause_when_days_under_3", () => {
    const msg = buildNominateMustSeeUserMessage("上海", 0, 2, {
      trip_type: "family_kids",
      locale: "CN",
    });
    expect(msg).not.toMatch(/近郊/);
  });

  it("should_pass_through_already_localized_trip_type", () => {
    const msg = buildNominateMustSeeUserMessage("杭州", 0, 3, {
      trip_type: "情侣浪漫",
      locale: "CN",
      party_size: 2,
    });
    expect(msg).toMatch(/情侣浪漫/);
  });

  it("should_include_known_dates_origin_and_must_include_when_present", () => {
    const msg = buildNominateMustSeeUserMessage("杭州", 0, 3, {
      trip_type: "couple_romance",
      locale: "CN",
      party_size: 2,
      bounds: { start: "2026-07-01", end: "2026-07-04" },
      origin_name: "SFEEL设计师酒店",
      must_include: ["灵隐寺"],
      other: "不要爬山",
    });
    expect(msg).toMatch(/2026-07-01/);
    expect(msg).toMatch(/2026-07-04/);
    expect(msg).toMatch(/7月/);
    expect(msg).toMatch(/夏季/);
    expect(msg).toMatch(/季节专属|该季/);
    expect(msg).toMatch(/SFEEL设计师酒店/);
    expect(msg).toMatch(/灵隐寺/);
    expect(msg).toMatch(/不要爬山/);
  });

  it("should_omit_date_bits_when_bounds_absent", () => {
    const msg = buildNominateMustSeeUserMessage("杭州", 0, 3, {
      trip_type: "couple_romance",
      locale: "CN",
    });
    expect(msg).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("placesOntologyPrompt (L2)", () => {
  it("should_include_attraction_tag_and_forbid_invented_coords", () => {
    const cn = placesOntologyPrompt("CN");
    expect(cn).toMatch(/\[#景点\]/);
    expect(cn).toMatch(/可落到地图上的一个点/);
    expect(cn).not.toMatch(/可停靠/);
    expect(cn).toMatch(/禁止编造坐标/);
    expect(cn).not.toMatch(/duration_min|user_ratings_total/);
  });
});

describe("parseNominatePlaceNames", () => {
  it("should_parse_heading_and_slash_lines_from_plain_list", () => {
    const raw = `
杭州必去推荐（情侣浪漫·豪华·轻松）
# 西湖核心
西湖游船（三潭印月）
苏堤
灵隐寺 / 飞来峰
# 周边
湘湖
`;
    const names = parseNominatePlaceNames(raw);
    expect(names).toContain("西湖游船");
    expect(names).toContain("苏堤");
    expect(names).toContain("灵隐寺 / 飞来峰");
    expect(names).toContain("湘湖");
    expect(names.some((n) => n.startsWith("#") || n.includes("必去推荐"))).toBe(false);
    expect(names.some((n) => n.includes("（") || n.includes("("))).toBe(false);
  });

  it("should_drop_prose_preamble_and_keep_json_bare_names", () => {
    const raw = `以下为说明……\n["断桥","灵隐寺","三潭印月"]`;
    expect(parseNominatePlaceNames(raw)).toEqual(["断桥", "灵隐寺", "三潭印月"]);
  });
});
