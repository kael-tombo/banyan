import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { installBrokenPipeGuard, isPipeGone } from "@/lib/runtime/broken-pipe-guard";

const setup = () => {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const exits: number[] = [];
  installBrokenPipeGuard({ stdout, stderr }, (c) => exits.push(c));
  return { stdout, stderr, exits };
};
const err = (code: string) => Object.assign(new Error(code), { code });

describe("broken-pipe guard (orphaned dev server)", () => {
  it("exits once when stderr's reader is gone, instead of looping on the error", () => {
    const { stderr, exits } = setup();
    stderr.emit("error", err("EPIPE"));
    stderr.emit("error", err("EPIPE"));
    expect(exits).toEqual([0]);
  });

  it("watches stdout too, and a destroyed stream counts as gone", () => {
    const { stdout, exits } = setup();
    stdout.emit("error", err("ERR_STREAM_DESTROYED"));
    expect(exits).toEqual([0]);
  });

  it("ignores other stream errors", () => {
    const { stderr, exits } = setup();
    stderr.emit("error", err("EAGAIN"));
    expect(exits).toEqual([]);
  });

  it("recognises only pipe-gone codes", () => {
    expect(isPipeGone({ code: "EPIPE" })).toBe(true);
    expect(isPipeGone({ code: "ENOENT" })).toBe(false);
    expect(isPipeGone(undefined)).toBe(false);
  });
});
