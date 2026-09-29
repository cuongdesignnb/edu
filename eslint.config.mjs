import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "node_modules/**", "references/**", "preview/**", "public/**", "scripts/**"] },
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "@next/next/no-img-element": "off",
    },
  },
];
export default config;
