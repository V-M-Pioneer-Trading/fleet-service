/**
 * @file Typed access to the calls a `jest.fn()` standing in for `global.fetch` received.
 *
 * `jest.fn()` is untyped, so `mock.calls[0][1].headers` is `any` all the way
 * down. Every outbound request this service makes carries a URL and an init
 * object with headers; this names that shape once.
 */

export type FetchCall = [url: string, init: { headers: Record<string, string>; body: string; signal: AbortSignal }];

/** The calls recorded by a mocked `fetch`: pass the mock, or `global.fetch` once it is one. */
export const fetchCalls = (mock: unknown): FetchCall[] => (mock as jest.Mock<unknown, FetchCall>).mock.calls;
