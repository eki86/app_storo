require("dotenv").config();
const express = require("express");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const helmet  = require("helmet");
const cors    = require("cors");
const path    = require("path");

const app = express();

app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionStore = new MySQLStore({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT || 3306,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  clearExpired: true,
  checkExpirationInterval: 900000,
  expiration: 86400000,
  createDatabaseTable: true
});

app.use(session({
  name: "adtrack_sid",
  secret: process.env.SESSION_SECRET || "adtrack_secret_2024",
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// index: false - sprečava da express.static servisira index.html direktno
app.use(express.static(path.join(__dirname, "public"), { index: false }));

app.use("/api/auth",      require("./routes/auth"));
app.use("/api/stores",    require("./routes/stores"));
app.use("/api/settings",  require("./routes/settings"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/orders",    require("./routes/orders"));
app.use("/api/finansije", require("./routes/finansije"));
app.use("/api/creatives", require("./routes/creatives"));
app.use("/api/debug",    require("./routes/debug")); // PRIVREMENO — obriši nakon dijagnostike

app.get("*", (req, res) => {
  if (req.path === "/login.html") {
    return res.sendFile(path.join(__dirname, "public", "login.html"));
  }
  if (!req.session || !req.session.userId) {
    return res.redirect("/login.html");
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("AdTrack running on port " + PORT));