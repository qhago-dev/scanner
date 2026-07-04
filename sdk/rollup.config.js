import typescript from "@rollup/plugin-typescript";
import { terser } from "rollup-plugin-terser";

export default [
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/index.js",
        format: "cjs",
        sourcemap: true,
      },
      {
        file: "dist/index.mjs",
        format: "es",
        sourcemap: true,
      },
    ],
    plugins: [typescript({ tsconfig: "./tsconfig.json" })],
    external: [],
  },
  {
    input: "src/index.ts",
    output: {
      file: "dist/index.min.js",
      format: "iife",
      name: "ScanAI",
    },
    plugins: [
      typescript({ tsconfig: "./tsconfig.json" }),
      terser(),
    ],
  },
];
