export { CEFR, ITEM_DIFFICULTY, QUESTIONS } from "../questions.js";

export function getItemDifficulty(id) {
  const m = {"a1":0,"a2":1,"b1":2,"b2":3,"c1":4,"c2":5};
  const p = id.split("-")[0];
  return m[p] !== void 0 ? [-2.0, -1.0, 0.0, 1.0, 2.0, 3.0][m[p]] : 0;
}