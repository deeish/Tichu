/**
 * Optional persistence for in-memory games (P4).
 * When REDIS_URL is set, game JSON is written to Redis (debounced) so a process
 * restart can reload rooms; all sockets are cleared so clients must reconnect / rejoin.
 */

const KEY_PREFIX = 'tichu:game:';

function isTestGame(game) {
  return Array.isArray(game?.players) && game.players.some((p) => p?.isTestPlayer);
}

/**
 * After loading from Redis, no live sockets exist — force everyone disconnected so rejoin works.
 */
function normalizeRestoredGame(game) {
  if (!game || typeof game !== 'object') return;
  const now = Date.now();
  for (const p of game.players || []) {
    if (!p || typeof p !== 'object') continue;
    p.socketId = null;
    p.disconnected = true;
    if (p.disconnectedAt == null) p.disconnectedAt = now;
  }
}

function createNoopPersistence() {
  return {
    async init() {},
    scheduleSave() {},
    async deleteGame() {},
    async restoreIntoMap() {},
    isEnabled: false,
  };
}

function createRedisPersistence(redisUrl) {
  const { createClient } = require('redis');
  let client = null;
  const debounceTimers = new Map();
  /** Bumped on delete so a late async SET cannot resurrect a removed game. */
  const saveEpochByGameId = new Map();
  const DEBOUNCE_MS = Number(process.env.GAME_REDIS_SAVE_DEBOUNCE_MS) || 400;

  function bumpSaveEpoch(gameId) {
    saveEpochByGameId.set(gameId, (saveEpochByGameId.get(gameId) ?? 0) + 1);
  }

  async function init() {
    try {
      client = createClient({ url: redisUrl });
      client.on('error', (err) => console.error('[redis]', err?.message ?? err));
      await client.connect();
      console.log('[persist] Redis connected for game snapshots');
    } catch (e) {
      console.error('[persist] Redis connect failed — continuing without snapshots:', e?.message ?? e);
      client = null;
    }
  }

  async function saveGameNow(game, epochAtSchedule) {
    if (!client || !game?.id || isTestGame(game)) return;
    if ((saveEpochByGameId.get(game.id) ?? 0) !== epochAtSchedule) return;
    try {
      await client.set(KEY_PREFIX + game.id, JSON.stringify(game));
      if ((saveEpochByGameId.get(game.id) ?? 0) !== epochAtSchedule) {
        await client.del(KEY_PREFIX + game.id).catch(() => {});
      }
    } catch (e) {
      console.error('[persist] save failed', game.id, e?.message ?? e);
    }
  }

  function scheduleSave(game) {
    if (!client || !game?.id || isTestGame(game)) return;
    const id = game.id;
    const epoch = saveEpochByGameId.get(id) ?? 0;
    const prev = debounceTimers.get(id);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      debounceTimers.delete(id);
      saveGameNow(game, epoch).catch((e) => console.error('[persist]', e?.message ?? e));
    }, DEBOUNCE_MS);
    if (typeof t.unref === 'function') t.unref();
    debounceTimers.set(id, t);
  }

  async function deleteGame(gameId) {
    if (!client || !gameId) return;
    bumpSaveEpoch(gameId);
    const prev = debounceTimers.get(gameId);
    if (prev) clearTimeout(prev);
    debounceTimers.delete(gameId);
    try {
      await client.del(KEY_PREFIX + gameId);
    } catch (e) {
      console.error('[persist] delete failed', gameId, e?.message ?? e);
    }
    // Keep saveEpochByGameId[gameId] bumped so any in-flight saveGameNow(epochBeforeDelete) aborts.
  }

  async function restoreIntoMap(gamesMap) {
    if (!client) return;
    try {
      for await (const key of client.scanIterator({ MATCH: `${KEY_PREFIX}*`, COUNT: 64 })) {
        const raw = await client.get(key);
        if (!raw) continue;
        let game;
        try {
          game = JSON.parse(raw);
        } catch (e) {
          console.error('[persist] bad JSON for', key, e?.message ?? e);
          continue;
        }
        if (!game?.id) continue;
        if (isTestGame(game)) {
          await client.del(key).catch(() => {});
          continue;
        }
        normalizeRestoredGame(game);
        gamesMap.set(game.id, game);
      }
    } catch (e) {
      console.error('[persist] restore failed:', e?.message ?? e);
    }
  }

  return {
    init,
    scheduleSave,
    deleteGame,
    restoreIntoMap,
    get isEnabled() {
      return client != null;
    },
  };
}

function createGameplayPersistence(maybeUrl) {
  const url = typeof maybeUrl === 'string' ? maybeUrl.trim() : '';
  if (!url) return createNoopPersistence();
  return createRedisPersistence(url);
}

module.exports = {
  createGameplayPersistence,
  normalizeRestoredGame,
  isTestGame,
  KEY_PREFIX,
};
