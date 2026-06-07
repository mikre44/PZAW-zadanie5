
import { DatabaseSync } from "node:sqlite";
import session, { getUserId } from "./session.js";
import { isAdmin } from "./user.js";




const db_path = "./db.sqlite";
const db = new DatabaseSync(db_path);


const categories = {
  "games": {
    title: "games",
    link: [
      { name: "Slope", link: "https://slopegame.io" },
      { name: "super mario bros", link: "https://supermarioplay.com" },
      { name: "Geoguessr", link: "https://www.geoguessr.com" },
      { name: "Little Alchemy 2", link: "https://littlealchemy2.com" },

    ],
  },
  "sites": {
    title: "sites",
    link: [ 
      { name: "W3Schools", link: "https://www.w3schools.com" },
      { name: "FreeCodeCamp", link: "https://www.freecodecamp.org" },
      { name: "MDN Web Docs", link: "https://developer.mozilla.org" },
      { name: "Codewars", link: "https://www.codewars.com" },
    ],
  },
};

db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    user_id     INTEGER NOT NULL,
    published   INTEGER DEFAULT 0,
    created_at      INTEGER
  ) STRICT;
`);


db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    link        TEXT NOT NULL,
    user_id     INTEGER NOT NULL,
    published   INTEGER DEFAULT 0,
    created_at  INTEGER
  ) STRICT;
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS categories_links (
    category_id INTEGER NOT NULL,
    link_id     INTEGER NOT NULL,
    PRIMARY KEY (category_id, link_id),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (link_id)     REFERENCES links(id)     ON DELETE CASCADE
  ) STRICT;
`);


const db_ops = {

  get_categories: db.prepare(
    "SELECT DISTINCT id, name, user_id FROM categories WHERE user_id = ? OR published >= ?;"
  ),
  get_cards: db.prepare(
    `SELECT links.id, links.name, link, links.user_id FROM links
    JOIN categories_links ON links.id = categories_links.link_id
    JOIN categories ON categories_links.category_id = categories.id
    WHERE categories.name = ? AND (links.user_id = ? OR links.published >= ?)`
  ),
  get_card_by_id: db.prepare(
  `SELECT * FROM links WHERE id = ?;`
  ),
  get_category: db.prepare(
    `SELECT * FROM categories WHERE name = ?;`
  )
};




// process.env.POPULATE_DB = "1";
// ^^^ na windowsie działa


const checkForMinimumData =  
  db.prepare(
    `SELECT * FROM 'links';`
  ).all();

if(checkForMinimumData.length === 0 ||  process.env.POPULATE_DB){
  console.log("Populating db...");

  Object.values(categories).forEach((category) => {

    const insertedCategory = db
    .prepare(
      `INSERT INTO categories (name, user_id, published)
      VALUES (?, 1, 1);`
    )
    .run(category.title);
    console.log("Inserted to categories:", {
    category: category.title,
    });


    category.link.forEach((item) => {
      const insertedLink  = db
      .prepare(
            `INSERT INTO links (name, link, user_id, published)
            VALUES (?, ?, 1, 1);`
        ) .run(item.name, item.link);
        
      const linkId = insertedLink.lastInsertRowid;
      console.log("Inserted link:", {
        id: linkId,
        category: category.title,
        name: item.name,
        link: item.link
      });
      
      const categoryId = db_ops.get_category.get(category.title).id;

      db.prepare(
        `INSERT INTO categories_links (category_id, link_id)
        VALUES (?, ?);`
      ).run(categoryId, linkId);

      console.log("Inserted foreign key:", {
        category_id: categoryId,
        link_id: linkId
      });
    });
    
  });
}






export function getCategorySummaries(userId) {
    if (isAdmin(userId)){
    var mustBePublished = 0;
  }
  else{
    var mustBePublished = 1;
  } 
  const categories = db_ops.get_categories.all(userId, mustBePublished);
  if (categories.length === 0) {
    return{categories: 0};
  }
  return {
    categories: categories.map(category => ({
      id: category.id,
      name: category.name,
      parent: category.user_id == userId || mustBePublished == 0
    }))
  };
}

export function getCategory(categoryName){
    const category = db_ops.get_category.get(categoryName);
  return category;
}

export function getCards(categoryName, req) {

  let userId = getUserId(req)
  if (isAdmin(userId)){
    var mustBePublished = 0;
  }
  else{
    var mustBePublished = 1;
  }


  const cards = db_ops.get_cards.all(categoryName, userId, mustBePublished);

  if (cards.length === 0) {
    return{cards: 0};
  }
  return {
    cards: cards.map(card => ({
      id: card.id, 
      name: card.name,
      link: card.link,
      parent: card.user_id == userId || mustBePublished === 0
    }))
  };
}

export function getCardById(cardId){
  const card = db_ops.get_card_by_id.get(cardId)
  return card;
}

const MAX_CATEGORY_NAME_LENGTH = 25;
const MAX_CARD_NAME_LENGTH = 100;
const MAX_CARD_LINK_LENGTH = 500;

function isValidCategoryName(name) {
  return typeof name === "string" && name.trim().length > 0 && name.trim().length <= MAX_CATEGORY_NAME_LENGTH;
}

function isValidCardValue(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

export function addCard(categoryNames, card, published, req) {
  if (
    !isValidCardValue(card.name, MAX_CARD_NAME_LENGTH) ||
    !isValidCardValue(card.link, MAX_CARD_LINK_LENGTH)
  ) {
    return false;
  }

  categoryNames.forEach(name => {
    const category = db.prepare(`SELECT id FROM categories WHERE name = ?;`).get(name);
    if (!category) {
      return;
    }

    const categoryid = category.id;
    const userId = getUserId(req);
    const insertedLink = db
      .prepare(
        `INSERT INTO links (name, link, user_id, published)
        VALUES (?, ?, ?, ?) RETURNING id, name, link;`
      )
      .get(card.name.trim(), card.link.trim(), userId, published);

    const linkId = insertedLink.id;
    db.prepare(`INSERT INTO categories_links (category_id, link_id) VALUES (?, ?);`).run(categoryid, linkId);
  });
  return true;
}
export function deleteCard(req, cardId){
    const userId = getUserId(req);
    let card;
    if (isAdmin(userId)){
      card = db.
      prepare("SELECT * FROM links WHERE id = ?")
      .get(cardId);
    }
    else{

      card = db.
      prepare("SELECT * FROM links WHERE id = ? AND user_id = ?;")
      .get(cardId, userId);
    }

    if (card){
      db.prepare(
      `DELETE FROM links WHERE id = ?;`
      ).run(cardId)
    }
}

export function addCategory(req, res, published) {
  const userId = getUserId(req);
  const name = String(req.body.name || "").trim();

  if (!isValidCategoryName(name) || !userId) {
    return res.redirect("/?error=invalid_category_name");
  }

  const availableName = !db_ops.get_category.get(name);

  if (availableName) {
    db.prepare(`
      INSERT INTO categories (name, user_id, published)
      VALUES (?, ?, ?);
    `).run(name, userId, published);
    res.redirect("/");
  } else {
    return res.redirect("/?error=zajeta_nazwa");
  }
}


export function deleteCategory(req, categoryId) {
  const userId = getUserId(req);
    let category;
    if (isAdmin(userId)){
      category = db
      .prepare("SELECT * FROM categories WHERE id = ?;")
      .get(categoryId);
    }
    else{

      category = db.
      prepare("SELECT * FROM categories WHERE id = ? AND user_id = ?;")
      .get(categoryId, userId);
    }

    if (category){
      db.prepare(
      `DELETE FROM categories WHERE id = ?;`
      ).run(categoryId)
    }
}

export default {
  getCategorySummaries,
  getCards,
  getCardById,
  addCard,
  deleteCard,
  getCategory,
  addCategory,
  deleteCategory
};
