/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      { source: "/load_rl", destination: "/api/rl/load_rl" },
      { source: "/save_rl", destination: "/api/rl/save_rl" },
      { source: "/save_rl_full", destination: "/api/rl/save_rl_full" },
    ];
  },
};

module.exports = nextConfig;
