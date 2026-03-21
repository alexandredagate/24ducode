import express from "express";

const app = express();
const port = process.env.PORT || 3001;

app.get("/", (_req, res) => {
  res.json({ message: "Hello World!" });
});

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});