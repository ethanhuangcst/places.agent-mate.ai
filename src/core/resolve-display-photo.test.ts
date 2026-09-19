import { describe, expect, it } from "vitest";
import {
  isDisplayablePhotoUrl,
  pickDisplayablePhotoUrl,
} from "./resolve-display-photo";

const GOOGLE_CDN =
  "https://lh3.googleusercontent.com/grass-cs/ACvplmOe8KCuyS9mjCCizL3TveFa1Q4VSiK833YJ1T-_jgHO0Xycbj8htOt7QAkdIyONKxwedV2LVGev_0vpxubggmLkXnkgiDGPsqRHYsBJ2qvtgkbqmYg0l5KDkuMUjd9dD56cYGiO5xfWfbQ7=s4800-w800";

describe("isDisplayablePhotoUrl", () => {
  it("should_reject_rfc2606_placeholder_hosts", () => {
    expect(isDisplayablePhotoUrl("https://cdn.example.com/verify_belem.jpg")).toBe(false);
    expect(isDisplayablePhotoUrl("https://sub.example.org/x.jpg")).toBe(false);
    expect(isDisplayablePhotoUrl("https://example.net/photo.jpg")).toBe(false);
  });

  it("should_accept_vendor_cdn_https", () => {
    expect(isDisplayablePhotoUrl(GOOGLE_CDN)).toBe(true);
  });

  it("pickDisplayablePhotoUrl_skips_example_com", () => {
    expect(
      pickDisplayablePhotoUrl([
        "https://cdn.example.com/fake.jpg",
        GOOGLE_CDN,
      ]),
    ).toBe(GOOGLE_CDN);
  });
});
