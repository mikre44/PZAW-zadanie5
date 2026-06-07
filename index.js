
import 'dotenv/config';

import express from "express";
import categories from "./models/categories.js";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import settings from "./models/settings.js";
import session from "./models/session.js";
import auth from "./controllers/auth.js";
import user from "./models/user.js";

const port = process.env.PORT || 8000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const ONE_MONTH = 30 * ONE_DAY;
const SECRET = process.env.SECRET;

const MAX_CATEGORY_NAME_LENGTH = 25;
const MAX_CARD_NAME_LENGTH = 100;
const MAX_CARD_LINK_LENGTH = 500;

if (SECRET == null) {
  console.error(
    `SECRET environment variable missing.
     Please create an env file or provide SECRET via environment variables.`,
  );
  process.exit(1);
}

const app = express();
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded());
app.use(morgan("dev"));
app.use(cookieParser(SECRET));

app.use(settings.settingsHandler);
app.use(session.sessionHandler);

const settingsRouter = express.Router();
settingsRouter.use("/toggle-theme", settings.themeToggle);
app.use("/settings", settingsRouter);

const authRouter = express.Router();
authRouter.get("/signup", auth.signup_get);
authRouter.post("/signup", auth.signup_post);
authRouter.get("/login", auth.login_get);
authRouter.post("/login", auth.login_post);
authRouter.get("/logout", auth.logout);
authRouter.get("/account", auth.account_get);
app.use("/auth", authRouter);



function requireLogin(req, res, next) {
  if (req.path.startsWith("/auth")) return next();

  if (res.locals.user == null) {
    return res.redirect("/auth/login");
  }

  return next();
}

app.use(requireLogin);




app.get("/:category_name", (req, res) => {
  const category_name = req.params.category_name;
  if (!categories.getCategory(category_name)) {
    res.sendStatus(404);
  } else {
    const userId = session.getUserId(req)
    const cards = categories.getCards(category_name, req).cards;
    const categoriesList = categories.getCategorySummaries(userId).categories;
    const currentUser = user.getUser(userId).username;

    if (cards != null) {
      res.render("cards", {
        title: category_name,
        cards,
        page: req.originalUrl,
        categories: categoriesList,
        username: currentUser,
      });
    } else {
      res.sendStatus(404);
    }
  }
});

app.post("/:category_name/new", (req, res) => {
  const currentCategory = req.params.category_name;
  if (!categories.getCategory(currentCategory)) {
    res.sendStatus(404);
  } else {
    const cardName = String(req.body.name || "").trim();
    const cardLink = String(req.body.link || "").trim();

    if (
      cardName.length === 0 ||
      cardName.length > MAX_CARD_NAME_LENGTH ||
      cardLink.length === 0 ||
      cardLink.length > MAX_CARD_LINK_LENGTH
    ) {
      return res.redirect(`/${currentCategory}`);
    }

    let categoryNames = req.body.categories || [];

    if (!Array.isArray(categoryNames)) {
      categoryNames = [categoryNames];
    }
    const published = req.body.published ? 1 : 0;
    categories.addCard(categoryNames, {
      name: cardName,
      link: cardLink,
    },
    published,
    req
  );
    res.redirect(`/${currentCategory}`);
  }
});

app.post("/:category_name/delete", (req, res) => {

  const currentCategory = req.params.category_name;
  const delete_id = req.body.delete_id

  if(categories.getCardById(delete_id)) {
    categories.deleteCard(req, delete_id);
  }
  if (categories.getCategory(currentCategory)) {
    return res.redirect(`/${currentCategory}`);
  }
  return res.redirect(`/`);

  
});

app.post("/newCategory", (req, res) => {
  const published = req.body.published ? 1 : 0;
  const name = String(req.body.name || "").trim();

  if (name.length === 0 || name.length > MAX_CATEGORY_NAME_LENGTH) {
    return res.redirect("/?error=invalid_category_name");
  }

  categories.addCategory(req, res, published);
});
app.post("/deleteCategory", (req, res) => {
  const delete_id = req.body.delete_id

  categories.deleteCategory(req, delete_id);
  return res.redirect(`/`);

});


app.get("/", (req, res) => {

  const userId = session.getUserId(req);
  const categoriesList = categories.getCategorySummaries(userId).categories;
  const currentUser = user.getUser(userId);

  if(req.query.error) var error = true;
  else error = false;

  res.render("index", {
    title: "Home",
    categories: categoriesList,
    page: req.originalUrl,
    username: currentUser.username,
    error,
  });
});




app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

