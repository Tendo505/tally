import type { Group } from "../lib/types";
import { initialState, validateGroup, type AppState } from "./reducer";

const STORAGE_KEY = "tally:v1";

/** Load saved state. Corrupt or unavailable storage falls back to an empty app, never a crash. */
export function loadState(storage: Storage | undefined = safeLocalStorage()): AppState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as AppState;
    const groups = Array.isArray(parsed.groups) ? parsed.groups.filter(isValidGroup) : [];
    const activeGroupId = groups.some((g) => g.id === parsed.activeGroupId) ? parsed.activeGroupId : groups[0]?.id ?? null;
    return { groups, activeGroupId };
  } catch {
    return initialState;
  }
}

export function saveState(state: AppState, storage: Storage | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded or storage blocked: the app keeps working in memory */
  }
}

function isValidGroup(g: unknown): g is Group {
  try {
    validateGroup(g);
    return typeof (g as Group).id === "string";
  } catch {
    return false;
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

// ---------- share links ----------
// A group is serialised to JSON, deflate-compressed, and base64url-encoded into
// the URL fragment. The fragment never reaches a server, so shared data stays
// between the people who have the link.

export async function encodeShareLink(group: Group, baseUrl: string): Promise<string> {
  const { id: _omit, ...data } = group;
  const bytes = await compress(new TextEncoder().encode(JSON.stringify(data)));
  return `${baseUrl}#share=${toBase64Url(bytes)}`;
}

export async function decodeShareFragment(hash: string): Promise<Group | null> {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("share");
  if (!token) return null;
  const json = new TextDecoder().decode(await decompress(fromBase64Url(token)));
  const group = { ...JSON.parse(json), id: "shared" } as unknown;
  validateGroup(group);
  return group;
}

async function compress(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Response(data).body!.pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompress(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Response(data).body!.pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
