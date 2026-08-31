import { afterEach, describe, expect, it, vi } from "vitest";

const execFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
}));

import { getCleanPythonEnv, resolveSystemPython } from "./python_manager";

const originalPythonBin = process.env.PYTHON_BIN;
const originalPath = process.env.PATH;

afterEach(() => {
  execFileSyncMock.mockReset();
  if (originalPythonBin === undefined) delete process.env.PYTHON_BIN;
  else process.env.PYTHON_BIN = originalPythonBin;
  process.env.PATH = originalPath;
});

describe("Python runtime selection", () => {
  it("accepts the Windows launcher default Python 3 when it is 3.10 or newer", () => {
    delete process.env.PYTHON_BIN;
    execFileSyncMock.mockImplementation((command: string, args: string[]) => {
      if (command === "py" && args[0] === "-3") return Buffer.from("");
      throw new Error("not installed");
    });

    expect(resolveSystemPython({ PATH: "C:\\Windows" })).toEqual({
      command: "py",
      args: ["-3"],
    });
  });

  it("does not discard a normal Python 3.13 PATH entry", () => {
    process.env.PATH = [
      "C:\\Python\\cpython-3.13",
      "C:\\Windows\\System32",
    ].join(";");

    expect(getCleanPythonEnv().PATH).toContain("cpython-3.13");
  });
});
