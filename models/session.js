  import { DatabaseSync } from "node:sqlite";
  import { randomBytes } from "node:crypto";
  import { getUser } from "./user.js";

  const db_path = "./db.sqlite";
  const db = new DatabaseSync(db_path, { readBigInts: true });

  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  const IS_PROD = process.env.NODE_ENV === "production";
  const SESSION_COOKIE = IS_PROD ? "__Host-fisz-id" : "fisz-id";

  db.exec(`
    CREATE TABLE IF NOT EXISTS fc_session (
      id              TEXT,
      user_id         INTEGER,
      created_at      INTEGER
    ) STRICT;
  `);

  const db_ops = {
    create_session: db.prepare(
      `INSERT INTO fc_session (id, user_id, created_at)
      VALUES (?, ?, ?)
      RETURNING id, user_id, created_at;`
    ),
    get_session: db.prepare(
      "SELECT id, user_id, created_at FROM fc_session WHERE id = ?;"
    ),
  };

  function createSession(user, res) {
    let sessionId = randomBytes(32).toString("hex");
    let createdAt = Date.now();

    let session = db_ops.create_session.get(sessionId, user, createdAt);
    res.locals.session = session;
    res.locals.user = user != null ? getUser(user) : null;

    res.cookie(SESSION_COOKIE, sessionId, {
      maxAge: ONE_WEEK,
      httpOnly: true,
      secure: IS_PROD,
      path: "/",
      sameSite: "lax",
    });

    return session;
  }

  function deleteSession(res) {
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: IS_PROD,
      path: "/",
      sameSite: "lax",
    });
    res.locals.session = null;
    res.locals.user = null;
  }

  function sessionHandler(req, res, next) {
    let sessionId = req.cookies[SESSION_COOKIE];
    let session = null;

    if (typeof sessionId === "string" && sessionId.length > 0) {
      session = db_ops.get_session.get(sessionId);
    }

    if (session != null) {
      res.locals.session = session;
      res.locals.user = session.user_id != null ? getUser(session.user_id) : null;

      res.cookie(SESSION_COOKIE, session.id, {
        maxAge: ONE_WEEK,
        httpOnly: true,
        secure: IS_PROD,
        path: "/",
        sameSite: "lax",
      });
    } else {
      res.locals.session = null;
      res.locals.user = null;
    }

    next();
  }

  export function getUserId(req){
    let sessionId = req.cookies[SESSION_COOKIE];
    let session = null;

    if (typeof sessionId === "string" && sessionId.length > 0) {
      session = db_ops.get_session.get(sessionId);
    }
    if (session == null) return null
    return session.user_id
  }

  export default {
    createSession,
    deleteSession,
    sessionHandler,
    getUserId
  };