import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../lib/auth/password";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse");
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("correct horsE", stored)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it.each(["", "plain", "bcrypt$x$y", "scrypt$16384$8$1$c2FsdA$c2hvcnQ", "scrypt$abc$8$1$c2FsdA$" + "A".repeat(86)])(
    "returns false for malformed stored value %#",
    async (stored) => {
      expect(await verifyPassword("x", stored)).toBe(false);
    },
  );
});
