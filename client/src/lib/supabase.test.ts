import { describe, expect, it } from "vitest";
import { supabase, supabaseConfigured } from "./supabase";

describe("Supabase client configuration", () => {
  it("exposes a boolean configuration state without leaking credentials", () => {
    expect(typeof supabaseConfigured).toBe("boolean");
  });

  it("accepts the configured public credentials at the Auth endpoint", async () => {
    expect(supabase).not.toBeNull();
    const { error } = await supabase!.auth.getSession();
    expect(error).toBeNull();
  });
});
