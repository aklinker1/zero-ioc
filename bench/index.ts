import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { generateSvg } from "./utils";

const filter = process.argv[2];

const BENCH_EXT = ".bench.ts";
const outDir = join(import.meta.dir, "results");

const allFiles = await readdir(import.meta.dir, {
  recursive: true,
  withFileTypes: true,
});
const benches = allFiles
  .filter(
    (file) =>
      file.isFile() &&
      file.name.endsWith(BENCH_EXT) &&
      (!filter || file.name.includes(filter)),
  )
  .map((file) => {
    const path = join(file.parentPath, file.name);
    const url = pathToFileURL(path);
    return {
      path,
      url,
      filename: file.name,
      name: file.name.slice(0, -BENCH_EXT.length),
    };
  })
  .toSorted((a, b) => b.path.localeCompare(a.path));

for (let i = 0; i < benches.length; i++) {
  const { url, name } = benches[i]!;
  const { default: benchPromise } = await import(url.href);
  const bench = await benchPromise;
  const svg = generateSvg(bench);
  await mkdir(outDir, { recursive: true });
  await Bun.write(join(outDir, `${name}.svg`), svg);
}
