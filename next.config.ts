import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // `forbidden()` is how a page refuses a role that lacks the capability.
    // Without this flag the call throws instead of rendering the 403 page, and
    // a user without permission gets a server error rather than an explanation.
    authInterrupts: true,
  },
}

export default nextConfig
