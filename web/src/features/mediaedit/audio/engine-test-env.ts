// What the engine's modules read of the browser when they load, for engine-test.ts in Node.
(globalThis as { location?: unknown }).location ??= { pathname: '/', search: '', href: 'http://localhost/' };
