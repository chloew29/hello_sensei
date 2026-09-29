// Petal rewards + Sakura-chan wardrobe. Learners earn petals for correct
// quiz answers and spend them to unlock outfits for the mascot.
import { kvGet, kvSet } from "./store";

export const OUTFITS = [
  { id: "default", name: "老师日常", file: "/teacher-anime.png", cost: 0, desc: "经典教师装，永远免费~" },
  { id: "idol", name: "偶像舞台装 ✨", file: "/outfits/idol.png", cost: 80, desc: "Karina风闪耀舞台装" },
  { id: "aigoddess", name: "AI女神·未来战衣 🌌", file: "/outfits/ai.png", cost: 100, desc: "银色镭射，aespa元宇宙概念" },
  { id: "sport", name: "运动服 🏃‍♀️", file: "/outfits/sport.png", cost: 80, desc: "高马尾+运动夹克，活力全开" },
  { id: "whitedress", name: "纯欲白裙 🤍", file: "/outfits/white.png", cost: 60, desc: "反差萌，温柔暴击" },
  { id: "winter", name: "冬日暖阳", file: "/outfits/winter.png", cost: 40, desc: "毛衣围巾配热可可" },
  { id: "matsuri", name: "夏日祭典", file: "/outfits/matsuri.png", cost: 40, desc: "樱花浴衣去逛祭典" },
];

export const KISS_COST = 10;

const key = (learner) => `rewards:${learner}`;

export async function getRewards(learner) {
  const r = await kvGet(key(learner), null);
  if (r && typeof r.petals === "number") return r;
  const fresh = { petals: 0, unlocked: ["default"], active: "default", kisses: 0 };
  await kvSet(key(learner), fresh);
  return fresh;
}

export const saveRewards = (learner, r) => kvSet(key(learner), r);

export async function addPetals(learner, n) {
  const r = await getRewards(learner);
  r.petals = Math.max(0, r.petals + n);
  await saveRewards(learner, r);
  return r;
}
