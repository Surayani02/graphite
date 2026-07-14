/**
 * features/files/format.ts unit tests — envelope round-trip, every typed
 * error code, the migration runner, and file-name derivation. Documents
 * built through the real DocumentModel so "what serialize emits" and
 * "what parse accepts" can never drift apart.
 */
import { describe, expect, it, vi } from "vitest";
import { DocumentModel } from "../document/model";
import {
  FILE_MIGRATIONS,
  FileFormatError,
  GRAPHITE_FILE_VERSION,
  parseGraphiteFile,
  runFileMigrations,
  serializeGraphiteFile,
  suggestedFileName,
  type FileMigration,
} from "../features/files/format";

const FILL = { r: 255, g: 128, b: 0, a: 255 } as const;

function docJson(): string {
  const doc = new DocumentModel("Logo Draft");
  doc.addFrame("f1", 0, 0, 800, 600);
  doc.addRect("r1", "f1", 10, 20, 100, 80, FILL);
  return doc.serialize();
}

function expectCode(fn: () => unknown, code: FileFormatError["code"]): FileFormatError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(FileFormatError);
    if (err instanceof FileFormatError) {
      expect(err.code).toBe(code);
      return err;
    }
  }
  throw new Error(`expected FileFormatError(${code})`);
}

describe("serializeGraphiteFile", () => {
  it("wraps the document in a v1 envelope with a deterministic timestamp", () => {
    const savedAt = new Date("2026-07-13T09:30:00.000Z");
    const text = serializeGraphiteFile(docJson(), savedAt);
    const envelope = JSON.parse(text) as Record<string, unknown>;

    expect(envelope["format"]).toBe("graphite");
    expect(envelope["version"]).toBe(GRAPHITE_FILE_VERSION);
    expect(envelope["savedAt"]).toBe("2026-07-13T09:30:00.000Z");
    expect(envelope["document"]).toEqual(JSON.parse(docJson()));
  });

  it("pretty-prints — .graphite files are diffable artifacts", () => {
    const text = serializeGraphiteFile(docJson());
    expect(text).toContain('\n  "format": "graphite"');
  });

  it("rejects a garbage document payload loudly", () => {
    expectCode(() => serializeGraphiteFile("not json"), "invalid-document");
  });
});

describe("parseGraphiteFile", () => {
  it("round-trips what serializeGraphiteFile wrote", () => {
    const json = docJson();
    const parsed = parseGraphiteFile(serializeGraphiteFile(json));
    expect(parsed).toEqual(JSON.parse(json));
    expect(parsed.name).toBe("Logo Draft");
  });

  it("file-too-large rejects oversized input before any parsing (injected ceiling)", () => {
    const err = expectCode(
      () => parseGraphiteFile("x".repeat(50), FILE_MIGRATIONS, 1, 10),
      "file-too-large"
    );
    expect(err.message).toContain("ceiling is 10");
  });

  it("invalid-json for non-JSON input", () => {
    expectCode(() => parseGraphiteFile("{nope"), "invalid-json");
  });

  it("not-graphite for foreign JSON shapes", () => {
    expectCode(() => parseGraphiteFile("[1,2,3]"), "not-graphite");
    expectCode(() => parseGraphiteFile('{"hello":"world"}'), "not-graphite");
    expectCode(() => parseGraphiteFile('{"format":"sketch","version":1}'), "not-graphite");
    expectCode(() => parseGraphiteFile('{"format":"graphite","version":"1"}'), "not-graphite");
    expectCode(() => parseGraphiteFile('{"format":"graphite","version":0}'), "not-graphite");
  });

  it("unsupported-version for files from a newer Graphite, reporting the version", () => {
    const text = '{"format":"graphite","version":99,"savedAt":"x","document":{}}';
    const err = expectCode(() => parseGraphiteFile(text), "unsupported-version");
    expect(err.fileVersion).toBe(99);
    expect(err.message).toContain("v99");
  });

  it("invalid-document when the payload fails DocumentData validation", () => {
    const text = JSON.stringify({
      format: "graphite",
      version: 1,
      savedAt: "x",
      document: { version: 1, name: "Broken", nodes: [{ id: "orphan" }] },
    });
    expectCode(() => parseGraphiteFile(text), "invalid-document");
  });

  it("runs registered migrations before validating (injected table)", () => {
    // A synthetic v1→v2 world: the v1 payload used `title`, v2 uses `name`.
    const legacy = JSON.parse(docJson()) as Record<string, unknown>;
    legacy["title"] = legacy["name"];
    delete legacy["name"];

    const migrate = vi.fn<FileMigration>((payload) => {
      const { title, ...rest } = payload;
      return { ...rest, name: title };
    });
    const text = JSON.stringify({
      format: "graphite",
      version: 1,
      savedAt: "x",
      document: legacy,
    });

    const parsed = parseGraphiteFile(text, new Map([[1, migrate]]), 2);
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(parsed.name).toBe("Logo Draft");
  });

  it("the production migration table is empty at format v1 — by definition", () => {
    expect(FILE_MIGRATIONS.size).toBe(0);
    expect(GRAPHITE_FILE_VERSION).toBe(1);
  });
});

describe("runFileMigrations", () => {
  it("is the identity when from === to", () => {
    const payload = { a: 1 };
    expect(runFileMigrations(payload, 1, 1, new Map())).toBe(payload);
  });

  it("chains steps in order", () => {
    const calls: number[] = [];
    const table = new Map<number, FileMigration>([
      [
        1,
        (p) => {
          calls.push(1);
          return { ...p, one: true };
        },
      ],
      [
        2,
        (p) => {
          calls.push(2);
          return { ...p, two: true };
        },
      ],
    ]);
    const out = runFileMigrations({}, 1, 3, table);
    expect(calls).toEqual([1, 2]);
    expect(out).toEqual({ one: true, two: true });
  });

  it("a missing step is unsupported-version, never a corrupt document", () => {
    expectCode(() => runFileMigrations({}, 1, 3, new Map()), "unsupported-version");
  });
});

describe("suggestedFileName", () => {
  it("kebab-cases, strips hostile characters, appends the extension", () => {
    expect(suggestedFileName("Logo Draft")).toBe("logo-draft.graphite");
    expect(suggestedFileName('a<b>:c"/d\\e|f?g*h')).toBe("abcdefgh.graphite");
    expect(suggestedFileName("  Spaced   Out  ")).toBe("spaced-out.graphite");
  });

  it("falls back to untitled", () => {
    expect(suggestedFileName("")).toBe("untitled.graphite");
    expect(suggestedFileName("???")).toBe("untitled.graphite");
    expect(suggestedFileName("...")).toBe("untitled.graphite");
  });
});
