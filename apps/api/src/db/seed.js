// ---------------------------------------------------------------------------
// Seed — creates default admin, starter videos, content & settings.
// Idempotent: safe to run repeatedly; never overwrites existing rows.
//   npm run seed
// ---------------------------------------------------------------------------
import bcrypt from "bcryptjs";
import { getDb } from "./index.js";
import repo from "./repository.js";
import config from "../config.js";
import { slugify } from "../services/slug.js";

const db = getDb();

if (!repo.users.count()) {
  const hash = await bcrypt.hash(config.adminPassword, config.bcryptRounds);
  repo.users.create({ name: config.adminName, email: config.adminEmail, passwordHash: hash, role: "admin" });
  console.log(`Seeded admin user: ${config.adminEmail}`);
} else {
  console.log("Users already present — skipping admin seed.");
}

if (!repo.videos.count()) {
  [
    { title: "Explosive Chemical Reactions", category: "EXTREME SCIENCE",
      description: "Fast-paced reactions and dramatic science moments made for curious fans.",
      url: "https://youtu.be/cO_FdTGJECY",
      thumbnail: "https://i.ytimg.com/vi/cO_FdTGJECY/hqdefault.jpg", viewsLabel: "3.2M" },
    { title: "Extreme Survival Challenges", category: "SURVIVAL",
      description: "High-risk scenarios, endurance tests, and the thrill of pushing limits.",
      url: "https://youtu.be/XZgxswVPmoY",
      thumbnail: "https://i.ytimg.com/vi/XZgxswVPmoY/hqdefault.jpg", viewsLabel: "2.7M" },
    { title: "CO2 Rocket Experiments", category: "TECHNOLOGY",
      description: "Rocket-powered science ideas and maker-style builds with big visual payoff.",
      url: "https://youtu.be/CsafO_dFj0U",
      thumbnail: "https://i.ytimg.com/vi/CsafO_dFj0U/hqdefault.jpg", viewsLabel: "4.3M" }
  ].forEach((v, i) => repo.videos.create({ ...v, slug: slugify(v.title), sortOrder: i }));
  console.log("Seeded starter videos.");
} else {
  console.log("Videos already present — skipping video seed.");
}

if (!Object.keys(repo.content.all()).length) {
  repo.content.setMany({
    heroTitle: "Science Goes Extreme",
    heroText: "Dangerous experiments, futuristic inventions, survival challenges, and extreme technology videos gathered into one cinematic fan page.",
    channelUrl: "https://www.youtube.com/@MrIndianHacker",
    footerLabel: "Extreme Science · Futuristic Technology · Survival Challenges",
    aboutText: "Titanium Army is presented here as a fan-made showcase for viewers who enjoy large-scale experiments, gadget builds, and survival challenge content."
  });
  console.log("Seeded site content.");
}

if (!Object.keys(repo.settings.all()).length) {
  repo.settings.setMany({
    siteName: "Titanium Army",
    accent: "#c8ff39",
    notificationEmail: config.adminEmail,
    seoDescription: "A fan-made Titanium Army hub celebrating extreme science experiments, futuristic builds, and survival challenges inspired by Mr Indian Hacker."
  });
  console.log("Seeded site settings.");
}

console.log("Seed complete ✔");
db.close();
