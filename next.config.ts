import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep a visited page's render in the client router cache for 30s, so
    // going back to it (or re-clicking its nav link) is instant with no
    // server round trip at all. A server action's revalidatePath still
    // purges this, so a write is never masked by it.
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
