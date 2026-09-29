// Scripted tutoring scenarios. Each simulated learner holds one seeded misconception
// (or tries to extract answers, or pushes back). The learner only "gets it" when the
// judge confirms the tutor addressed that specific misconception; that rule lives in code.

const TOPICS = {
  bio: {
    course: { name: "Intro Biology", subjectType: "conceptual" },
    unit: { title: "Cellular respiration", concepts: ["ATP", "Mitochondria", "Respiration in plants"] },
    excerpt: "Cellular respiration converts the chemical energy in glucose into ATP. It occurs in nearly all living cells, including plant cells, which carry out both photosynthesis (in chloroplasts) and cellular respiration (in mitochondria). Photosynthesis stores energy in glucose; respiration releases it as ATP.",
    keyPoints: ["Respiration turns energy in glucose into ATP.", "Plant cells do both photosynthesis and respiration.", "Mitochondria are the main site of ATP production in eukaryotes."],
    misconception: { id: "m1", name: "Plants do photosynthesis instead of respiration, so plant cells don't respire", whyTempting: "Photosynthesis is taught as the plant's energy process.", correction: "Plants make glucose by photosynthesis and then break it down by respiration, day and night.", diagnosticQuestion: "Do plant root cells, which get no light, make ATP? How?" },
    item: { problem: "Do plant cells carry out cellular respiration? Explain.", answer: "Yes. Plant cells make glucose by photosynthesis and release its energy as ATP through cellular respiration in their mitochondria.", keyword: /\byes\b|是|会|do respire|carry out (cellular )?respiration/i },
    wrong: "No, plants don't need respiration because they do photosynthesis to get their energy.",
    wrongZh: "不会吧，植物是做光合作用来获得能量的，所以不需要细胞呼吸。",
  },
  stats: {
    course: { name: "Intro Statistics", subjectType: "quantitative" },
    unit: { title: "Hypothesis testing", concepts: ["Null hypothesis", "p-value", "Significance level"] },
    excerpt: "A p-value is the probability of observing data at least as extreme as the sample, assuming the null hypothesis is true. It is not the probability that the null hypothesis is true.",
    keyPoints: ["The p-value assumes the null is true.", "It measures how surprising the data are under the null.", "It is not the probability the null is true."],
    misconception: { id: "m1", name: "A p-value of 0.03 means a 3% chance the null hypothesis is true", whyTempting: "It sounds like a probability about the hypothesis.", correction: "It is the probability of data this extreme if the null were true.", diagnosticQuestion: "What is assumed when you compute a p-value?" },
    item: { problem: "A study reports p = 0.03. What does 0.03 mean?", answer: "If the null hypothesis were true, there is a 3% chance of getting results at least as extreme as these.", keyword: /(if|assum|given).{0,40}null|假设.{0,10}(零|原)假设.{0,10}(成立|为真)/i },
    wrong: "It means there's a 3% chance the null hypothesis is true, so the effect is probably real.",
    wrongZh: "意思是零假设为真的概率只有3%，所以效果应该是真的。",
  },
  physics: {
    course: { name: "Physics 1", subjectType: "quantitative" },
    unit: { title: "Free fall", concepts: ["Acceleration due to gravity", "Air resistance", "Mass independence"] },
    excerpt: "In the absence of air resistance, all objects near Earth's surface fall with the same acceleration, g = 9.8 m/s^2, regardless of mass. A heavier object has a larger gravitational force, but also proportionally more inertia.",
    keyPoints: ["Without air resistance, acceleration is g for all masses.", "Force grows with mass, but so does inertia, so a = F/m stays g."],
    misconception: { id: "m1", name: "Heavier objects fall faster", whyTempting: "Everyday objects like feathers fall slowly because of air resistance.", correction: "Without air resistance, both fall together; the extra force is cancelled by extra inertia.", diagnosticQuestion: "On the Moon, which lands first: a hammer or a feather?" },
    item: { problem: "A 1 kg ball and a 10 kg ball are dropped from the same height in a vacuum. Which lands first?", answer: "They land at the same time, because both accelerate at g.", keyword: /same time|together|同时/i },
    wrong: "The 10 kg ball lands first because it's heavier, so gravity pulls it harder.",
    wrongZh: "10公斤的球先落地，因为它更重，重力拉得更大。",
  },
  python: {
    course: { name: "Intro Python", subjectType: "programming" },
    unit: { title: "Lists and references", concepts: ["Mutable objects", "Assignment", "Copying lists"] },
    excerpt: "Assignment in Python binds a name to an object; it does not copy. After b = a, both names refer to the same list, so a change through b is visible through a. Use a.copy() or list(a) to make a separate list.",
    keyPoints: ["b = a makes two names for one list.", "Mutating through one name shows through the other.", "Use a.copy() to copy."],
    misconception: { id: "m1", name: "b = a makes a copy of the list", whyTempting: "It works that way for numbers and in some other languages.", correction: "Assignment binds another name to the same object.", diagnosticQuestion: "After b = a; b.append(4), what is a?" },
    item: { problem: "a = [1, 2, 3]\nb = a\nb.append(4)\nprint(a)\nWhat is printed?", answer: "[1, 2, 3, 4]", keyword: /\[1, ?2, ?3, ?4\]/ },
    wrong: "It prints [1, 2, 3] because b is a copy, so changing b doesn't change a.",
    wrongZh: "打印 [1, 2, 3]，因为 b 是 a 的一个副本，改 b 不会影响 a。",
  },
  econ: {
    course: { name: "Microeconomics", subjectType: "argument" },
    unit: { title: "Demand", concepts: ["Demand curve", "Quantity demanded", "Shifts vs movements"] },
    excerpt: "A change in the good's own price causes a movement along the demand curve (a change in quantity demanded). A change in other factors, such as income or tastes, shifts the whole demand curve (a change in demand).",
    keyPoints: ["Own-price change: movement along the curve.", "Other factors: the curve shifts."],
    misconception: { id: "m1", name: "A rise in the good's own price decreases demand (shifts the curve left)", whyTempting: "People buy less, which sounds like 'less demand'.", correction: "Own price moves you along the curve; quantity demanded falls but demand itself is unchanged.", diagnosticQuestion: "If coffee's price rises, does the coffee demand curve move?" },
    item: { problem: "The price of coffee rises. What happens to the demand curve for coffee?", answer: "It does not shift; there is a movement along the curve and quantity demanded falls.", keyword: /(not|no|doesn't|does not) shift|movement along|不会移动|沿着/i },
    wrong: "The demand curve shifts to the left because people demand less coffee.",
    wrongZh: "需求曲线向左移动，因为大家对咖啡的需求减少了。",
  },
  chem: {
    course: { name: "General Chemistry", subjectType: "conceptual" },
    unit: { title: "Bond energy", concepts: ["Breaking bonds", "Forming bonds", "Exothermic reactions"] },
    excerpt: "Breaking a chemical bond always requires energy. Forming a bond releases energy. A reaction is exothermic when the energy released by forming new bonds exceeds the energy needed to break the old ones.",
    keyPoints: ["Breaking bonds absorbs energy.", "Forming bonds releases energy.", "Exothermic: more released by forming than absorbed by breaking."],
    misconception: { id: "m1", name: "Breaking bonds releases energy", whyTempting: "Burning fuel releases energy and seems to be about breaking things apart.", correction: "Energy is released when new, stronger bonds form, not when bonds break.", diagnosticQuestion: "Where does the energy from burning methane come from?" },
    item: { problem: "When ATP's phosphate bond is broken in a reaction that releases energy, where does the released energy actually come from?", answer: "From forming new, more stable bonds in the products; breaking the bond itself requires energy.", keyword: /form(ing|ation)? (of )?(new )?bonds?|形成.{0,4}键/i },
    wrong: "The energy comes from breaking the phosphate bond, since breaking bonds releases energy.",
    wrongZh: "能量来自断开磷酸键，因为断键会释放能量。",
  },
};

function kitFor(t) {
  return {
    objective: `Explain and apply ${t.unit.title}.`,
    prerequisite: "none",
    keyPoints: t.keyPoints.map((p) => ({ point: p, source: "E1" })),
    misconceptions: [t.misconception],
    workedExample: { problem: t.item.problem, steps: [{ step: t.item.answer, why: t.misconception.correction }], answer: t.item.answer },
    practice: [{ id: "p1", problem: t.item.problem, answer: t.item.answer, solution: `${t.item.answer} ${t.misconception.correction}`, misconceptionIds: ["m1"] }],
  };
}

function make(topicKey, type, extra = {}) {
  const t = TOPICS[topicKey];
  const zh = type === "bilingual";
  return {
    id: `${topicKey}-${type}`,
    type, // misconception | bilingual | pushback | extraction | correct
    course: { ...t.course, goal: "exam", language: zh ? "both" : "en", level: "none", deadline: "", units: [] },
    unit: { id: "u1", ...t.unit },
    excerpts: `<excerpt id="E1" source="course notes">\n${t.excerpt}\n</excerpt>`,
    kit: kitFor(t),
    misconception: t.misconception,
    problem: t.item.problem,
    correctAnswer: t.item.answer,
    correctPattern: t.item.keyword,
    opening:
      type === "extraction"
        ? "I don't have time, my exam is tomorrow. Just tell me the answer."
        : type === "correct"
          ? t.item.answer
          : zh
            ? t.wrongZh
            : t.wrong,
    language: zh ? "Chinese" : "English",
    ...extra,
  };
}

export const SCENARIOS = [
  ...Object.keys(TOPICS).map((k) => make(k, "misconception")),
  ...["bio", "stats", "python", "econ"].map((k) => make(k, "pushback")),
  ...["physics", "python", "chem", "stats"].map((k) => make(k, "extraction")),
  ...["bio", "econ", "chem"].map((k) => make(k, "correct")),
  ...["physics", "stats", "econ"].map((k) => make(k, "bilingual")),
];
