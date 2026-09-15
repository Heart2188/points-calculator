// ============================================================================
// 回收点数最优方案计算器 - 核心求解逻辑
//
// 规则模型（按用户提供的数据）：
//   1) 直接回收：把 1 个号按它的面值回收。
//   2) 组合回收：4 套组合，每套把组合里每种号各消耗 1 个，一次给固定点数。
//   3) 豹子回收：同一种号凑够指定数量回收一次，给固定点数；可以重复多次。
//
// 直接回收总点数 = 所有号面值之和（固定基线）。
// 因此优化等价于：在不超库存的前提下，选择“组合回收次数”与“豹子回收次数”，
// 使额外奖励（高于直接回收的部分）最大。
//
// 方法：豹子回收对每个号而言只要剩余数量允许就一定划算，
// 所以真正需要搜索的只有 4 套组合的可行数量 (c1,c2,c3,c4)。
// 遍历全部可行组合数量后，取总点数最高者即为精确最优解。
// ============================================================================

'use strict';

// ---------------------------------------------------------------------------
// 规则数据
// ---------------------------------------------------------------------------
const TYPES = [
  { id: 5,  name: '七号',   value: 200,  leopardCount: 10, leopardPoints: 2100 },
  { id: 6,  name: '六号',   value: 300,  leopardCount: 9,  leopardPoints: 2900 },
  { id: 7,  name: '五号',   value: 400,  leopardCount: 8,  leopardPoints: 3500 },
  { id: 8,  name: '四号',   value: 500,  leopardCount: 7,  leopardPoints: 3900 },
  { id: 9,  name: '敖丙',   value: 600,  leopardCount: 6,  leopardPoints: 4100 },
  { id: 10, name: '哪吒',   value: 800,  leopardCount: 5,  leopardPoints: 4600 },
  { id: 11, name: '魔灵送财', value: 1500, leopardCount: 4, leopardPoints: 7200 },
];

const TYPE_INDEX = {};
TYPES.forEach((t, i) => {
  TYPE_INDEX[t.id] = i;
});

const COMBOS = [
  { id: 1, name: '组合1', need: [5, 6, 7, 8, 9],         points: 2400 },
  { id: 2, name: '组合2', need: [5, 6, 7, 8, 10],        points: 2800 },
  { id: 3, name: '组合3', need: [5, 6, 7, 8, 11],        points: 3700 },
  { id: 4, name: '组合4', need: [6, 7, 8, 9, 10, 11],    points: 5200 },
];

// 豹子回收的面值加成（回收点数 - 消耗数量 × 面值）
function leopardBonus(type) {
  return type.leopardPoints - type.leopardCount * type.value;
}

function comboBonus(combo) {
  const base = combo.need.reduce((sum, id) => sum + typeById(id).value, 0);
  return combo.points - base;
}

function typeById(id) {
  return TYPES.find((t) => t.id === id);
}

function typeIndex(id) {
  return TYPES.findIndex((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// 校验输入
// ---------------------------------------------------------------------------
// 输入：{ 5: n, 6: n, ... }，返回规范化的库存或抛错
function normalizeCounts(raw) {
  const counts = {};
  for (const t of TYPES) {
    const v = raw[t.id];
    let n = 0;
    if (v !== undefined && v !== null && v !== '') {
      n = Number(v);
    }
    if (!Number.isFinite(n)) {
      throw new Error(`${t.name} 的数量必须是数字`);
    }
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`${t.name} 的数量必须是大于等于 0 的整数`);
    }
    counts[t.id] = n;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// 求解器
// ---------------------------------------------------------------------------
// 给定一组组合回收次数，检查可行性并生成完整方案
function buildPlan(counts, comboUses) {
  const used = {};
  for (const t of TYPES) used[t.id] = 0;

  const comboItems = [];
  for (let i = 0; i < COMBOS.length; i++) {
    const combo = COMBOS[i];
    const n = comboUses[i];
    if (n > 0) {
      for (const id of combo.need) used[id] += n;
      comboItems.push({ combo, count: n });
    }
  }

  // 可行性检查
  for (const t of TYPES) {
    if (used[t.id] > counts[t.id]) return null;
  }

  // 剩余数量优先做豹子回收（奖励恒为正，能凑够就做）
  const leopardItems = [];
  for (const t of TYPES) {
    const left = counts[t.id] - used[t.id];
    const n = Math.floor(left / t.leopardCount);
    if (n > 0) {
      used[t.id] += n * t.leopardCount;
      leopardItems.push({ type: t, count: n });
    }
  }

  // 剩下的直接回收
  const directItems = [];
  for (const t of TYPES) {
    const left = counts[t.id] - used[t.id];
    if (left > 0) directItems.push({ type: t, count: left });
  }

  // 汇总点数
  let points = 0;
  const lines = [];
  for (const item of comboItems) {
    points += item.combo.points * item.count;
    lines.push({
      text: `${item.combo.name} ×${item.count}`,
      points: item.combo.points * item.count,
    });
  }
  for (const item of leopardItems) {
    points += item.type.leopardPoints * item.count;
    lines.push({
      text: `${item.type.name}豹子(凑${item.type.leopardCount}个) ×${item.count}`,
      points: item.type.leopardPoints * item.count,
    });
  }
  for (const item of directItems) {
    points += item.type.value * item.count;
    lines.push({
      text: `${item.type.name}直接回收 ×${item.count}`,
      points: item.type.value * item.count,
    });
  }

  return {
    comboUses: comboUses.slice(),
    points,
    bonus: points - totalFaceValue(counts),
    lines,
    comboItems,
    leopardItems,
    directItems,
  };
}

function totalFaceValue(counts) {
  return TYPES.reduce((sum, t) => sum + t.value * counts[t.id], 0);
}

// 找到“组合回收最多能做几次”的上限，用于循环裁剪
function comboCap(counts, combo, already = {}) {
  let cap = Infinity;
  for (const id of combo.need) {
    const remain = counts[id] - (already[id] || 0);
    cap = Math.min(cap, remain);
  }
  return cap;
}

// 只算点数的快速打分（不在遍历过程中生成完整方案，避免大库存时卡顿）
function tupleScore(counts, uses) {
  const used = [0, 0, 0, 0, 0, 0, 0];
  let points = 0;
  for (let i = 0; i < COMBOS.length; i++) {
    const n = uses[i];
    if (!n) continue;
    const combo = COMBOS[i];
    points += n * combo.points;
    for (const id of combo.need) used[TYPE_INDEX[id]] += n;
  }
  for (let k = 0; k < TYPES.length; k++) {
    const t = TYPES[k];
    if (used[k] > counts[t.id]) return -1;
    const left = counts[t.id] - used[k];
    const blocks = Math.floor(left / t.leopardCount);
    points += blocks * t.leopardPoints + (left - blocks * t.leopardCount) * t.value;
  }
  return points;
}

// 主入口：返回最优方案与备选方案
function solve(rawCounts) {
  const counts = normalizeCounts(rawCounts);
  const best = { plan: null, alternatives: [] };
  const top = []; // 只保留点数最高的前几名
  let checked = 0;

  const c5 = counts[5], c6 = counts[6], c7 = counts[7], c8 = counts[8];
  const c9 = counts[9], c10 = counts[10], c11 = counts[11];

  const consider = (uses, points) => {
    checked++;
    const entry = { uses, points };
    if (top.length < 6) {
      top.push(entry);
      top.sort((a, b) => b.points - a.points);
    } else if (points > top[5].points) {
      top.push(entry);
      top.sort((a, b) => b.points - a.points);
      top.length = 6;
    }
  };

  // 组合1 消耗 5,6,7,8,9；组合2 消耗 5,6,7,8,10；
  // 组合3 消耗 5,6,7,8,11；组合4 消耗 6,7,8,9,10,11
  const c1Max = Math.min(c5, c6, c7, c8, c9);
  for (let c1 = 0; c1 <= c1Max; c1++) {
    const rest = c6 - c1;
    const c2Max = Math.min(c5 - c1, rest, c7 - c1, c8 - c1, c10);
    for (let c2 = 0; c2 <= c2Max; c2++) {
      const rest2 = Math.min(rest, c7 - c1, c8 - c1) - c2;
      const c3Max = Math.min(c5 - c1 - c2, rest2, c11);
      for (let c3 = 0; c3 <= c3Max; c3++) {
        const usedBy123 = c1 + c2 + c3;
        const c4Max = Math.min(
          c6 - usedBy123,
          c7 - usedBy123,
          c8 - usedBy123,
          c9 - c1,
          c10 - c2,
          c11 - c3
        );
        for (let c4 = 0; c4 <= c4Max; c4++) {
          const points = tupleScore(counts, [c1, c2, c3, c4]);
          if (points >= 0) consider([c1, c2, c3, c4], points);
        }
      }
    }
  }

  if (top.length === 0) {
    // 理论上不会发生：四种组合都做 0 次一定可行
    const empty = buildPlan(counts, [0, 0, 0, 0]);
    best.plan = empty;
    best.alternatives = [];
  } else {
    top.sort((a, b) => b.points - a.points);
    best.plan = buildPlan(counts, top[0].uses);
    best.alternatives = top.slice(1).map((entry) => buildPlan(counts, entry.uses));
  }

  best.counts = counts;
  best.basePoints = totalFaceValue(counts);
  best.checked = checked;
  return best;
}

// 兼容浏览器与 Node（便于命令行测试）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TYPES,
    COMBOS,
    solve,
    normalizeCounts,
    totalFaceValue,
    leopardBonus,
    comboBonus,
  };
}
