import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const configuredUri = 'mongodb://fake-user:fake-password@example.invalid:27017/fake-db?authSource=admin';
const uriUsername = 'fake-user';
const uriPassword = 'fake-password';

type GlobalWithMongooseCache = typeof globalThis & {
    mongooseCache?: unknown;
};

async function loadDatabaseModule(connectImpl: ReturnType<typeof vi.fn>) {
    vi.resetModules();

    Reflect.deleteProperty(globalThis, 'mongooseCache');
    vi.stubEnv('MONGODB_URI', configuredUri);
    vi.stubEnv('NODE_ENV', 'test');

    const mongooseMock = {
        connect: connectImpl,
    };

    vi.doMock('mongoose', () => ({
        default: mongooseMock,
    }));

    vi.doMock('dns', () => ({
        default: {
            setDefaultResultOrder: vi.fn(),
            setServers: vi.fn(),
        },
    }));

    const databaseModule = await import('./mongoose');

    return {
        connectToDatabase: databaseModule.connectToDatabase,
        mongooseMock,
    };
}

function expectLogsToExcludeSensitiveValues(logSpy: ReturnType<typeof vi.spyOn>) {
    const loggedArguments = logSpy.mock.calls.flat();

    expect(loggedArguments).not.toContain(process.env);

    for (const argument of loggedArguments) {
        const text = String(argument);

        expect(text).not.toContain(configuredUri);
        expect(text).not.toContain(uriUsername);
        expect(text).not.toContain(uriPassword);
        expect(text).not.toContain('mongodb://');
        expect(text).not.toContain('mongodb+srv://');
    }
}

describe('connectToDatabase', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'mongooseCache');
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it('passes the configured URI to mongoose.connect', async () => {
        const connectedMongoose = {};
        const connectImpl = vi.fn(async () => connectedMongoose);
        const { connectToDatabase } = await loadDatabaseModule(connectImpl);

        await connectToDatabase();

        expect(connectImpl).toHaveBeenCalledWith(configuredUri, { bufferCommands: false, family: 4 });
    });

    it('logs a sanitized success message without credential-bearing values', async () => {
        const connectImpl = vi.fn(async () => ({}));
        const { connectToDatabase } = await loadDatabaseModule(connectImpl);

        await connectToDatabase();

        expect(logSpy).toHaveBeenCalledWith('MongoDB connected successfully');
        expectLogsToExcludeSensitiveValues(logSpy);
    });

    it('reuses the cached connection without reconnecting', async () => {
        const connectedMongoose = {};
        const connectImpl = vi.fn(async () => connectedMongoose);
        const { connectToDatabase } = await loadDatabaseModule(connectImpl);

        const firstConnection = await connectToDatabase();
        const secondConnection = await connectToDatabase();

        expect(firstConnection).toBe(connectedMongoose);
        expect(secondConnection).toBe(connectedMongoose);
        expect(connectImpl).toHaveBeenCalledTimes(1);
    });

    it('clears the cached promise and preserves the thrown connection failure', async () => {
        const connectionError = new Error('connection failed');
        const connectImpl = vi.fn(async () => {
            throw connectionError;
        });
        const { connectToDatabase } = await loadDatabaseModule(connectImpl);

        await expect(connectToDatabase()).rejects.toBe(connectionError);

        const cache = (globalThis as GlobalWithMongooseCache).mongooseCache as {
            conn: unknown;
            promise: unknown;
        };
        expect(cache.conn).toBeNull();
        expect(cache.promise).toBeNull();
    });
});
