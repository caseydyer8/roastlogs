// S2: a hung request must not freeze the per-id queue or the single-flight drain.
// The request is aborted (AbortController), never merely raced, so a late write
// cannot land after a newer one.
import { enqueueUpload } from "./lib/pendingUploads";

let mockBehavior;
let mockUid = "A";
const mockCalls = [];

jest.mock("./supabaseClient", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: mockUid === undefined ? null : { user: { id: mockUid } } } }) },
    from: () => ({
      upsert: (row) => mockMakeBuilder("upsert", row),
      delete: () => ({ eq: (_c, id) => mockMakeBuilder("delete", id) }),
    }),
  },
}));

function mockMakeBuilder(kind, arg) {
  let signal;
  const b = {
    abortSignal: (s) => { signal = s; return b; },
    then: (res, rej) => {
      mockCalls.push({ kind, arg, signal });
      return mockBehavior(signal).then(res, rej);
    },
  };
  return b;
}

const { syncRoastToSupabase, deleteRoastFromSupabase, setRequestTimeoutMs } = require("./syncService");

const hang = (signal) =>
  new Promise((_res, rej) => signal.addEventListener("abort", () => rej(new Error("aborted"))));

beforeEach(() => { mockCalls.length = 0; mockUid = "A"; setRequestTimeoutMs(20); });
afterAll(() => setRequestTimeoutMs(30000));

test("a never-settling upsert resolves false after the timeout, and the next queued write proceeds", async () => {
  mockBehavior = (signal) => (mockCalls.length === 1 ? hang(signal) : Promise.resolve({ error: null }));
  const first = enqueueUpload(1, () => syncRoastToSupabase({ id: 1 }));
  const second = enqueueUpload(1, () => syncRoastToSupabase({ id: 1 }));
  expect(await first).toBe(false);
  expect(await second).toBe(true);
  expect(mockCalls[0].signal.aborted).toBe(true);
  expect(mockCalls.length).toBe(2);
});

test("a never-settling delete resolves false after the timeout", async () => {
  mockBehavior = (signal) => hang(signal);
  expect(await deleteRoastFromSupabase(3)).toBe(false);
  expect(mockCalls[0].signal.aborted).toBe(true);
});

test("an expected uid that differs from the signed-in user sends nothing", async () => {
  mockBehavior = () => Promise.resolve({ error: null });
  expect(await syncRoastToSupabase({ id: 1 }, "B")).toBe(false);
  expect(mockCalls.length).toBe(0);
  expect(await syncRoastToSupabase({ id: 1 }, "A")).toBe(true);
});

test("no expected uid, or no resolvable current uid (e2e bypass), still sends", async () => {
  mockBehavior = () => Promise.resolve({ error: null });
  expect(await syncRoastToSupabase({ id: 1 })).toBe(true);
  expect(await syncRoastToSupabase({ id: 1 }, null)).toBe(true);
  mockUid = undefined;
  expect(await syncRoastToSupabase({ id: 1 }, undefined)).toBe(true);
});
