import { Bench, type BenchOptions } from "tinybench";

export async function defineBench(
  options: BenchOptions,
  setup: (bench: Bench) => void,
): Promise<Bench> {
  const bench = new Bench(options);

  console.log(bench.name);
  setup(bench);
  await bench.run();
  console.table(bench.table());
  console.log();

  return bench;
}

export function generateSvg(bench: Bench): string {
  const results = bench
    .table()
    .filter((res) => res != null)
    .map((res) => ({
      x: Number((res["Throughput avg (ops/s)"] as string).split(" ± ")[0]),
      y: res["Task name"] as string,
    }));
  const maxX = Math.max(...results.map((res) => res.x));
  const n = results.length;

  const WIDTH = 672;
  const TITLE_HEIGHT = 48;
  const Y_AXIS_LABEL_WIDTH = 113;
  const ROW_HEIGHT = 32;
  const PADDING = 16;
  const ROW_GAP = 16;
  const LABEL_PADDING = 10;

  const xAxisTop = PADDING + TITLE_HEIGHT + PADDING;
  const yAxisLeft = PADDING + Y_AXIS_LABEL_WIDTH + ROW_GAP;
  const height = xAxisTop + (n - 1) * ROW_GAP + n * ROW_HEIGHT;
  const totalHeight = height + PADDING;

  const container = Rect.fromPoints(PADDING, PADDING, WIDTH - PADDING, height);

  const titleRect = new Rect(
    container.top,
    container.left,
    container.width,
    TITLE_HEIGHT,
  );

  const yAxisLabelContainer = Rect.fromPoints(
    container.top,
    xAxisTop,
    container.left + Y_AXIS_LABEL_WIDTH,
    height,
  );
  const yAxisGap = yAxisLabelContainer.rightOf(ROW_GAP);
  const rowY = (i: number) =>
    yAxisLabelContainer.top + i * ROW_GAP + i * ROW_HEIGHT;

  const barsContainer = Rect.fromPoints(
    yAxisLeft,
    xAxisTop,
    container.right,
    height,
  );

  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${totalHeight}" fill="currentColor" width="${WIDTH}" height="${totalHeight}" background-color="white" font-family="sans-serif">`,
    container.toBoundingRect(),

    // Title
    titleRect.toBoundingRect(),
    titleRect.toText(bench.name!, {
      textAlign: "start",
      fontSize: 24,
      fontWeight: "bold",
    }),

    // xAxisLabel.toText(`${maxXFormatted} Ops / S`, {
    //   textAlign: "end",
    //   fontSize: 12,
    // }),
    // xAxisLabel.toBoundingRect(),

    // Bars
    ...results.flatMap((res, i) => {
      const rect = new Rect(
        barsContainer.left,
        rowY(i),
        barsContainer.width * (res.x / maxX),
        ROW_HEIGHT,
      );
      const textInsideBox = res.x > maxX * 0.75;
      const textRect = textInsideBox
        ? rect.clone({ width: rect.width - LABEL_PADDING })
        : rect.clone({
            x: rect.right + LABEL_PADDING,
            width: container.right - rect.right - LABEL_PADDING,
          });
      return [
        rect.toRect({ fill: res.x === maxX ? "lightskyblue" : "gainsboro" }),
        rect.toBoundingRect(),
        textRect.toText(`${res.x.toLocaleString()} ops/s`, {
          dominantBaseline: "middle",
          textAlign: textInsideBox ? "end" : "start",
          fontSize: 12,
          fontWeight: textInsideBox ? "bold" : "regular",
          // color: textInsideBox ? "white" : "black",
        }),
        textRect.toBoundingRect(),
      ];
    }),

    // Y-Axis
    yAxisLabelContainer.toBoundingRect(),
    yAxisGap.toBoundingRect(),
    ...results.flatMap((res, i) => {
      const rect = new Rect(
        yAxisLabelContainer.left,
        rowY(i),
        yAxisLabelContainer.width,
        ROW_HEIGHT,
      );
      return [
        rect.toBoundingRect(),
        rect.toText(res.y, {
          textAlign: "end",
          fontSize: 12,
          fontWeight: res.y === "@aklinker1/zero-ioc" ? "bold" : "regular",
        }),
      ];
    }),

    `</svg>`,
  ];
  return lines.join("");
}

const DEBUG_SVG = process.env.DEBUG_SVG === "true";

class Rect {
  static fromPoints(x1: number, y1: number, x2: number, y2: number): Rect {
    return new Rect(x1, y1, x2 - x1, y2 - y1);
  }

  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number,
  ) {}

  beneath(newHeight: number): Rect {
    return new Rect(this.x, this.y + this.height, this.width, newHeight);
  }

  rightOf(newWidth: number): Rect {
    return new Rect(this.x + this.width, this.y, newWidth, this.height);
  }

  clone(overrides?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): Rect {
    return new Rect(
      overrides?.x ?? this.x,
      overrides?.y ?? this.y,
      overrides?.width ?? this.width,
      overrides?.height ?? this.height,
    );
  }

  get top() {
    return this.y;
  }

  get bottom() {
    return this.y + this.height;
  }

  get left() {
    return this.x;
  }

  get right() {
    return this.x + this.width;
  }

  toBoundingRect(): string {
    if (!DEBUG_SVG) return "";
    return `<rect stroke="red" stroke-width="1" fill="none" x="${this.x}" y="${this.y}" width="${this.width}" height="${this.height}" />`;
  }

  toText(
    text: string,
    attrs?: {
      textAlign?: "start" | "middle" | "end";
      dominantBaseline?: "top" | "middle" | "bottom";
      fontSize?: number;
      fontWeight?: "bold" | "regular";
      color?: string;
    },
  ): string {
    let x = this.x;
    let y = this.y;

    const {
      textAlign = "middle",
      dominantBaseline = "middle",
      fontSize = 16,
      fontWeight = "regular",
      color = "black",
    } = attrs ?? {};

    if (textAlign === "middle") x += this.width / 2;
    if (textAlign === "end") x += this.width;

    if (dominantBaseline === "middle") y += this.height / 2;
    if (dominantBaseline === "bottom") y += this.height;

    return `<text x="${x}" y="${y}" text-anchor="${textAlign}" dominant-baseline="${dominantBaseline}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}">${text}</text>`;
  }

  toRect(attrs?: { fill?: string }): string {
    const { fill = "grey" } = attrs ?? {};
    return `<rect fill="${fill}" x="${this.x}" y="${this.y}" width="${this.width}" height="${this.height}" />`;
  }
}
