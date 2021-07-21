import { Options } from "tsup";

export const tsup: Options = {
    target: "node14",
    entryPoints: ["./src/index.ts"],
    clean: true,
    sourcemap: true,
    dts: true,
    splitting: true,
    format: ["cjs", "esm"],
    external: ["discord.js", "discord-api-types"],
};
