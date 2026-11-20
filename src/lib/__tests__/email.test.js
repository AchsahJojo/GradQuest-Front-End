import { isSyntheticEmail, isDeliverableEmail, looksLikeEmail } from "../email";

describe("email helpers", () => {
  it("treats missing and noreply addresses as synthetic", () => {
    expect(isSyntheticEmail(null)).toBe(true);
    expect(isSyntheticEmail("")).toBe(true);
    expect(isSyntheticEmail("login@github.noreply")).toBe(true);
    expect(isSyntheticEmail("user@discord.noreply")).toBe(true);
    expect(isSyntheticEmail("you@example.com")).toBe(false);
    expect(isSyntheticEmail("tester@dev.local")).toBe(false);
  });

  it("prefers emailDeliverable from /api/me when present", () => {
    expect(isDeliverableEmail("you@example.com", { emailDeliverable: false })).toBe(false);
    expect(
      isDeliverableEmail("login@github.noreply", { emailDeliverable: true })
    ).toBe(true);
    expect(isDeliverableEmail(null, { email: "a@b.co" })).toBe(true);
  });

  it("validates simple email shape and rejects noreply", () => {
    expect(looksLikeEmail("you@example.com")).toBe(true);
    expect(looksLikeEmail("not-an-email")).toBe(false);
    expect(looksLikeEmail("x@github.noreply")).toBe(false);
  });
});
